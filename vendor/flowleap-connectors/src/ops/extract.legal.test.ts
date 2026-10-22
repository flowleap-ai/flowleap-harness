/*---------------------------------------------------------------------------------------------
 *  extractLegalEvents / extractFamilyLegalEvents regression tests
 *
 *  Asserted against a saved real EPO OPS /legal/publication response for EP2110298
 *  (trimmed to 25 events). The events that decide freedom to operate carry the contracting
 *  state in the L500EP detail block, not in L001EP — L001EP is always "EP" for an EP
 *  post-grant event, so reading it alone cannot say whether the patent is live in DE or FR.
 *  The same block carries what an EP filing covers in the first place: the designated
 *  contracting states of the AK event (L507EP) and the extension states of AX (L524EP).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { xmlToJson } from './xml-to-json.js';
import {
	extractLegalEvents,
	extractFamilyLegalEvents,
	extractStateCoverage,
} from './extract.js';
import type { FamilyLegalEvent, LegalEvent } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, './__fixtures__/ep2110298-legal.xml');

describe('extractLegalEvents (EP2110298 legal status)', () => {
	let events: LegalEvent[];
	let familyEvents: FamilyLegalEvent[];

	beforeAll(async () => {
		const json = await xmlToJson(readFileSync(fixturePath, 'utf8'));
		events = extractLegalEvents(json);
		familyEvents = extractFamilyLegalEvents(json);
	});

	it('carries the contracting state, effective date and reason of a PG25 lapse', () => {
		expect(events.find((e) => e.code === 'PG25' && e.state === 'PT')).toStrictEqual({
			code: 'PG25',
			date: '2015-02-03',
			country: 'EP',
			text: 'LAPSED IN A CONTRACTING STATE [ANNOUNCED VIA POSTGRANT INFORMATION FROM NATIONAL OFFICE TO EPO]',
			gazette: { number: null, date: '2015-01-30' },
			state: 'PT',
			effectiveDate: '2014-12-09',
			detail:
				'LAPSE BECAUSE OF FAILURE TO SUBMIT A TRANSLATION OF THE DESCRIPTION OR TO PAY THE FEE WITHIN THE PRESCRIBED TIME-LIMIT',
		});
	});

	it('carries the payment date and fee year of a PGFP annual-fee payment', () => {
		expect(events.find((e) => e.code === 'PGFP' && e.state === 'FR')).toStrictEqual({
			code: 'PGFP',
			date: '2023-02-01',
			country: 'EP',
			text: 'ANNUAL FEE PAID TO NATIONAL OFFICE  [ANNOUNCED VIA POSTGRANT INFORMATION FROM NATIONAL OFFICE TO EPO]',
			gazette: { number: null, date: '2023-01-31' },
			state: 'FR',
			paymentDate: '2022-12-08',
			feeYear: 15,
		});
	});

	it('omits the detail fields on an event whose L500EP block does not carry them', () => {
		expect(events.find((e) => e.code === 'GBPC')).toStrictEqual({
			code: 'GBPC',
			date: '2024-09-30',
			country: 'EP',
			text: 'GB: EUROPEAN PATENT CEASED THROUGH NON-PAYMENT OF RENEWAL FEE',
			gazette: { number: null, date: '2024-09-25' },
			effectiveDate: '2024-01-19',
		});
	});

	it('carries the same detail fields on the family-legal variant', () => {
		expect(familyEvents.find((e) => e.code === 'PG25' && e.state === 'PT')).toStrictEqual({
			familyMemberDocId: 'EP2110298',
			code: 'PG25',
			date: '2015-02-03',
			country: 'EP',
			text: 'LAPSED IN A CONTRACTING STATE [ANNOUNCED VIA POSTGRANT INFORMATION FROM NATIONAL OFFICE TO EPO]',
			state: 'PT',
			effectiveDate: '2014-12-09',
			detail:
				'LAPSE BECAUSE OF FAILURE TO SUBMIT A TRANSLATION OF THE DESCRIPTION OR TO PAY THE FEE WITHIN THE PRESCRIBED TIME-LIMIT',
		});
	});

	it('carries the designated contracting states of the AK event', () => {
		const ak = events.find((e) => e.code === 'AK');
		expect(ak?.designatedStates).toStrictEqual([
			'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR',
			'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MK', 'MT', 'NL', 'NO',
			'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'TR',
		]);
		expect(ak?.designatedStates?.length).toBeGreaterThan(0);
	});

	it('carries the extension states of the AX event', () => {
		expect(events.find((e) => e.code === 'AX')?.extensionStates).toStrictEqual(['AL', 'BA', 'RS']);
	});

	it('leaves the state lists off an event that carries neither', () => {
		const pgfp = events.find((e) => e.code === 'PGFP' && e.state === 'FR');
		expect(pgfp).toBeDefined();
		expect(pgfp).not.toHaveProperty('designatedStates');
		expect(pgfp).not.toHaveProperty('extensionStates');
	});

	it('carries the state lists on the family-legal variant too', () => {
		expect(familyEvents.find((e) => e.code === 'AK')?.designatedStates).toContain('DE');
		expect(familyEvents.find((e) => e.code === 'AX')?.extensionStates).toStrictEqual([
			'AL', 'BA', 'RS',
		]);
	});
});

describe('extractStateCoverage (the designated-state coverage of an EP filing)', () => {
	it('rolls the AK/AX events up into non-empty designated and extension state lists', async () => {
		const json = await xmlToJson(readFileSync(fixturePath, 'utf8'));
		const coverage = extractStateCoverage(extractLegalEvents(json));

		expect(coverage.designatedStates.length).toBeGreaterThan(0);
		expect(coverage.designatedStates).toContain('DE');
		expect(coverage.designatedStates).toContain('FR');
		expect(coverage.designatedStates).toContain('GB');
		expect(coverage.extensionStates).toStrictEqual(['AL', 'BA', 'RS']);
	});

	it('takes the most recent AK event, so a narrowed designation replaces the published one', () => {
		const coverage = extractStateCoverage([
			{ code: 'AK', date: '2021-04-14', designatedStates: ['DE', 'FR'] },
			{ code: 'AK', date: '2019-10-10', designatedStates: ['DE', 'FR', 'GB', 'IT'] },
		]);

		expect(coverage.designatedStates).toStrictEqual(['DE', 'FR']);
	});

	it('reads recency off the event date, not the order the events arrive in', () => {
		// The B1 designation is NARROWED to DE/FR, and it arrives second. Selecting on
		// array order would answer the wider A1 set.
		const coverage = extractStateCoverage([
			{ code: 'AK', date: '2019-10-10', designatedStates: ['DE', 'FR', 'GB', 'IT'] },
			{ code: 'AK', date: '2021-04-14', designatedStates: ['DE', 'FR'] },
			{ code: 'AX', date: '2019-10-10', extensionStates: ['AL', 'BA', 'RS'] },
			{ code: 'AX', date: '2021-04-14', extensionStates: ['BA', 'ME'] },
		]);

		expect(coverage.designatedStates).toStrictEqual(['DE', 'FR']);
		expect(coverage.extensionStates).toStrictEqual(['BA', 'ME']);
	});

	it('prefers a dated event over an undated one of the same code', () => {
		const coverage = extractStateCoverage([
			{ code: 'AK', date: undefined, designatedStates: ['GB', 'IT'] },
			{ code: 'AK', date: '2021-04-14', designatedStates: ['DE', 'FR'] },
		]);

		expect(coverage.designatedStates).toStrictEqual(['DE', 'FR']);
	});

	it('keeps the arrival order when no AK event carries a date', () => {
		const coverage = extractStateCoverage([
			{ code: 'AK', designatedStates: ['DE', 'FR'] },
			{ code: 'AK', designatedStates: ['GB', 'IT'] },
		]);

		expect(coverage.designatedStates).toStrictEqual(['DE', 'FR']);
	});

	it('answers from an older AK event when the newest one carries no parsed list', () => {
		// A malformed L507EP block yields no list at all. That is a gap in the record, not
		// a designation of nothing, so an older AK answers rather than [] — which would be
		// indistinguishable from the genuine "designates no states". The cost is that the
		// answer can be a superseded, wider set; this test pins that deliberate trade.
		const coverage = extractStateCoverage([
			{ code: 'AK', date: '2021-04-14' },
			{ code: 'AK', date: '2019-10-10', designatedStates: ['DE', 'FR'] },
		]);

		expect(coverage.designatedStates).toStrictEqual(['DE', 'FR']);
	});

	it('ranks an OPS YYYYMMDD date against a normalized YYYY-MM-DD one', () => {
		// The date on a legal event is raw OPS (20211230); the same OPS field is normalized
		// to 2021-12-31 elsewhere in extract.ts. A plain string compare ranks "20211230"
		// ABOVE "2021-12-31" — the '-' sorts under any digit — and so answers the older,
		// wider set. Comparing on digits only is what makes this come out right.
		const coverage = extractStateCoverage([
			{ code: 'AK', date: '20211230', designatedStates: ['DE', 'FR', 'GB', 'IT'] },
			{ code: 'AK', date: '2021-12-31', designatedStates: ['DE', 'FR'] },
		]);

		expect(coverage.designatedStates).toStrictEqual(['DE', 'FR']);
	});

	it('answers empty lists, not an error, for a record with no AK or AX event', () => {
		expect(extractStateCoverage([{ code: 'PGFP' }])).toStrictEqual({
			designatedStates: [],
			extensionStates: [],
		});
	});
});
