/*---------------------------------------------------------------------------------------------
 *  The Mistral OCR client (PRD #105, fan-out #108; in the package since ADR 0019 C3a).
 *
 *  OCR over PDF/image/office documents via Mistral Document AI
 *  (mistral-ocr-latest): markdown that preserves the document structure, plus
 *  the extracted images (base64). Results are cached for 24 hours through the
 *  host's cache — OCR output never changes for the same input.
 *
 *  Host-neutral (ADR 0019): the key is the host's `mistral` credential, the
 *  network is `host.fetch` against Mistral's REST API (`POST /v1/ocr`), the
 *  cache is `host.cache`, the log is `host.logger`. No SDK: the one call the
 *  client makes is a JSON POST with a bearer token, and the harness carries no
 *  dependency for it. Two consumers share the client and its cache: the `ocr`
 *  tool (./tools/ocr-tool.ts) and the IFW document reader
 *  (../uspto-odp/documents.ts, through ./index.ts `resolveOcr`).
 *
 *  Failures the caller can fix are OcrInputError (with a stable `code`); a
 *  host without a Mistral key is OcrNotConfiguredError; Mistral's own answers
 *  are the package's typed errors — RateLimitError on 429, ProviderKeyInvalidError
 *  when Mistral rejects a USER-owned key (401/403), APIError for every other
 *  non-2xx. `verifyKey` is the settings-card test call: one cheap authenticated
 *  GET that answers `{ ok, message }` and never throws.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'node:crypto';
import { getCacheKey } from '../cache-key.js';
import { withClientAbort } from '../client-abort.js';
import type { ConnectorContext } from '../context.js';
import { APIError, ProviderKeyInvalidError, RateLimitError } from '../errors.js';
import { parseRetryAfter } from '../fetch-with-retry.js';
import type { CredentialLookup } from '../host.js';

/** Cache TTL for OCR results, in seconds (24 hours — OCR output never changes for the same file). */
export const OCR_CACHE_TTL = 86400;

/** The Mistral Document AI model this client drives (the API alias). */
export const OCR_MODEL = 'mistral-ocr-latest';

/** Mistral's REST API. The OCR call and the key test both go here. */
export const MISTRAL_API_BASE = 'https://api.mistral.ai';

/** File extensions the client accepts, in the order the health probe reports. */
export const OCR_SUPPORTED_FORMATS = [
	'pdf',
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'avif',
	'docx',
	'pptx',
] as const;

/**
 * OCR Response type
 */
export interface OcrImage {
	id: string;
	base64: string;
	mimeType: string;
}

export interface OcrPage {
	pageNumber: number;
	markdown: string;
	dimensions?: {
		width: number;
		height: number;
	};
	images?: OcrImage[];
}

export interface OcrResponse {
	success: boolean;
	filename?: string;
	pages: OcrPage[];
	markdown: string; // Combined markdown from all pages
	images: OcrImage[]; // All extracted images (empty unless include_images)
	/** How many images the document yielded, even when they are not included. */
	imageCount?: number;
	pageCount: number;
	model: string;
	processingTimeMs: number;
	cached?: boolean;
}

export interface OcrRequestInput {
	/** Base64-encoded file content (no data: prefix). Requires `filename`. */
	file?: string;
	/** File name including extension — determines the document type. */
	filename?: string;
	/** Publicly reachable URL to a PDF/image/document. */
	url?: string;
	/** Include extracted images as base64 (default false — text only). */
	include_images?: boolean;
}

/** What `verifyKey` answers: the settings card shows green or red with the message. */
export interface OcrKeyVerdict {
	ok: boolean;
	message: string;
}

/** Bad OCR input the caller can fix (missing file/url, missing filename, unsupported type). */
export class OcrInputError extends Error {
	constructor(message: string, public code: string) {
		super(message);
		this.name = 'OcrInputError';
	}
}

/**
 * The host holds no Mistral key (`credentials('mistral')` is `missing`), so
 * OCR cannot run here. A host's own `ocr` capability throws it for the same
 * condition, so the IFW document reader maps one class to `ocr_unavailable`.
 */
export class OcrNotConfiguredError extends Error {
	constructor(message = 'OCR is not configured on this host: no Mistral API key.') {
		super(message);
		this.name = 'OcrNotConfiguredError';
	}
}

/** Mistral's `POST /v1/ocr` response, the fields this client reads (snake_case on the wire). */
interface MistralOcrPage {
	index?: number;
	markdown?: string;
	images?: Array<{
		id?: string;
		image_base64?: string | null;
		mime_type?: string;
		/** The SDK's spelling, accepted so a host-recorded fixture in either form decodes. */
		imageBase64?: string | null;
		mimeType?: string;
	}>;
	dimensions?: { width: number; height: number; dpi?: number } | null;
}

interface MistralOcrResponse {
	pages?: MistralOcrPage[];
	model?: string;
}

