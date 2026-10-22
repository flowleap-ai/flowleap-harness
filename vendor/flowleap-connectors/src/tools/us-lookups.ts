/*---------------------------------------------------------------------------------------------
 *  US lookup tools — get_us_grant and get_us_application (PRD 0013 T06, #274)
 *
 *  Facade parity with the legacy USPTO ODP lookup routes:
 *   - get_us_grant       ≙ GET /v1/patent-search-uspto/grants/:patentNumber —
 *     two-step resolution (grant number → applicationNumberText via an ODP
 *     search, the permanent mapping cached ~1 year; then the full file
 *     wrapper record).
 *   - get_us_application ≙ GET /v1/patent-search-uspto/applications/:app —
 *     the full ODP file wrapper record by applicationNumberText.
 *
 *  Both tools share the routes' cache keys (odp-patent-to-app /
 *  odp-application), so facade and legacy reads of the same document hit ONE
 *  cache entry. Opt-in EPO enrichment (enrich[]) runs AFTER the cache read on
 *  the mutation-safe copy — exactly as the routes do — and lands under each
 *  record's namespaced `epoEnrichment` block. Not-found is never cached (the
 *  number may be ingested by ODP later).
 *
 *  ODP application vs granted patent (CONTEXT.md): a granted patent is an
 *  application whose applicationMetaData.publicationCategoryBag includes
 *  "Granted/Issued" AND whose patentNumber is non-empty. Both tools surface
 *  that verdict as a top-level `granted` flag.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { getCacheKey } from '../cache-key.js';
import { cachedProviderRead, UpstreamError } from '../cached-provider-read.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { parseEnrichKeys } from '../uspto-odp/enrichment.js';
import type { ODPApplicationRecord, ODPSearchError, ODPSearchResponse } from '../uspto-odp/patent-search.js';
import type { ToolContext } from './definition.js';
// Shared primitives from the leaf module (T09 consolidation, #277) — no
// registry import cycle. unwrapCachedOdp moved there with the #334 ODP
// caching-gap work, so every cached ODP read shares one unwrap chokepoint.
import { tool, unwrapCachedOdp, ODP_LOOKUP_TTL, type ToolDefinition } from './shared.js';

// Same TTLs the route file used: transient wrapper reads ride the standard
// USPTO window (ODP_LOOKUP_TTL, 24h); the grant-number → application-number
// mapping is permanent (a granted patent is never reassigned), so it gets the
// longest TTL the cache layers accept.
const USPTO_CACHE_TTL = ODP_LOOKUP_TTL;
const PATENT_TO_APP_TTL = 60 * 60 * 24 * 365;

/** Convert an ODP `{ ok: false }` result into the verbatim-passthrough error. */
function toUpstreamError(error: ODPSearchError): UpstreamError {
	return new UpstreamError(error.status, error.code, error.message, {
		upstreamRequestIdentifier: error.upstreamRequestIdentifier,
	});
}

/** CONTEXT.md rule: granted ⇔ "Granted/Issued" in publicationCategoryBag AND non-empty patentNumber. */
function isGrantedRecord(record: ODPApplicationRecord | undefined): boolean {
	const meta = record?.applicationMetaData;
	const categories = Array.isArray(meta?.publicationCategoryBag)
		? meta.publicationCategoryBag
		: [];
	return (
		typeof meta?.patentNumber === 'string' &&
		meta.patentNumber.length > 0 &&
		categories.includes('Granted/Issued')
	);
}

/**
 * Read the full file wrapper for an application through the shared
 * odp-application cache entry (the same key the legacy /grants step 2 and
 * /applications routes populate). Empty bag → 404 inside the thunk, never
 * cached.
 */
async function readApplicationWrapper(
	ctx: ToolContext,
	applicationNumberText: string
): Promise<ODPSearchResponse> {
	return unwrapCachedOdp(
		await cachedProviderRead<ODPSearchResponse>(ctx.connectors.host, {
			cacheKey: getCacheKey('odp-application', { applicationNumberText }),
			ttlSeconds: USPTO_CACHE_TTL,
			fetchFresh: async () => {
				const record = await ctx.connectors.odp.getODPApplicationByNumber(applicationNumberText);
				if (!record.ok) throw toUpstreamError(record.error);
				if (record.data.patentFileWrapperDataBag.length === 0) {
					throw new UpstreamError(
						404,
						ErrorCodes.application_not_found,
						`No application found with applicationNumberText=${applicationNumberText}.`
					);
				}
				return record.data;
			},
		})
	);
}

// ---------------------------------------------------------------------------
// Input schemas (snake_case params, numeric JSON accepted for identifiers)
// ---------------------------------------------------------------------------

const ENRICH_KEYS = ['abstract', 'claims', 'family', 'legal', 'ipc'] as const;

