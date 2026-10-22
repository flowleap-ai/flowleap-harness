/*---------------------------------------------------------------------------------------------
 *  The per-instance context (ADR 0019 C1).
 *
 *  `createConnectors(host)` makes one of these and binds every client function
 *  to it. It carries the host and the state the clients keep per instance —
 *  state that used to be module-global in the backend and must not be shared
 *  between two hosts in one process: the OPS access-token cache (one entry per
 *  credential), the OPS throttle buckets (one scope per credential), and the
 *  ODP citation search's request spacing.
 *
 *  Every client function takes the context as its FIRST parameter. That keeps
 *  each module a set of plain functions a test can replace by file path, and
 *  keeps the instance explicit instead of ambient.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectorHost } from './host.js';

/** The OPS access token minted from one credential, with its expiry (epoch ms). */
export interface OpsTokenData {
	access_token: string;
	expires_in: number;
	expiry_time: number;
}

/** One OPS throttle bucket's state (see ./ops/throttle.ts). */
export interface OpsBucketState {
	/** Tokens available now, fractional between refills. */
	tokens: number;
	/** Epoch ms `tokens` was last brought up to date. */
	lastRefill: number;
	/** Requests per minute currently allowed; also the bucket's capacity. */
	perMinute: number;
	/** Epoch ms an armed backoff ends, when one is armed. */
	backoffUntil?: number;
}

export type OpsBucketType = 'search' | 'retrieval' | 'inpadoc' | 'images';

export type OpsScopeState = Record<OpsBucketType, OpsBucketState>;

export interface ConnectorState {
	readonly ops: {
		/** Access tokens by credential fingerprint (`env:<sha256>` / `user:<sha256>`). */
		readonly tokens: Map<string, OpsTokenData>;
		/** Throttle buckets by credential scope (`house` / `user:<sha256>`). */
		readonly throttleScopes: Map<string, OpsScopeState>;
	};
	readonly odp: {
		/** Epoch ms of the last enriched-citation request, for the 1s spacing. */
		lastCitationRequestAt: number;
	};
}

export interface ConnectorContext {
	readonly host: ConnectorHost;
	readonly state: ConnectorState;
}

export function createContext(host: ConnectorHost): ConnectorContext {
	return {
		host,
		state: {
			ops: { tokens: new Map(), throttleScopes: new Map() },
			odp: { lastCitationRequestAt: 0 },
		},
	};
}
