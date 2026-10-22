/**
 * USPTO ODP Patent Search
 *
 * Thin client over USPTO Open Data Portal's `/api/v1/patent/applications/*`
 * endpoints (search, lookup-by-application-number, continuity). Replaces the
 * retired PatentsView Search API. See ADR 0002 for the passthrough shape.
 */

import type { ConnectorContext } from '../context.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { APIError } from '../errors.js';
import { fetchWithRetry } from '../fetch-with-retry.js';
import { getUSPTOOdpAuthHeader, isUSPTOOdpConfigured, resolveOdpCredentials, throwIfUserKeyRejected } from './auth.js';

const ODP_API_BASE = 'https://api.uspto.gov/api/v1';

const DEFAULT_FIELDS = [
	'applicationNumberText',
	'applicationMetaData.inventionTitle',
	'applicationMetaData.patentNumber',
	'applicationMetaData.filingDate',
	'applicationMetaData.grantDate',
	'applicationMetaData.firstApplicantName',
	'applicationMetaData.firstInventorName',
	'applicationMetaData.applicationTypeLabelName',
	'applicationMetaData.applicationStatusDescriptionText',
	'applicationMetaData.publicationCategoryBag',
	'applicationMetaData.cpcClassificationBag',
];

export interface ODPSearchRequest {
	q?: string;
	// NOTE (issue #155): no `filters`. USPTO ODP rejects the legacy
	// "fieldName value" string form with 400; the search route strips it and
	// callers express equality constraints as fielded `q` terms (path:value).
	rangeFilters?: string;
	sort?: string;
	fields?: string[];
	facets?: string;
	pagination?: { limit?: number; offset?: number };
}

export interface ODPApplicationMetaData {
	inventionTitle?: string;
	patentNumber?: string;
	filingDate?: string;
	grantDate?: string;
	firstApplicantName?: string;
	firstInventorName?: string;
	applicationTypeLabelName?: string;
	applicationTypeCode?: string;
	applicationStatusCode?: number;
	applicationStatusDescriptionText?: string;
	publicationCategoryBag?: string[];
	cpcClassificationBag?: Array<Record<string, unknown>> | string[];
	[key: string]: unknown;
}

export interface ODPApplicationRecord {
	applicationNumberText: string;
	applicationMetaData?: ODPApplicationMetaData;
	[key: string]: unknown;
}

export interface ODPSearchResponse {
	count: number;
	patentFileWrapperDataBag: ODPApplicationRecord[];
	requestIdentifier?: string;
}

export interface ODPSearchError {
	status: number;
	code: string;
	message: string;
	upstreamRequestIdentifier?: string;
}

export type ODPSearchResult =
	| { ok: true; data: ODPSearchResponse }
	| { ok: false; error: ODPSearchError };

export async function searchODPApplications(
	ctx: ConnectorContext,
	request: ODPSearchRequest
): Promise<ODPSearchResult> {
	const lookup = await resolveOdpCredentials(ctx);
	if (!isUSPTOOdpConfigured(lookup)) {
		return {
			ok: false,
			error: {
				status: 503,
				code: ErrorCodes.odp_api_key_missing,
				message: 'USPTO ODP API key not configured. Set USPTO_ODP_API_KEY environment variable.',
			},
		};
	}

	const body: ODPSearchRequest = {
		...request,
		fields: request.fields && request.fields.length > 0 ? request.fields : DEFAULT_FIELDS,
	};

	let response: Response;
	try {
		const authHeader = await getUSPTOOdpAuthHeader(ctx, lookup);
		response = await fetchWithRetry(
			ctx.host,
			`${ODP_API_BASE}/patent/applications/search`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...authHeader,
				},
				body: JSON.stringify(body),
			},
			{ service: 'USPTO-ODP-PatentSearch' }
		);
	} catch (err) {
		if (err instanceof APIError) {
			// ODP returns 404 with detailedMessage "No matching records found" on empty searches.
			// Translate to an empty result so the route stays a clean 200 for the LLM agent.
			if (err.statusCode === 404) {
				return { ok: true, data: { count: 0, patentFileWrapperDataBag: [] } };
			}
			throwIfUserKeyRejected(lookup, err.statusCode);
			return { ok: false, error: parseODPError(err.statusCode, err.message) };
		}
		throw err;
	}

	const data = (await response.json()) as ODPSearchResponse;
	return { ok: true, data };
}

