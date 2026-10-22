/*---------------------------------------------------------------------------------------------
 *  EP Register biblio extraction: the representatives of record and the
 *  opponents, beside the fields the read always carried.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRegisterBiblio, extractRegisterSearch } from './extract.js';
import { xmlToJson } from './xml-to-json.js';

async function fixture() {
	const xml = readFileSync(join(import.meta.dirname, '__fixtures__/register-biblio-agents.xml'), 'utf8');
	return extractRegisterBiblio(await xmlToJson(xml), 'EP1000000');
}

/** EP2771468B1 as OPS served it (trimmed): three publications, two applications, an opposition. */
async function opposed() {
	const xml = readFileSync(join(import.meta.dirname, '__fixtures__/register-biblio-opposed.xml'), 'utf8');
	return extractRegisterBiblio(await xmlToJson(xml), 'EP2771468');
}

/** A register document from parts, for the ordering cases the fixtures do not cover. */
function registerDoc(bibliographicData: Record<string, unknown>) {
	return { 'register-search': { 'register-documents': { 'register-document': { 'bibliographic-data': bibliographicData } } } };
}

describe('extractRegisterBiblio', () => {
	it('keeps title, applicants, status and dates', async () => {
		const biblio = await fixture();
		expect(biblio.title).toBe('Apparatus for flattening a strip');
		expect(biblio.applicants).toEqual(['Example Machines B.V.']);
		expect(biblio.status).toBe('The patent has been granted');
		expect(biblio.dates).toEqual({ filing: '19991108', publication: '20030409' });
	});

	it('returns the representatives of the latest agents block', async () => {
		const biblio = await fixture();
		expect(biblio.representativesChangeGazette).toBe('2002/31');
		expect(biblio.representatives).toEqual([
			{ name: 'Muster Patentanwälte PartG mbB', country: 'DE', address: ['Leopoldstraße 4', '80802 München'] },
			{ name: 'Erika Muster', country: 'DE', address: ['Leopoldstraße 4', '80802 München'] },
		]);
	});

	it('names the opponents with their filing date and status', async () => {
		const biblio = await fixture();
		expect(biblio.opponents).toEqual([
			{ name: 'Rival Industries AG', country: 'CH', address: ['Hauptstrasse 9', '8000 Zürich'], filingDate: '20040105', status: 'ADMISSIBLE' },
		]);
	});

	it('answers empty lists when the register names no representative or opponent', async () => {
		const xml = readFileSync(join(import.meta.dirname, '__fixtures__/register-biblio-agents.xml'), 'utf8')
			.replace(/<reg:agents[\s\S]*<\/reg:agents>/, '')
			.replace(/<reg:opposition-data[\s\S]*<\/reg:opposition-data>/, '');
		const biblio = extractRegisterBiblio(await xmlToJson(xml), 'EP1000000');
		expect(biblio.representatives).toEqual([]);
		expect(biblio.representativesChangeGazette).toBeNull();
		expect(biblio.opponents).toEqual([]);
		expect(biblio.applicants).toEqual(['Example Machines B.V.']);
	});

	it('answers the empty shape when there is no register document', () => {
		expect(extractRegisterBiblio({}, 'EP1')).toMatchObject({ representatives: [], opponents: [], representativesChangeGazette: null, representativesChangeDate: null });
	});

	// The live register of EP2771468B1 (2026-10-11). Every case below was a wrong
	// answer on the live data before it was a test.
	describe('on the live register shape', () => {
		it('reads filing and publication dates from the EP references, not from an array that has none', async () => {
			const biblio = await opposed();
			expect(biblio.dates).toEqual({ filing: '20131212', publication: '20140903' });
			expect(biblio.status).toBe('Patent revoked');
		});

		it('takes the agents block with the latest change date, even before it is in a Bulletin', async () => {
			const biblio = await opposed();
			expect(biblio.representatives.map(r => r.name)).toEqual(['De Clercq, Ann G. Y., et al']);
			expect(biblio.representativesChangeDate).toBe('20151201');
			// "N/P": the change is recorded, its Bulletin is not yet published.
			expect(biblio.representativesChangeGazette).toBeNull();
		});

		it('lists each opponent once, from the current opposition block, with filing date and status', async () => {
			const biblio = await opposed();
			expect(biblio.opponents).toHaveLength(3);
			expect(biblio.opponents.slice(0, 2)).toEqual([
				{ name: 'Schlich, George William', country: 'GB', address: ['9 St Catherine\'s Road', 'Littlehampton', 'Sussex BN17 5HS'], filingDate: '20151026', status: 'ADMISSIBLE' },
				{ name: 'Grund, Dr., Martin', country: 'DE', address: ['Nikolaistr. 15', '80802 Munich'], filingDate: '20151110', status: 'ADMISSIBLE' },
			]);
			// The 2015 rendering of the same opponent ("Schlich, George") is not a second opponent.
			expect(biblio.opponents.filter(o => o.name.startsWith('Schlich'))).toHaveLength(1);
			// A withdrawn opposition stays listed, marked by the register's status.
			expect(biblio.opponents[2]).toMatchObject({ name: 'Storz, Dr. Ulrich', filingDate: '20151111', status: 'WITHDRAWN' });
		});
	});

	// The live register of EP3414489 (2026-10-15, #583): the current opposition
	// block is decision-only (date-rejected); the opponent is in the older block.
	describe('on a rejected opposition', () => {
		async function rejected() {
			const xml = readFileSync(join(import.meta.dirname, '__fixtures__/register-biblio-opposition-rejected.xml'), 'utf8');
			return extractRegisterBiblio(await xmlToJson(xml), 'EP3414489');
		}

		it('keeps the opponent of an older block when the current block names none', async () => {
			const biblio = await rejected();
			expect(biblio.status).toBe('Opposition rejected');
			expect(biblio.opponents).toEqual([
				{ name: 'Boniberger, Bernhard', country: null, address: [], filingDate: '20210920', status: 'ADMISSIBLE' },
			]);
		});

		it('reads the outcome from the decision-only block', async () => {
			const biblio = await rejected();
			expect(biblio.oppositionOutcome).toEqual({ status: 'rejected', date: '20230131' });
		});

		it('leaves the outcome out while no block records a decision', async () => {
			expect(await opposed()).not.toHaveProperty('oppositionOutcome');
		});

		it('keeps the latest status and the first filing date of one opponent across blocks', () => {
			const opponent = (name: string, extra: Record<string, unknown> = {}) => ({ '@sequence': '01', addressbook: { name }, ...extra });
			const biblio = extractRegisterBiblio(registerDoc({ 'opposition-data': [
				{ '@change-date': '20200301', opponent: opponent('Rival GmbH', { 'opponent-status': { '@status': 'WITHDRAWN' } }) },
				{ '@change-date': '20200101', opponent: opponent('Rival', { 'date-opposition-filed': { date: '20191220' } }) },
				{ '@change-date': '20200201', opponent: opponent('Rival GmbH', { 'opponent-status': { '@status': 'ADMISSIBLE' } }) },
			] }), 'EP1');
			expect(biblio.opponents).toEqual([
				{ name: 'Rival GmbH', country: null, address: [], filingDate: '20191220', status: 'WITHDRAWN' },
			]);
		});
	});

	describe('current block ordering', () => {
		const agent = (name: string) => ({ agent: { addressbook: { name } } });

		it('compares Bulletin numbers as year and week, not as strings', () => {
			const biblio = extractRegisterBiblio(registerDoc({ parties: { agents: [
				{ '@change-gazette-num': '2002/5', ...agent('Week five') },
				{ '@change-gazette-num': '2002/31', ...agent('Week thirty-one') },
			] } }), 'EP1');
			expect(biblio.representatives.map(r => r.name)).toEqual(['Week thirty-one']);
			expect(biblio.representativesChangeGazette).toBe('2002/31');
		});

		it('ranks a pending Bulletin above a published one', () => {
			const biblio = extractRegisterBiblio(registerDoc({ parties: { agents: [
				{ '@change-gazette-num': '2014/36', ...agent('Published') },
				{ '@change-gazette-num': 'N/P', ...agent('Pending') },
			] } }), 'EP1');
			expect(biblio.representatives.map(r => r.name)).toEqual(['Pending']);
		});

		it('orders a block dated by its change date beside one dated by its Bulletin week', () => {
			// April by change date against Bulletin week 40 (October) of the same year.
			const biblio = extractRegisterBiblio(registerDoc({ parties: { agents: [
				{ '@change-date': '20150401', ...agent('April') },
				{ '@change-gazette-num': '2015/40', ...agent('October') },
			] } }), 'EP1');
			expect(biblio.representatives.map(r => r.name)).toEqual(['October']);
			const reversed = extractRegisterBiblio(registerDoc({ parties: { agents: [
				{ '@change-gazette-num': '2015/10', ...agent('March') },
				{ '@change-date': '20150401', ...agent('April') },
			] } }), 'EP1');
			expect(reversed.representatives.map(r => r.name)).toEqual(['April']);
		});
	});
});

