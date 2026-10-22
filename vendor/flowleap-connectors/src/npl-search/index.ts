/*---------------------------------------------------------------------------------------------
 *  NPL (Non-Patent Literature) search — OpenAlex API (PRD 0013 T08, #276)
 *
 *  The full search pipeline the POST /v1/npl-search route has always run,
 *  moved out of the route so the search_npl tool can share it: the OpenAlex
 *  query build (year/open-access/type filters, polite-pool mailto), the
 *  inverted-index abstract reconstruction, result parsing, and the 24h
 *  read-through cache. The search_npl tool is the only consumer (the
 *  /v1/npl-search route retired under ADR 0013). In the package since ADR
 *  0019 C2a: the OpenAlex client of both hosts, over the host's fetch and
 *  cache.
 *
 *  OpenAlex is FREE, no auth required — 250M+ scholarly works.
 *--------------------------------------------------------------------------------------------*/

import { getCacheKey } from '../cache-key.js';
import { cachedProviderRead, type ProviderReadResult } from '../cached-provider-read.js';
import type { ConnectorContext } from '../context.js';
import { fetchWithRetry } from '../fetch-with-retry.js';

export const OPENALEX_BASE = 'https://api.openalex.org';

/** The polite-pool contact OpenAlex asks for (better rate limits). */
export const OPENALEX_MAILTO = 'api@flowleap.co';

// Cache TTL for NPL search (24 hours — scholarly works change slowly; matches
// the academic-search TTL).
const NPL_CACHE_TTL = 86400;

/**
 * The publication types search_npl accepts. journal-article and
 * proceedings-article are the tool's original (Crossref-style) names and map
 * to the OpenAlex types article and conference-paper (#569); the rest are
 * OpenAlex work types as spelled.
 */
export const NPL_PUBLICATION_TYPES = [
	'journal-article',
	'book-chapter',
	'proceedings-article',
	'preprint',
	'review',
	'book',
	'dissertation',
	'report',
	'standard',
	'dataset',
] as const;

export type NplPublicationType = (typeof NPL_PUBLICATION_TYPES)[number];

/**
 * The OpenAlex filter clause for a publication type. `journal-article` and
 * `proceedings-article` are the tool's original Crossref-style names; OpenAlex
 * calls them `article` and `conference-paper`. Passing the Crossref names to
 * `type:` matched nothing, and `type_crossref:` (#565) matched nothing in
 * production either. Every other name is an OpenAlex `type` value as is.
 */
export function openAlexTypeFilter(type: NplPublicationType): string {
	switch (type) {
		case 'journal-article':
			return 'type:article';
		case 'proceedings-article':
			return 'type:conference-paper';
		default:
			return `type:${type}`;
	}
}

export interface NplSearchFilter {
	fromYear?: number;
	toYear?: number;
	openAccess?: boolean;
	type?: NplPublicationType;
}

export interface NplSearchParams {
	query: string;
	limit?: number;
	page?: number;
	filter?: NplSearchFilter;
}

export interface ScholarlyWork {
	id: string;
	doi: string | null;
	title: string;
	abstract: string | null;
	publicationDate: string | null;
	type: string;
	citedByCount: number;
	isOpenAccess: boolean;
	openAccessUrl: string | null;
	authors: string[];
	source: string | null;
	concepts: Array<{
		name: string;
		score: number;
	}>;
}

/** The cacheable success payload; route cache hits gain a `cached: true` flag. */
export interface NplSearchResponse {
	success: true;
	total: number;
	page: number;
	perPage: number;
	results: ScholarlyWork[];
	query: string;
}

/** The OpenAlex `select` list behind a ScholarlyWork (shared with lib/npl-resolve). */
export const OPENALEX_WORK_FIELDS =
	'id,doi,title,abstract_inverted_index,publication_date,type,cited_by_count,open_access,authorships,primary_location,concepts';

/**
 * Parse OpenAlex work into our format
 */
