/*---------------------------------------------------------------------------------------------
 *  NPL resolution — a cited non-patent reference to an OpenAlex work.
 *
 *  Offices print cited literature as one free-text string (EPO OPS `<nplcit>`,
 *  USPTO enriched `citedDocument`), e.g.
 *    - CONG L. ET AL: "MULTIPLEX GENOME ENGINEERING USING CRISPR/CAS SYSTEMS",
 *      SCIENCE, vol. 339, no. 6121, 15 February 2013 (2013-02-15), pages 819 - 823, XP055102030
 *  This module turns such a string (or a bare DOI or OpenAlex id) into the
 *  OpenAlex record: title, DOI, abstract. The get_npl_work tool, the
 *  get_bibliography `resolve_npl` option and examiner_baseline all call
 *  `resolveNplReference`, so the three surfaces answer the same reference the
 *  same way. In the package since ADR 0019 C2a, over the host's fetch and cache.
 *
 *  Order: an OpenAlex id, then a DOI anywhere in the string, then the title.
 *  A DOI that OpenAlex does not know falls through to the title. A title match
 *  is decided by token overlap with the candidate's title, never by a model;
 *  a weak or year-inconsistent match comes back as `candidates`, not as a
 *  record, so the agent never reads the wrong paper's abstract as the cited one.
 *--------------------------------------------------------------------------------------------*/

import { getCacheKey } from '../cache-key.js';
import { cachedProviderRead, type ProviderReadResult } from '../cached-provider-read.js';
import type { ConnectorContext } from '../context.js';
import { APIError } from '../errors.js';
import { fetchWithRetry } from '../fetch-with-retry.js';
import {
	OPENALEX_BASE,
	OPENALEX_MAILTO,
	OPENALEX_WORK_FIELDS,
	parseWork,
	type ScholarlyWork,
} from '../npl-search/index.js';

/** A resolved reference does not change; a week keeps OpenAlex calls rare. */
const NPL_RESOLVE_TTL = 7 * 86400;

/** Bump with any change to what `resolveNplReference` returns (the cache key carries it). */
export const NPL_RESOLVE_SHAPE_VERSION = 1;

/** Title similarity at or above which a candidate is the cited work. */
export const MATCH_THRESHOLD = 0.9;
/** Title similarity at or above which a candidate is worth showing. */
const CANDIDATE_THRESHOLD = 0.6;
const CANDIDATES_SHOWN = 3;
/** A title shorter than this (in words) is too generic to match from an unquoted string. */
const MIN_TITLE_WORDS = 4;

export interface ParsedNplReference {
	doi: string | null;
	openalexId: string | null;
	/** The quoted title, when the string quotes one. */
	title: string | null;
	year: number | null;
	/** EPO's own NPL accession number (XP…). Not resolvable through OpenAlex; kept for the reader. */
	xpNumber: string | null;
}

export interface NplCandidate {
	work: Pick<ScholarlyWork, 'id' | 'doi' | 'title' | 'publicationDate' | 'source'>;
	/** Title similarity, 0–1. */
	score: number;
}

export interface NplResolution {
	reference: string;
	parsed: ParsedNplReference;
	/**
	 * `matched`: `work` is the cited record. `candidates`: OpenAlex had similar
	 * works but none is certain (see `candidates`). `not_found`: nothing similar.
	 */
	status: 'matched' | 'candidates' | 'not_found';
	method: 'openalex_id' | 'doi' | 'title' | null;
	/** 1 for an id or DOI hit; the title similarity for a title match. */
	confidence: number | null;
	work: ScholarlyWork | null;
	candidates: NplCandidate[];
}

// ============================================================================
// Parsing
// ============================================================================

const DOI_PATTERN = /\b10\.\d{4,9}\/[^\s"<>]+/i;
const OPENALEX_ID_PATTERN = /^(?:https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?)?(W\d{4,})$/i;
const QUOTED_PATTERNS = [/"([^"]{8,})"/, /“([^”]{8,})”/, /«([^»]{8,})»/];

/** A DOI as written, without the trailing punctuation a sentence adds. Lowercase: DOIs are case-insensitive. */
function cleanDoi(raw: string): string {
	let doi = raw.replace(/[.,;:]+$/, '');
	while (/[)\]]$/.test(doi) && count(doi, doi.endsWith(')') ? '(' : '[') < count(doi, doi.slice(-1))) {
		doi = doi.slice(0, -1).replace(/[.,;:]+$/, '');
	}
	return doi.toLowerCase();
}

function count(text: string, char: string): number {
	return text.split(char).length - 1;
}

