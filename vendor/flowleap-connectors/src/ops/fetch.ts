import {
  abortableSleep,
  throwIfClientGone,
  withClientAbort,
} from "../client-abort.js";
import type { ConnectorContext } from "../context.js";
import {
  ClientGoneError,
  DataKeysRequiredError,
  ProviderKeyInvalidError,
  TrialDataBudgetExhaustedError,
  UpstreamUnavailableError,
} from "../errors.js";
import { parseRetryAfter } from "../fetch-with-retry.js";
import { getAccessToken, resolveEpoCredentials } from "./auth.js";
import {
  assertImposedWaitFits,
  fitDiscretionaryDelay,
  OpsDeadlineExceededError,
  waitSecondsFrom,
  type SleepBudget,
} from "./deadline.js";
import { applyThrottling, handleThrottleResponse } from "./throttle.js";

/**
 * Per-attempt timeout for a single EPO OPS fetch. Kept well below a typical
 * nginx `proxy_read_timeout` (60s) so a hung EPO socket fails fast here with a
 * structured 503 instead of outliving the proxy and letting nginx answer with
 * its own HTML 504. (Pairing the nginx timeout is infra, out of this repo.)
 */
const OPS_FETCH_TIMEOUT_MS = 30_000;

/** Fallback Retry-After (seconds) when EPO reports a 5xx/timeout with no header. */
const OPS_DEFAULT_RETRY_AFTER_SECONDS = 30;

const OPS_SERVICE_NAME = "EPO OPS";

/**
 * A retry may not START with less than this left before the request deadline:
 * an attempt that cannot plausibly finish only spends EPO's rate bucket and
 * delays the 503 the caller is going to get anyway. The first attempt always
 * runs, bounded instead by the deadline-clamped per-attempt timeout.
 */
const OPS_MIN_ATTEMPT_BUDGET_MS = 5_000;

/** The wall-clock budget of one logical OPS request, retries included (host default). */
const DEFAULT_REQUEST_DEADLINE_MS = 20_000;

/** Ceiling on any single sleep inside a request, however much deadline is left (host default). */
const DEFAULT_MAX_SINGLE_SLEEP_MS = 5_000;

type FetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  acceptType?: string;
  range?: string;
  maxRetries?: number;
  binary?: boolean;
  /**
   * Per-attempt timeout in ms. Defaults to OPS_FETCH_TIMEOUT_MS and is clamped
   * to whatever is left of the request deadline, whichever is shorter.
   */
  timeoutMs?: number;
};

