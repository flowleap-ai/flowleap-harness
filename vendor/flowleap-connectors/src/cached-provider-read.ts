/*---------------------------------------------------------------------------------------------
 *  Cached provider read (#84)
 *
 *  The single spine for read-through patent-data provider calls: given a cache
 *  key, a TTL, and a thunk performing the provider call, return the cached or
 *  fresh result. One deep module so route handlers shrink to
 *  validate → build key → delegate → respond.
 *
 *  The implementation owns:
 *   - hybrid memory + Redis caching via the existing async hybrid path
 *     (getFromCacheAsync/setInCacheAsync) — this is what closes the latent bug
 *     where hot routes used the sync node-cache-only path and silently skipped
 *     Redis;
 *   - clone discipline: the cache always holds a pristine copy and callers get
 *     a mutation-safe one, so post-cache mutation (e.g. the opt-in EPO
 *     enrichment fan-out) never leaks into later cache hits;
 *   - typed-error mapping to the ONE unified error envelope (the shape the
 *     /v1/tools facade uses): `{ success: false, error: { code, message, ... },
 *     status }`. Known classes: DataKeysRequiredError → 400 data_keys_required
 *     (ADR 0008), ProviderKeyInvalidError → 400 patent_provider_key_invalid
 *     (ADR 0007), RateLimitError → 429 rate_limit_exceeded (+ Retry-After),
 *     UpstreamError → verbatim passthrough of a provider-reported failure,
 *     anything else → generic upstream failure.
 *   - the no-cache-on-failure rule: only successful thunk results are stored.
 *
 *  The thunk runs in the caller's context (the backend's AsyncLocalStorage
 *  request context flows through untouched) — the module never captures
 *  credentials.
 *
 *  Host-scoped (ADR 0019 C1): the cache is `host.cache` (absent: every read is
 *  fresh), a cache hit is reported through `host.onOutcome`, and the extra
 *  envelope fields of a typed key error come from `host.errorDetails`.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes } from './contract/error-codes.js';
import {
	APIError,
	ClientGoneError,
	DataKeysRequiredError,
	ProviderKeyInvalidError,
	RateLimitError,
	TrialDataBudgetExhaustedError,
	UpstreamError,
	UpstreamUnavailableError,
	type PatentProvider,
} from './errors.js';
import type { ConnectorHost } from './host.js';

export { UpstreamError } from './errors.js';

/** The unified error envelope — the same wire shape the /v1/tools facade emits. */
export interface UnifiedErrorBody {
	success: false;
	error: {
		code: string;
		message: string;
		[detail: string]: unknown;
	};
	status: number;
}

export interface ProviderReadFailure {
	ok: false;
	/** HTTP status to respond with (mirrors body.status). */
	status: number;
	/** Extra response headers (e.g. Retry-After on 429). */
	headers: Record<string, string>;
	body: UnifiedErrorBody;
	/**
	 * The error the thunk threw, when the failure came from one (ADR 0019 C2a).
	 * In memory only — the wire carries `body`. A tool that re-raises a typed
	 * key or rate-limit condition throws THIS object, so it keeps every field
	 * the host set on it (a rejected stored key's `stored` flag, #518) without
	 * reading the host's request context.
	 */
	cause?: unknown;
}

export type ProviderReadResult<T> =
	| { ok: true; data: T; cached: boolean }
	| ProviderReadFailure;

export interface CachedProviderReadOptions<T> {
	/** Cache key (build with getCacheKey). Must exclude post-cache mutations like `enrich`. */
	cacheKey: string;
	/** TTL in seconds for both cache layers. */
	ttlSeconds: number;
	/**
	 * The provider call. Runs only on a cache miss, in the caller's request
	 * context (AsyncLocalStorage patent keys flow through). Throw a typed error
	 * (DataKeysRequiredError, ProviderKeyInvalidError, RateLimitError,
	 * UpstreamError) for a specific envelope; any other throw maps to the
	 * generic upstream failure. Failures are never cached.
	 */
	fetchFresh: () => Promise<T>;
	/**
	 * Optional: return false to hand a successful result back without storing
	 * it — for a partial result (one source of several failed) that must not be
	 * served from cache for the whole TTL. Default: every success is stored.
	 */
	shouldCache?: (data: T) => boolean;
}