export function parseNplReference(reference: string): ParsedNplReference {
	const text = reference.trim();
	const openalex = OPENALEX_ID_PATTERN.exec(text);
	const doiMatch = DOI_PATTERN.exec(text);
	const xp = /\bXP\d{9}\b/.exec(text);

	let title: string | null = null;
	let titleEnd = 0;
	for (const pattern of QUOTED_PATTERNS) {
		const match = pattern.exec(text);
		if (match && (title === null || match.index < titleEnd)) {
			title = match[1].trim();
			titleEnd = match.index + match[0].length;
		}
	}

	// The year: an ISO date in parentheses is the office's own normalised date;
	// otherwise the first plausible year after the title, ignoring the DOI, the
	// XP number and page ranges (which can look like years).
	const scrubbed = text
		.slice(titleEnd)
		.replace(DOI_PATTERN, ' ')
		.replace(/\bXP\d+\b/g, ' ')
		.replace(/\bISSN:?\s*[\d-]+X?/gi, ' ')
		.replace(/\bpages?\s*\d+\s*-\s*\d+/gi, ' ');
	const isoDate = /\(((?:18|19|20)\d{2})-\d{2}-\d{2}\)/.exec(scrubbed);
	const anyYear = /\b((?:18|19|20)\d{2})\b/.exec(scrubbed);
	const yearText = isoDate?.[1] ?? anyYear?.[1];

	return {
		doi: doiMatch ? cleanDoi(doiMatch[0]) : null,
		openalexId: openalex ? openalex[1].toUpperCase() : null,
		title,
		year: yearText ? Number(yearText) : null,
		xpNumber: xp ? xp[0] : null,
	};
}

// ============================================================================
// Matching
// ============================================================================

/** Lowercase ASCII words: accents folded, punctuation dropped. */
export function titleTokens(text: string): string[] {
	return text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean);
}

/** Dice coefficient over the two titles' word sets. */
export function titleSimilarity(a: string, b: string): number {
	const left = new Set(titleTokens(a));
	const right = new Set(titleTokens(b));
	if (left.size === 0 || right.size === 0) {
		return 0;
	}
	let shared = 0;
	for (const token of left) {
		if (right.has(token)) {
			shared++;
		}
	}
	return (2 * shared) / (left.size + right.size);
}

/**
 * For a string with no quoted title: the share of the candidate title's words
 * that the citation string contains. A short title scores 0 — "Introduction"
 * appears in too many strings to prove anything.
 */
export function titleContainment(title: string, citation: string): number {
	const words = new Set(titleTokens(title));
	if (words.size < MIN_TITLE_WORDS) {
		return 0;
	}
	const haystack = new Set(titleTokens(citation));
	let found = 0;
	for (const word of words) {
		if (haystack.has(word)) {
			found++;
		}
	}
	return found / words.size;
}

function workYear(work: ScholarlyWork): number | null {
	const year = Number(work.publicationDate?.slice(0, 4));
	return Number.isFinite(year) && year > 0 ? year : null;
}

/** Offices print the issue date; OpenAlex often has the online-first date a year earlier. */
function yearConsistent(parsed: ParsedNplReference, work: ScholarlyWork): boolean {
	const year = workYear(work);
	return parsed.year === null || year === null || Math.abs(parsed.year - year) <= 1;
}

function compact(work: ScholarlyWork): NplCandidate['work'] {
	return { id: work.id, doi: work.doi, title: work.title, publicationDate: work.publicationDate, source: work.source };
}

/** Pick the cited work from title-search results. Pure. */
export function pickTitleMatch(
	reference: string,
	parsed: ParsedNplReference,
	works: ScholarlyWork[]
): Pick<NplResolution, 'status' | 'method' | 'confidence' | 'work' | 'candidates'> {
	const scored = works
		.map((work) => ({
			work,
			score: round(parsed.title ? titleSimilarity(parsed.title, work.title) : titleContainment(work.title, reference)),
		}))
		.filter((c) => c.score >= CANDIDATE_THRESHOLD)
		.sort((a, b) => b.score - a.score);

	const best = scored[0];
	// A unique best: a second candidate at the same score is two papers with
	// one title (an erratum, a preprint and its article) — not ours to choose.
	if (best && best.score >= MATCH_THRESHOLD && yearConsistent(parsed, best.work) && scored[1]?.score !== best.score) {
		return { status: 'matched', method: 'title', confidence: best.score, work: best.work, candidates: [] };
	}
	if (scored.length) {
		return {
			status: 'candidates',
			method: 'title',
			confidence: null,
			work: null,
			candidates: scored.slice(0, CANDIDATES_SHOWN).map((c) => ({ work: compact(c.work), score: c.score })),
		};
	}
	return { status: 'not_found', method: null, confidence: null, work: null, candidates: [] };
}

function round(score: number): number {
	return Math.round(score * 1000) / 1000;
}

// ============================================================================
// OpenAlex reads
// ============================================================================