export function parseWork(work: any): ScholarlyWork {
	return {
		id: work.id?.replace('https://openalex.org/', '') || '',
		doi: work.doi?.replace('https://doi.org/', '') || null,
		title: work.title || 'Untitled',
		abstract: work.abstract_inverted_index
			? reconstructAbstract(work.abstract_inverted_index)
			: null,
		publicationDate: work.publication_date || null,
		type: work.type || 'unknown',
		citedByCount: work.cited_by_count || 0,
		isOpenAccess: work.open_access?.is_oa || false,
		openAccessUrl: work.open_access?.oa_url || null,
		authors: (work.authorships || []).slice(0, 10).map((a: any) => a.author?.display_name || 'Unknown'),
		source: work.primary_location?.source?.display_name || null,
		concepts: (work.concepts || [])
			.filter((c: any) => c.score > 0.3)
			.slice(0, 5)
			.map((c: any) => ({
				name: c.display_name,
				score: c.score,
			})),
	};
}

/**
 * Reconstruct abstract from OpenAlex inverted index format
 */
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
	const words: [string, number][] = [];

	for (const [word, positions] of Object.entries(invertedIndex)) {
		for (const pos of positions) {
			words.push([word, pos]);
		}
	}

	words.sort((a, b) => a[1] - b[1]);
	return words.map(([word]) => word).join(' ');
}

/**
 * Run an OpenAlex scholarly-works search through the read-through cache. The
 * unified-envelope failure mapping (and the no-cache-on-failure rule) come
 * from cachedProviderRead.
 */
export async function runNplSearch(
	ctx: ConnectorContext,
	params: NplSearchParams
): Promise<ProviderReadResult<NplSearchResponse>> {
	const { host } = ctx;
	const { query, limit = 25, page = 1, filter } = params;

	// Cache key includes every request field that varies the upstream response:
	// query, pagination, and all filters (year range, open access, type).
	// v3: the type filter changed meaning (journal-article / proceedings-article
	// matched nothing under v1 and v2), so zero-hit entries cached under the old
	// keys are not reused.
	const cacheKey = getCacheKey('npl-search:v3', {
		query: query.toLowerCase(),
		limit,
		page,
		fromYear: filter?.fromYear,
		toYear: filter?.toYear,
		openAccess: filter?.openAccess,
		type: filter?.type,
	});

	return cachedProviderRead<NplSearchResponse>(host, {
		cacheKey,
		ttlSeconds: NPL_CACHE_TTL,
		fetchFresh: async () => {
			// Build OpenAlex query URL
			const searchParams = new URLSearchParams({
				search: query,
				per_page: Math.min(limit, 50).toString(),
				page: page.toString(),
				// Request these fields for efficiency
				select: OPENALEX_WORK_FIELDS,
			});

			// Add filters
			const filters: string[] = [];
			if (filter?.fromYear) {
				filters.push(`from_publication_date:${filter.fromYear}-01-01`);
			}
			if (filter?.toYear) {
				filters.push(`to_publication_date:${filter.toYear}-12-31`);
			}
			if (filter?.openAccess) {
				filters.push('open_access.is_oa:true');
			}
			if (filter?.type) {
				filters.push(openAlexTypeFilter(filter.type));
			}

			if (filters.length > 0) {
				searchParams.set('filter', filters.join(','));
			}

			// Add polite pool email for better rate limits
			searchParams.set('mailto', OPENALEX_MAILTO);

			const url = `${OPENALEX_BASE}/works?${searchParams}`;
			host.logger.info(`[NPL Search] Querying OpenAlex: ${url}`);

			const response = await fetchWithRetry(
				host,
				url,
				{
					method: 'GET',
					headers: {
						'Accept': 'application/json',
					},
				},
				{ service: 'OpenAlex', maxRetries: 2 }
			);

			const data = await response.json() as any;

			const results: ScholarlyWork[] = (data.results || []).map(parseWork);

			const searchResponse: NplSearchResponse = {
				success: true,
				total: data.meta?.count || 0,
				page: data.meta?.page || 1,
				perPage: data.meta?.per_page || limit,
				results,
				query,
			};

			host.logger.info(`[NPL Search] Found ${searchResponse.total} results`);
			return searchResponse;
		},
	});
}
