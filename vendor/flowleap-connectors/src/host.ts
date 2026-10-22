/*---------------------------------------------------------------------------------------------
 *  The connector host (ADR 0019, slice C1).
 *
 *  The office clients in this package run in two hosts: the FlowLeap backend
 *  (behind the /v1/tools facade and the MCP server) and the plugin inside the
 *  harness, in the user's own process with the firm's own keys. Everything a
 *  host can do differently — reach the network, hold credentials, cache, log,
 *  tell the time, account for a request, cancel it — is a capability on this
 *  one interface. The package itself reads no environment, holds no process-
 *  wide state and imports nothing from a host.
 *
 *  A client function gets the host through a {@link ConnectorContext} (see
 *  ./context.ts): the host plus the per-instance state the clients keep (the
 *  OPS token cache, the OPS throttle buckets, the ODP request spacing).
 *--------------------------------------------------------------------------------------------*/

import type { DataKeysRequiredError, ProviderKeyInvalidError } from './errors.js';

/** The providers a host holds credentials for. `mistral` is reserved for OCR. */
export type ConnectorProvider = 'epoOps' | 'usptoOdp' | 'semanticScholar' | 'mistral';

export interface EpoOpsCredentials {
	readonly consumerKey: string;
	readonly consumerSecret: string;
}

export interface UsptoOdpCredentials {
	readonly apiKey: string;
}

export interface SemanticScholarCredentials {
	readonly apiKey?: string;
}

export interface MistralCredentials {
	readonly apiKey?: string;
}

export interface ConnectorCredentialMap {
	epoOps: EpoOpsCredentials;
	usptoOdp: UsptoOdpCredentials;
	semanticScholar: SemanticScholarCredentials;
	mistral: MistralCredentials;
}

/**
 * What a credentials lookup answers for one provider.
 *
 * - `available`: use these. `owner` says whose they are: `user` for a key the
 *   caller brought (forwarded on the request, or the user's stored key, in
 *   which case `stored` is true), `host` for the host's own key. The owner
 *   decides how a rejection is reported (a user key rejected upstream is a
 *   `patent_provider_key_invalid` the user must fix; a host key rejected is a
 *   host fault) and which OPS throttle scope and token-cache entry the request
 *   spends.
 * - `required`: the host holds a key but refuses it to this caller (the
 *   backend's paid plan without a user key, ADR 0008). The clients answer with
 *   `DataKeysRequiredError`.
 * - `missing`: nothing is configured for this provider.
 */
export type CredentialLookup<P extends ConnectorProvider> =
	| {
			readonly status: 'available';
			readonly credentials: ConnectorCredentialMap[P];
			readonly owner: 'user' | 'host';
			readonly stored?: boolean;
	  }
	| { readonly status: 'required' }
	| { readonly status: 'missing' };

/** A cache of JSON-serialisable values with a TTL in seconds. Absent on the host: no cache. */
export interface ConnectorCache {
	get<T>(key: string): Promise<T | undefined>;
	set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export interface ConnectorLogger {
	info(message: string, ...rest: unknown[]): void;
	warn(message: string, ...rest: unknown[]): void;
	error(message: string, ...rest: unknown[]): void;
}

/** The patent office a client event or error names. */
export type PatentOffice = 'epo' | 'uspto';

/**
 * What a client reports to the host while it works (`onOutcome`). Every event
 * is observational except `upstream_call`, which a host may refuse by throwing.
 */
export type ConnectorEvent =
	/**
	 * The client is about to make the first upstream call of one logical
	 * request on `office` (retries are the same request). Emitted once per
	 * request, after the throttle and before the token mint or the data call.
	 * A host may throw here to refuse the call — the backend charges its trial
	 * data budget at this point and throws when today's budget is spent.
	 */
	| { readonly kind: 'upstream_call'; readonly office: PatentOffice }
	/** Which upstream the request consulted: a provider, or the cache. */
	| { readonly kind: 'upstream'; readonly upstream: 'ops' | 'odp' | 'cache' }
	/** How the request is ending, when the client knows better than a status code. */
	| { readonly kind: 'outcome'; readonly outcome: 'timeout' | 'backoff' };

/** The OCR capability the IFW document reader needs (the OCR itself stays with the host). */
export interface ConnectorOcr {
	run(input: { file: string; filename: string }): Promise<{
		pageCount: number;
		markdown: string;
		model: string;
	}>;
}

export interface ConnectorSettings {
	/**
	 * The wall-clock budget of one logical OPS request, retries included, in
	 * ms. Default 20000 — inside a 60s proxy read window, with room for the
	 * cache write and the response (PRD 0001 S2).
	 */
	readonly opsRequestDeadlineMs?: number;
	/** Ceiling on any single sleep inside an OPS request, in ms. Default 5000. */
	readonly opsMaxSingleSleepMs?: number;
}

export interface ConnectorHost {
	/** The network. The standard `fetch` signature; retry rules live in this package. */
	readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
	/** The credentials for one provider, looked up per call (a request-scoped answer is fine). */
	credentials<P extends ConnectorProvider>(provider: P): Promise<CredentialLookup<P>>;
	/** Read-through cache for provider results and the OPS access token. Absent: no cache. */
	readonly cache?: ConnectorCache;
	readonly logger: ConnectorLogger;
	/** The clock, epoch ms. Deadlines, token expiry and throttle refills read it. */
	now(): number;
	/** Accounting hook, see {@link ConnectorEvent}. */
	onOutcome?(event: ConnectorEvent): void;
	/**
	 * The signal of the caller this work is for, aborted when the caller is
	 * gone (the HTTP client hung up, the user cancelled). A client stops before
	 * spending anything on an abandoned request. Absent: never aborted.
	 */
	signal?(): AbortSignal | undefined;
	readonly ocr?: ConnectorOcr;
	readonly settings?: ConnectorSettings;
	/**
	 * Extra fields a host adds to the error envelope of a typed key error — the
	 * backend's keys-page URL and the human next step (#516, #518). Absent or
	 * undefined: the envelope carries `code`, `message` and `provider` only.
	 */
	errorDetails?(error: DataKeysRequiredError | ProviderKeyInvalidError): Record<string, unknown> | undefined;
}

/** The office of a provider, for events and the typed key errors. */
export function officeOf(provider: 'epoOps' | 'usptoOdp'): PatentOffice {
	return provider === 'epoOps' ? 'epo' : 'uspto';
}