/**
 * Read-through cache for a provider call: serve from the hybrid memory+Redis
 * cache when possible, otherwise run `fetchFresh`, store the result in both
 * layers, and return it. The returned `data` is always safe to mutate — the
 * cached copy stays pristine.
 */
export async function cachedProviderRead<T>(
	host: ConnectorHost,
	options: CachedProviderReadOptions<T>,
): Promise<ProviderReadResult<T>> {
	const { cacheKey, ttlSeconds, fetchFresh, shouldCache } = options;

	// Both absence sentinels count as a miss: node-cache reports misses as
	// undefined, the Redis layer as null — and failures are never cached, so a
	// stored null can only ever be an absent entry, not a success payload.
	const cached = await host.cache?.get<T>(cacheKey);
	if (cached !== undefined && cached !== null) {
		// Observational (PRD 0001 S1): served without touching a provider. A miss says
		// nothing here — the thunk's own upstream names itself and wins (last writer).
		host.onOutcome?.({ kind: 'upstream', upstream: 'cache' });
		// node-cache runs with useClones:false (it hands back the stored
		// reference), so clone before returning to keep the cached copy pristine.
		return { ok: true, data: structuredClone(cached), cached: true };
	}

	let data: T;
	try {
		data = await fetchFresh();
	} catch (error) {
		// PRD 0001 S4: the client hung up, so the thunk abandoned its work. That is not a
		// provider failure — do not map it into an envelope nobody can receive; let it
		// reach the route, which swallows it.
		if (error instanceof ClientGoneError) {
			throw error;
		}
		// Upstream failures are never cached.
		return { ok: false, ...mapProviderError(host, error), cause: error };
	}

	if (shouldCache && !shouldCache(data)) {
		return { ok: true, data, cached: false };
	}

	// Store a pristine clone; hand the caller the original, which it may mutate.
	await host.cache?.set(cacheKey, structuredClone(data), ttlSeconds);
	return { ok: true, data, cached: false };
}

/**
 * Map any error thrown around a provider call to the unified envelope. Used
 * internally by cachedProviderRead; exported so route adapters can keep their
 * catch-all on the same single construction site (e.g. errors thrown by
 * post-cache enrichment fan-out).
 */
