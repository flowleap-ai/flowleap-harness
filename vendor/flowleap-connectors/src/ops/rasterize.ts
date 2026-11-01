/*---------------------------------------------------------------------------------------------
 *  PDF → PNG/JPEG rasterization for patent figures.
 *
 *  EPO OPS serves most patent drawings only as PDF. The VS Code chat model can render
 *  PNG/JPEG image parts but not application/pdf, so we rasterize a single-page PDF here
 *  (pure WASM through PDFium, `@hyzyla/pdfium`; PNG through `pngjs`, JPEG through
 *  `jpeg-js` — no native or system binaries, and every dependency is permissively
 *  licensed). The PDFium WASM module loads once per process, on the first render.
 *
 *  Two renders (#589):
 *   - the default: 150 DPI, RGB, PNG — the bytes get_patent_image always returned;
 *   - fit=compact: the long edge scaled to at most COMPACT_MAX_EDGE_PX, grayscale, and
 *     the smaller of PNG and JPEG (quality COMPACT_JPEG_QUALITY) per page. Patent
 *     drawings are line art, so grayscale loses nothing and PNG usually wins.
 *--------------------------------------------------------------------------------------------*/

import { PDFiumLibrary } from '@hyzyla/pdfium';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/** Default rasterization resolution. 150 DPI is sharp enough for patent line drawings. */
export const DEFAULT_RASTER_DPI = 150;

/** fit=compact: the long edge of a page is at most this many pixels. */
export const COMPACT_MAX_EDGE_PX = 1000;

/** fit=compact: JPEG quality tried against PNG; the smaller encoding wins. */
export const COMPACT_JPEG_QUALITY = 70;

export interface RasterizeOptions {
	/** Output resolution in dots per inch (default 150). Not used with fit=compact. */
	dpi?: number;
	/**
	 * 'compact' scales the page so its long edge is at most COMPACT_MAX_EDGE_PX
	 * (never above the default DPI), renders grayscale, and keeps the smaller
	 * of PNG and JPEG.
	 */
	fit?: 'compact';
}

/** One rasterized page with its encoding and pixel size. */
export interface RasterizedPage {
	bytes: Buffer;
	format: 'png' | 'jpeg';
	width: number;
	height: number;
}

let library: Promise<PDFiumLibrary> | undefined;

/** The process-wide PDFium instance; a failed load is retried on the next render. */
function pdfium(): Promise<PDFiumLibrary> {
	library ??= PDFiumLibrary.init().catch((error: unknown) => {
		library = undefined;
		throw error;
	});
	return library;
}

/**
 * Rasterize the first page of a (typically single-page) PDF buffer.
 *
 * @param pdf - PDF document bytes (EPO returns one page per request via ?Range=N)
 * @param opts - dpi for the default render, or fit='compact'
 * @returns the encoded page with format, width and height
 */
export async function rasterizePdf(pdf: Buffer, opts: RasterizeOptions = {}): Promise<RasterizedPage> {
	const doc = await (await pdfium()).loadDocument(pdf);
	try {
		if (doc.getPageCount() < 1) {
			throw new Error('PDF has no pages to rasterize');
		}
		const page = doc.getPage(0);
		const compact = opts.fit === 'compact';
		// 72 is the PDF userspace unit; scale up to the requested DPI.
		const scale = compact ? compactScale(page.getOriginalSize()) : (opts.dpi ?? DEFAULT_RASTER_DPI) / 72;
		// No transparency: an opaque white background keeps line drawings crisp, and JPEG has no alpha.
		const { width, height, data } = await page.render({
			scale,
			colorSpace: compact ? 'Gray' : 'RGBA',
			render: 'bitmap',
			transparent: false,
		});
		if (!compact) {
			return { bytes: encodePng(data, width, height, 'rgba'), format: 'png', width, height };
		}
		const png = encodePng(data, width, height, 'gray');
		const jpg = jpeg.encode({ data: grayToRgba(data), width, height }, COMPACT_JPEG_QUALITY).data;
		return jpg.length < png.length
			? { bytes: jpg, format: 'jpeg', width, height }
			: { bytes: png, format: 'png', width, height };
	} finally {
		doc.destroy();
	}
}

/**
 * Rasterize the first page of a PDF buffer to a PNG buffer (the default render).
 *
 * @param pdf - PDF document bytes
 * @param dpi - Output resolution in dots per inch (default 150)
 * @returns PNG image bytes
 */
export async function rasterizePdfToPng(pdf: Buffer, dpi: number = DEFAULT_RASTER_DPI): Promise<Buffer> {
	return (await rasterizePdf(pdf, { dpi })).bytes;
}

/** An RGBA bitmap as an RGB PNG, or a one-byte-per-pixel bitmap as a grayscale PNG. */
function encodePng(data: Uint8Array, width: number, height: number, input: 'rgba' | 'gray'): Buffer {
	const colors = input === 'gray' ? { colorType: 0, inputColorType: 0 } as const : { colorType: 2, inputColorType: 6 } as const;
	const png = new PNG({ width, height, ...colors });
	png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	return PNG.sync.write(png, colors);
}

/** jpeg-js encodes RGBA only. */
function grayToRgba(gray: Uint8Array): Buffer {
	const rgba = Buffer.alloc(gray.length * 4, 255);
	for (let i = 0; i < gray.length; i++) {
		rgba[i * 4] = gray[i];
		rgba[i * 4 + 1] = gray[i];
		rgba[i * 4 + 2] = gray[i];
	}
	return rgba;
}

/**
 * The compact scale for a page in points: the long edge lands on
 * COMPACT_MAX_EDGE_PX, but a small page is never scaled above the default DPI.
 * PDFium floors the point size and then the scaled size, so the floored long
 * edge times this scale never exceeds the cap.
 */
function compactScale(size: { originalWidth: number; originalHeight: number }): number {
	const longEdgePt = Math.max(Math.floor(size.originalWidth), Math.floor(size.originalHeight));
	if (!(longEdgePt > 0)) {
		return DEFAULT_RASTER_DPI / 72;
	}
	return Math.min(COMPACT_MAX_EDGE_PX / longEdgePt, DEFAULT_RASTER_DPI / 72);
}