async function openAlexJson(ctx: ConnectorContext, path: string, params: Record<string, string>): Promise<any | null> {
	const search = new URLSearchParams({ ...params, select: OPENALEX_WORK_FIELDS, mailto: OPENALEX_MAILTO });
	try {
		const response = await fetchWithRetry(
			ctx.host,
			`${OPENALEX_BASE}${path}?${search}`,
			{ method: 'GET', headers: { Accept: 'application/json' } },
			{ service: 'OpenAlex', maxRetries: 2 }
		);
		return await response.json();
	} catch (error) {
		// An id or DOI OpenAlex does not know is an answer, not a failure.
		if (error instanceof APIError && error.statusCode === 404) {
			return null;
		}
		throw error;
	}
}

/** One work by OpenAlex id (`W…`) or DOI (`doi:10.…`), the form OpenAlex documents for /works/{id}. */
async function workByKey(ctx: ConnectorContext, key: { openalexId: string } | { doi: string }): Promise<ScholarlyWork | null> {
	// The DOI's own slashes stay literal; anything else that could end the path (?, #) is encoded.
	const path =
		'openalexId' in key
			? key.openalexId
			: `doi:${key.doi.split('/').map(encodeURIComponent).join('/')}`;
	const data = await openAlexJson(ctx, `/works/${path}`, {});
	return data?.id ? parseWork(data) : null;
}

async function titleSearch(ctx: ConnectorContext, reference: string, parsed: ParsedNplReference): Promise<ScholarlyWork[]> {
	let params: Record<string, string>;
	if (parsed.title) {
		// The filter syntax splits on commas and colons: send words only.
		const words = titleTokens(parsed.title).join(' ');
		if (!words) {
			return [];
		}
		params = { filter: `title.search:${words}`, per_page: '5' };
	} else {
		const words = titleTokens(
			reference
				.replace(DOI_PATTERN, ' ')
				.replace(/\bXP\d+\b/g, ' ')
				.replace(/\bpages?\s*\d+\s*-\s*\d+/gi, ' ')
		)
			.join(' ')
			.slice(0, 300);
		if (!words) {
			return [];
		}
		params = { search: words, per_page: '5' };
	}
	const data = await openAlexJson(ctx, '/works', params);
	return ((data?.results ?? []) as any[]).map(parseWork);
}

/** Collapse whitespace so the same string printed twice shares a cache entry. */
function normalizeReference(reference: string): string {
	return reference.replace(/\s+/g, ' ').trim();
}

/** Resolve one cited reference (a citation string, a DOI or an OpenAlex id) through the read-through cache. */
export async function resolveNplReference(ctx: ConnectorContext, rawReference: string): Promise<ProviderReadResult<NplResolution>> {
	const reference = normalizeReference(rawReference);
	return cachedProviderRead<NplResolution>(ctx.host, {
		cacheKey: getCacheKey('npl-resolve', { shape: NPL_RESOLVE_SHAPE_VERSION, reference: reference.toLowerCase() }),
		ttlSeconds: NPL_RESOLVE_TTL,
		fetchFresh: async () => {
			const parsed = parseNplReference(reference);
			const base = { reference, parsed };

			if (parsed.openalexId) {
				const work = await workByKey(ctx, { openalexId: parsed.openalexId });
				return work
					? { ...base, status: 'matched', method: 'openalex_id', confidence: 1, work, candidates: [] }
					: { ...base, status: 'not_found', method: null, confidence: null, work: null, candidates: [] };
			}
			if (parsed.doi) {
				const work = await workByKey(ctx, { doi: parsed.doi });
				if (work) {
					return { ...base, status: 'matched', method: 'doi', confidence: 1, work, candidates: [] };
				}
			}
			const bare = parsed.doi && reference.toLowerCase().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, '') === parsed.doi;
			if (bare) {
				// Only a DOI was given and OpenAlex does not know it: no title to try.
				return { ...base, status: 'not_found', method: null, confidence: null, work: null, candidates: [] };
			}
			return { ...base, ...pickTitleMatch(reference, parsed, await titleSearch(ctx, reference, parsed)) };
		},
	});
}

// ============================================================================
// Attaching to citation rows
// ============================================================================

/** What a citation row carries: the record in brief, or why there is none. */
export interface NplWorkSummary {
	/** `skipped`: over the per-call cap, not looked up (get_npl_work resolves it). */
	status: NplResolution['status'] | 'lookup_failed' | 'skipped';
	method: NplResolution['method'];
	confidence: number | null;
	work: {
		openalexId: string;
		doi: string | null;
		title: string;
		abstract: string | null;
		publicationDate: string | null;
		source: string | null;
		openAccessUrl: string | null;
	} | null;
	candidates?: NplCandidate[];
	/** Only on `lookup_failed`: the error code of the failed read. */
	error?: string;
}