export function mapProviderError(host: Pick<ConnectorHost, 'errorDetails'>, error: unknown): {
	status: number;
	headers: Record<string, string>;
	body: UnifiedErrorBody;
} {
	// ADR 0008: paid user, no forwarded key, fallback denied → 400, never 402.
	if (error instanceof DataKeysRequiredError) {
		return envelope(400, error.code, error.message, {
			provider: error.provider,
			...host.errorDetails?.(error),
		});
	}

	// ADR 0017: the trialing user's daily house-key budget is spent → 429 with a
	// Retry-After to the next UTC day. The BYOK nudge rides the message.
	if (error instanceof TrialDataBudgetExhaustedError) {
		const result = envelope(429, error.code, error.message, {
			provider: error.provider,
			remaining: 0,
			resets_at: error.resetsAt.toISOString(),
			retry_after: error.retryAfterSeconds,
		});
		result.headers['Retry-After'] = String(error.retryAfterSeconds);
		return result;
	}

	// ADR 0007: the USER-supplied key was rejected upstream → 400, never a
	// passthrough 401/403 (the client maps 401 to Clerk re-sign-in). A rejected STORED
	// key (#518) also sends the human to the keys page.
	if (error instanceof ProviderKeyInvalidError) {
		return envelope(400, error.code, error.message, {
			provider: error.provider,
			...host.errorDetails?.(error),
		});
	}

	if (error instanceof RateLimitError) {
		const result = envelope(
			429,
			ErrorCodes.rate_limit_exceeded,
			`Rate limit exceeded for ${error.service}. Please retry later.`,
			{ service: error.service, retry_after: error.retryAfter },
		);
		if (error.retryAfter !== undefined) {
			result.headers['Retry-After'] = String(error.retryAfter);
		}
		return result;
	}

	// A transient upstream failure (5xx or timeout) → structured 503 with a
	// Retry-After steer, so the agent knows to retry the same query rather than
	// treating it as a permanent error. The message is already an HTML-free
	// status line (the throwing code strips any upstream body).
	if (error instanceof UpstreamUnavailableError) {
		const result = envelope(503, ErrorCodes.upstream_unavailable, error.message, {
			service: error.service,
			retry_after: error.retryAfter,
		});
		if (error.retryAfter !== undefined) {
			result.headers['Retry-After'] = String(error.retryAfter);
		}
		return result;
	}

	// Provider-reported failure passed through verbatim by the thunk. A numeric
	// `retry_after` detail also becomes the header, so a transient typed error
	// carries its back-off on EVERY route that maps through here rather than at
	// the one call site that remembered to set it by hand (#406).
	if (error instanceof UpstreamError) {
		const result = envelope(error.status, error.code, error.message, error.details);
		const retryAfter = error.details?.retry_after;
		if (typeof retryAfter === 'number') {
			result.headers['Retry-After'] = String(retryAfter);
		}
		return result;
	}

	// Generic upstream failure: an HTTP-level error from the shared fetch
	// plumbing keeps its status (clamped to a valid response range)…
	if (error instanceof APIError) {
		const status = error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502;
		return envelope(status, ErrorCodes.upstream_error, error.message.substring(0, 500), {
			service: error.service,
		});
	}

	// …and anything else is an opaque upstream failure.
	return envelope(
		502,
		ErrorCodes.upstream_error,
		error instanceof Error ? error.message : 'Upstream provider request failed',
	);
}

function envelope(
	status: number,
	code: string,
	message: string,
	details?: Record<string, unknown>,
): { status: number; headers: Record<string, string>; body: UnifiedErrorBody } {
	const errorBody: UnifiedErrorBody['error'] = { code, message };
	if (details) {
		for (const [key, value] of Object.entries(details)) {
			if (value !== undefined) errorBody[key] = value;
		}
	}
	return {
		status,
		headers: {},
		body: { success: false, error: errorBody, status },
	};
}

/**
 * Re-raise a failed provider read as the typed error it came from, for the
 * tool contract: a typed key or rate-limit condition reaches the route layer
 * as its error class (DataKeysRequiredError, ProviderKeyInvalidError,
 * RateLimitError), which the host maps canonically (the backend: 400
 * data_keys_required / 400 patent_provider_key_invalid / 429 with
 * Retry-After); everything else as a plain Error carrying the upstream message.
 *
 * The thunk's own error (`failure.cause`) is thrown when it is one of those
 * classes, so nothing the host set on it is lost. A failure built without a
 * cause (a hand-made envelope) is reconstructed from its body; `stored` then
 * says whether the rejected key of that office was a stored one (the backend
 * answers it from its request context; default: not stored).
 */
export function throwProviderReadError(
	failure: ProviderReadFailure,
	stored: (provider: PatentProvider) => boolean = () => false,
): never {
	const { cause } = failure;
	if (
		cause instanceof DataKeysRequiredError ||
		cause instanceof ProviderKeyInvalidError ||
		cause instanceof RateLimitError
	) {
		throw cause;
	}
	const { code, message } = failure.body.error;
	const provider = (failure.body.error.provider as PatentProvider) ?? 'epo';

	if (code === ErrorCodes.data_keys_required) {
		throw new DataKeysRequiredError(provider);
	}
	if (code === ErrorCodes.patent_provider_key_invalid) {
		throw new ProviderKeyInvalidError(provider, message, stored(provider));
	}
	if (code === ErrorCodes.rate_limit_exceeded && typeof failure.body.error.service === 'string') {
		// A genuine RateLimitError (it carries its service); message-sniffed 429s
		// stay plain Errors, exactly as they were thrown before.
		throw new RateLimitError(
			failure.body.error.service,
			failure.body.error.retry_after as number | undefined,
			message,
		);
	}
	throw new Error(message);
}
