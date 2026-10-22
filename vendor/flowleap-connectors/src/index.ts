/*---------------------------------------------------------------------------------------------
 *  @flowleap/connectors — the patent-data office clients behind a host interface
 *  (ADR 0019, slice C1).
 *
 *  One library, two hosts: the FlowLeap backend (the /v1/tools facade and the
 *  MCP server) and the plugin inside the harness. `createConnectors(host)`
 *  binds every client to one {@link ConnectorHost} and returns the three
 *  clients with the signatures the backend's tools have always called:
 *
 *    const { ops, odp, academic } = createConnectors(host);
 *    await ops.getBiblio('EP1234567');
 *    await odp.searchODPApplications({ q: 'inventionTitle:battery' });
 *    await academic.runAcademicSearch({ query: 'solid state electrolyte' });
 *
 *  Everything the clients return, throw or need from a host is exported from
 *  here too: the result and error contract, the pure utilities (publication
 *  numbers, the representative publication, XML decoding, extraction, the
 *  register hint, rasterization) and the shared plumbing (fetch with retry,
 *  the read-through cache, caller-gone abort). Since slice C2a the office
 *  TOOLS are here as well: `officeTools()` is the list both hosts register
 *  (./tools/), each a `ToolDefinition` whose handler runs over a
 *  `ToolContext` holding these clients.
 *--------------------------------------------------------------------------------------------*/

import { createContext, type ConnectorContext } from './context.js';
import type { ConnectorHost } from './host.js';
import * as academic from './academic-search/index.js';
import * as fulltextRouter from './fulltext-router.js';
import * as nplResolve from './npl-resolve/index.js';
import * as nplSearch from './npl-search/index.js';
import * as opsAuth from './ops/auth.js';
import * as direct from './ops/direct.js';
import * as opsFetch from './ops/fetch.js';
import * as throttle from './ops/throttle.js';
import * as odpAuth from './uspto-odp/auth.js';
import * as documents from './uspto-odp/documents.js';
import * as enrichment from './uspto-odp/enrichment.js';
import * as patentSearch from './uspto-odp/patent-search.js';
import * as citations from './uspto-odp/search.js';

// ── The host interface and the instance context ─────────────────────────────
export type {
	ConnectorHost,
	ConnectorCache,
	ConnectorLogger,
	ConnectorEvent,
	ConnectorOcr,
	ConnectorUsFulltext,
	UsFulltext,
	UsFulltextResult,
	ConnectorSettings,
	ConnectorProvider,
	ConnectorCredentialMap,
	CredentialLookup,
	EpoOpsCredentials,
	UsptoOdpCredentials,
	SemanticScholarCredentials,
	MistralCredentials,
	PatentOffice,
} from './host.js';
export { officeOf } from './host.js';
export type { ConnectorContext, ConnectorState, OpsTokenData, OpsBucketState, OpsBucketType, OpsScopeState } from './context.js';
export { createContext } from './context.js';

// ── The contract: error codes, typed errors, result envelopes ───────────────
export { ErrorCodes, type ErrorCode } from './contract/error-codes.js';
export {
	APIError,
	RateLimitError,
	UpstreamUnavailableError,
	UpstreamError,
	ProviderKeyInvalidError,
	DataKeysRequiredError,
	TrialDataBudgetExhaustedError,
	ClientGoneError,
	type PatentProvider,
} from './errors.js';
export {
	cachedProviderRead,
	mapProviderError,
	throwProviderReadError,
	type UnifiedErrorBody,
	type ProviderReadFailure,
	type ProviderReadResult,
	type CachedProviderReadOptions,
} from './cached-provider-read.js';
export { fetchWithRetry, parseRetryAfter, type FetchWithRetryOptions } from './fetch-with-retry.js';
export { getCacheKey } from './cache-key.js';
export { runWithCacheVisibility, recordCacheRead } from './cache-visibility.js';
export { isClientGone, throwIfClientGone, abortableSleep, withClientAbort } from './client-abort.js';

