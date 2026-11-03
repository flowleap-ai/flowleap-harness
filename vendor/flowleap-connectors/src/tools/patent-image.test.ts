/*---------------------------------------------------------------------------------------------
 *  get_patent_image over a fake host (#180): what the harness gets when it runs
 *  the tool on the firm's own OPS key. No network: the host's fetch answers the
 *  OPS token, the image inquiry of EP4831432A1 and its drawing page 6 (a real
 *  PDF page, the rasterize fixture).
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConnectors, ErrorCodes, officeTools, ToolError, type ToolContext } from '../index.js';
import { createFakeHost } from '../__tests__/fake-host.js';

const page6 = readFileSync(new URL('../ops/__fixtures__/ep4831432a1-page6.pdf', import.meta.url));
const LINK = 'published-data/images/EP/4831432/A1/fullimage';

/** The OPS image inquiry of an A1: eight pages, drawings on 6 and 7, the search report from 8. */
const inquiryXml =
	'<?xml version="1.0" encoding="UTF-8"?><ops:world-patent-data xmlns="http://www.epo.org/exchange" xmlns:ops="http://ops.epo.org">' +
	'<ops:document-inquiry><ops:inquiry-result>' +
	`<ops:document-instance system="ops.epo.org" number-of-pages="8" desc="FullDocument" link="${LINK}">` +
	'<ops:document-format-options><ops:document-format>application/pdf</ops:document-format><ops:document-format>application/tiff</ops:document-format></ops:document-format-options>' +
	'<ops:document-section name="ABSTRACT" start-page="1"/><ops:document-section name="DESCRIPTION" start-page="2"/>' +
	'<ops:document-section name="CLAIMS" start-page="4"/><ops:document-section name="DRAWINGS" start-page="6"/>' +
	'<ops:document-section name="SEARCH_REPORT" start-page="8"/>' +
	'</ops:document-instance></ops:inquiry-result></ops:document-inquiry></ops:world-patent-data>';

function recordedOps() {
	const urls: string[] = [];
	const fetch = async (input: string | URL): Promise<Response> => {
		const url = String(input);
		urls.push(url);
		const throttle = { 'x-throttling-control': 'idle (images=green:200, retrieval=green:1200)' };
		if (url === 'https://ops.epo.org/3.2/auth/accesstoken') {
			return Response.json({ access_token: 'tok-1', expires_in: 1200 });
		}
		if (url.endsWith('/images')) {
			return new Response(inquiryXml, { status: 200, headers: throttle });
		}
		if (url.endsWith(`/${LINK}?Range=6`)) {
			return new Response(page6, { status: 200, headers: { ...throttle, 'content-type': 'application/pdf' } });
		}
		return new Response('not recorded', { status: 404, headers: throttle });
	};
	const ctx: ToolContext = { connectors: createConnectors(createFakeHost({ fetch })) };
	return { ctx, urls };
}

const definition = officeTools().find((d) => d.name === 'get_patent_image')!;
const run = (args: Record<string, unknown>, ctx: ToolContext) => definition.handler(definition.input.parse(args), ctx);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('get_patent_image', () => {
	it('spends the OPS key', () => {
		expect(definition.access).toBe('epoOps');
		expect(definition.annotations?.title).toBe('Get patent image');
	});

	it('answers the metadata: the drawing pages stop before the search report, and the OPS link stays internal', async () => {
		const { ctx } = recordedOps();
		const answer = await run({ patent_number: 'EP4831432A1' }, ctx);
		expect(answer).toEqual({
			docId: expect.any(String),
			totalFigures: 8,
			drawingStartPage: 6,
			drawingPages: [6, 7],
			sections: { ABSTRACT: 1, DESCRIPTION: 2, CLAIMS: 4, DRAWINGS: 6, SEARCH_REPORT: 8 },
			formats: [
				{
					format: 'pdf',
					pages: 8,
					availableFormats: ['pdf', 'tiff'],
					drawingStartPage: 6,
					sections: { ABSTRACT: 1, DESCRIPTION: 2, CLAIMS: 4, DRAWINGS: 6, SEARCH_REPORT: 8 },
				},
			],
		});
	});

	it('renders a drawing page to PNG with render=png, and serves the repeat from the host cache', async () => {
		const { ctx, urls } = recordedOps();
		const args = { patent_number: 'EP4831432A1', include_images: true, pages: [6], render: 'png' };
		const answer = (await run(args, ctx)) as { figures: Array<{ page: number; format: string; base64: string }>; availableFormats: string[] };
		const pageFetches = () => urls.filter((u) => u.includes('?Range=')).length;
		expect(answer.availableFormats).toEqual(['png', 'pdf']);
		expect(answer.figures.map((f) => [f.page, f.format])).toEqual([[6, 'png']]);
		expect(Buffer.from(answer.figures[0].base64, 'base64').subarray(0, 4)).toEqual(PNG_MAGIC);
		expect(pageFetches()).toBe(1);

		await run(args, ctx);
		expect(pageFetches()).toBe(1);
	});

	it('renders a compact page under the response budget with fit=compact, and skips a failed page', async () => {
		const { ctx } = recordedOps();
		const answer = (await run({ patent_number: 'EP4831432A1', include_images: true, pages: [6, 7], fit: 'compact' }, ctx)) as {
			figures: Array<{ page: number; format: string; width: number; height: number; bytes: number; base64: string }>;
			truncated: boolean;
			remainingPages: number[];
		};
		// Page 7 is not recorded: its fetch fails and the page is dropped.
		expect(answer.figures).toHaveLength(1);
		const [figure] = answer.figures;
		expect(figure.page).toBe(6);
		expect(['png', 'jpeg']).toContain(figure.format);
		expect(Math.max(figure.width, figure.height)).toBeLessThanOrEqual(1000);
		expect(Buffer.from(figure.base64, 'base64').length).toBe(figure.bytes);
		expect([answer.truncated, answer.remainingPages]).toEqual([false, []]);
	});

	it('answers 404 NOT_FOUND when OPS reports no image formats', async () => {
		const fetch = async (input: string | URL): Promise<Response> =>
			String(input).endsWith('/accesstoken')
				? Response.json({ access_token: 'tok-1', expires_in: 1200 })
				: new Response('<ops:world-patent-data xmlns:ops="http://ops.epo.org"/>', { status: 200 });
		const ctx: ToolContext = { connectors: createConnectors(createFakeHost({ fetch })) };
		const failure = await run({ patent_number: 'EP4831432A1', include_images: true }, ctx).catch((e) => e);
		expect(failure).toBeInstanceOf(ToolError);
		expect(failure).toMatchObject({ status: 404, code: ErrorCodes.NOT_FOUND });
	});
});
