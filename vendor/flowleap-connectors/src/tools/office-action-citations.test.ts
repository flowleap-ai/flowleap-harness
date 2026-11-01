/*---------------------------------------------------------------------------------------------
 *  The office-action citation tools over a fake host (#180): what the harness
 *  gets when it runs them on the firm's own ODP key. No network: the host's
 *  fetch answers the ODP enriched-citation endpoint.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { createConnectors, ErrorCodes, officeTools, ToolError, type ToolContext } from '../index.js';
import { createFakeHost, type FakeHost } from '../__tests__/fake-host.js';

const CITATIONS_URL = 'https://api.uspto.gov/api/v1/patent/oa/enriched_cited_reference_metadata/v3/records';

const ROWS = [
	{
		id: 'r1',
		patentApplicationNumber: '16123456',
		citedDocumentIdentifier: 'US 2007/0052285 A1',
		countryCode: 'US',
		citationCategoryCode: 'X',
		relatedClaimNumberText: '1-3',
		passageLocationText: ['para 12'],
		examinerCitedReferenceIndicator: true,
		applicantCitedExaminerReferenceIndicator: false,
		nplIndicator: false,
		officeActionDate: '2021-03-04T00:00:00',
		officeActionCategory: 'CTNF',
	},
	{
		id: 'r2',
		patentApplicationNumber: '16123456',
		citedDocumentIdentifier: 'SMITH, J. "Batteries", 2010',
		countryCode: '',
		citationCategoryCode: 'A',
		examinerCitedReferenceIndicator: false,
		applicantCitedExaminerReferenceIndicator: false,
		nplIndicator: true,
	},
];

interface Upstream {
	host: FakeHost;
	ctx: ToolContext;
	/** The Lucene `criteria` of every ODP request, in order. */
	criteria: string[];
}

function upstream(answer: () => Response): Upstream {
	const criteria: string[] = [];
	const host = createFakeHost({
		fetch: async (input, init) => {
			expect(String(input)).toBe(CITATIONS_URL);
			criteria.push(new URLSearchParams(String(init?.body)).get('criteria') ?? '');
			return answer();
		},
	});
	return { host, ctx: { connectors: createConnectors(host) }, criteria };
}

const odpAnswer = () => Response.json({ response: { numFound: 2, docs: ROWS } });

const byName = new Map(officeTools().map((definition) => [definition.name, definition]));

async function run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
	const definition = byName.get(name)!;
	return definition.handler(definition.input.parse(args), ctx);
}

describe('search_office_action_citations', () => {
	it('spends the ODP key and answers the rows with a navigation reference, then serves the repeat from the host cache', async () => {
		expect(byName.get('search_office_action_citations')?.access).toBe('usptoOdp');
		const { ctx, criteria } = upstream(odpAnswer);
		const args = { application_number: 16123456, category: 'X', examiner_cited_only: true, date_range: { from: '2020-01-01' } };

		const answer = (await run('search_office_action_citations', args, ctx)) as {
			total: number;
			citations: Array<{ citedDocument: string; category: string; documentReference: unknown }>;
		};
		const again = await run('search_office_action_citations', args, ctx);

		expect(criteria).toEqual([
			'patentApplicationNumber:16123456 AND citationCategoryCode:X AND examinerCitedReferenceIndicator:true AND officeActionDate:[20200101 TO *]',
		]);
		expect(answer.total).toBe(2);
		expect(answer.citations.map((c) => [c.citedDocument, c.category, c.documentReference])).toEqual([
			['US 2007/0052285 A1', 'X', { publicationNumber: 'US20070052285A1', section: 'bibliography' }],
			['SMITH, J. "Batteries", 2010', 'A', null],
		]);
		expect(again).toEqual(answer);
	});

	it('answers an ODP outage as 503 TOOL_EXECUTION_ERROR and caches nothing', async () => {
		const { ctx, host } = upstream(() => new Response('down', { status: 502 }));
		const failure = await run('search_office_action_citations', { application_number: '16123456' }, ctx).catch((e) => e);
		expect(failure).toBeInstanceOf(ToolError);
		expect(failure).toMatchObject({ status: 503, code: ErrorCodes.TOOL_EXECUTION_ERROR });
		expect(host.store.size).toBe(0);
	});
});

describe('search_enriched_citations', () => {
	it('finds the office actions that cite a document', async () => {
		const { ctx, criteria } = upstream(odpAnswer);
		const answer = (await run('search_enriched_citations', { cited_document: 'US 2007/0052285' }, ctx)) as { total: number };
		expect(byName.get('search_enriched_citations')?.access).toBe('usptoOdp');
		expect(criteria).toEqual(['citedDocumentIdentifier:"US 2007\\/0052285"']);
		expect(answer.total).toBe(2);
	});
});

describe('get_citation_stats', () => {
	it('counts every row once per split', async () => {
		const { ctx, criteria } = upstream(odpAnswer);
		const answer = await run('get_citation_stats', { application_number: '16123456' }, ctx);
		expect(byName.get('get_citation_stats')?.access).toBe('usptoOdp');
		expect(criteria).toEqual(['patentApplicationNumber:16123456']);
		expect(answer).toEqual({
			applicationNumber: '16123456',
			stats: {
				total: 2,
				byCategory: { X: 1, Y: 0, A: 1, other: 0 },
				examinerCited: 1,
				applicantCited: 0,
				unknownOrigin: 1,
				nplCount: 1,
			},
		});
	});

	it('answers a failed read as 500 TOOL_EXECUTION_ERROR', async () => {
		const { ctx } = upstream(() => new Response('down', { status: 503 }));
		const failure = await run('get_citation_stats', { application_number: '16123456' }, ctx).catch((e) => e);
		expect(failure).toMatchObject({ status: 500, code: ErrorCodes.TOOL_EXECUTION_ERROR });
	});
});
