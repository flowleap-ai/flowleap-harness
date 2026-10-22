/*---------------------------------------------------------------------------------------------
 *  OPS XML-to-JSON Parser Tests
 *
 *  Parser-level regression tests for extractBiblio, asserted against a saved real
 *  EPO OPS biblio response. These lock in classification parsing so the CPC/IPC
 *  extraction cannot silently regress.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { xmlToJson, extractBiblio } from './xml-to-json.js';
import { selectPublication } from './publication.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, './__fixtures__/ep1234567-biblio.xml');

describe('extractBiblio - classification parsing (EP1234567)', () => {
	let biblio: any;

	beforeAll(async () => {
		const xml = readFileSync(fixturePath, 'utf8');
		biblio = extractBiblio(await xmlToJson(xml));
	});

	it('extracts CPC from <patent-classifications> (scheme="CPC*")', () => {
		// Regression: parser previously read a non-existent <classifications-cpc>
		// element and always returned []. EPO OPS carries CPC under
		// <patent-classifications>/<patent-classification> with scheme="CPCI".
		expect(biblio.cpc).toEqual([
			'A61K 31/04',
			'A61K 6/77',
			'A61K 6/887',
			'C02F 3/284',
			'C02F 5/00',
		]);
	});

	it('extracts IPC as clean symbols, not raw fixed-width text', () => {
		// Regression: IPC previously surfaced the raw fixed-width text
		// (e.g. "A61C  13/   003            A I"). It must be normalized.
		expect(biblio.ipc).toEqual([
			'A61C 13/003',
			'A61C 13/087',
			'A61C 5/08',
			'A61K 6/00',
			'A61K 6/027',
			'A61K 6/083',
			'C08F 2/44',
		]);
	});

	it('does not leak fixed-width whitespace into any classification symbol', () => {
		for (const symbol of [...biblio.ipc, ...biblio.cpc]) {
			expect(symbol).not.toMatch(/\s{2,}/);
			expect(symbol).toBe(symbol.trim());
		}
	});

	it('deduplicates CPC entries listed once per generating office', () => {
		expect(new Set(biblio.cpc).size).toBe(biblio.cpc.length);
	});
});

describe('extractBiblio - date parsing', () => {
	const load = async (name: string): Promise<any> => {
		const xml = readFileSync(join(__dirname, `./__fixtures__/${name}`), 'utf8');
		return extractBiblio(await xmlToJson(xml));
	};

	it('extracts the filing date when only the epodoc document-id carries it (EP1234567)', async () => {
		// Regression: <application-reference> lists several <document-id> formats
		// (docdb, epodoc, original) and the date is typically only on the epodoc
		// entry. The parser read document-id[0] (docdb, no date), so dates.filing
		// was always null — which broke get_patent_term downstream.
		const biblio = await load('ep1234567-biblio.xml');
		expect(biblio.dates.filing).toBe('20020221');
		expect(biblio.dates.publication).toBe('20020828');
	});

	it('extracts filing and publication dates for a granted US patent (US10000000)', async () => {
		const biblio = await load('us10000000-biblio.xml');
		expect(biblio.dates.filing).toBe('20150310');
		expect(biblio.dates.publication).toBe('20180619');
	});
});

describe('extractBiblio - references-cited parsing', () => {
	const load = async (name: string): Promise<any> => {
		const xml = readFileSync(join(__dirname, `./__fixtures__/${name}`), 'utf8');
		return extractBiblio(await xmlToJson(xml));
	};

	it('keeps non-patent literature and the examiner phase (US10000000)', async () => {
		// The US grant cites six NPL references among its applicant citations —
		// an nplcit carries text and no document-id, so it has no docId to read
		// back. The two examiner citations close the list.
		const biblio = await load('us10000000-biblio.xml');

		expect({
			count: biblio.citedReferences.length,
			npl: biblio.citedReferences[3],
			last: biblio.citedReferences.at(-1),
		}).toStrictEqual({
			count: 11,
			npl: {
				docId: '',
				citedBy: 'applicant',
				npl: '- Li; “Time-of-Flight Camera—An Introduction”; Texas Instruments White Paper; SLOA190B; Jan. 2014; revised May 2014; 10 pp.',
			},
			last: {
				docId: 'US2006227317',
				citedBy: 'examiner',
				kind: 'A1',
				date: '20061001',
				phase: 'national-search-report',
			},
		});
	});

	it('joins a repeated category, so a search-report document also cited in the application keeps its D (EP1234567 A3)', async () => {
		const xml = readFileSync(fixturePath, 'utf8');
		const a3 = extractBiblio(selectPublication(await xmlToJson(xml), 'EP1234567A3'));

		expect(a3.citedReferences.at(-2)).toStrictEqual({
			docId: 'EP0475239',
			citedBy: 'examiner',
			kind: 'A2',
			date: '19920318',
			phase: 'national-search-report',
			category: 'A,D',
			relevantClaims: '1,3,4,6,7,10,12,13,15-17,26,27',
			categoryClaims: [
				{ category: 'A', claims: '1,3,4,6,7,10,12,13,15-17,26,27' },
				{ category: 'D', claims: '1,3,4,6,7,10,12,13,15-17,26,27' },
			],
			relevantPassages: ['* column  1, lines  35-41 *', '* column  3, lines  14-31 *'],
		});
	});

	it('pairs each category with its own claims, and gives no pairs when a category has none (#548)', async () => {
		// EP2110298A3 writes X then its claims, A then its claims: the X and A
		// lists differ, and `relevantClaims` alone (the first list) hid the A
		// claims. EP1234567A3's first citation is an A with passages and no
		// <rel-claims>, so a positional pairing cannot be certain there.
		const ep2110298 = extractBiblio(await xmlToJson(readFileSync(join(__dirname, './__fixtures__/ep2110298a3-biblio.xml'), 'utf8')));
		const ep1234567 = extractBiblio(selectPublication(await xmlToJson(readFileSync(fixturePath, 'utf8')), 'EP1234567A3'));
		const pick = (r: any) => ({ docId: r.docId, category: r.category, relevantClaims: r.relevantClaims, categoryClaims: r.categoryClaims });

		expect({
			ep1602570: pick(ep2110298.citedReferences[0]),
			us4964287: pick(ep2110298.citedReferences[1]),
			aWithoutClaims: pick(ep1234567.citedReferences[0]),
		}).toStrictEqual({
			ep1602570: {
				docId: 'EP1602570',
				category: 'X,A',
				relevantClaims: '13',
				categoryClaims: [
					{ category: 'X', claims: '13' },
					{ category: 'A', claims: '1,5,9' },
				],
			},
			us4964287: {
				docId: 'US4964287',
				category: 'X,A',
				relevantClaims: '1-3,5,7,8',
				categoryClaims: [
					{ category: 'X', claims: '1-3,5,7,8' },
					{ category: 'A', claims: '9' },
				],
			},
			aWithoutClaims: { docId: 'US6274644', category: 'A', relevantClaims: undefined, categoryClaims: undefined },
		});
	});
});
