/**
 * USPTO Enriched Citation Search
 *
 * Search and retrieve patent citation data from USPTO's Enriched Citation API.
 * Talks to the ODP host (api.uspto.gov) — the legacy developer.uspto.gov host
 * decommissions 2026-05-29. Request/response shape and all 22 field names are
 * identical between the legacy and ODP variants; only the base URL and the
 * X-API-KEY header differ. See ADR 0003.
 */

import { abortableSleep, throwIfClientGone, withClientAbort } from '../client-abort.js';
import type { ConnectorContext } from '../context.js';
import { ClientGoneError, DataKeysRequiredError, ProviderKeyInvalidError } from '../errors.js';
import { getUSPTOOdpAuthHeader, isUSPTOOdpConfigured, resolveOdpCredentials, throwIfUserKeyRejected } from './auth.js';
import type {
	CitationSearchResponse,
	CitationRecord,
	NormalizedCitation,
	CitationSearchOptions,
	CitationSearchResult,
	CitationCategory,
} from './types.js';

const CITATION_API_BASE = 'https://api.uspto.gov/api/v1/patent/oa/enriched_cited_reference_metadata/v3';

// Rate limiting: Be conservative to avoid hitting limits. The clock of the last
// request lives on the connector instance (ADR 0019 C1).
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

/**
 * Apply rate limiting. The wait wakes early with ClientGoneError when the client hangs
 * up (PRD 0001 S4) — a request with no one left to answer must not take its turn.
 */
async function applyRateLimit(ctx: ConnectorContext): Promise<void> {
	const { host } = ctx;
	const now = host.now();
	const elapsed = now - ctx.state.odp.lastCitationRequestAt;
	if (elapsed < MIN_REQUEST_INTERVAL) {
		await abortableSleep(host, MIN_REQUEST_INTERVAL - elapsed);
	}
	ctx.state.odp.lastCitationRequestAt = host.now();
}

/**
 * Get category description for citation category code
 */
function getCategoryDescription(category: CitationCategory): string {
	switch (category) {
		case 'X':
			return 'Destroys novelty (102 rejection)';
		case 'Y':
			return 'Affects inventiveness when combined (103 rejection)';
		case 'A':
			return 'Background/technological context';
		default:
			return 'Unknown category';
	}
}

/**
 * Normalize a citation record for API response
 */
function normalizeCitation(record: CitationRecord): NormalizedCitation {
	return {
		id: record.id,
		applicationNumber: record.patentApplicationNumber,
		citedDocument: record.citedDocumentIdentifier,
		country: record.countryCode,
		category: record.citationCategoryCode,
		categoryDescription: getCategoryDescription(record.citationCategoryCode),
		rejectedClaims: record.relatedClaimNumberText,
		citedPassages: record.passageLocationText || [],
		examinerCited: record.examinerCitedReferenceIndicator,
		applicantCited: record.applicantCitedExaminerReferenceIndicator,
		isNPL: record.nplIndicator,
		officeActionDate: record.officeActionDate,
		officeActionType: record.officeActionCategory,
		inventor: record.inventorNameText,
		techCenter: record.techCenter,
	};
}

/**
 * Build Lucene query string for citation search
 */
function buildLuceneQuery(
	applicationNumber?: string,
	citedDocument?: string,
	options?: CitationSearchOptions
): string {
	const clauses: string[] = [];

	if (applicationNumber) {
		// Remove any dashes or formatting
		const cleanAppNum = applicationNumber.replace(/[^0-9]/g, '');
		clauses.push(`patentApplicationNumber:${cleanAppNum}`);
	}

	if (citedDocument) {
		// Escape special characters for Lucene
		const escaped = citedDocument.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, '\\$&');
		clauses.push(`citedDocumentIdentifier:"${escaped}"`);
	}

	if (options?.category) {
		clauses.push(`citationCategoryCode:${options.category}`);
	}

	if (options?.examinerCitedOnly) {
		clauses.push('examinerCitedReferenceIndicator:true');
	}

	if (options?.dateRange?.from) {
		const from = options.dateRange.from.replace(/-/g, '');
		clauses.push(`officeActionDate:[${from} TO *]`);
	}

	if (options?.dateRange?.to) {
		const to = options.dateRange.to.replace(/-/g, '');
		clauses.push(`officeActionDate:[* TO ${to}]`);
	}

	return clauses.length > 0 ? clauses.join(' AND ') : '*:*';
}

/**
 * Run a Lucene/Solr citation query against ODP.
 * 404 → empty result (clean 200 for callers).
 * 5xx → 503 (upstream USPTO outage; see ADR 0003 — USPTO disclosed an ongoing
 *        issue on this product as of 2026-05-12 in SR 2-00990457).
 */
