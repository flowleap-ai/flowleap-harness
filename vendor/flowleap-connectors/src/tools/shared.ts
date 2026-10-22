/*---------------------------------------------------------------------------------------------
 *  Shared tool primitives (PRD 0013 T09, #277; in the package since ADR 0019 C2a).
 *
 *  The leaf module under every tool module: the ToolError class a host's
 *  transport branches on, the `tool()` helper that applies the definition
 *  defaults, and the error-unwrap chokepoints the tool modules share. It
 *  imports only the package's own plumbing — never a tool module — so no
 *  import cycle can form.
 *
 *  History: these lived in the backend's registry.ts; the five parallel
 *  parity branches (T04–T08) each either duplicated them locally or reached
 *  them via dependency injection / a registry import cycle. T09 consolidated
 *  them in the backend's shared.ts; C2a moved them here with the tools. The
 *  backend's src/tools/shared.ts re-exports them and adds its own registry
 *  entry shape (access tier, rate limit, the caller identity).
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { recordCacheRead } from '../cache-visibility.js';
import {
	cachedProviderRead,
	throwProviderReadError,
	UpstreamError,
	type ProviderReadResult,
} from '../cached-provider-read.js';
import { getCacheKey } from '../cache-key.js';
import { ErrorCodes } from '../contract/error-codes.js';
import type { ToolAccess, ToolAnnotations, ToolContext, ToolDefinition } from './definition.js';

// ============================================================================
// Core types
// ============================================================================

/** Error a tool handler raises deliberately; the route maps status/code 1:1. */
export class ToolError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string,
		public details?: unknown
	) {
		super(message);
		this.name = 'ToolError';
	}
}

export type { ToolAccess, ToolAnnotations, ToolContext, ToolDefinition };

/** Words that a title spells in capitals, not in sentence case. */
const TITLE_ACRONYMS: Record<string, string> = {
	us: 'US',
	uspto: 'USPTO',
	npl: 'NPL',
	ocr: 'OCR',
	epo: 'EPO',
	cpc: 'CPC',
};

/** Default human title from a snake_case tool name: `get_us_grant` → "Get US grant". */
export function titleFromToolName(name: string): string {
	return name
		.split('_')
		.filter(Boolean)
		.map((word, index) => {
			const acronym = TITLE_ACRONYMS[word.toLowerCase()];
			if (acronym) return acronym;
			return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
		})
		.join(' ');
}

/**
 * Identity helper that keeps per-tool handler input types inferred from the
 * schema, and applies the definition defaults: a title derived from the name,
 * read-only hints. `access` names the credential the tool spends — stated on
 * every office tool, so a host can key-gate the call before the handler runs.
 */
export function tool<S extends z.ZodType>(def: {
	name: string;
	description: string;
	input: S;
	handler: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
	access: ToolAccess;
	annotations?: { title: string };
}): ToolDefinition {
	if (def.annotations && def.annotations.title.trim().length === 0) {
		throw new Error(`tool ${def.name}: annotations.title must not be blank`);
	}
	return {
		name: def.name,
		description: def.description,
		input: def.input,
		access: def.access,
		annotations: {
			title: def.annotations?.title ?? titleFromToolName(def.name),
			readOnlyHint: true,
			destructiveHint: false,
		},
		handler: def.handler,
	} as unknown as ToolDefinition;
}

// ============================================================================
// Input helpers
// ============================================================================

/**
 * Identifier fields accept numeric JSON (e.g. a bare patent number from a
 * CLI's key=value parsing) by converting numbers to strings BEFORE string
 * validation. Deliberately not z.coerce.string(): that would also coerce
 * undefined -> "undefined" and silently satisfy required fields.
 */
export function flexibleId(min: number) {
	return z.preprocess(
		(value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value),
		z.string().min(min)
	);
}

// ============================================================================
// Error-unwrap chokepoints
// ============================================================================

/**
 * Unwrap an EPO document-module read (../ops/direct.ts) for the tool
 * contract. Failures arrive already typed by the module's unified envelope —
 * no message sniffing:
 *  - typed key/rate-limit conditions re-raise as their error classes
 *    (throwProviderReadError), which the host's transport maps canonically
 *    (the backend's respondIfKnownError: 400 data_keys_required / 400
 *    patent_provider_key_invalid / 429 rate_limit_exceeded with Retry-After);
 *  - FULLTEXT_UNAVAILABLE passes through verbatim (with its `reason` and, on
 *    `no_source`, the `workaround`, on a host without the source, the
 *    `paidRoute`, under details) — the registry docs promise
 *    that code as a data-coverage verdict, so the generic 404→NOT_FOUND
 *    mapping must not swallow it;
 *  - upstream 404/429 keep the legacy tool codes NOT_FOUND / RATE_LIMITED;
 *  - a 422 keeps the module's own code (INVALID_INPUT) — the fault is in the
 *    request, not the server;
 *  - anything else surfaces as INTERNAL_ERROR with the upstream status.
 */
