/**
 * USPTO ODP File-Wrapper Documents
 *
 * Listing and text extraction for IFW (Image File Wrapper) documents —
 * office actions, responses, notices — via ODP's
 * `/patent/applications/{app}/documents` endpoint and the
 * `/download/applications/{app}/{documentIdentifier}.pdf` download path.
 *
 * The documents listing has its OWN envelope (`{ count, documentBag }`), unlike
 * the sibling sub-resources which share `{ count, patentFileWrapperDataBag }`.
 *
 * Text extraction chains download → OCR (`resolveOcr`, ../ocr/index.ts: the
 * host's own `ocr` capability when it supplies one, else the package's Mistral
 * client on the host's `mistral` credential, ADR 0019 C3a): most IFW
 * documents are scanned images with no text layer, so OCR is the only reliable
 * path to their content. The download follows ODP's 302 redirect to a signed
 * data-documents.uspto.gov URL (fetch follows it transparently). OCR results
 * ride the OCR client's 24h content-hash cache; the read_application_document
 * tool (../tools/office-tools.ts, #334) adds the outer app+documentIdentifier
 * cache so cache hits skip the download entirely (IFW documents are immutable
 * once filed).
 */

import type { ConnectorContext } from '../context.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { APIError, UpstreamError } from '../errors.js';
import { fetchWithRetry } from '../fetch-with-retry.js';
import { OcrConfigurationError, OcrNotConfiguredError, resolveOcr } from '../ocr/index.js';
import { getUSPTOOdpAuthHeader, isUSPTOOdpConfigured, resolveOdpCredentials, throwIfUserKeyRejected, type OdpCredentialLookup } from './auth.js';
import { parseODPError, type ODPSearchError } from './patent-search.js';

const ODP_API_BASE = 'https://api.uspto.gov/api/v1';

/**
 * Refuse downloads above this size before OCR. Mistral Document AI caps at
 * ~50MB; base64 inflation (4/3) plus JSON framing puts the practical ceiling
 * lower. Oversized documents surface as a clear 413 rather than an opaque
 * upstream OCR failure.
 */
const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

export interface ODPDownloadOption {
	mimeTypeIdentifier: string;
	downloadUrl: string;
	pageTotalQuantity?: number;
	[key: string]: unknown;
}

export interface ODPDocumentRecord {
	applicationNumberText: string;
	officialDate?: string;
	documentIdentifier: string;
	documentCode?: string;
	documentCodeDescriptionText?: string;
	/** "INCOMING" (applicant → office) or "OUTGOING" (office → applicant). */
	directionCategory?: string;
	downloadOptionBag?: ODPDownloadOption[];
	[key: string]: unknown;
}

export interface ODPDocumentsResponse {
	count: number;
	documentBag: ODPDocumentRecord[];
	requestIdentifier?: string;
}

export type ODPDocumentsResult =
	| { ok: true; data: ODPDocumentsResponse }
	| { ok: false; error: ODPSearchError };

/**
 * List the IFW documents for an application. 404 → empty bag (clean result for
 * callers); other upstream failures parse into the shared ODPSearchError.
 */
export async function getODPApplicationDocuments(
	ctx: ConnectorContext,
	applicationNumberText: string
): Promise<ODPDocumentsResult> {
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
			`${ODP_API_BASE}/patent/applications/${encodeURIComponent(applicationNumberText)}/documents`,
			{
				method: 'GET',
				headers: { ...authHeader },
			},
			{ service: 'USPTO-ODP-Documents' }
		);
	} catch (err) {
		if (err instanceof APIError) {
			if (err.statusCode === 404) {
				return { ok: true, data: { count: 0, documentBag: [] } };
			}
			throwIfUserKeyRejected(lookup, err.statusCode);
			return { ok: false, error: parseODPError(err.statusCode, err.message) };
		}
		throw err;
	}

	const data = (await response.json()) as ODPDocumentsResponse;
	return { ok: true, data };
}

export interface ODPDocumentText {
	applicationNumberText: string;
	documentIdentifier: string;
	pageCount: number;
	/** Markdown-formatted text of the whole document (pages joined by `---`). */
	markdown: string;
	/** OCR model that produced the text. */
	model: string;
}

/**
 * Download an IFW document PDF and return its bytes. The IFW document ids are
 * opaque alphanumeric identifiers from the documents listing.
 * @throws UpstreamError 404 document_not_found / 413 document_too_large
 * @throws ProviderKeyInvalidError / DataKeysRequiredError via the auth layer
 */
