/*---------------------------------------------------------------------------------------------
 *  OCR input schema — the SINGLE validation source of the `ocr` tool
 *  (PRD #105, fan-out #108; in the package since ADR 0019 C3a).
 *
 *  This zod schema validates the `ocr` tool (../tools/ocr-tool.ts) in every
 *  host — the backend's facade maps failures to 422 INVALID_INPUT with issue
 *  paths — and feeds the published tool JSON schema (GET /v1/tools, MCP
 *  tools/list, the harness registration). The retired POST /v1/ocr route
 *  mapped the same failures to its legacy 400 body.
 *
 *  `file` and `filename` are deliberately plain optional strings (no min
 *  length): an empty string is falsy exactly like an absent field, so it
 *  falls through to the refinements and reproduces the route's historical
 *  `missing_input` / `missing_filename` errors byte-for-byte instead of a
 *  generic "too small" issue. The unsupported-file-type check stays inside
 *  runOcr (./ocr.ts: it inspects the extension, which is content, not shape).
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

export const ocrInputSchema = z
	.object({
		file: z
			.string()
			.optional()
			.describe('Base64-encoded file content (no data: prefix); requires filename'),
		url: z.string().url().optional().describe('Publicly reachable URL to the document/image'),
		filename: z
			.string()
			.optional()
			.describe('File name incl. extension; required when file is provided'),
		include_images: z
			.boolean()
			.optional()
			.describe(
				'Include extracted images as base64 in the response (default false — text only; imageCount always reports how many exist)'
			),
	})
	.refine((v) => Boolean(v.file || v.url), {
		message: 'Either "file" (base64) or "url" is required',
		path: ['file'],
	})
	.refine((v) => !(v.file && !v.filename), {
		message: '"filename" is required when providing base64 file',
		path: ['filename'],
	});

/** Validated OCR input as produced by a successful schema parse. */
export type OcrInput = z.infer<typeof ocrInputSchema>;
