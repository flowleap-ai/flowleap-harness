/*---------------------------------------------------------------------------------------------
 *  EPO OPS throttling (PRD 0001 S3 — the real header, token buckets, per-credential scope).
 *
 *  On 2026-09-02 this module was the storm's amplifier. It parsed an `idle=` key OPS never
 *  sends, so the per-bucket limits OPS announces on EVERY response were never applied; it
 *  armed an uncapped, process-global backoff from a `Retry-After: 600`; and every later
 *  search from every user — BYOK users included — slept on that backoff until nginx gave up.
 *
 *  Three rules replace that:
 *
 *  1. Read what OPS actually says. `X-Throttling-Control: overloaded (images=green:50,
 *     inpadoc=green:30, other=green:1000, retrieval=green:50, search=green:5)` is the shape;
 *     `n` is requests per minute allowed for that service right now.
 *  2. Spend that rate through a per-bucket TOKEN BUCKET, not a fixed inter-request delay.
 *     Five searches a minute is a budget to spend, not a 12-second gap to sleep in.
 *  3. Fail fast, never sleep past the proxy. A wait that does not fit the caller's request
 *     budget throws `OpsDeadlineExceededError` (503 `upstream_unavailable` + the real
 *     `Retry-After`), so the agent's escalation ladder decides — ADR 0010, PRD 0001 S2.
 *
 *  State is scoped PER CREDENTIAL (`house` vs `user:<fingerprint>`): the house keys are one
 *  shared EPO quota across every trial user, which is exactly what needs protecting, while a
 *  BYOK user spends their own quota and must never wait on the house keys' backoff. The
 *  state lives on the connector instance (ADR 0019 C1: `ctx.state.ops.throttleScopes`), so
 *  two hosts in one process never share a bucket.
 *
 *  Every state change is logged under `[EPO OPS throttle]` (PRD 0001 S1), and
 *  getThrottleSnapshot() exposes the HOUSE scope read-only for /v1/health.
 *--------------------------------------------------------------------------------------------*/

import { abortableSleep } from "../client-abort.js";
import type { ConnectorContext, OpsBucketState, OpsBucketType, OpsScopeState } from "../context.js";
import { credentialFingerprint, type EpoCredentialLookup } from "./auth.js";
import { assertImposedWaitFits, type SleepBudget } from "./deadline.js";

export type BucketType = OpsBucketType;

/** The colour OPS gives a service: how close that service is to refusing requests. */
export type ThrottleColor = "green" | "yellow" | "red" | "black";

/** The system-wide state OPS reports; `black` means stop calling entirely. */
export type ThrottleSystemState = "idle" | "busy" | "overloaded" | "black";

/** One service's announced allowance. */
export type ThrottleServiceLimit = {
  color: ThrottleColor;
  /** Requests per minute OPS allows for this service right now. */
  perMinute: number;
};

/** A parsed `X-Throttling-Control` header. */
export type ThrottlingControl = {
  state: ThrottleSystemState;
  /** Only services this module buckets; OPS's `other` and unknown names are dropped. */
  services: Partial<Record<BucketType, ThrottleServiceLimit>>;
};

/**
 * Per-minute rate assumed before any header has been seen. These are the S1 constants'
 * equivalent rates (search/inpadoc 100 ms spacing, retrieval/images 50 ms), so behaviour
 * with a silent upstream is unchanged. The first OPS response replaces them with the
 * announced allowance, which is normally far lower.
 */
const DEFAULT_PER_MINUTE: Record<BucketType, number> = {
  search: 600,
  retrieval: 1200,
  inpadoc: 600,
  images: 1200,
};

/** OPS service names as they appear in the header, mapped to our buckets. `other` is ignored. */
const SERVICE_BUCKETS: Record<string, BucketType> = {
  search: "search",
  retrieval: "retrieval",
  inpadoc: "inpadoc",
  images: "images",
};

const SYSTEM_STATES: readonly string[] = ["idle", "busy", "overloaded", "black"];
const COLORS: readonly string[] = ["green", "yellow", "red", "black"];

/**
 * Ceiling on any armed backoff. A `Retry-After: 600` parked the 2026-09-02 incident for ten
 * minutes of every user's requests; past a minute the honest answer is a 503 the agent can
 * act on, not a longer wait nobody is watching.
 */
const MAX_BACKOFF_MS = 60_000;

