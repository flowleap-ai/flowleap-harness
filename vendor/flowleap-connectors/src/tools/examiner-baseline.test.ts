/*---------------------------------------------------------------------------------------------
 *  examiner_baseline (#548): the pure assembly and the walk's failure rules.
 *
 *  The fixture is the EP2110298B1 family as the sibling tools answered it on
 *  2026-10-05 (live EPO OPS + USPTO ODP), trimmed to the fields the walk reads:
 *  the representatives block, each publication's citedReferences, the grant's
 *  applicationNumberText and the enriched-citation rows. The same run printed
 *  the matrix the flowleap-cli verb printed (cli#127): 57 documents, one gap.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createFakeHost } from '../__tests__/fake-host.js';
import { DataKeysRequiredError } from '../errors.js';
import { getCacheKey } from '../cache-key.js';
import { createConnectors, officeTools } from '../index.js';
import { NPL_RESOLVE_SHAPE_VERSION } from '../npl-resolve/index.js';
import { OPS_RESPONSE_SHAPE_VERSION } from '../ops/types.js';
import type { ToolContext } from './definition.js';
import {
	EXAMINER_BASELINE_SHAPE_VERSION,
	assembleBaseline,
	attachNplWorks,
	collectBaseline,
	docKey,
	usGrantNumber,
	type Baseline,
	type Collected,
	type ToolRunner,
} from './examiner-baseline.js';
import { ToolError } from './shared.js';

function fixture(): Collected {
	return JSON.parse(
		readFileSync(new URL('./__fixtures__/examiner-baseline-ep2110298b1.collected.json', import.meta.url), 'utf8')
	) as Collected;
}

const CTX: ToolContext = { connectors: createConnectors(createFakeHost()) };

describe('assembleBaseline — EP2110298B1 family', () => {
	it('computes the members walked, the matrix and the gap rows from the office records', () => {
		const baseline = assembleBaseline(fixture());

		expect({
			publication: baseline.publication,
			offices: baseline.offices,
			dedupe: baseline.dedupe,
			membersWalked: baseline.membersWalked,
			matrix: baseline.documents.map((d) => [
				d.document,
				Object.fromEntries(Object.entries(d.cells).map(([office, cell]) => [office, cell.text])),
			]),
			gaps: baseline.gaps,
		}).toStrictEqual({
			publication: 'EP2110298B1',
			offices: ['EP', 'US'],
			dedupe: 'docdb-number',
			membersWalked: [
				{
					office: 'EP',
					representativePublication: 'EP2110298B1',
					docdbApplication: 'EP09250131 (A)',
					publications: [
						{ publication: 'EP2110298A2', status: 'read', citedCount: 1, examinerCount: 0, applicantCount: 1 },
						{ publication: 'EP2110298A3', status: 'read', citedCount: 5, examinerCount: 4, applicantCount: 1 },
						{ publication: 'EP2110298B1', status: 'no_citation_record', citedCount: 0, examinerCount: 0, applicantCount: 0 },
					],
				},
				{
					office: 'US',
					representativePublication: 'US7722129B2',
					docdbApplication: 'US10374408 (A)',
					publications: [
						{ publication: 'US2009261648A1', status: 'read', citedCount: 46, examinerCount: 0, applicantCount: 46 },
						{ publication: 'US7722129B2', status: 'read', citedCount: 49, examinerCount: 5, applicantCount: 44 },
					],
					usptoEnriched: { applicationNumber: '12103744', status: 'read', rows: 4, total: 4, unidentifiedRows: 1 },
				},
				{
					office: 'US',
					representativePublication: 'US8056987B2',
					docdbApplication: 'US75653110 (A)',
					publications: [
						{ publication: 'US2010194184A1', status: 'read', citedCount: 46, examinerCount: 0, applicantCount: 46 },
						{ publication: 'US8056987B2', status: 'read', citedCount: 50, examinerCount: 6, applicantCount: 44 },
					],
					usptoEnriched: { applicationNumber: '12756531', status: 'no_citation_record', rows: 0, total: 0, unidentifiedRows: 0 },
				},
			],
			matrix: [
				// Any examiner citation first …
				['US2003089146', { US: 'examiner' }],
				['US2004046353', { US: 'examiner' }],
				['US2007052285', { EP: 'X cl. 5, A cl. 1,9', US: 'applicant' }],
				['US2007052286', { US: 'X cl. 1 (US OA 2009-08-18)' }],
				['US2009121538', { US: 'examiner' }],
				['US4763957', { EP: 'X cl. 13, A cl. 1,5,9', US: 'applicant' }],
				['US4964287', { EP: 'X cl. 1-3,5,7,8, A cl. 9', US: 'applicant' }],
				['US5135330', { EP: 'X cl. 1-5, A cl. 9,13', US: 'X cl. 1-4,6,8,11-21 (US OA 2009-08-18)' }],
				['US5385360', { US: 'X cl. 10 (US OA 2009-08-18)' }],
				['US5875662', { US: 'examiner' }],
				['US6761417', { US: 'examiner' }],
				['US7530645', { US: 'examiner' }],
				['US7562943', { US: 'examiner' }],
				['US7665928', { US: 'examiner' }],
				// … then category-only (an applicant citation the search report categorised) …
				['EP1602570', { EP: 'X cl. 13, A cl. 1,5,9 [applicant]' }],
				// … then the rest, alphabetical.
				['FR983137', { US: 'applicant' }],
				['FR995747', { US: 'applicant' }],
				['GB658726', { US: 'applicant' }],
				['IT463954', { US: 'applicant' }],
				['US2002026816', { US: 'applicant' }],
				['US2007145814', { US: 'applicant' }],
				['US2630020', { US: 'applicant' }],
				['US331805', { US: 'applicant' }],
				['US3610659', { US: 'applicant' }],
				['US4033627', { US: 'applicant' }],
				['US4079958', { US: 'applicant' }],
				['US4114409', { US: 'applicant' }],
				['US4400038', { US: 'applicant' }],
				['US4573925', { US: 'applicant' }],
				['US4724692', { US: 'applicant' }],
				['US4789206', { US: 'applicant' }],
				['US4805941', { US: 'applicant' }],
				['US4906053', { US: 'applicant' }],
				['US5005390', { US: 'applicant' }],
				['US5118125', { US: 'applicant' }],
				['US5121973', { US: 'applicant' }],
				['US5165762', { US: 'applicant' }],
				['US5238259', { US: 'applicant' }],
				['US5337587', { US: 'applicant' }],
				['US5364115', { US: 'applicant' }],
				['US5383716', { US: 'applicant' }],
				['US5516131', { US: 'applicant' }],
				['US5567020', { US: 'applicant' }],
				['US5576020', { US: 'applicant' }],
				['US5653511', { US: 'applicant' }],
				['US5653512', { US: 'applicant' }],
				['US5673925', { US: 'applicant' }],
				['US5961186', { US: 'applicant' }],
				['US5961188', { US: 'applicant' }],
				['US6089675', { US: 'applicant' }],
				['US6241322', { US: 'applicant' }],
				['US6260931', { US: 'applicant' }],
				['US6296322', { US: 'applicant' }],
				['US6386643', { US: 'applicant' }],
				['US6454363', { US: 'applicant' }],
				['US6742849', { US: 'applicant' }],
				['US7000995', { US: 'applicant' }],
			],
			gaps: [
				{
					office: 'US',
					member: 'US8056987B2',
					source: 'uspto_enriched',
					reason: 'no_citation_record',
					message: 'no USPTO enriched-citation record for US8056987B2 (application 12756531)',
				},
			],
		});
	});

	it('keeps the citation behind a cell verbatim, with the per-category claims beside it', () => {
		const ep1602570 = assembleBaseline(fixture()).documents.find((d) => d.document === 'EP1602570');

		expect(ep1602570).toStrictEqual({
			document: 'EP1602570',
			kinds: ['A1'],
			familyId: null,
			cells: {
				EP: {
					text: 'X cl. 13, A cl. 1,5,9 [applicant]',
					citations: [
						{
							source: 'ops_biblio',
							citing: 'EP2110298A3',
							citedBy: 'applicant',
							category: 'X,A',
							relevantClaims: '13',
							categoryClaims: [
								{ category: 'X', claims: '13' },
								{ category: 'A', claims: '1,5,9' },
							],
						},
					],
				},
			},
		});
	});

	it('names every failed or missing record as a gap, never as an empty column', () => {
		const collected = fixture();
		collected.biblio.US2009261648A1 = { ok: false, error: { status: 404, code: 'NOT_FOUND', message: 'not found' } };
		collected.biblio.US7722129B2 = { ok: true, data: {} };
		collected.usGrants.US8056987B2 = { ok: false, error: { status: 503, code: 'upstream_unavailable', message: 'down' } };

		expect(assembleBaseline(collected).gaps).toStrictEqual([
			{
				office: 'US',
				member: 'US7722129B2',
				source: 'ops_biblio',
				reason: 'read_failed',
				message: 'could not read citations from US (US2009261648A1): 404 NOT_FOUND',
			},
			{
				office: 'US',
				member: 'US7722129B2',
				source: 'ops_biblio',
				reason: 'no_citation_record',
				message: 'no citation record from US (US7722129B2)',
			},
			{
				office: 'US',
				member: 'US8056987B2',
				source: 'uspto_enriched',
				reason: 'not_resolved',
				message: 'US application number not resolved for US8056987B2: 503 upstream_unavailable',
			},
		]);
	});
});

describe('collectBaseline — which failures become gaps', () => {
	const family = {
		representatives: {
			members: [{ application: 'EP1 (A)', representativePublication: 'EP1B1', publications: ['EP1A1', 'EP1B1'] }],
		},
	};

	function runner(biblioFailure: unknown): ToolRunner {
		return async (name, input) => {
			if (name === 'get_family') {
				return family;
			}
			if (input.patent_number === 'EP1A1') {
				throw biblioFailure;
			}
			return { citedReferences: [] };
		};
	}

	it('keeps a per-document 404, 422 or 5xx as a read failure', async () => {
		const outcomes = [];
		for (const error of [
			new ToolError(404, 'NOT_FOUND', 'no such document'),
			new ToolError(422, 'INVALID_INPUT', 'bad number'),
			new ToolError(502, 'INTERNAL_ERROR', 'office down'),
		]) {
			outcomes.push((await collectBaseline('EP1B1', runner(error), CTX)).biblio.EP1A1);
		}

		expect(outcomes).toStrictEqual([
			{ ok: false, error: { status: 404, code: 'NOT_FOUND', message: 'no such document' } },
			{ ok: false, error: { status: 422, code: 'INVALID_INPUT', message: 'bad number' } },
			{ ok: false, error: { status: 502, code: 'INTERNAL_ERROR', message: 'office down' } },
		]);
	});

	it('stops the walk on a key gate, sign-in, plan or rate-limit failure', async () => {
		const stopped = [];
		for (const error of [
			new DataKeysRequiredError('epo'),
			new ToolError(401, 'unauthorized', 'sign in'),
			new ToolError(402, 'subscription_required', 'plan'),
			new ToolError(429, 'RATE_LIMITED', 'slow down'),
		]) {
			stopped.push(await collectBaseline('EP1B1', runner(error), CTX).then(() => 'walked', (e: unknown) => e === error));
		}

		expect(stopped).toStrictEqual([true, true, true, true]);
	});
});

describe('number helpers', () => {
	it('meets the OPS and USPTO spellings of one document on one key, and resolves only US grants', () => {
		expect({
			keys: ['US2007052285', 'US 2007/0052285', 'US20070052285', 'US5,135,330', 'EP1602570A1', 'US7722129B2', 'WO2020123456'].map(docKey),
			grants: ['US7722129B2', 'US6241322B1', 'US2009261648A1', 'EP2110298B1'].map(usGrantNumber),
		}).toStrictEqual({
			keys: ['US2007052285', 'US2007052285', 'US2007052285', 'US5135330', 'EP1602570', 'US7722129', 'WO2020123456'],
			grants: ['7722129', '6241322', null, null],
		});
	});
});

describe('attachNplWorks — cited NPL rows gain their OpenAlex record', () => {
	const NPL = 'CONG L. ET AL: "MULTIPLEX GENOME ENGINEERING USING CRISPR/CAS SYSTEMS", SCIENCE, 2013 (2013-02-15)';

	function withNplRow(): Collected {
		const collected = fixture();
		const read = collected.biblio['EP2110298A3'];
		if (!read.ok) throw new Error('fixture: EP2110298A3 must be a read');
		const data = read.data as { citedReferences: unknown[] };
		data.citedReferences.push(
			{ docId: '', citedBy: 'examiner', npl: NPL, category: 'X', relevantClaims: '1' },
			{ docId: '', citedBy: 'examiner', npl: 'UNREACHABLE STANDARD TS 38.331', category: 'A' }
		);
		return collected;
	}

	it('attaches nplWork through get_npl_work and keeps a failed lookup as a row status', async () => {
		const calls: string[] = [];
		const run: ToolRunner = async (name, input) => {
			calls.push(name);
			const reference = (input as { reference: string }).reference;
			if (reference.startsWith('UNREACHABLE')) {
				throw new ToolError(503, 'upstream_unavailable', 'OpenAlex is down');
			}
			return {
				reference,
				parsed: { doi: null, openalexId: null, title: 'MULTIPLEX GENOME ENGINEERING USING CRISPR/CAS SYSTEMS', year: 2013, xpNumber: null },
				status: 'matched',
				method: 'title',
				confidence: 1,
				work: {
					id: 'W2064815984', doi: '10.1126/science.1231143', title: 'Multiplex Genome Engineering Using CRISPR/Cas Systems',
					abstract: 'Functional elucidation…', publicationDate: '2013-01-03', type: 'article', citedByCount: 1,
					isOpenAccess: false, openAccessUrl: null, authors: [], source: 'Science', concepts: [],
				},
				candidates: [],
			};
		};

		const baseline = await attachNplWorks(assembleBaseline(withNplRow()), run, CTX);

		expect(calls).toStrictEqual(['get_npl_work', 'get_npl_work']);
		const cong = baseline.documents.find((d) => d.npl === NPL);
		expect(cong?.nplWork).toMatchObject({ status: 'matched', method: 'title', work: { openalexId: 'W2064815984', doi: '10.1126/science.1231143' } });
		const standard = baseline.documents.find((d) => d.npl?.startsWith('UNREACHABLE'));
		expect(standard?.nplWork).toMatchObject({ status: 'lookup_failed', error: 'upstream_unavailable', work: null });
		// Patent rows are untouched.
		expect(baseline.documents.filter((d) => !d.npl).every((d) => d.nplWork === undefined)).toBe(true);
		expect(baseline.nplResolution).toStrictEqual({ references: 2, matched: 1, candidates: 0, notFound: 0, failed: 1, skipped: 0 });
	});

	it('reports zero references and calls nothing for a family with no NPL', async () => {
		const run: ToolRunner = async () => {
			throw new Error('no lookup expected');
		};
		const baseline = await attachNplWorks(assembleBaseline(fixture()), run, CTX);
		expect(baseline.nplResolution).toStrictEqual({ references: 0, matched: 0, candidates: 0, notFound: 0, failed: 0, skipped: 0 });
	});
});

/**
 * The tool over a fake host (#180): the walk runs the sibling office tools in
 * process, on the host's own OPS and ODP keys. The family and the EP2110298A3
 * search report are recorded OPS answers; the other publications answer a
 * bibliography without a citation block, and ODP resolves each US grant and
 * answers one enriched row for US7722129B2.
 */
