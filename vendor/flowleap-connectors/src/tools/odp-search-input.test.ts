/*---------------------------------------------------------------------------------------------
 *  search_patents (provider=uspto): range_filters, sort and facets reach ODP as
 *  the arrays its search body accepts, and a malformed string is refused at the
 *  input with the expected form (./odp-search-input.ts).
 *
 *  The live call runs ONLY with ODP_LIVE_SMOKE=1 and a USPTO_ODP_API_KEY:
 *
 *      ODP_LIVE_SMOKE=1 USPTO_ODP_API_KEY=… npx vitest run --root packages/connectors src/tools/odp-search-input.test.ts
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { createConnectors, officeTools, type ToolContext } from '../index.js';
import { createFakeHost, hostCredentials } from '../__tests__/fake-host.js';
import { parseFacets, parseRangeFilter, parseSort } from './odp-search-input.js';

const searchPatents = officeTools().find((definition) => definition.name === 'search_patents')!;
const EXAMPLE = 'applicationMetaData.filingDate 1900-01-01 2008-04-16';

/** An ODP upstream that records each search body and answers one record. */
function recordingOdp() {
	const bodies: unknown[] = [];
	const fetch = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
		bodies.push(JSON.parse(String(init?.body)));
		return Response.json({ count: 1, patentFileWrapperDataBag: [{ applicationNumberText: '61068927' }] });
	};
	return { fetch, bodies };
}

async function run(input: Record<string, unknown>, ctx: ToolContext) {
	return searchPatents.handler(searchPatents.input.parse(input), ctx);
}

describe('parseRangeFilter', () => {
	it('parses "<field> <from> <to>" into the ODP range object', () => {
		expect(parseRangeFilter(EXAMPLE)).toEqual({
			ok: true,
			value: { field: 'applicationMetaData.filingDate', valueFrom: '1900-01-01', valueTo: '2008-04-16' },
		});
		expect(parseRangeFilter('  applicationMetaData.applicationStatusCode 100  150 ')).toEqual({
			ok: true,
			value: { field: 'applicationMetaData.applicationStatusCode', valueFrom: '100', valueTo: '150' },
		});
	});

	it.each([
		['applicationMetaData.filingDate,1900-01-01,2008-04-16', 'the comma form a model sent live'],
		['applicationMetaData.filingDate 2008-04-16', 'one end only'],
		['applicationMetaData.filingDate 2020-01-01->2024-12-31', 'an arrow range'],
		['applicationMetaData.filingDate 2008-04-16 1900-01-01', 'a reversed range'],
		['applicationMetaData.filingDate 2008-02-30 2008-04-16', 'a date that does not exist'],
		['applicationMetaData.filingDate 2001 2008-04-16', 'a mixed integer and date'],
		['filing-date 1900-01-01 2008-04-16', 'a field that is not a path'],
	])('refuses %j (%s) with the form and the example', (value) => {
		const parsed = parseRangeFilter(value);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.message).toContain('"<field> <from> <to>"');
		expect(parsed.message).toContain(EXAMPLE);
	});
});

describe('parseSort and parseFacets', () => {
	it('parse into the ODP sort object and facet list', () => {
		expect(parseSort('applicationMetaData.filingDate DESC')).toEqual({
			ok: true,
			value: { field: 'applicationMetaData.filingDate', order: 'desc' },
		});
		expect(parseFacets('applicationMetaData.applicationTypeLabelName, applicationMetaData.filingDate')).toEqual({
			ok: true,
			value: ['applicationMetaData.applicationTypeLabelName', 'applicationMetaData.filingDate'],
		});
	});

	it('refuse a malformed value', () => {
		expect(parseSort('applicationMetaData.filingDate').ok).toBe(false);
		expect(parseSort('applicationMetaData.filingDate newest').ok).toBe(false);
		expect(parseFacets('applicationMetaData.filingDate,').ok).toBe(false);
	});
});

describe('search_patents (uspto) request body', () => {
	it('sends range_filters, sort and facets as the ODP arrays', async () => {
		const odp = recordingOdp();
		const ctx: ToolContext = { connectors: createConnectors(createFakeHost({ fetch: odp.fetch })) };

		await run(
			{
				query: 'applicationMetaData.inventionTitle:lidar',
				provider: 'uspto',
				range_filters: EXAMPLE,
				sort: 'applicationMetaData.filingDate desc',
				facets: 'applicationMetaData.applicationTypeLabelName',
			},
			ctx,
		);

		expect(odp.bodies).toHaveLength(1);
		expect(odp.bodies[0]).toMatchObject({
			q: 'applicationMetaData.inventionTitle:lidar',
			rangeFilters: [{ field: 'applicationMetaData.filingDate', valueFrom: '1900-01-01', valueTo: '2008-04-16' }],
			sort: [{ field: 'applicationMetaData.filingDate', order: 'desc' }],
			facets: ['applicationMetaData.applicationTypeLabelName'],
		});
	});

	it('refuses a malformed range_filters at the input; nothing goes to ODP', () => {
		const result = searchPatents.input.safeParse({
			query: 'lidar',
			provider: 'uspto',
			range_filters: 'applicationMetaData.filingDate,1900-01-01,2008-04-16',
		});

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues[0]!.path).toEqual(['range_filters']);
		expect(result.error.issues[0]!.message).toContain(EXAMPLE);
	});
});

const LIVE = process.env.ODP_LIVE_SMOKE === '1' && Boolean(process.env.USPTO_ODP_API_KEY);

describe.skipIf(!LIVE)('search_patents (uspto) live (ODP_LIVE_SMOKE=1)', () => {
	it('a filing-date range returns records inside the range', { timeout: 30_000 }, async () => {
		const host = createFakeHost({
			fetch: (input, init) => fetch(input, init),
			credentials: { usptoOdp: hostCredentials<'usptoOdp'>({ apiKey: process.env.USPTO_ODP_API_KEY! }) },
		});
		const result = (await run(
			{ query: 'lidar', provider: 'uspto', limit: 5, range_filters: EXAMPLE },
			{ connectors: createConnectors(host) },
		)) as { count: number; patentFileWrapperDataBag: Array<{ applicationMetaData?: { filingDate?: string } }> };

		expect(result.count).toBeGreaterThan(0);
		for (const record of result.patentFileWrapperDataBag) {
			expect(record.applicationMetaData?.filingDate ?? '').toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect((record.applicationMetaData?.filingDate ?? '') <= '2008-04-16').toBe(true);
		}
	});
});