/** The host's Mistral credential, or the typed not-configured error. */
async function requireMistralCredential(ctx: ConnectorContext): Promise<CredentialLookup<'mistral'> & { status: 'available' }> {
	const lookup = await ctx.host.credentials('mistral');
	if (lookup.status !== 'available' || !lookup.credentials.apiKey) {
		throw new OcrNotConfiguredError();
	}
	return lookup;
}

/** Whether this host can run OCR: its own `ocr` capability, or a Mistral key. */
export async function isOcrConfigured(ctx: ConnectorContext): Promise<boolean> {
	if (ctx.host.ocr) return true;
	const lookup = await ctx.host.credentials('mistral');
	return lookup.status === 'available' && Boolean(lookup.credentials.apiKey);
}

/** The first 500 characters of an upstream error body: enough to read, never a whole document. */
async function errorBodyText(response: Response): Promise<string> {
	const text = await response.text().catch(() => '');
	const trimmed = text.trim();
	return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
}

/**
 * Map a non-2xx Mistral answer to the package's typed errors. A 429 is a
 * RateLimitError (the Retry-After honoured); a 401/403 on a USER-owned key is
 * the user's to fix (ProviderKeyInvalidError, the same class the office
 * clients throw); everything else — a host key rejected included, which is a
 * host fault — is an APIError with the upstream status.
 */
async function throwMistralError(
	ctx: ConnectorContext,
	lookup: CredentialLookup<'mistral'> & { status: 'available' },
	response: Response,
): Promise<never> {
	const body = await errorBodyText(response);
	const detail = body ? `: ${body}` : '';
	if (response.status === 429) {
		throw new RateLimitError('Mistral', parseRetryAfter(response.headers, ctx.host.now()), `Mistral rate limit exceeded${detail}`);
	}
	if ((response.status === 401 || response.status === 403) && lookup.owner === 'user') {
		throw new ProviderKeyInvalidError(
			'mistral',
			`Mistral rejected the supplied API key (HTTP ${response.status}). Check your Mistral key.`,
			lookup.stored === true,
		);
	}
	throw new APIError('Mistral', response.status, `Mistral OCR failed (HTTP ${response.status})${detail}`);
}

/**
 * Shape one OCR result for the caller. The cache always holds the full
 * image-laden response (one Mistral call serves both image and text-only
 * consumers); images are stripped on the way out unless the caller asked for
 * them. `imageCount` always reports how many images the document yielded, so
 * a text-only caller knows a re-run with include_images would return them.
 */
function presentOcrResponse(response: OcrResponse, includeImages: boolean): OcrResponse {
	const imageCount = response.images.length;
	if (includeImages) {
		return { ...response, imageCount };
	}
	return {
		...response,
		imageCount,
		images: [],
		pages: response.pages.map((page) => ({ ...page, images: undefined })),
	};
}

/**
 * Run OCR over a PDF/image/document via Mistral Document AI, using the host's
 * cache for 24h. Extracted images (base64) are returned only when
 * `include_images` is true — the default response is text-only, with
 * `imageCount` reporting what was extracted. Throws OcrInputError for bad
 * input, OcrNotConfiguredError when the host has no Mistral key, and
 * RateLimitError / ProviderKeyInvalidError / APIError for Mistral's own
 * answers. Consumed by the `ocr` tool and the IFW document reader, which
 * share the cache.
 */