describe('examiner_baseline over a fake host', () => {
	const recorded = (name: string) => readFileSync(new URL(`../ops/__fixtures__/${name}`, import.meta.url), 'utf8');
	const emptyBiblio = (country: string, number: string, kind: string) =>
		'<?xml version="1.0" encoding="UTF-8"?><ops:world-patent-data xmlns="http://www.epo.org/exchange" xmlns:ops="http://ops.epo.org">' +
		`<exchange-documents><exchange-document system="ops.epo.org" country="${country}" doc-number="${number}" kind="${kind}">` +
		'<bibliographic-data><invention-title lang="en">Test</invention-title></bibliographic-data>' +
		'</exchange-document></exchange-documents></ops:world-patent-data>';
	const applications: Record<string, string> = { '7722129': '12103744', '8056987': '12756531' };
	const enrichedRow = {
		id: 'r1',
		patentApplicationNumber: '12103744',
		citedDocumentIdentifier: 'US 5135330 A',
		countryCode: 'US',
		citationCategoryCode: 'X',
		relatedClaimNumberText: '1',
		examinerCitedReferenceIndicator: true,
		applicantCitedExaminerReferenceIndicator: false,
		nplIndicator: false,
		officeActionDate: '2009-05-01T00:00:00',
		officeActionCategory: 'CTNF',
	};

	function upstream() {
		const urls: string[] = [];
		const fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
			const url = String(input);
			urls.push(url);
			const headers = { 'x-throttling-control': 'idle (search=green:600, retrieval=green:1200, inpadoc=green:60)' };
			if (url.endsWith('/auth/accesstoken')) return Response.json({ access_token: 'tok-1', expires_in: 1200 });
			if (url.includes('/family/publication/')) return new Response(recorded('family-ep2110298.xml'), { status: 200, headers });
			const biblio = /docdb\/(\w\w)\.(\d+)\.(\w+)\/biblio$/.exec(url);
			if (biblio) {
				const body = biblio.slice(1).join('.') === 'EP.2110298.A3' ? recorded('ep2110298a3-biblio.xml') : emptyBiblio(biblio[1], biblio[2], biblio[3]);
				return new Response(body, { status: 200, headers });
			}
			if (url.endsWith('/patent/applications/search')) {
				const query = String(JSON.parse(String(init?.body)).q);
				const application = applications[query.split(':').pop() ?? ''];
				return Response.json({ count: 1, patentFileWrapperDataBag: [{ applicationNumberText: application }] });
			}
			const byNumber = /\/patent\/applications\/(\d+)$/.exec(url);
			if (byNumber) return Response.json({ count: 1, patentFileWrapperDataBag: [{ applicationNumberText: byNumber[1] }] });
			if (url.endsWith('/enriched_cited_reference_metadata/v3/records')) {
				const criteria = new URLSearchParams(String(init?.body)).get('criteria') ?? '';
				const docs = criteria.includes('12103744') ? [enrichedRow] : [];
				return Response.json({ response: { numFound: docs.length, docs } });
			}
			return new Response('not recorded', { status: 404, headers });
		};
		const host = createFakeHost({ fetch });
		return { urls, host, ctx: { connectors: createConnectors(host) } as ToolContext };
	}

	const definition = officeTools().find((d) => d.name === 'examiner_baseline')!;

	it('walks the family on the host keys alone, then serves the Baseline from the host cache', async () => {
		expect([definition.access, definition.annotations?.title]).toEqual(['epoOps', 'Examiner Baseline']);
		const { urls, host, ctx } = upstream();

		const baseline = (await definition.handler(definition.input.parse({ publication: ' EP2110298B1 ' }), ctx)) as Baseline;

		// Only the offices were called: OPS and USPTO ODP, never a FlowLeap host.
		expect(new Set(urls.map((u) => new URL(u).host))).toEqual(new Set(['ops.epo.org', 'api.uspto.gov']));
		expect(baseline.offices).toEqual(['EP', 'US']);
		expect(baseline.gaps.map((g) => [g.member, g.source, g.reason])).toEqual([
			['US7722129B2', 'ops_biblio', 'no_citation_record'],
			['US8056987B2', 'ops_biblio', 'no_citation_record'],
			['US8056987B2', 'uspto_enriched', 'no_citation_record'],
		]);
		expect(baseline.membersWalked.find((m) => m.representativePublication === 'US7722129B2')?.usptoEnriched).toEqual({
			applicationNumber: '12103744', status: 'read', rows: 1, total: 1, unidentifiedRows: 0,
		});
		expect(baseline.documents.find((d) => d.document === 'US5135330')?.cells.US?.text).toBe('X cl. 1 (US OA 2009-05-01)');
		expect(baseline.nplResolution).toEqual({ references: 0, matched: 0, candidates: 0, notFound: 0, failed: 0, skipped: 0 });

		// The cache key carries the three shape versions (the #433 lesson).
		const key = getCacheKey('examiner-baseline', {
			shape: EXAMINER_BASELINE_SHAPE_VERSION,
			ops: OPS_RESPONSE_SHAPE_VERSION,
			npl: NPL_RESOLVE_SHAPE_VERSION,
			publication: 'EP2110298B1',
		});
		expect(host.store.get(key)).toEqual(baseline);
		const calls = urls.length;
		expect(await definition.handler(definition.input.parse({ publication: 'EP2110298B1' }), ctx)).toEqual(baseline);
		expect(urls.length).toBe(calls);
	});
});
