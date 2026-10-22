/*---------------------------------------------------------------------------------------------
 *  Literature tools — academic search, NPL search, NPL reference resolution
 *  (PRD 0013 T08, #276; parent #268 Tier 2).
 *
 *  Registry entries kept in their own module so parallel registry work stays
 *  conflict-free. Each handler delegates to the client its retired route
 *  counterpart used (ADR 0013) — academic-search, npl-search, npl-resolve,
 *  through the handler's ToolContext since ADR 0019 C2a — keeping the cache
 *  entries and behavior.
 *  get_legal_jurisdictions was retired under ADR 0017 (410 endpoint_gone,
 *  ./tool-envelopes.ts).
 *
 *  Shared primitives (ToolError, tool) come from ./shared.ts, the leaf module —
 *  no registry import cycle (T09 consolidation, #277).
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { KEY_REJECTED_REASON } from '../academic-search/reasons.js';
import { recordCacheRead } from '../cache-visibility.js';
import { throwProviderReadError, type ProviderReadResult } from '../cached-provider-read.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { NPL_PUBLICATION_TYPES } from '../npl-search/index.js';
import { ToolError, tool, type ToolDefinition } from './shared.js';

/**
 * Unwrap a cached-provider read for the tool contract (mirrors the registry's
 * unwrapRead, without the patent-key branches — literature sources need no
 * provider keys). Genuine upstream rate limits re-raise as RateLimitError so
 * the route layer answers the canonical 429 with Retry-After; every other
 * failure keeps its unified-envelope registry code (upstream_error,
 * upstream_unavailable, …) — clients branch on the code, never message text.
 */
function unwrapLiteratureRead<T>(result: ProviderReadResult<T>): T {
	if (result.ok) {
		// Surface cache visibility to the facade envelope's `cached` flag.
		recordCacheRead(result.cached);
		return result.data;
	}
	const { code, message, ...details } = result.body.error;
	if (code === ErrorCodes.rate_limit_exceeded && typeof details.service === 'string') {
		throwProviderReadError(result);
	}
	throw new ToolError(
		result.status,
		code,
		message,
		Object.keys(details).length ? details : undefined
	);
}

const yearRange = {
	from_year: z.number().int().min(1000).max(9999).optional()
		.describe('Only papers published in or after this year'),
	to_year: z.number().int().min(1000).max(9999).optional()
		.describe('Only papers published in or before this year'),
};

export const literatureTools: ToolDefinition[] = [
	tool({
		name: 'search_academic',
		annotations: { title: 'Search academic literature' },
		description:
			'Search academic literature across Semantic Scholar and arXiv. Papers come back in relevance ' +
			'order, the two sources interleaved, with duplicates merged (by DOI, arXiv id, or title; ' +
			'alsoIn names the other source). Restrict with sources (semantic-scholar, arxiv) and a ' +
			'publication-year filter. Each paper carries its source: "scholar" (Semantic Scholar) or "arxiv". ' +
			'The sources array reports every requested source: status ok, rate_limited, or error, and ' +
			'totalHits, its own match count (total is the number of papers returned). A failed source ' +
			'contributes no papers and is named there; if every source fails, the call fails. ' +
			'The caller may send its own Semantic Scholar key in the X-Semantic-Scholar-Key header ' +
			`(a rejected key is reported as reason ${KEY_REJECTED_REASON} on the scholar source row); never ask ` +
			'the human for the key value in the chat. ' +
			'For OpenAlex-backed non-patent literature with open-access/type filters use search_npl.',
		input: z.object({
			query: z.string().min(1).describe('Search query for academic papers'),
			sources: z
				.array(z.enum(['semantic-scholar', 'arxiv']))
				.min(1)
				.default(['semantic-scholar', 'arxiv'])
				.describe('Academic sources to search (default: both)'),
			max_results: z.number().int().min(1).max(100).default(10),
			filter: z.object(yearRange).optional(),
		}),
		access: 'semanticScholar',
		handler: async (input, ctx) => {
			const data = unwrapLiteratureRead(
				await ctx.connectors.academic.runAcademicSearch({
					query: input.query,
					// The lib's historical name for the Semantic Scholar source is
					// 'scholar' (and papers carry source: 'scholar').
					sources: input.sources.map((s) => (s === 'semantic-scholar' ? 'scholar' : s)),
					maxResults: input.max_results,
					filter: input.filter
						? { fromYear: input.filter.from_year, toYear: input.filter.to_year }
						: undefined,
				})
			);
			return { query: input.query, total: data.total, papers: data.papers, sources: data.sources };
		},
	}),
	tool({
		name: 'search_npl',
		description:
			'Search non-patent literature: 250M+ scholarly works via OpenAlex (journal articles, ' +
			'proceedings, book chapters, preprints, reviews, theses, reports, standards) with abstracts, ' +
			'citation counts, and concept tags. ' +
			'Filter by publication year, open-access status, and publication type; paginate with limit/page. ' +
			'For Semantic Scholar/arXiv searches use search_academic.',
		input: z.object({
			query: z.string().min(1).describe('Search query for scholarly works'),
			limit: z.number().int().min(1).max(50).default(25).describe('Results per page (max 50)'),
			page: z.number().int().min(1).default(1).describe('Page number for pagination'),
			filter: z
				.object({
					...yearRange,
					open_access: z.boolean().optional().describe('Only return open-access papers'),
					type: z
						.enum(NPL_PUBLICATION_TYPES)
						.optional()
						.describe(
							'Filter by publication type: journal-article, proceedings-article, book-chapter, ' +
								'preprint, review, book, dissertation, report, standard or dataset'
						),
				})
				.optional(),
		}),
		access: 'none',
		handler: async (input, ctx) => {
			const data = unwrapLiteratureRead(
				await ctx.connectors.openalex.runNplSearch({
					query: input.query,
					limit: input.limit,
					page: input.page,
					filter: input.filter
						? {
								fromYear: input.filter.from_year,
								toYear: input.filter.to_year,
								openAccess: input.filter.open_access,
								type: input.filter.type,
							}
						: undefined,
				})
			);
			// The lib payload embeds the route's `success: true` flag; the facade
			// envelope already carries success, so strip the duplicate.
			const { success: _success, ...payload } = data;
			return payload;
		},
	}),
	tool({
		name: 'get_npl_work',
		annotations: { title: 'Look up a cited paper' },
		description:
			'Resolve one non-patent literature reference to its OpenAlex record (title, DOI, abstract, authors, ' +
			'venue, open-access link). Takes a DOI, an OpenAlex work id (W…) or a citation string exactly as an ' +
			'office printed it (an `npl` entry of get_bibliography citedReferences, an examiner_baseline NPL row, ' +
			'an isNPL citedDocument of search_office_action_citations). Lookup order: OpenAlex id, then any DOI ' +
			'in the string, then the quoted title. `status` is matched (`work` is the cited record), candidates ' +
			'(similar works, none certain: say so, do not pick one) or not_found (standards, product manuals and ' +
			'web pages are often absent from OpenAlex).',
		input: z.object({
			reference: z
				.string()
				.trim()
				.min(3)
				.max(2000)
				.describe('A DOI, an OpenAlex work id, or a cited-NPL string as printed'),
		}),
		access: 'none',
		handler: async (input, ctx) => unwrapLiteratureRead(await ctx.connectors.openalex.resolveNplReference(input.reference)),
	}),
];
