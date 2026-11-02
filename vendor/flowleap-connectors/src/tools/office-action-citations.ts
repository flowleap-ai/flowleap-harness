/*---------------------------------------------------------------------------------------------
 *  The USPTO office-action citation tools (PRD 0013 T07; in the package since #180).
 *
 *  `search_office_action_citations`, `search_enriched_citations` and
 *  `get_citation_stats` read the USPTO ODP enriched citation data on the
 *  host's ODP key: a free public API, so every host runs them on its own key.
 *  Each read goes through the host cache for 24h (ODP_LOOKUP_TTL); a failed
 *  read is never cached. The cache keys are the ones the backend has always
 *  written, so a warm entry stays valid.
 *
 *  Vocabulary (the backend's CONTEXT.md): "examiner-cited prior art" is a
 *  citation from a USPTO office action, used by an examiner to reject claims
 *  under 35 USC 102/103. It is distinct from the "patent-cited references" of
 *  a patent's own bibliography, and materially stronger evidence.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { getCacheKey } from '../cache-key.js';
import { cachedProviderRead } from '../cached-provider-read.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { UpstreamError } from '../errors.js';
import type { CitationCategory, CitationSearchOptions, CitationSearchResult } from '../uspto-odp/types.js';
import type { ToolContext, ToolDefinition } from './definition.js';
import { withCitationDocumentReference } from './document-reference.js';
import { ODP_LOOKUP_TTL, flexibleId, tool, unwrapCachedOdp } from './shared.js';

const CITATION_CATEGORY = z.enum(['X', 'Y', 'A', 'all']);

function citationOptions(input: {
	size?: number;
	offset?: number;
	category?: z.infer<typeof CITATION_CATEGORY>;
	examiner_cited_only?: boolean;
}): CitationSearchOptions {
	return {
		size: input.size,
		offset: input.offset,
		category: input.category === 'all' ? undefined : (input.category as CitationCategory | undefined),
		examinerCitedOnly: input.examiner_cited_only,
	};
}

/**
 * One cached citation search: the rows with a navigation reference each. A
 * failed search raises the ODP status (422 when ODP names none) with
 * TOOL_EXECUTION_ERROR.
 */
async function cachedCitationSearch(
	ctx: ToolContext,
	endpoint: string,
	params: object,
	search: () => Promise<CitationSearchResult>,
) {
	const data = unwrapCachedOdp(
		await cachedProviderRead(ctx.connectors.host, {
			cacheKey: getCacheKey(endpoint, params),
			ttlSeconds: ODP_LOOKUP_TTL,
			fetchFresh: async () => {
				const result = await search();
				if (!result.success) {
					throw new UpstreamError(
						result.status || 422,
						ErrorCodes.TOOL_EXECUTION_ERROR,
						result.error || 'Citation search failed',
					);
				}
				return { total: result.total, citations: result.data };
			},
		}),
	);
	return { ...data, citations: data.citations?.map(withCitationDocumentReference) };
}

/** The office-action citation tools, as `officeTools()` lists them. */
export const searchOfficeActionCitationsTool: ToolDefinition = tool({
	name: 'search_office_action_citations',
	annotations: { title: 'Search US office-action citations' },
	description:
		'Examiner-cited prior art from USPTO office actions for an application (enriched citation data) — ' +
		'references an examiner used to reject claims under 35 USC 102/103, distinct from (and materially stronger ' +
		'evidence than) the patent-cited references in a patent\'s own bibliography. Filter by category, ' +
		'examiner_cited_only, and date_range over the office-action date. ' +
		'Novelty recipe: category="X" with examiner_cited_only=true reproduces the legacy novelty route — the ' +
		'X-category references the examiner held to destroy novelty under 35 USC 102 on their own. ' +
		'For aggregate counts only, use get_citation_stats.',
	input: z.object({
		application_number: flexibleId(4),
		size: z.number().int().min(1).max(1000).default(100),
		offset: z.number().int().min(0).default(0),
		category: CITATION_CATEGORY.optional(),
		examiner_cited_only: z.boolean().default(false),
		date_range: z
			.object({
				from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
				to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
			})
			.optional()
			.describe('Inclusive office-action date window; from/to are YYYY-MM-DD, each optional'),
	}),
	access: 'usptoOdp',
	handler: async (input, ctx) => {
		const options = { ...citationOptions(input), dateRange: input.date_range };
		return cachedCitationSearch(
			ctx,
			'odp-citations-application',
			{ applicationNumberText: input.application_number, ...options },
			() => ctx.connectors.odp.searchCitationsByApplication(input.application_number, options),
		);
	},
});

export const searchEnrichedCitationsTool: ToolDefinition = tool({
	name: 'search_enriched_citations',
	annotations: { title: 'Search US office actions citing a document' },
	description:
		'Find USPTO office actions citing a given document (forward enriched citations), with category and examiner filters.',
	input: z.object({
		cited_document: flexibleId(4).describe('Cited patent/publication number'),
		size: z.number().int().min(1).max(1000).default(100),
		offset: z.number().int().min(0).default(0),
		category: CITATION_CATEGORY.optional(),
		examiner_cited_only: z.boolean().default(false),
	}),
	access: 'usptoOdp',
	handler: async (input, ctx) => {
		const options = citationOptions(input);
		return cachedCitationSearch(
			ctx,
			'odp-citations-document',
			{ citedDocument: input.cited_document, ...options },
			() => ctx.connectors.odp.searchCitationsByDocument(input.cited_document, options),
		);
	},
});

export const getCitationStatsTool: ToolDefinition = tool({
	name: 'get_citation_stats',
	annotations: { title: 'Get US citation statistics' },
	description:
		'Citation statistics for the examiner-cited prior art of a US application (USPTO enriched citation data): ' +
		'total citations, counts by category (X = alone destroys novelty, Y = combines for obviousness, A = background, other), ' +
		'origin counts (examiner-cited, applicant-cited, unknown origin — each row lands in exactly one bucket), and the non-patent-literature (NPL) count. ' +
		'Parity with the legacy GET /v1/citation-search/stats route. ' +
		'For the citation records themselves use search_office_action_citations.',
	input: z.object({
		application_number: flexibleId(4).describe('USPTO application number, e.g. 16123456'),
	}),
	access: 'usptoOdp',
	handler: async (input, ctx) =>
		unwrapCachedOdp(
			await cachedProviderRead(ctx.connectors.host, {
				cacheKey: getCacheKey('odp-citation-stats', { applicationNumberText: input.application_number }),
				ttlSeconds: ODP_LOOKUP_TTL,
				fetchFresh: async () => {
					const result = await ctx.connectors.odp.getCitationStats(input.application_number);
					if (!result.success || !result.stats) {
						// getCitationStats reports no HTTP status, so a failure is a 500, as the
						// legacy stats route answered.
						throw new UpstreamError(500, ErrorCodes.TOOL_EXECUTION_ERROR, result.error || 'Citation stats failed');
					}
					return { applicationNumber: input.application_number, stats: result.stats };
				},
			}),
		),
});
