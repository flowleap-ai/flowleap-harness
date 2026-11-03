/*---------------------------------------------------------------------------------------------
 *  get_patent_image — the drawing pages of a publication (PRD 0013 T04, #272; in the
 *  package since #180).
 *
 *  EPO OPS images are a free read on the host's OPS key, so every host runs this
 *  tool on its own key. Metadata by default, and with include_images=true fetches
 *  figure pages through the host's OPS client (`getFigurePage`) with the behavior
 *  inherited from the retired GET /v1/ops/figures route (ADR 0013) — 3-at-a-time
 *  concurrency, MAX_PAGES=20 cap, render=png rasterization of the PDF source —
 *  returning figures[] with base64 page data inside the JSON tool result.
 *
 *  Both response shapes carry totalFigures and drawingStartPage at the top
 *  level (#278 ride-along, add-only). The metadata shape strips the internal
 *  EPO formats[].link — a raw OPS URL fragment that was never part of the
 *  contract and is useless without an authenticated OPS client — and
 *  lists drawingPages, the pages an images call should ask for, and sections,
 *  every document section with its start page (#589). The drawings end where
 *  the next section starts: an A1 has the search report after them.
 *
 *  A page is not a figure (#589): one drawing page holds several figures, so
 *  an entry carries its page number and no figure label. The opt-in
 *  fit='compact' renders each page small (../ops/rasterize.ts) and stops at
 *  FIGURE_BUDGET_CHARS of base64 with truncated + remainingPages, so the JSON
 *  never gets cut mid-string by a client's output cap. Without fit the call is
 *  byte-identical to before.
 *
 *  The tool definition is in ./office-tools.ts (its input extends
 *  patentNumberInput); this module holds the parameters and the handler body.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { recordCacheRead } from '../cache-visibility.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { COMPACT_MAX_EDGE_PX } from '../ops/rasterize.js';
import type { FigureData, FiguresResponse, ImageInquiryData } from '../ops/types.js';
import type { ToolContext } from './definition.js';
import { ToolError, unwrapRead } from './shared.js';

/** Same cap the /v1/ops/figures route enforces. */
export const MAX_FIGURE_PAGES = 20;

/** Same batch size the /v1/ops/figures route uses for page fetches. */
const PAGE_FETCH_CONCURRENCY = 3;

/**
 * fit=compact: the most base64 characters one response carries across all
 * pages. Pages are added in request order while they fit; the first page is
 * always returned, even when it alone is over the budget.
 */
export const FIGURE_BUDGET_CHARS = 60_000;

/**
 * The image-fetching parameters added to the tool's patent_number input.
 * Spread into the tool schema via patentNumberInput.extend(...).
 */
export const figureImageParams = {
	include_images: z
		.boolean()
		.default(false)
		.describe(
			'Set true to fetch base64-encoded page images into figures[]. Default false returns the figure metadata only (formats, page counts), exactly as before.'
		),
	pages: z
		.array(z.number().int().min(1))
		.min(1)
		.optional()
		.describe(
			`PDF page numbers to fetch, as an integer array, e.g. [9, 10] (only with include_images). A string such as "9-12" is rejected. Pages are not figures: one page holds several figures. Take the numbers from drawingPages in the metadata call. Max ${MAX_FIGURE_PAGES} per call; pages beyond the document's total are skipped. Omit to fetch all pages (capped at ${MAX_FIGURE_PAGES}).`
		),
	format: z
		.enum(['png', 'tiff', 'pdf'])
		.default('pdf')
		.describe('Source image format to fetch from EPO. Most patents are PDF-only.'),
	render: z
		.enum(['png'])
		.optional()
		.describe(
			'Set "png" to rasterize the (PDF) source to PNG. Recommended for AI agents and image rendering, since most patents are PDF-only and PDFs cannot be displayed as images.'
		),
	fit: z
		.enum(['compact'])
		.optional()
		.describe(
			`Set "compact" for small pages: each page is rendered from the PDF source at most ${COMPACT_MAX_EDGE_PX} px on the long edge, grayscale, as PNG or JPEG (the smaller). Each entry then carries format, width, height and bytes. The response holds at most ${FIGURE_BUDGET_CHARS} base64 characters in total: pages are added in request order while they fit, then truncated=true and remainingPages list the pages to ask for in the next call. The first page is always returned. Use this through MCP or any client with an output cap.`
		),
};

