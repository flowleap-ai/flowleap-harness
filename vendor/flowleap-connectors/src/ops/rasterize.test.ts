/**
 * PDF rasterization for get_patent_image (#589).
 *
 * The real fixture is page 6 of EP4831432A1 (a drawing page, a public EPO
 * publication; OPS serves this document as PDF only). The size cases use a
 * one-page line-art PDF written here, so any page box can be tested. The
 * default path keeps its 150 DPI RGB PNG; the compact path scales the long
 * edge to at most 1000 px, renders in grayscale and keeps the smaller of PNG
 * and JPEG.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { COMPACT_MAX_EDGE_PX, DEFAULT_RASTER_DPI, rasterizePdf, rasterizePdfToPng } from './rasterize.js';

const page6 = readFileSync(new URL('./__fixtures__/ep4831432a1-page6.pdf', import.meta.url));

/** A one-page PDF of `width` x `height` pt with two diagonals and a rectangle. */
function lineArtPdf(width = 595, height = 842): Buffer {
	const content = [
		'2 w 0 0 0 RG',
		`${width * 0.17} ${height * 0.12} m ${width * 0.83} ${height * 0.88} l S`,
		`${width * 0.17} ${height * 0.88} m ${width * 0.83} ${height * 0.12} l S`,
		`${width * 0.25} ${height * 0.18} ${width * 0.5} ${height * 0.64} re S`,
	].join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << >> >>`,
		`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
	];
	let pdf = '%PDF-1.4\n';
	const offsets = objects.map((body, i) => {
		const offset = pdf.length;
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
		return offset;
	});
	const xref = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(pdf, 'latin1');
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** Share of pixels darker than mid-gray: a blank render has none. */
function inkShare(png: Buffer): number {
	const { data, width, height } = PNG.sync.read(png);
	let dark = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] + data[i + 1] + data[i + 2] < 384) dark++;
	}
	return dark / (width * height);
}

describe('rasterizePdfToPng (default path)', () => {
	it('renders the EP4831432A1 drawing page at 150 DPI as an RGB PNG with ink on it', async () => {
		const png = await rasterizePdfToPng(page6);
		expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
		const decoded = PNG.sync.read(png);
		const page = await rasterizePdf(page6, { dpi: DEFAULT_RASTER_DPI });
		expect([decoded.width, decoded.height]).toEqual([page.width, page.height]);
		// An A4 page at 150 DPI: about 1240 x 1754 px.
		expect(page.width).toBeGreaterThan(1200);
		expect(page.height).toBeGreaterThan(1700);
		// PNG colour type 2 (RGB) at byte 25 of the IHDR chunk.
		expect(png[25]).toBe(2);
		const ink = inkShare(png);
		expect(ink).toBeGreaterThan(0.001);
		expect(ink).toBeLessThan(0.5);
	});

	it('scales an A4 page box to 150 DPI', async () => {
		const { width, height, format } = await rasterizePdf(lineArtPdf(), { dpi: DEFAULT_RASTER_DPI });
		// 595 pt and 842 pt at 150 DPI, floored.
		expect([format, width, height]).toEqual(['png', 1239, 1754]);
	});
});

describe('rasterizePdf fit=compact', () => {
	it('renders the EP4831432A1 page at most 1000 px on the long edge, grayscale, with the magic bytes of its format', async () => {
		const page = await rasterizePdf(page6, { fit: 'compact' });
		expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(COMPACT_MAX_EDGE_PX);
		expect(Math.max(page.width, page.height)).toBeGreaterThan(COMPACT_MAX_EDGE_PX - 3);
		const magic = page.format === 'png' ? PNG_MAGIC : JPEG_MAGIC;
		expect(page.bytes.subarray(0, magic.length)).toEqual(magic);
		if (page.format === 'png') {
			// PNG colour type 0 (grayscale).
			expect(page.bytes[25]).toBe(0);
		}
		// A drawing page fits the 60k-character budget as base64.
		expect(page.bytes.toString('base64').length).toBeLessThan(60_000);
	});

	it('keeps the long edge at or under 1000 px in portrait and landscape', async () => {
		const portrait = await rasterizePdf(lineArtPdf(595, 842), { fit: 'compact' });
		const landscape = await rasterizePdf(lineArtPdf(842, 595), { fit: 'compact' });
		expect(Math.max(portrait.width, portrait.height)).toBeLessThanOrEqual(COMPACT_MAX_EDGE_PX);
		expect(Math.max(landscape.width, landscape.height)).toBeLessThanOrEqual(COMPACT_MAX_EDGE_PX);
		// The long edge is scaled to the cap, not far under it.
		expect(Math.max(portrait.width, portrait.height)).toBeGreaterThan(COMPACT_MAX_EDGE_PX - 3);
		expect(portrait.height).toBeGreaterThan(portrait.width);
		expect(landscape.width).toBeGreaterThan(landscape.height);
	});

	it('does not scale a small page above 150 DPI', async () => {
		const small = await rasterizePdf(lineArtPdf(200, 100), { fit: 'compact' });
		// 200 pt at 150 DPI = 416 px, well under the 1000 px cap.
		expect(small.width).toBeLessThanOrEqual(417);
	});

	it('rejects bytes that are not a PDF', async () => {
		await expect(rasterizePdf(Buffer.from('not a pdf'))).rejects.toThrow();
	});
});