// ── Pure utilities ──────────────────────────────────────────────────────────
export * from './patent-number.js';
export * from './representative-publication.js';
export * from './ops/types.js';
export * from './ops/utils.js';
export * from './ops/publication.js';
export * from './ops/register-hint.js';
export * from './ops/citations-range.js';
export * from './ops/csv.js';
export * from './ops/rasterize.js';
export * from './ops/xml-to-json.js';
export * from './ops/extract.js';
export {
	OpsDeadlineExceededError,
	assertImposedWaitFits,
	fitDiscretionaryDelay,
	waitSecondsFrom,
	type SleepBudget,
	type WaitSource,
} from './ops/deadline.js';
export { credentialFingerprint, type EpoCredentialLookup } from './ops/auth.js';
export {
	parseThrottlingControl,
	getBucketForPath,
	throttleScopeFor,
	type BucketType,
	type ThrottleColor,
	type ThrottleSystemState,
	type ThrottleServiceLimit,
	type ThrottlingControl,
	type ThrottleBucketSnapshot,
	type ThrottleResult,
} from './ops/throttle.js';
export { BIBLIO_CACHE_TTL_SECONDS, EPO_CACHE_TTL_SECONDS } from './ops/direct.js';
export type { GetBiblioOptions, SearchPatentsOptions, GetFigurePageOptions } from './ops/direct.js';
export * from './uspto-odp/index.js';
export { throwIfUserKeyRejected, isUSPTOOdpConfigured as odpLookupIsConfigured, type OdpCredentialLookup } from './uspto-odp/auth.js';
export { KEY_REJECTED_REASON } from './academic-search/reasons.js';
export { ACADEMIC_RESPONSE_SHAPE_VERSION, buildArxivQuery, mergeRanked, parseArxivXML } from './academic-search/index.js';
export type {
	AcademicSourceName,
	AcademicPaper,
	AcademicYearFilter,
	AcademicSearchParams,
	AcademicSourceReport,
	AcademicSearchData,
} from './academic-search/index.js';

// ── The text tier and the literature (ADR 0019 C2a) ─────────────────────────
export * from './office-coverage.js';
export type { EuroPctFallback, FulltextWorkaround, RoutedClaims, RoutedDescription } from './fulltext-router.js';
export {
	OPENALEX_BASE,
	OPENALEX_MAILTO,
	OPENALEX_WORK_FIELDS,
	NPL_PUBLICATION_TYPES,
	openAlexTypeFilter,
	parseWork,
} from './npl-search/index.js';
export type {
	NplPublicationType,
	NplSearchFilter,
	NplSearchParams,
	NplSearchResponse,
	ScholarlyWork,
} from './npl-search/index.js';
export {
	NPL_RESOLVE_SHAPE_VERSION,
	NPL_ROWS_RESOLVED_PER_CALL,
	MATCH_THRESHOLD,
	SKIPPED,
	parseNplReference,
	pickTitleMatch,
	resolveNplReferences,
	summarizeResolution,
	titleContainment,
	titleSimilarity,
	titleTokens,
} from './npl-resolve/index.js';
export type {
	NplCandidate,
	NplResolution,
	NplResolutionStats,
	NplWorkSummary,
	ParsedNplReference,
} from './npl-resolve/index.js';

// ── The tool contract and the office tools (ADR 0019 C2a) ───────────────────
export * from './tools/index.js';

// ── The factory ─────────────────────────────────────────────────────────────

/** A client function with the context bound: the signature the backend's tools call. */
type Bound<F> = F extends (ctx: ConnectorContext, ...args: infer A) => infer R ? (...args: A) => R : never;
type BoundAll<T> = { readonly [K in keyof T]: Bound<T[K]> };

function bindAll<T extends Record<string, (ctx: ConnectorContext, ...args: any[]) => unknown>>(
	ctx: ConnectorContext,
	fns: T,
): BoundAll<T> {
	const bound: Record<string, unknown> = {};
	for (const [name, fn] of Object.entries(fns)) {
		bound[name] = (...args: unknown[]) => fn(ctx, ...args);
	}
	return bound as BoundAll<T>;
}

function opsClient(ctx: ConnectorContext) {
	return bindAll(ctx, {
		// Document reads, families, legal, register, search, citations, images
		getBiblio: direct.getBiblio,
		getBiblioData: direct.getBiblioData,
		getAbstract: direct.getAbstract,
		getAbstractData: direct.getAbstractData,
		getClaims: direct.getClaims,
		getClaimsData: direct.getClaimsData,
		getDescription: direct.getDescription,
		getDescriptionData: direct.getDescriptionData,
		getFulltextInquiry: direct.getFulltextInquiry,
		getFulltextSections: direct.getFulltextSections,
		getFulltextAvailability: direct.getFulltextAvailability,
		getFamily: direct.getFamily,
		getEquivalentsFamily: direct.getEquivalentsFamily,
		getFamilyData: direct.getFamilyData,
		getEquivalents: direct.getEquivalents,
		getLegalStatus: direct.getLegalStatus,
		searchPatents: direct.searchPatents,
		searchPublished: direct.searchPublished,
		searchPatentsData: direct.searchPatentsData,
		getForwardCitations: direct.getForwardCitations,
		convertPatentNumber: direct.convertPatentNumber,
		getRegisterBiblio: direct.getRegisterBiblio,
		searchRegister: direct.searchRegister,
		getRegisterEvents: direct.getRegisterEvents,
		getRegisterProceduralSteps: direct.getRegisterProceduralSteps,
		getRegisterUpp: direct.getRegisterUpp,
		getFamilyBiblio: direct.getFamilyBiblio,
		getFamilyLegal: direct.getFamilyLegal,
		getImages: direct.getImages,
		getImagesData: direct.getImagesData,
		getFigurePage: direct.getFigurePage,
		getFigurePageCompact: direct.getFigurePageCompact,
		// The authenticated, throttled fetch and the token mint
		opsFetch: opsFetch.opsFetch,
		opsFetchBinary: opsFetch.opsFetchBinary,
		getAccessToken: opsAuth.getAccessToken,
		resolveEpoCredentials: opsAuth.resolveEpoCredentials,
		clearOpsTokenCache: opsAuth.clearOpsTokenCache,
		// The throttle
		applyThrottling: throttle.applyThrottling,
		handleThrottleResponse: throttle.handleThrottleResponse,
		getThrottleSnapshot: throttle.getThrottleSnapshot,
		getThrottleScopeCount: throttle.getThrottleScopeCount,
	});
}