export interface GetPatentImageInput {
	patent_number: string;
	include_images: boolean;
	pages?: number[];
	format: 'png' | 'tiff' | 'pdf';
	render?: 'png';
	fit?: 'compact';
}

/** Pick the best-matching format entry (source preferred, then PDF > PNG > TIFF) — route parity. */
function pickFormatInfo(
	metadata: ImageInquiryData,
	sourceFormat: 'png' | 'tiff' | 'pdf'
): ImageInquiryData['formats'][number] | undefined {
	return (
		metadata.formats.find((f) => f.format === sourceFormat) ||
		metadata.formats.find((f) => f.format === 'pdf') ||
		metadata.formats.find((f) => f.format === 'png') ||
		metadata.formats.find((f) => f.format === 'tiff') ||
		metadata.formats[0]
	);
}

/**
 * Bounded-concurrency map; failed items are dropped (route parity). When
 * `stop` answers true for a result, the remaining items are not fetched and
 * come back as `rest` (fit=compact's response budget, #589).
 */
async function processInBatches<T, R>(
	items: T[],
	batchSize: number,
	fn: (item: T) => Promise<R>,
	stop: (result: R) => boolean = () => false
): Promise<{ results: R[]; rest: T[] }> {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.allSettled(batch.map(fn));
		for (const [j, r] of batchResults.entries()) {
			if (r.status !== 'fulfilled') continue;
			if (stop(r.value)) {
				return { results, rest: items.slice(i + j) };
			}
			results.push(r.value);
		}
	}
	return { results, rest: [] };
}

/**
 * The metadata response shape (include_images=false): the image-inquiry data
 * with totalFigures/drawingStartPage lifted to the top level (from the
 * best-matching format entry) and the internal EPO formats[].link removed.
 */
export interface FigureMetadataResponse {
	docId: string;
	/** Page count of the best-matching format entry; null when EPO reports no formats. */
	totalFigures: number | null;
	/** 1-based page where the DRAWINGS section starts; null when EPO does not report it. */
	drawingStartPage: number | null;
	/**
	 * The drawing pages — what an images call should ask for: drawingStartPage
	 * up to the page before the next section (an A1 has the search report
	 * after the drawings), or to the last page when no section follows. Empty
	 * when EPO does not report drawingStartPage (#589).
	 */
	drawingPages: number[];
	/**
	 * Every document section of the best-matching format by name with its
	 * 1-based start page, e.g. { DESCRIPTION: 2, CLAIMS: 7, DRAWINGS: 9,
	 * SEARCH_REPORT: 11 }. Empty when EPO reports none.
	 */
	sections: Record<string, number>;
	formats: Array<{
		format: string;
		pages: number;
		availableFormats?: string[];
		drawingStartPage?: number;
		sections?: Record<string, number>;
	}>;
}

/**
 * The get_patent_image handler body. Metadata-only calls (include_images
 * false) return FigureMetadataResponse. With include_images, returns the
 * FiguresResponse shape with base64 page data. Both shapes carry
 * totalFigures and drawingStartPage at the top level.
 */
