/*---------------------------------------------------------------------------------------------
 *  Academic literature search — Semantic Scholar + arXiv (PRD 0013 T08, #276)
 *
 *  The full search pipeline the POST /v1/academic-search route has always run,
 *  moved out of the route so the search_academic tool can share it: per-source
 *  fetch with graceful per-source degradation (a failing source contributes
 *  zero papers instead of failing the request), post-fetch year filtering,
 *  result capping, and the 24h read-through cache.
 *  The search_academic tool is the only consumer (the /v1/academic-search
 *  route retired under ADR 0013).
 *
 *  Degradation is reported, never silent: every requested source gets a row in
 *  `sources` (ok / rate_limited / error, with its own hit count), a result with
 *  a failed source is not cached, and a search where every source failed is an
 *  error, not an empty success. Papers are merged across sources in relevance
 *  order (each source's own ranking, interleaved) and deduplicated by DOI,
 *  arXiv id, then normalized title.
 *--------------------------------------------------------------------------------------------*/

import { KEY_REJECTED_REASON } from './reasons.js';

export { KEY_REJECTED_REASON } from './reasons.js';
import { getCacheKey } from '../cache-key.js';
import { cachedProviderRead, type ProviderReadResult } from '../cached-provider-read.js';
import type { ConnectorContext } from '../context.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { APIError, ClientGoneError, RateLimitError, UpstreamError } from '../errors.js';
import { fetchWithRetry } from '../fetch-with-retry.js';

// Cache TTL for academic search (24 hours - papers don't change often)
const ACADEMIC_CACHE_TTL = 86400;

/**
 * Bump when the cached payload's shape changes, so entries written by the old
 * code are not served for the rest of their 24h TTL after a deploy (the OPS and
 * graph caches learned this the hard way: #419, #433). The key carried no
 * version before #568. 2: `sources[]`, `doi`, `arxivId`, `alsoIn`; partial
 * results no longer cached. 3: the arXiv fallback keeps quoted phrases required
 * (#570); entries cached under 2 between the #568 and #570 deploys could hold
 * OR-everything fallback answers.
 */
export const ACADEMIC_RESPONSE_SHAPE_VERSION = 3;

/** Semantic Scholar's page-size ceiling for /paper/search. */
const SEMANTIC_SCHOLAR_MAX_LIMIT = 100;

export type AcademicSourceName = 'scholar' | 'arxiv';

export interface AcademicPaper {
	title: string;
	authors: string[];
	abstract?: string;
	url: string;
	source: string;
	year?: string;
	citations?: number;
	doi?: string;
	arxivId?: string;
	/** Other sources that returned the same paper (merged into this entry). */
	alsoIn?: string[];
}

export interface AcademicYearFilter {
	fromYear?: number;
	toYear?: number;
}

export interface AcademicSearchParams {
	query: string;
	/** Source set; 'scholar' is served by Semantic Scholar. Default: both. */
	sources?: string[];
	maxResults?: number;
	filter?: AcademicYearFilter;
}

/** What one source did for this search. */
export interface AcademicSourceReport {
	source: AcademicSourceName;
	status: 'ok' | 'rate_limited' | 'error';
	/** Papers this source returned, before merging and capping. */
	returned: number;
	/** The source's own count of matching papers, when it reports one. */
	totalHits?: number;
	/** Why the source failed (a short status line, never the upstream body). */
	message?: string;
	/**
	 * The structured cause, for clients that must not match message text (ADR
	 * 0014). `key_rejected`: Semantic Scholar refused the forwarded key (#571).
	 */
	reason?: typeof KEY_REJECTED_REASON;
	/** Seconds the source asked us to wait, on a rate limit. */
	retryAfter?: number;
}

export interface AcademicSearchData {
	papers: AcademicPaper[];
	/** Papers in this response (not the sources' hit counts — see sources[].totalHits). */
	total: number;
	sources: AcademicSourceReport[];
}

interface SourceResult {
	papers: AcademicPaper[];
	totalHits?: number;
}

