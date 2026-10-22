/*---------------------------------------------------------------------------------------------
 *  PDF → PNG/JPEG rasterization for patent figures.
 *
 *  EPO OPS serves most patent drawings only as PDF. The VS Code chat model can render
 *  PNG/JPEG image parts but not application/pdf, so we rasterize a single-page PDF here
 *  (server-side, pure-WASM via mupdf — no native/system binaries required).
 *
 *  Two renders (#589):
 *   - the default: 150 DPI, RGB, PNG — the bytes get_patent_image always returned;
 *   - fit=compact: the long edge scaled to at most COMPACT_MAX_EDGE_PX, grayscale, and
 *     the smaller of PNG and JPEG (quality COMPACT_JPEG_QUALITY) per page. Patent
 *     drawings are line art, so grayscale loses nothing and PNG usually wins.
 *--------------------------------------------------------------------------------------------*/

import * as mupdf from 'mupdf';

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

/**
 * Rasterize the first page of a (typically single-page) PDF buffer.
 *
 * @param pdf - PDF document bytes (EPO returns one page per request via ?Range=N)
 * @param opts - dpi for the default render, or fit='compact'
 * @returns the encoded page with format, width and height
 */
export function rasterizePdf(pdf: Buffer, opts: RasterizeOptions = {}): RasterizedPage {
	const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
	try {
		if (doc.countPages() < 1) {
			throw new Error('PDF has no pages to rasterize');
		}

		const page = doc.loadPage(0);
		const compact = opts.fit === 'compact';
		// 72 is the PDF userspace unit; scale up to the requested DPI.
		const defaultScale = (opts.dpi ?? DEFAULT_RASTER_DPI) / 72;
		const scale = compact ? compactScale(page.getBounds()) : defaultScale;
		const matrix = mupdf.Matrix.scale(scale, scale);
		const colorSpace = compact ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
		// No alpha channel: an opaque white background keeps line drawings crisp,
		// and JPEG has no alpha.
		const pixmap = page.toPixmap(matrix, colorSpace, false, true);
		try {
			const width = pixmap.getWidth();
			const height = pixmap.getHeight();
			const png = Buffer.from(pixmap.asPNG());
			if (!compact) {
				return { bytes: png, format: 'png', width, height };
			}
			const jpeg = Buffer.from(pixmap.asJPEG(COMPACT_JPEG_QUALITY, false));
			return jpeg.length < png.length
				? { bytes: jpeg, format: 'jpeg', width, height }
				: { bytes: png, format: 'png', width, height };
		} finally {
			pixmap.destroy();
		}
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
export function rasterizePdfToPng(pdf: Buffer, dpi: number = DEFAULT_RASTER_DPI): Buffer {
	return rasterizePdf(pdf, { dpi }).bytes;
}

/**
 * The compact scale for a page box [x0, y0, x1, y1] in points: the long edge
 * lands on COMPACT_MAX_EDGE_PX, but a small page is never scaled above the
 * default DPI. A hair under the exact ratio so mupdf's box rounding cannot
 * land one pixel over the cap.
 */
function compactScale(bounds: number[]): number {
	const [x0, y0, x1, y1] = bounds;
	const longEdgePt = Math.max(x1 - x0, y1 - y0);
	if (!(longEdgePt > 0)) {
		return DEFAULT_RASTER_DPI / 72;
	}
	const toCap = (COMPACT_MAX_EDGE_PX - 0.5) / longEdgePt;
	return Math.min(toCap, DEFAULT_RASTER_DPI / 72);
}