/** Wait budget applied when a caller passes none (internal callers, scripts, tests). */
const DEFAULT_WAIT_BUDGET_MS = 5_000;

/** Cap on distinct credential scopes held in memory; BYOK scopes evict oldest-first. */
const MAX_SCOPES = 500;

/** The scope every keyless (trial / internal) request shares — FlowLeap's own EPO quota. */
const HOUSE_SCOPE = "house";

type BucketState = OpsBucketState;

type ScopeState = OpsScopeState;

function freshScope(now: number): ScopeState {
  const state = {} as ScopeState;
  for (const bucket of Object.keys(DEFAULT_PER_MINUTE) as BucketType[]) {
    state[bucket] = {
      tokens: DEFAULT_PER_MINUTE[bucket],
      lastRefill: now,
      perMinute: DEFAULT_PER_MINUTE[bucket],
    };
  }
  return state;
}

function scopeState(ctx: ConnectorContext, scope: string): ScopeState {
  const scopes = ctx.state.ops.throttleScopes;
  const existing = scopes.get(scope);
  if (existing) {
    return existing;
  }
  if (scopes.size >= MAX_SCOPES) {
    // Maps iterate in insertion order — drop the oldest BYOK scope. The house scope is
    // never evicted: it is the shared quota every trial user spends, so losing its state
    // would let a fresh full bucket walk straight back into the storm.
    for (const key of scopes.keys()) {
      if (key !== HOUSE_SCOPE) {
        scopes.delete(key);
        break;
      }
    }
  }
  const created = freshScope(ctx.host.now());
  scopes.set(scope, created);
  return created;
}

/**
 * Which credential's throttle state this request spends.
 *
 * Uses the same credential fingerprint the OPS token cache keys on (`auth.ts`), so a scope
 * and its access token are the same identity. Keyless requests — trialing users on the
 * house keys, internal callers — share the house scope on purpose.
 */
export function throttleScopeFor(lookup: EpoCredentialLookup | undefined): string {
  if (lookup?.status !== "available" || lookup.owner !== "user") {
    return HOUSE_SCOPE;
  }
  const { consumerKey, consumerSecret } = lookup.credentials;
  if (!consumerKey || !consumerSecret) {
    return HOUSE_SCOPE;
  }
  return `user:${credentialFingerprint(consumerKey, consumerSecret)}`;
}

/** The scope of the current call: resolved through the host unless the caller already did. */
async function currentScope(ctx: ConnectorContext, lookup?: EpoCredentialLookup): Promise<string> {
  if (lookup) {
    return throttleScopeFor(lookup);
  }
  const resolved = await ctx.host.credentials("epoOps");
  return throttleScopeFor(resolved);
}

/** `house` or `user` — enough to read the logs, without putting a credential hash in them. */
function scopeLabel(scope: string): string {
  return scope === HOUSE_SCOPE ? "house" : "user";
}

export function getBucketForPath(path: string): BucketType {
  if (path.includes("/published-data/search")) {
    return "search";
  }
  if (path.includes("/family/") || path.includes("/legal/")) {
    return "inpadoc";
  }
  if (path.includes("/images/") || path.includes("/classification/cpc/media")) {
    return "images";
  }
  return "retrieval";
}

/**
 * Parse EPO OPS's `X-Throttling-Control` header.
 *
 * Shape: `<state> (<service>=<colour>:<perMinute>, …)`, e.g.
 * `overloaded (images=green:50, inpadoc=green:30, other=green:1000, retrieval=green:50,
 * search=green:5)`. Unknown service names (OPS's `other`, anything new) and malformed
 * entries are dropped rather than failing the parse — a header we half-understand is still
 * worth obeying.
 *
 * @returns The parsed header, or `undefined` when it is absent or its state is not one OPS
 * documents (in which case the announced numbers cannot be trusted either).
 */
export function parseThrottlingControl(
  header: string | null | undefined
): ThrottlingControl | undefined {
  if (!header) {
    return undefined;
  }

  const stateMatch = /^\s*([a-z]+)\b/i.exec(header);
  if (!stateMatch) {
    return undefined;
  }
  const state = stateMatch[1].toLowerCase();
  if (!SYSTEM_STATES.includes(state)) {
    return undefined;
  }

  const services: Partial<Record<BucketType, ThrottleServiceLimit>> = {};
  const entries = header
    .slice(stateMatch[0].length)
    .matchAll(/([a-z]+)\s*=\s*([a-z]+)\s*:\s*(\d+)/gi);
  for (const [, name, color, count] of entries) {
    const bucket = SERVICE_BUCKETS[name.toLowerCase()];
    const normalizedColor = color.toLowerCase();
    if (!bucket || !COLORS.includes(normalizedColor)) {
      continue;
    }
    services[bucket] = {
      color: normalizedColor as ThrottleColor,
      perMinute: Number.parseInt(count, 10),
    };
  }

  return { state: state as ThrottleSystemState, services };
}