const SOURCE_LABEL: Record<AcademicSourceName, string> = {
	scholar: 'Semantic Scholar',
	arxiv: 'arXiv',
};

/**
 * Run an academic literature search across the requested sources through the
 * read-through cache. The unified-envelope failure mapping (and the
 * no-cache-on-failure rule) come from cachedProviderRead; a partial result
 * (some source failed) is returned but not cached.
 */
export async function runAcademicSearch(
	ctx: ConnectorContext,
	params: AcademicSearchParams
): Promise<ProviderReadResult<AcademicSearchData>> {
	const { host } = ctx;
	const { query, sources = ['scholar', 'arxiv'], maxResults = 10, filter } = params;
	const requested = (['scholar', 'arxiv'] as const).filter((s) => sources.includes(s));

	// Cache key includes every request field that varies the response: query,
	// source set, result cap, and the year-range filter, plus the shape version.
	const cacheKey = getCacheKey('academic-search', {
		shape: ACADEMIC_RESPONSE_SHAPE_VERSION,
		query: query.toLowerCase(),
		sources: [...sources].sort(),
		maxResults,
		fromYear: filter?.fromYear,
		toYear: filter?.toYear,
	});

	return cachedProviderRead<AcademicSearchData>(host, {
		cacheKey,
		ttlSeconds: ACADEMIC_CACHE_TTL,
		shouldCache: (data) => data.sources.every((s) => s.status === 'ok'),
		fetchFresh: async () => {
			host.logger.info(
				`[Academic Search] Query: "${query}", Sources: ${requested.join(', ')}, Max: ${maxResults}`
			);

			// Each source is asked for the full cap, so one failing source or
			// cross-source duplicates do not shrink the answer below maxResults.
			const runners: Record<AcademicSourceName, () => Promise<SourceResult>> = {
				scholar: () => searchSemanticScholar(ctx, query, maxResults, filter),
				arxiv: () => searchArxiv(ctx, query, maxResults, filter),
			};
			const settled = await Promise.allSettled(requested.map((s) => runners[s]()));

			const reports: AcademicSourceReport[] = [];
			const ranked: AcademicPaper[][] = [];
			const failures: unknown[] = [];
			settled.forEach((outcome, i) => {
				const source = requested[i];
				if (outcome.status === 'fulfilled') {
					ranked.push(outcome.value.papers);
					reports.push({
						source,
						status: 'ok',
						returned: outcome.value.papers.length,
						totalHits: outcome.value.totalHits,
					});
					return;
				}
				const error = outcome.reason;
				// The client hung up: not a source failure, let it reach the route.
				if (error instanceof ClientGoneError) throw error;
				host.logger.error(`[${SOURCE_LABEL[source]}] Search error:`, error);
				failures.push(error);
				reports.push(failureReport(source, error));
			});

			// Every requested source failed: an empty success would read as "no
			// literature exists". Fail the call so the agent retries instead.
			if (failures.length === requested.length) {
				if (failures.every((e) => e instanceof RateLimitError)) {
					throw failures[0];
				}
				throw new UpstreamError(
					503,
					ErrorCodes.upstream_unavailable,
					`Every academic source failed: ${reports.map((r) => `${SOURCE_LABEL[r.source]} (${r.message})`).join('; ')}. Retry shortly.`,
					{ service: 'academic-search', sources: reports }
				);
			}

			const merged = filterByYear(mergeRanked(ranked), filter).slice(0, maxResults);
			return { papers: merged, total: merged.length, sources: reports };
		},
	});
}

/** Semantic Scholar refused the forwarded key (401/403). */
class SemanticScholarKeyRejectedError extends Error {
	constructor(readonly statusCode: number) {
		super('Semantic Scholar rejected your API key');
		this.name = 'SemanticScholarKeyRejectedError';
	}
}