export function unwrapRead<T>(result: ProviderReadResult<T>): T {
	if (result.ok) {
		// Surface cache visibility to the facade envelope's `cached` flag
		// (../cache-visibility.ts); no-op outside a collecting scope.
		recordCacheRead(result.cached);
		return result.data;
	}
	const { code, message } = result.body.error;
	if (
		code === ErrorCodes.data_keys_required ||
		code === ErrorCodes.patent_provider_key_invalid ||
		(code === ErrorCodes.rate_limit_exceeded && typeof result.body.error.service === 'string')
	) {
		throwProviderReadError(result);
	}
	if (code === ErrorCodes.FULLTEXT_UNAVAILABLE) {
		// The router's structured fields ride under `details`: `reason` and, on
		// `no_source` only, the family-member `workaround` (ADR 0024, #581); on a
		// host without the section's source, the `paidRoute` (ADR 0019 decision 3).
		const { reason, workaround, paidRoute } = result.body.error as {
			reason?: string;
			workaround?: unknown;
			paidRoute?: unknown;
		};
		throw new ToolError(
			result.status,
			ErrorCodes.FULLTEXT_UNAVAILABLE,
			message,
			reason ? { reason, ...(workaround ? { workaround } : {}), ...(paidRoute ? { paidRoute } : {}) } : undefined
		);
	}
	if (result.status === 404) throw new ToolError(404, ErrorCodes.NOT_FOUND, message);
	if (result.status === 429) throw new ToolError(429, ErrorCodes.RATE_LIMITED, message);
	// A 422 is the module saying the INPUT is wrong (a malformed publication
	// number, a bad country code) — it already carries the registry code that
	// says which. Passing it through keeps 422 INVALID_INPUT intact; the old
	// blanket mapping relabelled it INTERNAL_ERROR, telling the caller the
	// server had faulted on a request only the caller can fix. The module names
	// the offending field in `parameter`/`value`; carry that into details so the
	// answer is as actionable as the ODP lookups' own 422.
	if (result.status === 422) {
		const { parameter, value } = result.body.error as { parameter?: string; value?: unknown };
		throw new ToolError(422, code, message, parameter ? { parameter, value } : undefined);
	}
	throw new ToolError(result.status, ErrorCodes.INTERNAL_ERROR, message);
}

export type OdpResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: { status: number; code: string; message: string } };

/** Unwrap an uncached ODP client result; the provider-reported code passes through verbatim. */
export function unwrapOdp<T>(result: OdpResult<T>): T {
	if (!result.ok) {
		throw new ToolError(result.error.status, result.error.code, result.error.message);
	}
	return result.data;
}

// ============================================================================
// Cached ODP reads (#334 — the ODP caching gap)
// ============================================================================

/**
 * ODP read-through TTLs (#334). ODP is the scarcest house key (60 req/min), so
 * repeats must never touch it — but prosecution data mutates (a file wrapper
 * grows), so lookups stay modest, mirroring the EPO table's ratios:
 * search 6h (the backend's CACHE_TTL.SEARCH, pinned equal by a backend test);
 * file-wrapper lookups 24h; IFW document text 7 days (a filed document is
 * immutable — only the listing changes).
 */
export const ODP_SEARCH_TTL = 21600;
export const ODP_LOOKUP_TTL = ODP_SEARCH_TTL * 4;
export const ODP_DOCUMENT_TEXT_TTL = 60 * 60 * 24 * 7;

/**
 * Unwrap a CACHED ODP read for the tool contract — the ODP flavor of
 * unwrapRead:
 *  - typed key/rate-limit conditions re-raise as their error classes, which the
 *    route layer maps canonically (respondIfKnownError);
 *  - upstream 404/429 map to the facade codes NOT_FOUND / RATE_LIMITED;
 *  - anything else passes the provider-reported code through verbatim (the
 *    same behavior as unwrapOdp for uncached ODP calls).
 */
export function unwrapCachedOdp<T>(result: ProviderReadResult<T>): T {
	if (result.ok) {
		recordCacheRead(result.cached);
		return result.data;
	}
	const { code, message } = result.body.error;
	if (
		code === ErrorCodes.data_keys_required ||
		code === ErrorCodes.patent_provider_key_invalid ||
		(code === ErrorCodes.rate_limit_exceeded && typeof result.body.error.service === 'string')
	) {
		throwProviderReadError(result);
	}
	if (result.status === 404) throw new ToolError(404, ErrorCodes.NOT_FOUND, message);
	if (result.status === 429) throw new ToolError(429, ErrorCodes.RATE_LIMITED, message);
	throw new ToolError(result.status, code, message);
}

/**
 * Read-through cache around an OdpResult-returning ODP client call: serve
 * repeats from the shared hybrid cache so they never touch the ODP key (and,
 * for a trialing house-key request, never charge the trial data budget —
 * ADR 0017). `{ ok: false }` results throw inside the thunk, so failures are
 * never cached and the provider-reported code passes through verbatim.
 */
export async function cachedOdpRead<T>(
	ctx: ToolContext,
	endpoint: string,
	params: object,
	ttlSeconds: number,
	fetchFresh: () => Promise<OdpResult<T>>,
): Promise<T> {
	return unwrapCachedOdp(
		await cachedProviderRead<T>(ctx.connectors.host, {
			cacheKey: getCacheKey(endpoint, params),
			ttlSeconds,
			fetchFresh: async () => {
				const result = await fetchFresh();
				if (!result.ok) {
					const error = result.error as {
						status: number;
						code: string;
						message: string;
						upstreamRequestIdentifier?: string;
					};
					throw new UpstreamError(error.status, error.code, error.message, {
						upstreamRequestIdentifier: error.upstreamRequestIdentifier,
					});
				}
				return result.data;
			},
		}),
	);
}