/** The abstract on a citation row is a preview; get_npl_work returns it whole. */
const ROW_ABSTRACT_CHARS = 1200;

export function summarizeResolution(resolution: NplResolution): NplWorkSummary {
	const { work } = resolution;
	const summary: NplWorkSummary = {
		status: resolution.status,
		method: resolution.method,
		confidence: resolution.confidence,
		work: work
			? {
					openalexId: work.id,
					doi: work.doi,
					title: work.title,
					abstract:
						work.abstract && work.abstract.length > ROW_ABSTRACT_CHARS
							? `${work.abstract.slice(0, ROW_ABSTRACT_CHARS)}…`
							: work.abstract,
					publicationDate: work.publicationDate,
					source: work.source,
					openAccessUrl: work.openAccessUrl,
				}
			: null,
	};
	if (resolution.candidates.length) {
		summary.candidates = resolution.candidates;
	}
	return summary;
}

/** At most this many distinct references are looked up per response; the rest say `skipped`. */
export const NPL_ROWS_RESOLVED_PER_CALL = 40;
const LOOKUP_CONCURRENCY = 4;

export interface NplResolutionStats {
	/** Distinct NPL references in the response. */
	references: number;
	matched: number;
	candidates: number;
	notFound: number;
	failed: number;
	/** Over the per-call cap: not looked up (get_npl_work resolves them one by one). */
	skipped: number;
}

/**
 * Resolve many references, a few at a time, each failure kept as
 * `lookup_failed` rather than failing the caller. `lookup` is injectable so the
 * baseline can go through the get_npl_work handler and tests need no network.
 */
export async function resolveNplReferences(
	references: string[],
	lookup: (reference: string) => Promise<NplResolution>
): Promise<{ byReference: Map<string, NplWorkSummary>; stats: NplResolutionStats }> {
	const distinct = [...new Set(references)];
	const toResolve = distinct.slice(0, NPL_ROWS_RESOLVED_PER_CALL);
	const byReference = new Map<string, NplWorkSummary>();
	const stats: NplResolutionStats = {
		references: distinct.length,
		matched: 0,
		candidates: 0,
		notFound: 0,
		failed: 0,
		skipped: distinct.length - toResolve.length,
	};

	let next = 0;
	const worker = async () => {
		while (next < toResolve.length) {
			const reference = toResolve[next++];
			let summary: NplWorkSummary;
			try {
				summary = summarizeResolution(await lookup(reference));
			} catch (error) {
				const code = (error as { code?: unknown })?.code;
				summary = {
					status: 'lookup_failed',
					method: null,
					confidence: null,
					work: null,
					error: typeof code === 'string' ? code : 'upstream_error',
				};
			}
			byReference.set(reference, summary);
		}
	};
	await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, toResolve.length) }, worker));

	for (const summary of byReference.values()) {
		if (summary.status === 'matched') stats.matched++;
		else if (summary.status === 'candidates') stats.candidates++;
		else if (summary.status === 'not_found') stats.notFound++;
		else stats.failed++;
	}
	return { byReference, stats };
}

/** `resolveNplReference` for batch callers: the data, or a throw carrying the envelope's error code. */
export async function resolveNplOrThrow(ctx: ConnectorContext, reference: string): Promise<NplResolution> {
	const result = await resolveNplReference(ctx, reference);
	if (result.ok) {
		return result.data;
	}
	throw Object.assign(new Error(result.body.error.message), { code: result.body.error.code });
}

/**
 * get_bibliography `resolve_npl`: each `citedReferences` entry with an `npl`
 * string gains `nplWork`, and the payload gains `nplResolution` (the counts).
 * Additive: nothing already in the payload changes.
 */
export async function withResolvedNpl<T extends { citedReferences?: unknown }>(
	ctx: ConnectorContext,
	biblio: T
): Promise<T & { nplResolution: NplResolutionStats }> {
	const references = Array.isArray(biblio.citedReferences) ? (biblio.citedReferences as Array<Record<string, unknown>>) : [];
	const npl = references.flatMap((r) => (typeof r?.npl === 'string' && r.npl.trim() ? [r.npl] : []));
	const { byReference, stats } = await resolveNplReferences(npl, (reference) => resolveNplOrThrow(ctx, reference));
	const citedReferences = references.map((r) => {
		const summary = typeof r?.npl === 'string' ? byReference.get(r.npl) : undefined;
		return summary ? { ...r, nplWork: summary } : typeof r?.npl === 'string' && r.npl.trim() ? { ...r, nplWork: SKIPPED } : r;
	});
	return { ...biblio, ...(Array.isArray(biblio.citedReferences) ? { citedReferences } : {}), nplResolution: stats };
}

/** A reference over the per-call cap: not looked up. */
export const SKIPPED: NplWorkSummary = { status: 'skipped', method: null, confidence: null, work: null };