function failureReport(source: AcademicSourceName, error: unknown): AcademicSourceReport {
	if (error instanceof SemanticScholarKeyRejectedError) {
		return {
			source,
			status: 'error',
			returned: 0,
			reason: KEY_REJECTED_REASON,
			message: `Semantic Scholar rejected your API key (HTTP ${error.statusCode}); check the key`,
		};
	}
	if (error instanceof RateLimitError) {
		return {
			source,
			status: 'rate_limited',
			returned: 0,
			message: `${SOURCE_LABEL[source]} rate limit exceeded`,
			retryAfter: error.retryAfter,
		};
	}
	let message = `${SOURCE_LABEL[source]} request failed`;
	if (error instanceof APIError) {
		if (error.statusCode === 408) message = `${SOURCE_LABEL[source]} timed out`;
		else if (error.statusCode === 0) message = `${SOURCE_LABEL[source]} unreachable`;
		else message = `${SOURCE_LABEL[source]} answered HTTP ${error.statusCode}`;
	}
	return { source, status: 'error', returned: 0, message };
}

/** Post-fetch year filter (a safety net; both sources also filter server-side). */
function filterByYear(papers: AcademicPaper[], filter?: AcademicYearFilter): AcademicPaper[] {
	if (!filter?.fromYear && !filter?.toYear) return papers;
	return papers.filter((p) => {
		const year = p.year ? parseInt(p.year, 10) : null;
		if (!year) return true; // keep papers with unknown year
		if (filter.fromYear && year < filter.fromYear) return false;
		if (filter.toYear && year > filter.toYear) return false;
		return true;
	});
}

/** Lowercase letters and digits only, so punctuation and spacing differences still match. */
function normalizeTitle(title: string): string {
	return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function dedupeKeys(paper: AcademicPaper): string[] {
	const keys: string[] = [];
	if (paper.doi) keys.push(`doi:${paper.doi.toLowerCase()}`);
	if (paper.arxivId) keys.push(`arxiv:${paper.arxivId.toLowerCase()}`);
	const title = normalizeTitle(paper.title);
	if (title) keys.push(`title:${title}`);
	return keys;
}

/**
 * Interleave each source's relevance-ranked list (rank 1 of every source, then
 * rank 2, …) and fold duplicates into the first-seen entry, filling the fields
 * it lacks. Interleaving keeps arXiv preprints, which carry no citation counts,
 * from always sinking below Semantic Scholar.
 */
export function mergeRanked(lists: AcademicPaper[][]): AcademicPaper[] {
	const merged: AcademicPaper[] = [];
	const byKey = new Map<string, AcademicPaper>();
	const longest = Math.max(0, ...lists.map((l) => l.length));
	for (let rank = 0; rank < longest; rank++) {
		for (const list of lists) {
			const paper = list[rank];
			if (!paper) continue;
			const keys = dedupeKeys(paper);
			const existing = keys.map((k) => byKey.get(k)).find((p) => p !== undefined);
			if (existing) {
				existing.doi ??= paper.doi;
				existing.arxivId ??= paper.arxivId;
				existing.abstract ??= paper.abstract;
				existing.year ??= paper.year;
				existing.citations ??= paper.citations;
				if (existing.source !== paper.source && !existing.alsoIn?.includes(paper.source)) {
					existing.alsoIn = [...(existing.alsoIn ?? []), paper.source];
				}
				for (const k of dedupeKeys(existing)) byKey.set(k, existing);
				continue;
			}
			const copy = { ...paper };
			merged.push(copy);
			for (const k of keys) byKey.set(k, copy);
		}
	}
	return merged;
}

const ARXIV_STOPWORDS = new Set([
	'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of',
	'on', 'or', 'that', 'the', 'to', 'using', 'via', 'with', 'without',
]);

/** Curly and angled double quotes, as pasted from a document, read as `"`. */
const SMART_DOUBLE_QUOTES = /[“”„‟«»]/g;

/**
 * Build an arXiv search_query, stopwords dropped. Strict (the default): quoted
 * phrases stay phrases and every term is required (AND); a bare `all:a b c`
 * would let arXiv match any one word, which is how a battery query returned a
 * superconductivity primer. `anyTerm` (the fallback): quoted phrases stay
 * required and the plain words become one OR group; with one plain word the
 * loose query equals the strict one, and the caller skips the retry. Curly and
 * angled double quotes count as quotes. Returns undefined when nothing
 * searchable remains.
 */
export function buildArxivQuery(query: string, anyTerm = false): string | undefined {
	const phrases: string[] = [];
	const rest = query.replace(SMART_DOUBLE_QUOTES, '"').replace(/"([^"]+)"/g, (_m, phrase: string) => {
		const clean = phrase.replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
		if (clean) phrases.push(`all:"${clean}"`);
		return ' ';
	});
	const words: string[] = [];
	for (const raw of rest.split(/\s+/)) {
		const word = raw.replace(/[^\p{L}\p{N}-]+/gu, '').replace(/^-+|-+$/g, '');
		if (!word || ARXIV_STOPWORDS.has(word.toLowerCase())) continue;
		words.push(`all:${word}`);
	}
	if (phrases.length === 0 && words.length === 0) return undefined;
	if (!anyTerm) return [...phrases, ...words].join(' AND ');
	// The fallback only loosens the plain words: a quoted phrase is the user
	// saying "this exact thing", so it stays required. Dropping it let a
	// '"solid state electrolyte" lithium' search fall back to any lithium paper.
	if (words.length === 0) return phrases.join(' AND ');
	const anyWord = words.join(' OR ');
	if (phrases.length === 0) return anyWord;
	return [...phrases, words.length > 1 ? `(${anyWord})` : anyWord].join(' AND ');
}