/** One bucket's throttle state, as reported by getThrottleSnapshot(). */
export type ThrottleBucketSnapshot = {
  /** Seconds of backoff still to run; 0 when the bucket is not in backoff. */
  backoffRemainingSeconds: number;
  /** Requests per minute this bucket currently allows. */
  perMinute: number;
};

/**
 * Read-only view of the HOUSE scope's buckets — the shared EPO quota, which is what
 * /v1/health's `ops_backoff_active` block reports (PRD 0001 S1). BYOK scopes are a
 * per-user concern and deliberately absent. No caller may mutate throttle state through it.
 */
export function getThrottleSnapshot(ctx: ConnectorContext): Record<string, ThrottleBucketSnapshot> {
  const now = ctx.host.now();
  const snapshot: Record<string, ThrottleBucketSnapshot> = {};

  for (const [bucket, state] of Object.entries(scopeState(ctx, HOUSE_SCOPE))) {
    const remainingMs = state.backoffUntil ? state.backoffUntil - now : 0;
    snapshot[bucket] = {
      backoffRemainingSeconds: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
      perMinute: state.perMinute,
    };
  }

  return snapshot;
}

/** How many credential scopes currently hold throttle state (the house scope included). */
export function getThrottleScopeCount(ctx: ConnectorContext): number {
  return ctx.state.ops.throttleScopes.size;
}

/** What a throttle wait cost the caller. */
export type ThrottleResult = {
  /** Milliseconds actually slept before the request was allowed through. */
  waitedMs: number;
};

/** Bring `tokens` up to date for the time elapsed since the last refill. */
function refill(state: BucketState, now: number): void {
  const elapsedMs = now - state.lastRefill;
  if (elapsedMs <= 0) {
    return;
  }
  state.lastRefill = now;
  state.tokens = Math.min(
    state.perMinute,
    state.tokens + (elapsedMs * state.perMinute) / 60_000
  );
}

/** Milliseconds until a whole token is available; 0 when one already is. */
function msUntilToken(state: BucketState, now: number): number {
  refill(state, now);
  if (state.tokens >= 1) {
    return 0;
  }
  return Math.ceil(((1 - state.tokens) * 60_000) / state.perMinute);
}

/**
 * A throttle wait must wake at once when the client hangs up (PRD 0001 S4): a request
 * that has lost its client must not spend a bucket token on resuming.
 */
function sleep(ctx: ConnectorContext, ms: number): Promise<void> {
  return abortableSleep(ctx.host, ms);
}

/**
 * Wait for this bucket's next token, and for any armed backoff, before an OPS call.
 *
 * Fail-fast by construction (PRD 0001 S2/S3): a wait that would cross the caller's request
 * deadline, or exceed the single-sleep cap, throws `OpsDeadlineExceededError` rather than
 * parking the request until nginx answers 504. EPO-imposed waits are never shortened, so
 * the choice is wait in full or refuse now with the seconds until the wait ends. Short
 * waits still sleep, which is what keeps a 5/min bucket usable rather than merely honest.
 *
 * With no `budget` the wait is bounded by {@link DEFAULT_WAIT_BUDGET_MS} — no caller sleeps
 * open-endedly on EPO backpressure any more.
 */
