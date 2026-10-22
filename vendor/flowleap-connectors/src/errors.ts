/*---------------------------------------------------------------------------------------------
 *  The typed errors the connectors throw (ADR 0019 C1).
 *
 *  One module, so every host maps them with `instanceof` against the same
 *  classes the clients throw. The backend re-exports each class from the path
 *  it lived at before the extraction (lib/fetch-with-retry.ts,
 *  lib/cached-provider-read.ts, lib/patentKeys/context.ts, lib/client-abort.ts,
 *  lib/trial-data-budget.ts), so its importers and its wire mapping are
 *  unchanged.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes } from './contract/error-codes.js';

/** The patent office a typed key error names. */
export type PatentProvider = 'epo' | 'uspto';

/**
 * Custom error for rate limit (429) responses
 */
export class RateLimitError extends Error {
	readonly statusCode = 429;
	readonly retryAfter?: number;
	readonly service: string;

	constructor(service: string, retryAfter?: number, message?: string) {
		super(message || `${service} rate limit exceeded${retryAfter ? `. Retry after ${retryAfter}s` : ''}`);
		this.name = 'RateLimitError';
		this.service = service;
		this.retryAfter = retryAfter;
	}
}

/**
 * Custom error for API errors with status code
 */
export class APIError extends Error {
	readonly statusCode: number;
	readonly service: string;

	constructor(service: string, statusCode: number, message: string) {
		super(message);
		this.name = 'APIError';
		this.service = service;
		this.statusCode = statusCode;
	}
}

/**
 * A transient upstream failure the client should retry: an upstream 5xx or a
 * per-request timeout. Distinct from {@link APIError} so the error mapper can
 * turn it into a structured `503 upstream_unavailable` + `Retry-After` (a clear
 * transient-vs-permanent steer) instead of a generic 502, and so the message is
 * a short HTML-free status line rather than the upstream response body.
 */
export class UpstreamUnavailableError extends Error {
	/** Client-facing status is always 503 (transient). */
	readonly statusCode = 503;
	readonly service: string;
	/** Seconds to wait before retrying (honors an upstream Retry-After when known). */
	readonly retryAfter?: number;
	/** The real upstream status (e.g. 502/503/504) for logs — never leaked verbatim. */
	readonly upstreamStatus?: number;

	constructor(
		service: string,
		options: { retryAfter?: number; upstreamStatus?: number; message?: string } = {}
	) {
		super(options.message || `${service} is temporarily unavailable. Please retry shortly.`);
		this.name = 'UpstreamUnavailableError';
		this.service = service;
		this.retryAfter = options.retryAfter;
		this.upstreamStatus = options.upstreamStatus;
	}
}

/**
 * A provider call failed with a specific, provider-reported status/code/message
 * (e.g. an ODP `{ ok: false, error }` result). Thunks throw this to have the
 * failure pass through into the unified envelope verbatim instead of the
 * generic upstream-failure mapping.
 */
export class UpstreamError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = 'UpstreamError';
	}
}

/**
 * A patent-data provider rejected the USER-supplied credential (bad EPO consumer
 * key/secret, bad USPTO API key). Deliberately distinct from sign-in failures (401 →
 * re-sign-in) and the subscription gate (402): the recovery action is "update your
 * patent-data keys". The canonical HTTP mapping —
 * `400 { error: { code: 'patent_provider_key_invalid', provider } }` — lives with the
 * other error→response mappings in the backend (lib/fetch-with-retry.ts `createErrorResponse`).
 * `stored` is true when the rejected key is the user's stored key (#518): the envelope
 * then also sends the human to the keys page to replace it (the host's `errorDetails`).
 */
export class ProviderKeyInvalidError extends Error {
	readonly code = ErrorCodes.patent_provider_key_invalid;
	constructor(
		readonly provider: PatentProvider,
		message: string,
		readonly stored = false,
	) {
		super(message);
		this.name = 'ProviderKeyInvalidError';
	}
}

/** Human-facing provider names for error messages. */
const PROVIDER_LABELS: Record<PatentProvider, string> = {
	epo: 'EPO OPS',
	uspto: 'USPTO ODP',
};

/**
 * The host holds a key for this provider but refuses it to this caller (the
 * backend: a PAID subscription reached a provider chokepoint with no user key, and
 * server-key fallback is not permitted, ADR 0008). Distinct from the subscription
 * gate (402 → pay) and from a rejected user key (`patent_provider_key_invalid`
 * → the key is bad): here the recovery action is "add your patent-data keys".
 * Per-provider by construction — thrown at the specific provider's chokepoint, so
 * an EPO-only read never demands a USPTO key. The canonical HTTP mapping —
 * `400 { error: { code: 'data_keys_required', provider, keysPageUrl, nextStep } }` —
 * lives in the backend; the two #516 fields come from the host's `errorDetails`.
 */
export class DataKeysRequiredError extends Error {
	readonly code = ErrorCodes.data_keys_required;
	constructor(readonly provider: PatentProvider) {
		super(
			// Factual plan wording, no trial or promotion (#539): the text reaches MCP clients too.
			`${PROVIDER_LABELS[provider]} data keys are required. Your plan does not include FlowLeap's shared ` +
				`patent-data access — add your own free ${PROVIDER_LABELS[provider]} key to continue.`,
		);
		this.name = 'DataKeysRequiredError';
	}
}

/**
 * A trialing user's daily house-key budget is used up (ADR 0017). The backend's
 * `upstream_call` hook throws it; the clients never retry it and the error
 * mappers answer `429 trial_data_budget_exhausted` + Retry-After. The host
 * composes the message (it names the keys page); the default is a plain one.
 */
export class TrialDataBudgetExhaustedError extends Error {
	readonly code = ErrorCodes.trial_data_budget_exhausted;
	constructor(
		readonly provider: PatentProvider,
		readonly resetsAt: Date,
		readonly retryAfterSeconds: number,
		message = `Today's shared patent-data budget is used up — it resets at ${resetsAt.toISOString()}.`,
	) {
		super(message);
		this.name = 'TrialDataBudgetExhaustedError';
	}
}

/**
 * The caller is gone (the HTTP client hung up before the response was sent, the
 * user cancelled), so the work in flight was abandoned on purpose.
 *
 * Deliberately NOT an ADR 0014 wire code: it must never reach the wire, because there is
 * no socket left to answer on. Every layer that catches it either re-throws it (it is
 * never retried, and never mapped to a provider failure) or swallows it at the route,
 * where the completion line has already reported `outcome=client_gone`.
 */
export class ClientGoneError extends Error {
	constructor(message = 'Client closed the connection before the response was sent.') {
		super(message);
		this.name = 'ClientGoneError';
	}
}