async function downloadODPDocumentPdf(
	ctx: ConnectorContext,
	lookup: OdpCredentialLookup,
	applicationNumberText: string,
	documentIdentifier: string
): Promise<Buffer> {
	let response: Response;
	try {
		const authHeader = await getUSPTOOdpAuthHeader(ctx, lookup);
		response = await fetchWithRetry(
			ctx.host,
			`${ODP_API_BASE}/download/applications/${encodeURIComponent(applicationNumberText)}/${encodeURIComponent(documentIdentifier)}.pdf`,
			{
				method: 'GET',
				headers: { ...authHeader },
			},
			// Scanned office actions can run to hundreds of pages.
			{ service: 'USPTO-ODP-Documents', timeoutMs: 120_000 }
		);
	} catch (err) {
		if (err instanceof APIError) {
			// ADR 0007 first: a user-key 401/403 is "fix your key", regardless of path.
			// After that, ODP reports an unknown or non-public document as 403 (not
			// 404 — verified live), so both statuses map to document_not_found for
			// env-key requests instead of leaking a raw 403 the client would misread
			// as an auth problem.
			throwIfUserKeyRejected(lookup, err.statusCode);
			if (err.statusCode === 404 || err.statusCode === 403) {
				throw new UpstreamError(
					404,
					'document_not_found',
					`No document ${documentIdentifier} found for application ${applicationNumberText} (or the document is not publicly available). Use the documents listing to discover valid documentIdentifier values.`
				);
			}
			const parsed = parseODPError(err.statusCode, err.message);
			throw new UpstreamError(parsed.status, parsed.code, parsed.message, {
				upstreamRequestIdentifier: parsed.upstreamRequestIdentifier,
			});
		}
		throw err;
	}

	const contentLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_BYTES) {
		throw new UpstreamError(
			413,
			'document_too_large',
			`Document ${documentIdentifier} is ${contentLength} bytes; the OCR pipeline accepts up to ${MAX_DOCUMENT_BYTES}.`
		);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
		throw new UpstreamError(
			413,
			'document_too_large',
			`Document ${documentIdentifier} is ${buffer.byteLength} bytes; the OCR pipeline accepts up to ${MAX_DOCUMENT_BYTES}.`
		);
	}
	return buffer;
}

/**
 * Fetch an IFW document and extract its text: download the PDF, OCR it via
 * Mistral, return markdown only (extracted images are dropped — file-wrapper
 * consumers want the text, and base64 images would bloat agent context).
 *
 * Throws typed errors for the unified-envelope chokepoint (mapProviderError):
 * UpstreamError for ODP-side failures (503 odp_api_key_missing, 404
 * document_not_found, 413 document_too_large, parsed upstream errors, 503
 * ocr_unavailable when no OCR resolves on this host or its OCR has no key);
 * RateLimitError/APIError from download or OCR propagate as themselves.
 */
export async function getODPDocumentText(
	ctx: ConnectorContext,
	applicationNumberText: string,
	documentIdentifier: string
): Promise<ODPDocumentText> {
	const lookup = await resolveOdpCredentials(ctx);
	if (!isUSPTOOdpConfigured(lookup)) {
		throw new UpstreamError(
			503,
			ErrorCodes.odp_api_key_missing,
			'USPTO ODP API key not configured. Set USPTO_ODP_API_KEY environment variable.'
		);
	}

	const pdf = await downloadODPDocumentPdf(ctx, lookup, applicationNumberText, documentIdentifier);

	const ocrCapability = await resolveOcr(ctx);
	if (!ocrCapability) {
		throw new UpstreamError(503, ErrorCodes.ocr_unavailable, 'OCR is not available on this host.');
	}
	let ocr;
	try {
		ocr = await ocrCapability.run({
			file: pdf.toString('base64'),
			filename: `${documentIdentifier}.pdf`,
		});
	} catch (error) {
		if (error instanceof OcrNotConfiguredError || error instanceof OcrConfigurationError) {
			throw new UpstreamError(503, ErrorCodes.ocr_unavailable, error.message);
		}
		throw error;
	}

	return {
		applicationNumberText,
		documentIdentifier,
		pageCount: ocr.pageCount,
		markdown: ocr.markdown,
		model: ocr.model,
	};
}