async function executeCitationSearch(
	ctx: ConnectorContext,
	query: string,
	options: CitationSearchOptions
): Promise<CitationSearchResult> {
	const { host } = ctx;
	const lookup = await resolveOdpCredentials(ctx);
	if (!isUSPTOOdpConfigured(lookup)) {
		return {
			success: false,
			error: 'USPTO ODP API key not configured. Set USPTO_ODP_API_KEY environment variable.',
			status: 503,
		};
	}

	const size = Math.min(options.size || 100, 1000);
	const offset = options.offset || 0;

	const formData = new URLSearchParams();
	formData.append('criteria', query);
	formData.append('rows', size.toString());
	formData.append('start', offset.toString());

	try {
		await applyRateLimit(ctx);
		// PRD 0001 S4: the spacing wait above may have outlived the client.
		throwIfClientGone(host);

		const authHeader = await getUSPTOOdpAuthHeader(ctx, lookup);
		const response = await host.fetch(`${CITATION_API_BASE}/records`, {
			method: 'POST',
			signal: withClientAbort(host),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json',
				'Accept-Encoding': 'gzip, deflate',
				...authHeader,
			},
			body: formData.toString(),
		});

		if (response.status === 404) {
			return { success: true, total: 0, data: [] };
		}

		if (response.status >= 500) {
			return {
				success: false,
				error: `USPTO ODP Enriched Citations API is currently unavailable (upstream HTTP ${response.status}). Retry later.`,
				status: 503,
			};
		}

		if (!response.ok) {
			throwIfUserKeyRejected(lookup, response.status);
			return {
				success: false,
				error: `API error: ${response.status} ${response.statusText}`,
				status: response.status,
			};
		}

		const data = (await response.json()) as CitationSearchResponse;

		return {
			success: true,
			total: data.response.numFound,
			data: data.response.docs.map(normalizeCitation),
		};
	} catch (error) {
		// Typed key conditions must reach the route (mapped to 400), not collapse into a
		// success:false payload: rejected user key, or paid-with-no-key (ADR 0008).
		if (error instanceof ProviderKeyInvalidError || error instanceof DataKeysRequiredError) {
			throw error;
		}
		// PRD 0001 S4: the client left. Not a provider failure, and there is nobody to
		// hand a `success: false` payload to — let it reach the route, which swallows it.
		if (error instanceof ClientGoneError) {
			throw error;
		}
		host.logger.error('[USPTO-Citation] Search error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			status: 500,
		};
	}
}

/**
 * Search citations by patent application number
 *
 * Find all prior art citations for a given patent application.
 *
 * @param applicationNumber - USPTO application number (e.g., "16000001" or "16/000,001")
 * @param options - Search options
 */
export async function searchCitationsByApplication(
	ctx: ConnectorContext,
	applicationNumber: string,
	options: CitationSearchOptions = {}
): Promise<CitationSearchResult> {
	const query = buildLuceneQuery(applicationNumber, undefined, options);
	return executeCitationSearch(ctx, query, options);
}

/**
 * Search for applications that cite a specific document
 *
 * Find all patent applications that have been rejected based on a specific prior art document.
 * Useful for understanding the impact/relevance of a patent.
 *
 * @param citedDocument - The cited document identifier (e.g., "US 20150284881 A1")
 * @param options - Search options
 */
export async function searchCitationsByDocument(
	ctx: ConnectorContext,
	citedDocument: string,
	options: CitationSearchOptions = {}
): Promise<CitationSearchResult> {
	const query = buildLuceneQuery(undefined, citedDocument, options);
	return executeCitationSearch(ctx, query, options);
}

/**
 * Get citation statistics for a patent application
 *
 * Returns counts of X, Y, A citations and examiner vs applicant citations.
 *
 * Both splits partition the counted rows (cold-start walkthrough B3): live
 * ODP data has rows where NEITHER origin indicator is set, so the old
 * per-flag counting produced examiner + applicant < total. Every row now
 * lands in exactly one origin bucket (examiner > applicant precedence for
 * the both-true case ODP is not supposed to emit, `unknownOrigin`
 * otherwise) and exactly one category bucket (`other` for anything outside
 * X/Y/A), so each split sums to `total` whenever all rows were fetched
 * (`total` is upstream numFound; the fetch caps at 1000 rows).
 */
export async function getCitationStats(ctx: ConnectorContext, applicationNumber: string): Promise<{
	success: boolean;
	stats?: {
		total: number;
		byCategory: { X: number; Y: number; A: number; other: number };
		examinerCited: number;
		applicantCited: number;
		/** Rows carrying neither origin indicator (a real third state in ODP data). */
		unknownOrigin: number;
		nplCount: number;
	};
	error?: string;
}> {
	// Fetch all citations for the application
	const result = await searchCitationsByApplication(ctx, applicationNumber, { size: 1000 });

	if (!result.success || !result.data) {
		return {
			success: false,
			error: result.error,
		};
	}

	const stats = {
		total: result.total || 0,
		byCategory: { X: 0, Y: 0, A: 0, other: 0 },
		examinerCited: 0,
		applicantCited: 0,
		unknownOrigin: 0,
		nplCount: 0,
	};

	for (const citation of result.data) {
		const category = citation.category;
		if (category === 'X' || category === 'Y' || category === 'A') {
			stats.byCategory[category]++;
		} else {
			stats.byCategory.other++;
		}

		if (citation.examinerCited) {
			stats.examinerCited++;
		} else if (citation.applicantCited) {
			stats.applicantCited++;
		} else {
			stats.unknownOrigin++;
		}

		if (citation.isNPL) stats.nplCount++;
	}

	return { success: true, stats };
}

/**
 * Get forward citations (patents that cite a given patent)
 *
 * Note: This searches for office actions where the given patent was used as prior art.
 */
export async function getForwardCitations(
	ctx: ConnectorContext,
	patentNumber: string,
	options: CitationSearchOptions = {}
): Promise<CitationSearchResult> {
	return searchCitationsByDocument(ctx, patentNumber, options);
}

/**
 * Get X-rated (novelty-destroying) citations only
 *
 * These are the most relevant prior art references that the examiner
 * considered to anticipate the claims.
 */
export async function getNoveltyDestroyingCitations(
	ctx: ConnectorContext,
	applicationNumber: string,
	options: CitationSearchOptions = {}
): Promise<CitationSearchResult> {
	return searchCitationsByApplication(ctx, applicationNumber, {
		...options,
		category: 'X',
		examinerCitedOnly: true,
	});
}