export async function runGetPatentImage(
	input: GetPatentImageInput,
	ctx: ToolContext
): Promise<FigureMetadataResponse | FiguresResponse> {
	const { ops } = ctx.connectors;
	const metadata = unwrapRead(await ops.getImages(input.patent_number));

	if (!input.include_images) {
		const bestFormat = pickFormatInfo(
			metadata,
			input.render === 'png' ? 'pdf' : input.format
		);
		const drawingStartPage = bestFormat?.drawingStartPage ?? null;
		const totalFigures = bestFormat?.pages ?? null;
		const sections = bestFormat?.sections ?? {};
		return {
			docId: metadata.docId,
			totalFigures,
			drawingStartPage,
			drawingPages: drawingPageRange(drawingStartPage, totalFigures, sections),
			sections,
			// The internal EPO link is an OPS URL fragment usable only through
			// an authenticated OPS client — never exposed.
			formats: metadata.formats.map(({ link: _link, ...format }) => format),
		};
	}

	// render=png rasterizes the PDF source to PNG so it can be displayed as an
	// image (EPO serves most patents only as PDF). fit=compact also renders
	// from the PDF source, small, per page as PNG or JPEG.
	const compact = input.fit === 'compact';
	const renderToPng = input.render === 'png';
	const sourceFormat: 'png' | 'tiff' | 'pdf' = renderToPng || compact ? 'pdf' : input.format;
	const outputFormat: 'png' | 'tiff' | 'pdf' = renderToPng ? 'png' : input.format;

	const formatInfo = pickFormatInfo(metadata, sourceFormat);
	if (!formatInfo) {
		throw new ToolError(404, ErrorCodes.NOT_FOUND, `No figures available for ${metadata.docId}`);
	}

	const totalFigures = formatInfo.pages;

	const pagesToInclude = input.pages
		? input.pages.slice(0, MAX_FIGURE_PAGES).filter((p) => p <= totalFigures)
		: Array.from({ length: Math.min(totalFigures, MAX_FIGURE_PAGES) }, (_, i) => i + 1);

	const epoFormats = metadata.formats.map((f) => f.format);
	const base: Omit<FiguresResponse, 'figures' | 'availableFormats'> = {
		docId: metadata.docId,
		totalFigures,
		drawingStartPage: formatInfo.drawingStartPage,
	};

	if (compact) {
		// The budget: pages are added in request order while the base64 total
		// stays under FIGURE_BUDGET_CHARS. The first page is always kept, so a
		// single dense page still comes back (over budget, truncated for the
		// rest). A failed page is dropped as before and never counts.
		let used = 0;
		const { results, rest } = await processInBatches(
			pagesToInclude,
			PAGE_FETCH_CONCURRENCY,
			async (page): Promise<FigureData | null> => {
				const pageResult = await ops.getFigurePageCompact(formatInfo.link, page);
				if (!pageResult.ok) {
					logPageFailure(ctx, page, pageResult.body.error.message);
					return null;
				}
				recordCacheRead(pageResult.cached);
				const { base64, format, width, height, bytes } = pageResult.data;
				return { page, format, width, height, bytes, base64 };
			},
			(figure) => {
				if (figure === null) return false;
				const chars = figure.base64?.length ?? 0;
				if (used > 0 && used + chars > FIGURE_BUDGET_CHARS) return true;
				used += chars;
				return false;
			}
		);
		const figures = results.filter((f): f is FigureData => f !== null);
		return {
			...base,
			availableFormats: ['png', 'jpeg', ...epoFormats],
			figures,
			truncated: rest.length > 0,
			remainingPages: rest,
		};
	}

	const { results } = await processInBatches(
		pagesToInclude,
		PAGE_FETCH_CONCURRENCY,
		async (page): Promise<FigureData | null> => {
			const pageResult = await ops.getFigurePage(formatInfo.link, page, {
				sourceFormat,
				renderToPng,
			});
			if (!pageResult.ok) {
				logPageFailure(ctx, page, pageResult.body.error.message);
				return null;
			}
			// Per-page cache visibility feeds the facade envelope's `cached` flag.
			recordCacheRead(pageResult.cached);
			return { page, format: outputFormat, base64: pageResult.data };
		}
	);
	const figures = results.filter((f): f is FigureData => f !== null);

	return {
		...base,
		// When rendering, PNG is what we actually return (rasterized from the PDF source).
		availableFormats: renderToPng ? ['png', ...epoFormats] : epoFormats,
		figures,
	};
}

/**
 * The drawing pages: drawingStartPage up to the page before the first section
 * that starts after it (the search report of an A1, for example), or to the
 * last page when no section follows. Empty when the start or the page count
 * is unknown.
 */
function drawingPageRange(
	drawingStartPage: number | null,
	totalPages: number | null,
	sections: Record<string, number>
): number[] {
	if (drawingStartPage === null || totalPages === null || drawingStartPage > totalPages) {
		return [];
	}
	const nextSectionStart = Object.values(sections)
		.filter((start) => start > drawingStartPage)
		.reduce((min, start) => Math.min(min, start), Number.POSITIVE_INFINITY);
	const lastPage = Math.min(totalPages, nextSectionStart - 1);
	return Array.from({ length: lastPage - drawingStartPage + 1 }, (_, i) => drawingStartPage + i);
}

function logPageFailure(ctx: ToolContext, page: number, message: string): void {
	ctx.connectors.host.logger.error(`[Tools get_patent_image] Failed to fetch page ${page}: ${message}`);
}