const enrichInput = z
	.array(z.enum(ENRICH_KEYS))
	.optional()
	.describe(
		'Opt-in EPO OPS enrichment fields attached under each record\'s epoEnrichment block. ' +
			'Only granted records (with a patentNumber) are enriched; per-field EPO failures land in epoEnrichment.errors.'
	);

// Accepts numeric JSON and an optional "US" prefix; validates to a bare
// numeric US patent number. Normalization happens in the preprocess step so
// the schema output stays a plain string (JSON-schema representable).
const usGrantNumber = z
	.preprocess((value) => {
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
		if (typeof value === 'string') return value.trim().replace(/^us/i, '');
		return value;
	}, z.string().regex(/^\d+$/, 'must be a numeric US patent number, e.g. 10765880'))
	.describe('Granted US patent number, e.g. 10765880 (a leading "US" prefix is accepted)');

const usApplicationNumber = z
	.preprocess(
		(value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value),
		z.string().min(4)
	)
	.describe('USPTO application number, e.g. 16123456');

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const usLookupTools: ToolDefinition[] = [
	tool({
		name: 'get_us_grant',
		description:
			'Granted US patent lookup by patent number: resolves the grant to its USPTO application ' +
			'(two-step ODP resolution; the permanent number→application mapping is cached long-term) and ' +
			'returns the full application file wrapper. A granted patent is an ODP application whose ' +
			'publicationCategoryBag includes "Granted/Issued" with a non-empty patentNumber — the response ' +
			'carries that verdict as a `granted` flag. Optional enrich[] attaches EPO OPS data ' +
			'(abstract/claims/family/legal/ipc) under each record\'s epoEnrichment block.',
		input: z.object({
			patent_number: usGrantNumber,
			enrich: enrichInput,
		}),
		access: 'usptoOdp',
		handler: async (input, ctx) => {
			const patentNumber = input.patent_number;

			// Step 1: resolve patentNumber → applicationNumberText (permanent
			// mapping, cached ~1 year; shared with the legacy /grants route). A
			// not-found patent is an UpstreamError inside the thunk, so it is
			// never cached — the number may be ingested by ODP later.
			const applicationNumberText = unwrapCachedOdp(
				await cachedProviderRead<string>(ctx.connectors.host, {
					cacheKey: getCacheKey('odp-patent-to-app', { patentNumber }),
					ttlSeconds: PATENT_TO_APP_TTL,
					fetchFresh: async () => {
						const search = await ctx.connectors.odp.searchODPApplications({
							q: `applicationMetaData.patentNumber:${patentNumber}`,
							pagination: { limit: 1, offset: 0 },
							fields: ['applicationNumberText'],
						});
						if (!search.ok) throw toUpstreamError(search.error);
						const first = search.data.patentFileWrapperDataBag[0];
						if (!first?.applicationNumberText) {
							throw new UpstreamError(
								404,
								ErrorCodes.patent_not_found,
								`No US patent found with patentNumber=${patentNumber}. The number may be unissued, withdrawn, or not yet ingested by USPTO ODP.`
							);
						}
						return first.applicationNumberText;
					},
				})
			);

			// Step 2: full file wrapper (transient TTL); enrichment mutates the
			// mutation-safe copy AFTER cache retrieval.
			const wrapper = await readApplicationWrapper(ctx, applicationNumberText);
			const enrichKeys = parseEnrichKeys(input.enrich ?? null);
			if (enrichKeys) {
				await ctx.connectors.odp.enrichRecords(wrapper.patentFileWrapperDataBag, enrichKeys);
			}

			return {
				patentNumber,
				applicationNumberText,
				granted: isGrantedRecord(wrapper.patentFileWrapperDataBag[0]),
				...wrapper,
			};
		},
	}),
	tool({
		name: 'get_us_application',
		description:
			'Full USPTO application file wrapper by application number (USPTO ODP): metadata, continuity, ' +
			'transactions, assignments, attorney, and every other bag in one record. The `granted` flag ' +
			'reports whether the application has issued (publicationCategoryBag includes "Granted/Issued" ' +
			'with a non-empty patentNumber). Optional enrich[] attaches EPO OPS data ' +
			'(abstract/claims/family/legal/ipc) under the record\'s epoEnrichment block. ' +
			'Use get_us_grant when you only know the granted patent number.',
		input: z.object({
			application_number: usApplicationNumber,
			enrich: enrichInput,
		}),
		access: 'usptoOdp',
		handler: async (input, ctx) => {
			const applicationNumberText = input.application_number;

			const wrapper = await readApplicationWrapper(ctx, applicationNumberText);
			const enrichKeys = parseEnrichKeys(input.enrich ?? null);
			if (enrichKeys) {
				await ctx.connectors.odp.enrichRecords(wrapper.patentFileWrapperDataBag, enrichKeys);
			}

			return {
				applicationNumberText,
				granted: isGrantedRecord(wrapper.patentFileWrapperDataBag[0]),
				...wrapper,
			};
		},
	}),
];
