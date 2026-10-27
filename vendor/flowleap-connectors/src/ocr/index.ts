/*---------------------------------------------------------------------------------------------
 *  The OCR module of the package (PRD #105, fan-out #108; ADR 0019 C3a).
 *
 *  - runOcr / verifyKey / isOcrConfigured — the Mistral OCR client over the
 *    host's `mistral` credential (./ocr.ts), bound as `createConnectors(host).ocr`
 *  - ocrInputSchema — the single zod validation source of the `ocr` tool
 *  - resolveOcr — the resolution order every internal caller of OCR follows
 *  - OcrInputError / OcrNotConfiguredError / OcrConfigurationError, OCR_MODEL / OCR_SUPPORTED_FORMATS
 *--------------------------------------------------------------------------------------------*/

import type { ConnectorContext } from '../context.js';
import type { ConnectorOcr } from '../host.js';
import { runOcr } from './ocr.js';

export {
	runOcr,
	verifyKey,
	isOcrConfigured,
	OcrInputError,
	OcrNotConfiguredError,
	OcrConfigurationError,
	OCR_MODEL,
	OCR_CACHE_TTL,
	OCR_RESPONSE_SHAPE_VERSION,
	OCR_SUPPORTED_FORMATS,
	MISTRAL_API_BASE,
	type OcrRequestInput,
	type OcrResponse,
	type OcrPage,
	type OcrImage,
	type OcrKeyVerdict,
} from './ocr.js';
export { ocrInputSchema, type OcrInput } from './schema.js';

/**
 * The OCR an internal caller runs (the IFW document reader), in this order:
 * the host's own `ocr` capability when it supplies one; else the package
 * client when the host holds a `mistral` credential; else nothing — the
 * caller answers its existing not-configured error (`ocr_unavailable`).
 */
export async function resolveOcr(ctx: ConnectorContext): Promise<ConnectorOcr | undefined> {
	if (ctx.host.ocr) return ctx.host.ocr;
	const lookup = await ctx.host.credentials('mistral');
	if (lookup.status === 'available' && lookup.credentials.apiKey) {
		return { run: (input) => runOcr(ctx, input) };
	}
	return undefined;
}