describe('extractRegisterSearch', () => {
	async function searchPage() {
		const xml = readFileSync(join(import.meta.dirname, '__fixtures__/register-search-representative.xml'), 'utf8');
		return extractRegisterSearch(await xmlToJson(xml));
	}

	it('returns the total and one row per register document, keyed by the EP publication', async () => {
		const page = await searchPage();
		expect(page.total).toBe(845);
		expect(page.docs).toEqual([
			{
				docId: 'EP4671722',
				applicationNumber: 'EP25183540',
				title: 'DEVICE FOR THE VISUALISATION OF GAS FLOWS IN A ROOM, ESPECIALLY IN A CLEAN ROOM',
				applicants: ['Syntegon Technology GmbH'],
				representatives: [{ name: 'Kreuels, Justus', country: 'DE', address: ['Kreuels Henrichs Pannen', 'Patent- und Rechtsanwaltspartnerschaft mbB', 'Tersteegenstraße 28', '40474 Düsseldorf'] }],
				representativesChangeGazette: null,
				representativesChangeDate: '20251128',
				opponents: [],
				status: 'Examination is in progress',
				dates: { filing: '20250618', publication: '20251231' },
			},
			{
				docId: 'EP4671723',
				applicationNumber: 'EP25183541',
				title: 'DEVICE FOR THE VISUALISATION OF GAS FLOWS IN A ROOM, ESPECIALLY IN A CLEAN ROOM',
				applicants: ['Syntegon Technology GmbH'],
				representatives: [{ name: 'Kreuels, Justus', country: 'DE', address: ['Kreuels Henrichs Pannen', 'Patent- und Rechtsanwaltspartnerschaft mbB', 'Tersteegenstraße 28', '40474 Düsseldorf'] }],
				representativesChangeGazette: null,
				representativesChangeDate: '20251128',
				opponents: [],
				status: 'Grant of patent is intended',
				dates: { filing: '20250618', publication: '20251231' },
			},
		]);
	});

	it('keys a row by its earliest EP publication and tolerates a document without one', async () => {
		const page = extractRegisterSearch({
			'register-search': {
				'@total-result-count': '2',
				'register-documents': {
					'register-document': [
						{
							'bibliographic-data': {
								'publication-reference': [
									{ 'document-id': { country: 'EP', 'doc-number': '2000001', kind: 'B1', date: '20200101' } },
									{ 'document-id': { country: 'EP', 'doc-number': '2000001', kind: 'A1', date: '20180101' } },
									{ 'document-id': { country: 'WO', 'doc-number': '2017000001', date: '20170101' } },
								],
								'application-reference': { 'document-id': { country: 'EP', 'doc-number': '16700000', date: '20160101' } },
							},
						},
						{ 'bibliographic-data': { 'application-reference': { 'document-id': { country: 'EP', 'doc-number': '16700001', date: '20160102' } } } },
					],
				},
			},
		});
		expect(page.docs.map(d => [d.docId, d.applicationNumber, d.dates])).toEqual([
			['EP2000001', 'EP16700000', { filing: '20160101', publication: '20180101' }],
			[null, 'EP16700001', { filing: '20160102', publication: null }],
		]);
	});

	it('answers an empty page for a reply without register documents', () => {
		expect(extractRegisterSearch({ 'register-search': { '@total-result-count': '0' } })).toEqual({ total: 0, docs: [] });
	});
});