/**
 * Generic GET passthrough for ODP endpoints that share the
 * { count, patentFileWrapperDataBag, requestIdentifier } response shape.
 */
async function odpGet(ctx: ConnectorContext, path: string): Promise<ODPSearchResult> {
	const lookup = await resolveOdpCredentials(ctx);
	if (!isUSPTOOdpConfigured(lookup)) {
		return {
			ok: false,
			error: {
				status: 503,
				code: ErrorCodes.odp_api_key_missing,
				message: 'USPTO ODP API key not configured. Set USPTO_ODP_API_KEY environment variable.',
			},
		};
	}

	let response: Response;
	try {
		const authHeader = await getUSPTOOdpAuthHeader(ctx, lookup);
		response = await fetchWithRetry(
			ctx.host,
			`${ODP_API_BASE}${path}`,
			{
				method: 'GET',
				headers: { ...authHeader },
			},
			{ service: 'USPTO-ODP-PatentSearch' }
		);
	} catch (err) {
		if (err instanceof APIError) {
			if (err.statusCode === 404) {
				return { ok: true, data: { count: 0, patentFileWrapperDataBag: [] } };
			}
			throwIfUserKeyRejected(lookup, err.statusCode);
			return { ok: false, error: parseODPError(err.statusCode, err.message) };
		}
		throw err;
	}

	const data = (await response.json()) as ODPSearchResponse;
	return { ok: true, data };
}

/**
 * Fetch the full ODP application record by applicationNumberText.
 * Returns count: 0 / empty bag if the application is not found.
 */
export async function getODPApplicationByNumber(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}`);
}

/**
 * Fetch parent/child continuity for an application — ODP's closest analog
 * to a patent family graph (decision B in ADR 0002).
 */
export async function getODPApplicationContinuity(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/continuity`);
}

/**
 * File-wrapper sub-resources sharing the { count, patentFileWrapperDataBag }
 * envelope. Each is a projection of the full application record — the base
 * lookup already contains every bag — but the targeted paths keep payloads
 * small for agent consumption.
 */

/** Prosecution transaction/event history (eventDataBag). */
export async function getODPApplicationTransactions(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/transactions`);
}

/** Assignment records (assignmentBag) — reel/frame, assignors, assignees. */
export async function getODPApplicationAssignment(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/assignment`);
}

/** Foreign priority claims (foreignPriorityBag). */
export async function getODPApplicationForeignPriority(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/foreign-priority`);
}

/** Patent term adjustment data (patentTermAdjustmentData) — official PTA day counts. */
export async function getODPApplicationAdjustment(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/adjustment`);
}

/** Attorney/agent of record (recordAttorney) — power of attorney, customer number. */
export async function getODPApplicationAttorney(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/attorney`);
}

/** Grant/pgpub bulk-dataset XML pointers (grantDocumentMetaData, pgpubDocumentMetaData). */
export async function getODPApplicationAssociatedDocuments(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPSearchResult> {
	return odpGet(ctx, `/patent/applications/${encodeURIComponent(applicationNumberText)}/associated-documents`);
}

export function parseODPError(status: number, rawBody: string): ODPSearchError {
	type UpstreamErrorBody = {
		code?: unknown;
		error?: unknown;
		errorDetails?: unknown;
		detailedMessage?: unknown;
		message?: unknown;
		requestIdentifier?: unknown;
	};
	let upstream: UpstreamErrorBody | null = null;
	try {
		upstream = JSON.parse(rawBody) as UpstreamErrorBody;
	} catch {
		// non-JSON body; fall through to generic error
	}
	let detail = `ODP returned HTTP ${status}`;
	if (typeof upstream?.detailedMessage === 'string' && upstream.detailedMessage.length > 0) {
		detail = upstream.detailedMessage;
	} else if (typeof upstream?.errorDetails === 'string' && upstream.errorDetails.length > 0) {
		detail = upstream.errorDetails;
	} else if (typeof upstream?.message === 'string' && upstream.message.length > 0) {
		detail = upstream.message;
	} else if (typeof upstream?.error === 'string' && upstream.error.length > 0) {
		detail = upstream.error;
	}
	return {
		status,
		code: upstream?.code ? String(upstream.code) : ErrorCodes.odp_upstream_error,
		message: detail,
		upstreamRequestIdentifier: upstream?.requestIdentifier ? String(upstream.requestIdentifier) : undefined,
	};
}

export const ODP_DEFAULT_FIELDS = DEFAULT_FIELDS;
