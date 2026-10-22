/*---------------------------------------------------------------------------------------------
 *  EPO document module — getBiblio (tracer bullet, issue #95), over a fake host.
 *
 *  Direct module tests against a recorded EPO OPS XML fixture (no live EPO
 *  calls): extraction to the normalized shape, one shared cache entry per
 *  document (key convention + TTL), cache hits making no upstream call, the
 *  no-cache-on-failure rule, and typed-error mapping to the unified envelope.
 *
 *  The host is the package's fake host (ADR 0019 C1): its Map-backed cache is
 *  the hybrid memory+Valkey tier the backend provides, so "cached" is a key in
 *  `host.store`. The OPS transport is stubbed at the package's own seam
 *  (`./fetch.js`) and fed the recorded XML, as the backend's suite did before
 *  the move.
 *
 *  Ends with the #95 behavioral pin: an enrichment lookup after a module
 *  lookup of the same document makes no second upstream call.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createFakeHost, type FakeHost } from '../__tests__/fake-host.js';
import { ErrorCodes } from '../contract/error-codes.js';
import { DataKeysRequiredError } from '../errors.js';
import { createConnectors, type Connectors } from '../index.js';
import type { ODPApplicationRecord } from '../uspto-odp/patent-search.js';
import { BIBLIO_CACHE_TTL_SECONDS } from './direct.js';
import { opsFetch } from './fetch.js';

// No live EPO calls: the authenticated fetch is mocked at the module seam and
// fed the recorded XML fixture.
vi.mock('./fetch.js', () => ({
	opsFetch: vi.fn(),
	opsFetchBinary: vi.fn(),
}));

const mockOpsFetch = vi.mocked(opsFetch);

const biblioXml = readFileSync(new URL('./__fixtures__/ep1234567-biblio.xml', import.meta.url), 'utf8');

// The extractor-normalized shape of the recorded EP1234567 response. IPC/CPC
// values are the ones pinned by xml-to-json.biblio.test.ts.
const EXPECTED_EP1234567 = {
	docId: 'EP1234567.A2',
	title: 'Filling material based on particulate composite',
	abstract:
		'Partikuläres Kompositmaterial mit einer mittleren Partikelgröße von 20 bis 50 µm und einem maximalen Gehalt an Partikeln mit einer Größe von < 10 µm von 10 Gew.-% und dessen Verwendung zur Herstellung von Dentalwerkstoffen. <IMAGE>',
	applicants: ['IVOCLAR VIVADENT AG [LI]', 'IVOCLAR VIVADENT AG'],
	inventors: [
		'VOGEL KARIN [LI]',
		'NEUBERT ROLAND [AT]',
		'SALZ ULRICH [DE]',
		'RHEINBERGER VOLKER [LI]',
		'VOGEL, KARIN',
		'NEUBERT, ROLAND',
		'SALZ, ULRICH',
		'RHEINBERGER, VOLKER',
	],
	ipc: [
		'A61C 13/003',
		'A61C 13/087',
		'A61C 5/08',
		'A61K 6/00',
		'A61K 6/027',
		'A61K 6/083',
		'C08F 2/44',
	],
	cpc: ['A61K 31/04', 'A61K 6/77', 'A61K 6/887', 'C02F 3/284', 'C02F 5/00'],
	dates: {
		filing: '20020221',
		publication: '20020828',
		// This claim carries epodoc + original and no docdb entry, so the
		// office comes from the epodoc number's leading letters and there is
		// no DOCDB rendering or kind code to report (#432).
		priority: [
			{
				date: '20010221',
				country: 'DE',
				epodocApplication: 'DE20011008261',
				docdbApplication: null,
				originalApplication: '10108261',
				kind: null,
			},
		],
	},
};

let host: FakeHost;
let ops: Connectors['ops'];
let odp: Connectors['odp'];

// A fresh host per test: a fresh cache, so tests cannot contaminate each other.
beforeEach(() => {
	vi.clearAllMocks();
	host = createFakeHost();
	({ ops, odp } = createConnectors(host));
	mockOpsFetch.mockResolvedValue(biblioXml);
});

describe('getBiblio — fixture extraction', () => {
	it('parses the recorded exchange+xml fixture to the normalized biblio shape', async () => {
		const result = await ops.getBiblio('EP1234567');

		expect(result).toEqual({ ok: true, data: EXPECTED_EP1234567, cached: false });
		expect(mockOpsFetch).toHaveBeenCalledExactlyOnceWith(
			expect.anything(),
			'/published-data/publication/epodoc/EP1234567/biblio',
			{ acceptType: 'application/exchange+xml' }
		);
	});

	it('the legacy getBiblioData surface returns the same normalized data', async () => {
		const data = await ops.getBiblioData('EP1234567');
		expect(data).toEqual(EXPECTED_EP1234567);
	});
});

describe('getBiblio — references-cited', () => {
	// The recorded fixture carries the search report on the A3 publication, not
	// on the A2 — references-cited belongs to the document that lists it.
	it('extracts the A3 citations in document order, applicant- and examiner-cited', async () => {
		const result = await ops.getBiblio('EP1234567A3');

		if (!result.ok) throw new Error('expected success');
		expect({
			docId: result.data.docId,
			count: result.data.citedReferences?.length,
			firstTwo: result.data.citedReferences?.slice(0, 2),
		}).toStrictEqual({
			docId: 'EP1234567.A3',
			count: 9,
			firstTwo: [
				{
					docId: 'US6274644',
					citedBy: 'applicant',
					kind: 'B1',
					date: '20010814',
					category: 'A',
					relevantPassages: [
						'* column  1, lines  39-43 *',
						'* column  2, lines  6-11 *',
						'* figure 1 *',
					],
				},
				{
					docId: 'US5356951',
					citedBy: 'examiner',
					kind: 'A',
					date: '19941018',
					phase: 'national-search-report',
					category: 'X',
					relevantClaims: '1-7,10-17,26,27',
					categoryClaims: [{ category: 'X', claims: '1-7,10-17,26,27' }],
					relevantPassages: [
						'* column  2, lines  25-41 *',
						'* column  3, lines  44-67 *',
						'* column  4, lines  3-38 *',
						'* claim 4 *',
					],
				},
			],
		});
	});

	// Add-only: a publication with no references-cited block must not gain the
	// key, so biblio entries cached before this field stay byte-compatible.
	it('omits the key entirely when the publication lists no references (the A2)', async () => {
		const result = await ops.getBiblio('EP1234567');

		if (!result.ok) throw new Error('expected success');
		expect('citedReferences' in result.data).toBe(false);
	});
});

describe('getBiblio — one shared cache entry per document', () => {
	it('cache hit makes no upstream call', async () => {
		const first = await ops.getBiblio('EP1234567');
		const second = await ops.getBiblio('EP1234567');

		expect(first).toMatchObject({ ok: true, cached: false });
		expect(second).toEqual({ ok: true, data: EXPECTED_EP1234567, cached: true });
		expect(mockOpsFetch).toHaveBeenCalledTimes(1);
		expect(host.events).toContainEqual({ kind: 'upstream', upstream: 'cache' });
	});

	it('cleans the document id, so every spelling of a document shares one entry', async () => {
		await ops.getBiblio('EP1234567.A2');
		const second = await ops.getBiblio('ep 1234567 a2');
		const third = await ops.getBiblioData('EP1234567A2');

		expect(second).toMatchObject({ ok: true, cached: true });
		expect(third).toEqual(EXPECTED_EP1234567);
		expect(mockOpsFetch).toHaveBeenCalledTimes(1);
		expect([...host.store.keys()].filter((k) => k.includes(':biblio:'))).toHaveLength(1);
	});

	it('writes fresh results to the host cache under the epo:v<shape>:biblio:<docId> key with the 24h biblio TTL', async () => {
		const set = vi.spyOn(host.cache!, 'set');

		await ops.getBiblio('EP1234567.A2');

		expect(BIBLIO_CACHE_TTL_SECONDS).toBe(86400);
		expect(set).toHaveBeenCalledWith('epo:v8:publication-v2:biblio:EP1234567A2', EXPECTED_EP1234567, 86400);
		expect(host.store.get('epo:v8:publication-v2:biblio:EP1234567A2')).toEqual(EXPECTED_EP1234567);
	});
});

describe('getBiblio — typed errors through the unified envelope', () => {
	it('EPO 404 → not_found envelope', async () => {
		mockOpsFetch.mockRejectedValue(new Error('OPS error 404: Document not found'));

		const result = await ops.getBiblio('EP4040404');

		if (result.ok) throw new Error('expected failure');
		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({
			success: false,
			status: 404,
			error: { code: 'not_found', message: 'OPS error 404: Document not found' },
		});
	});

	it('EPO 429 → rate_limit_exceeded envelope', async () => {
		mockOpsFetch.mockRejectedValue(new Error('OPS error 429: Too many requests'));

		const result = await ops.getBiblio('EP4292929');

		if (result.ok) throw new Error('expected failure');
		expect(result.status).toBe(429);
		expect(result.body.error.code).toBe('rate_limit_exceeded');
	});

	it('DataKeysRequiredError flows through to 400 data_keys_required (ADR 0008)', async () => {
		mockOpsFetch.mockRejectedValue(new DataKeysRequiredError('epo'));

		const result = await ops.getBiblio('EP6666666');

		if (result.ok) throw new Error('expected failure');
		expect(result.status).toBe(400);
		expect(result.body.error).toMatchObject({
			code: 'data_keys_required',
			provider: 'epo',
		});
	});

	it('failures are never cached: the next call retries the upstream', async () => {
		mockOpsFetch
			.mockRejectedValueOnce(new Error('OPS error 500: transient'))
			.mockResolvedValueOnce(biblioXml);

		const first = await ops.getBiblio('EP1234567');
		if (first.ok) throw new Error('expected failure');
		expect(first.status).toBe(500);
		expect(first.body.error.code).toBe('upstream_error');
		expect(host.store.size).toBe(0);

		const second = await ops.getBiblio('EP1234567');
		expect(second).toEqual({ ok: true, data: EXPECTED_EP1234567, cached: false });
		expect(mockOpsFetch).toHaveBeenCalledTimes(2);
	});
});

describe('#95 behavioral pin — module reads and enrichment share one cache entry', () => {
	it('an enrichment lookup after a module lookup of the same document makes no second upstream call', async () => {
		// 1. A module lookup (what the get_bibliography tool runs) populates
		//    the module's cache entry. (The retired ops route rode the same
		//    entry — ADR 0013.)
		mockOpsFetch.mockResolvedValue(biblioXml.replaceAll('EP', 'US').replaceAll('1234567', '7654321'));
		const first = await ops.getBiblio('US7654321');
		expect(first).toMatchObject({ ok: true, cached: false });
		expect(mockOpsFetch).toHaveBeenCalledTimes(1);

		// 2. EPO enrichment of the same granted patent — served from the shared
		//    entry, zero additional upstream calls.
		const record = {
			applicationMetaData: { patentNumber: '7654321' },
		} as unknown as ODPApplicationRecord;
		await odp.enrichRecords([record], new Set(['abstract' as const]));

		const enriched = record as unknown as {
			epoEnrichment?: { abstract?: string; errors?: string[] };
		};
		expect(enriched.epoEnrichment?.abstract).toBe(EXPECTED_EP1234567.abstract);
		expect(enriched.epoEnrichment?.errors).toBeUndefined();
		expect(mockOpsFetch).toHaveBeenCalledTimes(1);
	});
});

describe('a malformed publication number is an ANSWER, not a thrown fault', () => {
	it('returns the 422 INVALID_INPUT envelope instead of rejecting', async () => {
		// The lookup runs before cachedProviderRead (its result builds the cache
		// key), so it used to throw straight out of the module — past the error
		// mapping, out of every per-record fan-out, and into the facade's
		// catch-all as 500 INTERNAL_ERROR.
		const result = await ops.getBiblio('not-a-publication-number');

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(422);
		expect(result.body.error.code).toBe(ErrorCodes.INVALID_INPUT);
		// Never reaches EPO: the number could not name a document.
		expect(mockOpsFetch).not.toHaveBeenCalled();
	});

	it('names the offending field, so the 422 is actionable', async () => {
		const result = await ops.getBiblio('not-a-publication-number');

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.body.error).toMatchObject({
			code: ErrorCodes.INVALID_INPUT,
			parameter: 'patent_number',
			value: 'not-a-publication-number',
		});
	});

	it.each([
		['USD1146627.S', 'docdb/US.D1146627.S'], // design
		['USRE45123.E', 'docdb/US.RE45123.E'], // reissue
		['USPP25000.P3', 'docdb/US.PP25000.P3'], // plant
		['USH1234.H', 'docdb/US.H1234.H'], // statutory invention registration
		['US5443036.A', 'docdb/US.5443036.A'], // control: a plain numeric grant
	])('%s reads through the document path as %s', async (input, expectedPath) => {
		// Every letter-prefixed US series failed this read identically, and the
		// prefix must land with the SERIAL segment of the DOCDB path, never with
		// the country code.
		mockOpsFetch.mockResolvedValue(biblioXml);

		await ops.getBiblio(input);

		expect(mockOpsFetch).toHaveBeenCalledWith(
			expect.anything(),
			expect.stringContaining(expectedPath),
			expect.anything()
		);
	});

	it('a design number is no longer malformed — it reads like any other document', async () => {
		// The recorded EP1234567 A2 response, relabelled as the US design
		// publication USD1146627 S so the identity check has something to match.
		mockOpsFetch.mockResolvedValue(
			biblioXml.replaceAll('EP', 'US').replaceAll('1234567', 'D1146627').replaceAll('A2', 'S')
		);

		const result = await ops.getBiblio('USD1146627.S');

		expect(result.ok).toBe(true);
		// The DOCDB path keeps the D with the serial, not with the country code.
		expect(mockOpsFetch).toHaveBeenCalledWith(
			expect.anything(),
			expect.stringContaining('docdb/US.D1146627.S'),
			expect.anything()
		);
	});
});