function arxivDateRange(filter?: AcademicYearFilter): string | undefined {
	if (!filter?.fromYear && !filter?.toYear) return undefined;
	const from = filter.fromYear ?? 1991; // arXiv opened in 1991
	const to = filter.toYear ?? 9999;
	return `submittedDate:[${from}01010000 TO ${to}12312359]`;
}

async function fetchArxiv(ctx: ConnectorContext, searchQuery: string, maxResults: number): Promise<SourceResult> {
	const params = new URLSearchParams({
		search_query: searchQuery,
		start: '0',
		max_results: String(maxResults),
		sortBy: 'relevance',
		sortOrder: 'descending',
	});
	const url = `https://export.arxiv.org/api/query?${params.toString()}`;
	ctx.host.logger.info(`[arXiv] Searching: ${url}`);

	const response = await fetchWithRetry(ctx.host, url, { method: 'GET' }, { service: 'arXiv', maxRetries: 2 });
	return parseArxivXML(await response.text());
}

/**
 * Search arXiv using their API, relevance-ranked. The strict query requires
 * every term. If it finds nothing, retry once with the loose query, still
 * relevance-ranked: quoted phrases stay required, the plain words become one
 * OR group (#570), so a long natural-language query does not come back empty
 * but a phrase the caller quoted is never dropped. No retry when the loose
 * query equals the strict one (one plain word, or phrases only).
 * API Docs: https://info.arxiv.org/help/api/user-manual.html
 */
async function searchArxiv(
	ctx: ConnectorContext,
	query: string,
	maxResults: number,
	filter?: AcademicYearFilter
): Promise<SourceResult> {
	const strict = buildArxivQuery(query);
	if (!strict) return { papers: [], totalHits: 0 };
	const dates = arxivDateRange(filter);
	const withDates = (q: string) => (dates ? `(${q}) AND ${dates}` : q);

	const result = await fetchArxiv(ctx, withDates(strict), maxResults);
	const loose = buildArxivQuery(query, true);
	if (result.papers.length === 0 && loose && loose !== strict) {
		return fetchArxiv(ctx, withDates(loose), maxResults);
	}
	ctx.host.logger.info(`[arXiv] Found ${result.papers.length} papers`);
	return result;
}