export async function applyThrottling(
  ctx: ConnectorContext,
  path: string,
  budget?: SleepBudget,
  lookup?: EpoCredentialLookup
): Promise<ThrottleResult> {
  const { host } = ctx;
  const bucket = getBucketForPath(path);
  const scope = await currentScope(ctx, lookup);
  const state = scopeState(ctx, scope)[bucket];
  const waitBudget: SleepBudget = budget ?? {
    deadline: host.now() + DEFAULT_WAIT_BUDGET_MS,
    maxSingleSleepMs: DEFAULT_WAIT_BUDGET_MS,
  };
  let waitedMs = 0;

  const backoffMs = state.backoffUntil ? state.backoffUntil - host.now() : 0;
  if (backoffMs > 0) {
    host.logger.warn(
      `[EPO OPS throttle] backoff_wait bucket=${bucket} scope=${scopeLabel(scope)} seconds_remaining=${Math.ceil(backoffMs / 1000)}`
    );
    // Observational: surfaces as outcome=backoff on the completion line, whether the wait
    // is served below or refused.
    host.onOutcome?.({ kind: "outcome", outcome: "backoff" });
    assertImposedWaitFits(backoffMs, waitBudget, "throttle-backoff", undefined, host.now());
    await sleep(ctx, backoffMs);
    waitedMs += backoffMs;
  }

  const tokenMs = msUntilToken(state, host.now());
  if (tokenMs > 0) {
    host.onOutcome?.({ kind: "outcome", outcome: "backoff" });
    assertImposedWaitFits(tokenMs, waitBudget, "throttle-backoff", undefined, host.now());
    await sleep(ctx, tokenMs);
    waitedMs += tokenMs;
    refill(state, host.now());
  }

  state.tokens -= 1;
  return { waitedMs };
}

/** Arm (or extend) a bucket's backoff, capped at {@link MAX_BACKOFF_MS}. */
function armBackoff(
  ctx: ConnectorContext,
  state: BucketState,
  bucket: BucketType,
  scope: string,
  requestedMs: number,
  source: string
): void {
  const cappedMs = Math.min(requestedMs, MAX_BACKOFF_MS);
  const until = ctx.host.now() + cappedMs;
  if (state.backoffUntil && state.backoffUntil >= until) {
    return;
  }
  state.backoffUntil = until;
  ctx.host.logger.warn(
    `[EPO OPS throttle] backoff_armed bucket=${bucket} scope=${scopeLabel(scope)} seconds=${Math.ceil(cappedMs / 1000)} source=${source}`
  );
}

/**
 * Record what an OPS response told us about our allowance: the `Retry-After` it may carry,
 * and the `X-Throttling-Control` header it carries on every response.
 *
 * Applies to the CURRENT request's credential scope — a house-key 503 must not back off a
 * BYOK user, and vice versa.
 */
export async function handleThrottleResponse(
  ctx: ConnectorContext,
  path: string,
  headers: Headers,
  lookup?: EpoCredentialLookup
): Promise<void> {
  const bucket = getBucketForPath(path);
  const scope = await currentScope(ctx, lookup);
  const buckets = scopeState(ctx, scope);
  const state = buckets[bucket];

  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const retrySeconds = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(retrySeconds)) {
      // Add jitter (10-30% variation) so a fleet of waiters does not resume in lockstep.
      const jitter = Math.random() * 0.2 + 0.1;
      armBackoff(ctx, state, bucket, scope, retrySeconds * 1000 * (1 + jitter), "retry-after");
    }
  }

  const control = parseThrottlingControl(headers.get("x-throttling-control"));
  if (!control) {
    return;
  }

  // `black` is OPS saying stop, for every service at once.
  if (control.state === "black") {
    for (const name of Object.keys(buckets) as BucketType[]) {
      armBackoff(ctx, buckets[name], name, scope, MAX_BACKOFF_MS, "x-throttling-control");
    }
    return;
  }

  for (const [name, limit] of Object.entries(control.services) as Array<
    [BucketType, ThrottleServiceLimit]
  >) {
    const target = buckets[name];
    if (limit.color === "black" || limit.perMinute <= 0) {
      // A black service, or an announced allowance of zero, is a closed door for that
      // bucket only; the previous rate is kept for when it reopens.
      armBackoff(ctx, target, name, scope, MAX_BACKOFF_MS, "x-throttling-control");
      continue;
    }
    if (limit.perMinute === target.perMinute) {
      continue;
    }
    const previousPerMinute = target.perMinute;
    // Capacity is the announced rate: a bucket that was full at 600/min may not spend 600
    // requests now that OPS says 5.
    refill(target, ctx.host.now());
    target.perMinute = limit.perMinute;
    target.tokens = Math.min(target.tokens, target.perMinute);
    ctx.host.logger.warn(
      `[EPO OPS throttle] limit_changed bucket=${name} scope=${scopeLabel(scope)} per_minute=${previousPerMinute}->${target.perMinute} source=x-throttling-control`
    );
  }
}
