import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDpmaFailure, parseDpmaHitList, parseDpmaRegisterRecord } from './wire.js';

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

describe('parseDpmaRegisterRecord', () => {
	it('reads the recorded register record of DE 100 27 360', async () => {
		const parsed = await parseDpmaRegisterRecord(fixture('patent_info.xml'));
		if (!parsed.ok) throw new Error(parsed.error.message);
		const record = parsed.data;
		expect(record.schemaVersion).toBe('0.10');
		expect(record.applicationNumber).toBe('10027360.2');
		expect(record.applicationDate).toBe('2000-06-02');
		expect(record.publications).toEqual([{ country: 'DE', number: '000010027360', kind: 'A1' }]);
		expect(record.title).toBe('Dreh-Energieumsetzer für ein Hybrid-Elektrofahrzeug');
		expect(record.ipRightType).toBe('patent');
		expect(record.status).toBe('nicht-anhaengig-erloschen');
		expect(record.applicants).toEqual([{ text: 'DENSO CORPORATION, Kariya-city, Aichi-pref., JP', name: 'DENSO CORPORATION, Kariya-city', country: 'JP' }]);
		expect(record.inventors).toHaveLength(1);
		expect(record.agents).toEqual([
			{ text: 'KUHNEN & WACKER Patent- und Rechtsanwaltsbüro, 85354 Freising, DE', name: 'KUHNEN & WACKER Patent- und Rechtsanwaltsbüro', country: 'DE' },
		]);
		expect(record.priorities).toEqual([{ country: 'JP', date: '1999-06-04', number: '11158010' }]);
		expect(record.ipc).toEqual(['H02K0016000000']);
		expect(record.firstPublicationDate).toBe('2000-12-07');
		expect(record.lastRegisterUpdate).toBe('2017-06-21');
		expect(record.abstract).toMatch(/^Ein Dreh-Energieumsetzer/);
		expect(record.events.map((event) => event.status)).toEqual(['R000', 'R004', 'R119', 'R079', 'R200']);
		expect(record.events[4]).toEqual({
			procedure: 'publikationen',
			status: 'R200',
			date: '2000-12-07',
			publicationDate: '2000-12-07',
			publishedDocuments: ['DE000010027360A1'],
		});
	});

	it('answers malformed for a body that is not a register record', async () => {
		const parsed = await parseDpmaRegisterRecord('<other/>');
		expect(parsed).toMatchObject({ ok: false, error: { kind: 'malformed' } });
	});

	it('answers malformed for a body that is not XML', async () => {
		expect(await parseDpmaRegisterRecord('not xml <')).toMatchObject({ ok: false, error: { kind: 'malformed' } });
	});

	it('gives the failure that the body names', async () => {
		expect(await parseDpmaRegisterRecord(fixture('auth_error.xml'))).toEqual({ ok: false, error: { kind: 'auth', message: 'Authentification failed' } });
	});
});

describe('parseDpmaHitList', () => {
	it('reads the recorded hit list', async () => {
		const parsed = await parseDpmaHitList(fixture('patent_search.xml'));
		if (!parsed.ok) throw new Error(parsed.error.message);
		expect(parsed.data.hitCount).toBe(4);
		expect(parsed.data.limited).toBe(false);
		expect(parsed.data.hits).toHaveLength(4);
		expect(parsed.data.hits[0]).toEqual({
			leadingRegisteredNumber: '82337144',
			registeredNumber: 'G 82 33 714.4',
			type: 'Utility model',
			legalStatus: 'Not pending/lapsed',
			title: 'Elektrofahrzeug',
			applicationDate: '1982-12-01',
			publicationDate: '1983-02-24',
			registrationDate: '1983-02-24',
			applicants: ['ELO - MA - HG Peter Kurs Ing. VDI GmbH & Co, 75334 Straubenhardt, DE'],
			inventors: [],
			agent: 'Trappenberg, Hans, Pat.-Ing., 76185 Karlsruhe, DE',
		});
		// The fourth hit is a patent with an inventor and an empty <agent>.
		expect(parsed.data.hits[3]).toMatchObject({ type: 'Patent', inventors: ['Ihle, Bernhard, W-7520 Bruchsal, DE'] });
		expect(parsed.data.hits[3]?.agent).toBeUndefined();
	});

	it('marks a list that the DPMA cut at the hit limit', async () => {
		const parsed = await parseDpmaHitList(fixture('patent_search_limited.xml'));
		if (!parsed.ok) throw new Error(parsed.error.message);
		expect(parsed.data.limited).toBe(true);
		expect(parsed.data.hitCount).toBe(10000);
		expect(parsed.data.hits.length).toBeGreaterThan(0);
		expect(parsed.data.hits[0]?.leadingRegisteredNumber).toBe('DD136869');
	});

	it('reads a list with no hit as an empty list, not as a failure', async () => {
		expect(await parseDpmaHitList(fixture('patent_search_empty.xml'))).toEqual({ ok: true, data: { hitCount: 0, limited: false, hits: [] } });
	});

	it('reads a refused query as a query failure with the text of the DPMA', async () => {
		const parsed = await parseDpmaHitList(fixture('patent_search_error.xml'));
		expect(parsed).toMatchObject({ ok: false, error: { kind: 'query' } });
		if (!parsed.ok) expect(parsed.error.message).toContain('not admissible');
	});
});

describe('parseDpmaFailure', () => {
	it('reads a refused login', async () => {
		expect(await parseDpmaFailure(fixture('auth_error.xml'))).toEqual({ kind: 'auth', message: 'Authentification failed' });
	});

	it('reads "data not available"', async () => {
		expect(await parseDpmaFailure(fixture('data_not_available.xml'))).toEqual({ kind: 'not_available', message: 'Data not available' });
	});

	it('answers undefined for a body that is not a failure', async () => {
		expect(await parseDpmaFailure(fixture('patent_search.xml'))).toBeUndefined();
		expect(await parseDpmaFailure(fixture('version.txt'))).toBeUndefined();
	});
});
