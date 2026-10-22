/*---------------------------------------------------------------------------------------------
 *  The `ocr` tool (ADR 0019 C3a) — defined once, registered by both hosts.
 *
 *  A pure wrapper over the package's Mistral OCR client (../ocr/): the shared
 *  zod schema validates the input, the client runs over the host's `mistral`
 *  credential and cache, and the client's typed errors become the tool
 *  contract — 422 INVALID_INPUT for input the caller can fix, 503
 *  SERVICE_UNAVAILABLE for a host without a Mistral key, the upstream status
 *  as OCR_ERROR for Mistral's own failures; a rate limit, a rejected user key
 *  and a gone caller pass through as their typed errors for the host's
 *  transport to map. The text of the description and the schema are what
 *  the backend has always served (its catalog is byte-identical).
 *
 *  History: this entry was the backend's src/tools/registry.ts `ocr` tool over
 *  src/lib/ocr/ (the Mistral SDK on MISTRAL_API_KEY).
 *--------------------------------------------------------------------------------------------*/

import { ClientGoneError } from '../client-abort.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { APIError, ProviderKeyInvalidError, RateLimitError } from '../errors.js';
import { OcrInputError, OcrNotConfiguredError, ocrInputSchema } from '../ocr/index.js';
import type { ToolDefinition } from './definition.js';
import { ToolError, tool } from './shared.js';

export const ocrTool: ToolDefinition = tool({
	name: 'ocr',
	description:
		'Optical character recognition over a PDF, image, or office document via Mistral Document AI. Returns markdown-formatted text that preserves document structure; the response is text-only by default (imageCount reports how many images were extracted), pass include_images: true to also get the images as base64. ' +
		'Use when you need the text of a scanned/native PDF, an image of a page, or a DOCX/PPTX — e.g. to read a patent PDF, an office action, or a figure caption before analyzing it. ' +
		'Supply exactly one source: file (base64-encoded content, which REQUIRES filename so the type can be inferred) or url (a publicly reachable link). Supported extensions: PDF, PNG, JPG, JPEG, GIF, WEBP, AVIF, DOCX, PPTX. Results are cached for 24h.',
	// The shared module schema (../ocr/schema.ts) — the single validation
	// source of this tool in every host (#108).
	input: ocrInputSchema,
	access: 'mistral',
	handler: async (input, ctx) => {
		try {
			return await ctx.connectors.ocr.runOcr(input);
		} catch (error) {
			if (error instanceof OcrInputError) {
				throw new ToolError(422, ErrorCodes.INVALID_INPUT, error.message);
			}
			if (error instanceof RateLimitError || error instanceof ProviderKeyInvalidError || error instanceof ClientGoneError) {
				throw error;
			}
			if (error instanceof APIError) {
				throw new ToolError(error.statusCode, ErrorCodes.OCR_ERROR, error.message);
			}
			// A host without a Mistral key is 503 (the backend: MISTRAL_API_KEY unset), anything else 500.
			if (error instanceof OcrNotConfiguredError) {
				throw new ToolError(503, ErrorCodes.SERVICE_UNAVAILABLE, error.message);
			}
			throw new ToolError(500, ErrorCodes.INTERNAL_ERROR, error instanceof Error ? error.message : 'OCR failed');
		}
	},
});