function decodeXmlEntities(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

/**
 * Parse arXiv's Atom response. An arXiv query error comes back as HTTP 200
 * with a single entry whose id is an api/errors URL; that is a failure.
 */
export function parseArxivXML(xml: string): SourceResult {
	const papers: AcademicPaper[] = [];
	const totalRaw = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/)?.[1];
	const totalHits = totalRaw !== undefined ? parseInt(totalRaw, 10) : undefined;

	const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
	for (const entry of entries) {
		const text = (tag: string) => {
			const raw = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1];
			return raw === undefined ? undefined : decodeXmlEntities(raw.trim().replace(/\s+/g, ' '));
		};
		const id = text('id');
		if (id?.includes('/api/errors')) {
			throw new APIError('arXiv', 400, `arXiv rejected the query: ${text('summary') ?? 'unknown error'}`);
		}
		const title = text('title');
		if (!title || !id) continue;

		const authors = (entry.match(/<name>([\s\S]*?)<\/name>/g) ?? []).map((a) =>
			decodeXmlEntities(a.replace(/<\/?name>/g, '').trim())
		);
		const arxivId = id.match(/arxiv\.org\/abs\/(.+?)(v\d+)?$/)?.[1];
		papers.push({
			title,
			authors,
			abstract: text('summary'),
			url: id.replace(/^http:/, 'https:'),
			source: 'arxiv',
			year: text('published')?.split('-')[0],
			doi: text('arxiv:doi'),
			arxivId,
		});
	}

	return { papers, totalHits };
}

/**
 * Search Semantic Scholar — this is what backs the 'scholar' source (Google
 * Scholar has no official API and actively blocks scraping; Semantic Scholar
 * is the free, supported alternative). A key lifts the request off the shared
 * unauthenticated rate limit: the host resolves it — on the backend the
 * forwarded key (X-Semantic-Scholar-Key) first, else S2_API_KEY.
 * API Docs: https://api.semanticscholar.org/
 */
async function searchSemanticScholar(
	ctx: ConnectorContext,
	query: string,
	maxResults: number,
	filter?: AcademicYearFilter
): Promise<SourceResult> {
	const params = new URLSearchParams({
		query,
		limit: String(Math.min(maxResults, SEMANTIC_SCHOLAR_MAX_LIMIT)),
		fields: 'title,authors,abstract,year,citationCount,url,externalIds',
	});
	if (filter?.fromYear || filter?.toYear) {
		params.set('year', `${filter.fromYear || ''}-${filter.toYear || ''}`);
	}
	const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`;
	ctx.host.logger.info(`[Semantic Scholar] Searching: ${url}`);

	const lookup = await ctx.host.credentials('semanticScholar');
	const apiKey = lookup.status === 'available' ? lookup.credentials.apiKey : undefined;
	// A key the caller brought: name it when it is the one refused (#571).
	const forwardedKey = lookup.status === 'available' && lookup.owner === 'user' ? apiKey : undefined;
	let response: Response;
	try {
		response = await fetchWithRetry(
			ctx.host,
			url,
			{ method: 'GET', headers: apiKey ? { 'x-api-key': apiKey } : undefined },
			{ service: 'Semantic Scholar', maxRetries: 2 }
		);
	} catch (error) {
		// Name the forwarded key when it is the one refused, so the fix is "check your key".
		if (forwardedKey && error instanceof APIError && (error.statusCode === 401 || error.statusCode === 403)) {
			throw new SemanticScholarKeyRejectedError(error.statusCode);
		}
		throw error;
	}

	const data = (await response.json()) as { total?: number; data?: Array<any> };
	const papers: AcademicPaper[] = (data.data ?? [])
		.filter((paper) => typeof paper.title === 'string' && paper.title)
		.map((paper) => ({
			title: paper.title,
			authors: paper.authors?.map((a: any) => a.name) || [],
			abstract: paper.abstract ?? undefined,
			url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
			source: 'scholar',
			year: paper.year?.toString(),
			citations: paper.citationCount ?? undefined,
			doi: paper.externalIds?.DOI ?? undefined,
			arxivId: paper.externalIds?.ArXiv ?? undefined,
		}));

	ctx.host.logger.info(`[Semantic Scholar] Found ${papers.length} papers`);
	return { papers, totalHits: data.total };
}