export async function runOcr(ctx: ConnectorContext, input: OcrRequestInput): Promise<OcrResponse> {
	const { host } = ctx;
	const startTime = host.now();
	const { file, filename, url } = input;
	const includeImages = input.include_images ?? false;

	// Validate input (defense in depth: the tool validates with the shared zod
	// schema, but the client stays safe for direct callers).
	if (!file && !url) {
		throw new OcrInputError('Either "file" (base64) or "url" is required', 'missing_input');
	}

	if (file && !filename) {
		throw new OcrInputError('"filename" is required when providing base64 file', 'missing_filename');
	}

	// Determine document type from filename or URL
	const docName = filename || url!;
	const isPdf = /\.pdf$/i.test(docName);
	const isImage = /\.(png|jpg|jpeg|gif|webp|avif)$/i.test(docName);
	const isDocument = /\.(docx|pptx)$/i.test(docName);

	if (!isPdf && !isImage && !isDocument) {
		throw new OcrInputError(
			'Unsupported file type. Supported: PDF, PNG, JPG, JPEG, GIF, WEBP, AVIF, DOCX, PPTX',
			'unsupported_file_type'
		);
	}

	// Create cache key from file content hash or URL — the same bytes as before
	// the extraction, so entries written by the backend keep their keys.
	const cacheInput = file
		? crypto.createHash('md5').update(file).digest('hex')
		: url;
	const cacheKey = getCacheKey('ocr', { input: cacheInput });

	// Check cache first
	const cached = await host.cache?.get<OcrResponse>(cacheKey);
	if (cached) {
		host.logger.info(`[OCR] Cache HIT for: ${docName}`);
		return presentOcrResponse({ ...cached, cached: true, processingTimeMs: 0 }, includeImages);
	}

	host.logger.info(`[OCR] Processing ${isPdf ? 'PDF' : isImage ? 'image' : 'document'}: ${docName}`);

	// The key before the upload: a host without one answers the typed error and spends nothing.
	const lookup = await requireMistralCredential(ctx);

	// Build the document object for Mistral's API: a public URL, or a data URL
	// carrying the base64 content; images go as image_url, everything else as
	// document_url.
	const source = url ?? `data:${getMimeType(filename!)};base64,${file}`;
	const document = isImage ? { type: 'image_url', image_url: source } : { type: 'document_url', document_url: source };

	// Call Mistral OCR API (model "mistral-ocr-latest" is the API alias of the
	// current Document AI model). No retry and no timeout of our own: an OCR
	// run on a large document takes tens of seconds, and a retry would upload
	// it again. Aborted only when the caller is gone.
	const response = await host.fetch(`${MISTRAL_API_BASE}/v1/ocr`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${lookup.credentials.apiKey}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			model: OCR_MODEL,
			document,
			include_image_base64: true, // Include images for saving alongside markdown
		}),
		signal: withClientAbort(host, undefined),
	});
	if (!response.ok) {
		await throwMistralError(ctx, lookup, response);
	}
	const ocrResponse = (await response.json()) as MistralOcrResponse;

	// Process response and extract images
	const allImages: OcrImage[] = [];
	const pages: OcrPage[] = (ocrResponse.pages || []).map((page, index) => {
		const pageImages: OcrImage[] = [];

		// Extract images from page if present
		if (page.images && Array.isArray(page.images)) {
			for (const img of page.images) {
				// The API's snake_case field, or the SDK's camelCase one in a recorded fixture.
				const base64Data = img.image_base64 || img.imageBase64;
				if (base64Data) {
					let cleanBase64 = base64Data;
					let mimeType = img.mime_type || img.mimeType || 'image/jpeg';

					// Strip data URL prefix if present (e.g., "data:image/jpeg;base64,")
					if (cleanBase64.startsWith('data:')) {
						const match = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
						if (match) {
							mimeType = match[1];
							cleanBase64 = match[2];
						}
					}

					const imageData: OcrImage = {
						id: img.id || `img-${allImages.length}`,
						base64: cleanBase64,
						mimeType: mimeType,
					};
					pageImages.push(imageData);
					allImages.push(imageData);
				}
			}
		}

		return {
			pageNumber: index + 1,
			markdown: page.markdown || '',
			dimensions: page.dimensions ?? undefined,
			images: pageImages.length > 0 ? pageImages : undefined,
		};
	});

	const combinedMarkdown = pages.map(p => p.markdown).join('\n\n---\n\n');

	const result: OcrResponse = {
		success: true,
		filename: filename || url,
		pages,
		markdown: combinedMarkdown,
		images: allImages,
		pageCount: pages.length,
		model: OCR_MODEL,
		processingTimeMs: host.now() - startTime,
	};

	// Cache the FULL result (images included), whatever this caller asked
	// for — the next caller may want the images, and OCR output never changes
	// for the same input.
	await host.cache?.set(cacheKey, result, OCR_CACHE_TTL);

	host.logger.info(
		`[OCR] Completed: ${pages.length} pages, ${allImages.length} images in ${result.processingTimeMs}ms for: ${docName}`
	);

	return presentOcrResponse({ ...result, cached: false }, includeImages);
}

/**
 * The settings-card test call: one cheap authenticated read (`GET /v1/models`)
 * on the host's Mistral key. Answers `{ ok, message }` and never throws — a
 * missing key, a rejected key, a rate limit and a network failure are all a
 * red card with a reason. Not cached.
 */
export async function verifyKey(ctx: ConnectorContext): Promise<OcrKeyVerdict> {
	const lookup = await ctx.host.credentials('mistral');
	if (lookup.status !== 'available' || !lookup.credentials.apiKey) {
		return { ok: false, message: 'No Mistral API key is configured.' };
	}
	let response: Response;
	try {
		response = await ctx.host.fetch(`${MISTRAL_API_BASE}/v1/models`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${lookup.credentials.apiKey}`, Accept: 'application/json' },
			signal: withClientAbort(ctx.host, undefined),
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `Mistral could not be reached: ${reason}` };
	}
	if (response.ok) {
		return { ok: true, message: 'Mistral accepted the key.' };
	}
	if (response.status === 401 || response.status === 403) {
		return { ok: false, message: `Mistral rejected the key (HTTP ${response.status}).` };
	}
	if (response.status === 429) {
		return { ok: false, message: 'Mistral is rate limiting this key; try again in a moment.' };
	}
	return { ok: false, message: `Mistral answered HTTP ${response.status}; the key could not be verified.` };
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop();
	const mimeTypes: Record<string, string> = {
		pdf: 'application/pdf',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		webp: 'image/webp',
		avif: 'image/avif',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	};
	return mimeTypes[ext || ''] || 'application/octet-stream';
}