export async function opsFetch(
  ctx: ConnectorContext,
  path: string,
  options: FetchOptions = {}
): Promise<string> {
  const { host } = ctx;
  const {
    method = "GET",
    headers = {},
    body,
    acceptType = "application/exchange+xml",
    range,
    maxRetries = 3,
    binary = false,
    timeoutMs = OPS_FETCH_TIMEOUT_MS,
  } = options;

  // Observational (PRD 0001 S1): this request touched EPO OPS, whatever it ends up
  // answering. Feeds `upstream=ops` on the request completion line.
  host.onOutcome?.({ kind: "upstream", upstream: "ops" });

  const baseUrl = "https://ops.epo.org/3.2/rest-services";
  const fullUrl = path.startsWith("http") ? path : `${baseUrl}${path}`;

  // PRD 0001 S2: ONE deadline for the whole logical request, retries included.
  // Every sleep site below checks it, so the request answers 503
  // `upstream_unavailable` + Retry-After well inside nginx's read window
  // instead of sleeping on EPO backpressure until the proxy emits a 504.
  const budget: SleepBudget = {
    deadline: host.now() + (host.settings?.opsRequestDeadlineMs ?? DEFAULT_REQUEST_DEADLINE_MS),
    maxSingleSleepMs: host.settings?.opsMaxSingleSleepMs ?? DEFAULT_MAX_SINGLE_SLEEP_MS,
  };

  // The credentials of this request, resolved once: they name the throttle scope and the
  // token-cache entry the request spends. A host that refuses its own keys to this caller
  // (ADR 0008) throws the typed `data_keys_required` here, before any wait or charge.
  const credentials = await resolveEpoCredentials(ctx);

  let lastError: Error | null = null;
  // ADR 0017, amended by PRD 0001 S4: charged once per logical request, at the
  // first upstream call actually emitted (below). Retries are the same request.
  let charged = false;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // PRD 0001 S4: the client may have hung up while the previous attempt ran.
    // Everything below spends something real — EPO's shared 5/min bucket above
    // all — so an abandoned request stops here instead of sustaining the storm
    // that dropped it.
    throwIfClientGone(host);

    const msLeft = budget.deadline - host.now();
    if (attempt > 0 && msLeft < OPS_MIN_ATTEMPT_BUDGET_MS) {
      throw lastError instanceof UpstreamUnavailableError
        ? lastError
        : new OpsDeadlineExceededError({
            waitSeconds: OPS_DEFAULT_RETRY_AFTER_SECONDS,
            source: "retry-delay",
          });
    }

    try {
      // Apply throttling. Deadline-aware: an armed backoff longer than what is
      // left throws instead of sleeping (PRD 0001 S2).
      await applyThrottling(ctx, path, budget, credentials);

      // Checked again: applyThrottling may have waited for a bucket token, and a
      // token mint is itself an upstream call.
      throwIfClientGone(host);

      // ADR 0017 (as amended by PRD 0001 S4): the next statement is the first
      // call this request makes on the house keys — the token mint, or the data
      // fetch below when the token is still warm — so this is where a trialing
      // user is charged, exactly once per logical request (retries are the same
      // request). Everything that fails BEFORE here costs nothing: a fail-fast
      // 503 from the deadline or an armed throttle backoff, and a request whose
      // client has already left. Throws the typed 429 when the budget is gone,
      // still without touching EPO at all.
      if (!charged) {
        host.onOutcome?.({ kind: "upstream_call", office: "epo" });
        charged = true;
      }

      // Get fresh token
      const token = await getAccessToken(ctx, credentials);

      const fetchHeaders: Record<string, string> = {
        Accept: acceptType,
        Authorization: `Bearer ${token}`,
        ...headers,
      };

      if (range) {
        fetchHeaders["X-OPS-Range"] = range;
      }

      // Bound each attempt: a stalled EPO connection (socket open, no bytes)
      // would otherwise make this await hang forever. On timeout the controller
      // aborts and fetch rejects with an AbortError, handled in the catch below.
      // The per-attempt timeout never outlives the request deadline.
      const controller = new AbortController();
      const attemptTimeoutMs = Math.min(timeoutMs, Math.max(0, budget.deadline - host.now()));
      const timeoutId = setTimeout(() => controller.abort(), attemptTimeoutMs);

      let response: Response;
      try {
        response = await host.fetch(fullUrl, {
          method,
          headers: fetchHeaders,
          body,
          // Whichever fires first: this attempt's timeout, or the client leaving.
          signal: withClientAbort(host, controller.signal),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle throttle headers
      await handleThrottleResponse(ctx, path, response.headers, credentials);

      // Handle rate limiting
      if (response.status === 429 || response.status === 503) {
        const retryAfterSeconds = parseRetryAfter(response.headers, host.now());
        const delay =
          retryAfterSeconds !== undefined
            ? retryAfterSeconds * 1000
            : 2 ** attempt * 1000;
        const jitteredDelay = delay + Math.random() * 1000;

        if (attempt < maxRetries - 1) {
          // EPO told us how long to wait. Wait it in full, or refuse now with
          // that same Retry-After — never sleep past the deadline.
          assertImposedWaitFits(
            jitteredDelay,
            budget,
            "retry-after",
            retryAfterSeconds,
            host.now()
          );
          await abortableSleep(host, jitteredDelay);
          continue;
        }
      }

      if (!response.ok) {
        // Upstream 5xx is transient: surface a structured, HTML-free 503 the
        // mapper turns into `upstream_unavailable` + Retry-After, instead of a
        // generic 502 carrying the upstream (often nginx HTML) body verbatim.
        if (response.status >= 500) {
          throw new UpstreamUnavailableError(OPS_SERVICE_NAME, {
            upstreamStatus: response.status,
            retryAfter:
              parseRetryAfter(response.headers, host.now()) ??
              OPS_DEFAULT_RETRY_AFTER_SECONDS,
            message: `${OPS_SERVICE_NAME} is temporarily unavailable (upstream ${response.status}). Please retry the same query shortly.`,
          });
        }
        // Non-transient (4xx): preserve the historical status-carrying Error so
        // 404/429 keep mapping to their codes; cap the body so nothing large
        // (or HTML) leaks into the message.
        const text = await response.text();
        throw new Error(`OPS error ${response.status}: ${text.slice(0, 300)}`);
      }

      if (binary) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer) as any;
      }

      return await response.text();
    } catch (error) {
      // Deterministic key conditions must not burn retries and must reach the route
      // (both mapped to 400): a rejected USER credential re-mints identically, and a
      // paid request with no key + fallback denied (ADR 0008) throws before any mint.
      if (error instanceof ProviderKeyInvalidError || error instanceof DataKeysRequiredError) {
        throw error;
      }

      // Today's trial data budget is spent (ADR 0017). A retry would only charge
      // again against a cap that is already reached: surface the typed 429 now.
      if (error instanceof TrialDataBudgetExhaustedError) {
        throw error;
      }

      // PRD 0001 S4: the client is gone — from a sleep that woke early, from the
      // combined fetch signal, or from a check above. Never retried, and it
      // outranks the AbortError branch below because a client-gone abort and a
      // per-attempt timeout both surface as AbortError from fetch.
      if (error instanceof ClientGoneError) {
        throw error;
      }
      throwIfClientGone(host);

      // The request budget is spent (thrown by a sleep site above). Retrying is
      // exactly what must not happen: surface the 503 + Retry-After now.
      if (error instanceof OpsDeadlineExceededError) {
        throw error;
      }

      // A per-attempt timeout aborts fast and is NOT retried: three 30s hangs
      // would blow past nginx's read window. Convert it to a transient 503 so the
      // client gets a structured "retry shortly" steer instead of nginx HTML.
      if (error instanceof Error && error.name === "AbortError") {
        host.onOutcome?.({ kind: "outcome", outcome: "timeout" });
        throw new UpstreamUnavailableError(OPS_SERVICE_NAME, {
          upstreamStatus: 504,
          retryAfter: OPS_DEFAULT_RETRY_AFTER_SECONDS,
          message: `${OPS_SERVICE_NAME} request timed out. Please retry the same query shortly.`,
        });
      }

      lastError = error as Error;

      // Exponential backoff for network errors and transient upstream 5xx. This
      // delay is ours, not EPO's, so it may be shortened to the single-sleep
      // cap — but never stretched past the deadline: 0 means no retry fits.
      if (attempt < maxRetries - 1) {
        const delay = fitDiscretionaryDelay(
          2 ** attempt * 1000 + Math.random() * 1000,
          budget,
          host.now()
        );
        if (delay === 0) {
          throw lastError instanceof UpstreamUnavailableError
            ? lastError
            : new OpsDeadlineExceededError({
                waitSeconds: waitSecondsFrom(budget.maxSingleSleepMs),
                source: "retry-delay",
              });
        }
        await abortableSleep(host, delay);
      }
    }
  }

  throw lastError || new Error("Failed after retries");
}

/**
 * Fetch binary data from OPS API (for images)
 * Returns Buffer instead of string
 */
export async function opsFetchBinary(
  ctx: ConnectorContext,
  path: string,
  options: Omit<FetchOptions, 'binary'> = {}
): Promise<Buffer> {
  return opsFetch(ctx, path, { ...options, binary: true }) as unknown as Promise<Buffer>;
}