function odpClient(ctx: ConnectorContext) {
	return bindAll(ctx, {
		// Enriched citations
		searchCitationsByApplication: citations.searchCitationsByApplication,
		searchCitationsByDocument: citations.searchCitationsByDocument,
		getCitationStats: citations.getCitationStats,
		getForwardCitations: citations.getForwardCitations,
		getNoveltyDestroyingCitations: citations.getNoveltyDestroyingCitations,
		// Application search + file-wrapper sub-resources
		searchODPApplications: patentSearch.searchODPApplications,
		getODPApplicationByNumber: patentSearch.getODPApplicationByNumber,
		getODPApplicationContinuity: patentSearch.getODPApplicationContinuity,
		getODPApplicationTransactions: patentSearch.getODPApplicationTransactions,
		getODPApplicationAssignment: patentSearch.getODPApplicationAssignment,
		getODPApplicationForeignPriority: patentSearch.getODPApplicationForeignPriority,
		getODPApplicationAdjustment: patentSearch.getODPApplicationAdjustment,
		getODPApplicationAttorney: patentSearch.getODPApplicationAttorney,
		getODPApplicationAssociatedDocuments: patentSearch.getODPApplicationAssociatedDocuments,
		// File-wrapper documents (listing + OCR text extraction)
		getODPApplicationDocuments: documents.getODPApplicationDocuments,
		getODPDocumentText: documents.getODPDocumentText,
		// EPO enrichment fan-out
		enrichRecords: enrichment.enrichRecords,
		// Key resolution and the auth header (the ADR 0017 charging seam)
		resolveOdpCredentials: odpAuth.resolveOdpCredentials,
		getUSPTOOdpApiKey: odpAuth.getUSPTOOdpApiKey,
		getUSPTOOdpAuthHeader: odpAuth.getUSPTOOdpAuthHeader,
	});
}

function academicClient(ctx: ConnectorContext) {
	return bindAll(ctx, {
		runAcademicSearch: academic.runAcademicSearch,
	});
}

/** The text tier (ADR 0024): claims and description routed by office, the US arm through `host.usFulltext`. */
function fulltextClient(ctx: ConnectorContext) {
	return bindAll(ctx, {
		getClaimsRouted: fulltextRouter.getClaimsRouted,
		getDescriptionRouted: fulltextRouter.getDescriptionRouted,
	});
}

/** OpenAlex: the NPL search and the cited-reference resolution. No key. */
function openalexClient(ctx: ConnectorContext) {
	return bindAll(ctx, {
		runNplSearch: nplSearch.runNplSearch,
		resolveNplReference: nplResolve.resolveNplReference,
		withResolvedNpl: nplResolve.withResolvedNpl,
	});
}

export type OpsClient = ReturnType<typeof opsClient>;
export type OdpClient = ReturnType<typeof odpClient>;
export type AcademicClient = ReturnType<typeof academicClient>;
export type FulltextClient = ReturnType<typeof fulltextClient>;
export type OpenalexClient = ReturnType<typeof openalexClient>;

export interface Connectors {
	readonly host: ConnectorHost;
	/** The instance context, for a caller that uses the ctx-first module functions directly. */
	readonly context: ConnectorContext;
	readonly ops: OpsClient;
	readonly odp: OdpClient;
	readonly academic: AcademicClient;
	/** The text tier router (ADR 0019 C2a). */
	readonly fulltext: FulltextClient;
	/** OpenAlex (ADR 0019 C2a). */
	readonly openalex: OpenalexClient;
}

/**
 * Build the three clients over one host. Every instance keeps its own OPS token
 * cache, throttle buckets and ODP request spacing: two hosts in one process
 * never share state.
 */
export function createConnectors(host: ConnectorHost): Connectors {
	const context = createContext(host);
	return {
		host,
		context,
		ops: opsClient(context),
		odp: odpClient(context),
		academic: academicClient(context),
		fulltext: fulltextClient(context),
		openalex: openalexClient(context),
	};
}
