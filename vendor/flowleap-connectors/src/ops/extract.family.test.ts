/*---------------------------------------------------------------------------------------------
 *  INPADOC family extraction — the DOCDB application number must never stand
 *  alone as the outward number (#419, the OPS counterpart of PR #422).
 *
 *  EP2110298 is the family that exposed the bug: its US applications carry the
 *  DOCDB values 10374408 and 75653110, which read like US filing numbers and
 *  are not. They are USPTO applications 12/103,744 and 12/756,531, verified
 *  against ODP continuity (12/103,744 has one DIV child, 12/756,531, which
 *  granted as US8056987).
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFamilyMembers, extractFamilyRepresentatives } from './extract.js';
import { xmlToJson } from './xml-to-json.js';
import type { FamilyMember } from './types.js';

/** The two DOCDB strings this family serves; neither is a number an office knows. */
const DOCDB_NUMBERS = ['10374408', '75653110'];

async function ep2110298Family(): Promise<FamilyMember[]> {
	const xml = readFileSync(join(import.meta.dirname, '__fixtures__/family-ep2110298.xml'), 'utf8');
	return extractFamilyMembers(await xmlToJson(xml));
}

describe('extractFamilyMembers (EP2110298 / #419)', () => {
	it('resolves every application and priority to a citable publication', async () => {
		const members = await ep2110298Family();

		expect(members).toEqual([
			{
				refType: 'publication',
				country: 'EP',
				number: '2110298',
				kind: 'A2',
				date: '20091021',
				publication: 'EP2110298A2',
				docdbApplication: null,
			},
			{
				refType: 'application',
				country: 'EP',
				number: '09250131',
				kind: 'A',
				date: '20090119',
				publication: 'EP2110298B1',
				docdbApplication: 'EP09250131 (A)',
			},
			{
				refType: 'priority',
				country: 'US',
				number: '10374408',
				kind: 'A',
				date: '20080416',
				publication: 'US7722129B2',
				docdbApplication: 'US10374408 (A)',
			},
			// The two rows #455 recovered. EP2110298 A2, A3 and B1 share a
			// country and a doc-number, so the old country+number key kept the
			// A2 and threw the other two away — the grant among them.
			{
				refType: 'publication',
				country: 'EP',
				number: '2110298',
				kind: 'A3',
				date: '20120404',
				publication: 'EP2110298A3',
				docdbApplication: null,
			},
			{
				refType: 'publication',
				country: 'EP',
				number: '2110298',
				kind: 'B1',
				date: '20140806',
				publication: 'EP2110298B1',
				docdbApplication: null,
			},
			{
				refType: 'publication',
				country: 'US',
				number: '2009261648',
				kind: 'A1',
				date: '20091022',
				publication: 'US2009261648A1',
				docdbApplication: null,
			},
			{
				refType: 'application',
				country: 'US',
				number: '10374408',
				kind: 'A',
				date: '20080416',
				publication: 'US7722129B2',
				docdbApplication: 'US10374408 (A)',
			},
			{
				refType: 'publication',
				country: 'US',
				number: '7722129',
				kind: 'B2',
				date: '20100525',
				publication: 'US7722129B2',
				docdbApplication: null,
			},
			{
				refType: 'publication',
				country: 'US',
				number: '2010194184',
				kind: 'A1',
				date: '20100805',
				publication: 'US2010194184A1',
				docdbApplication: null,
			},
			{
				refType: 'application',
				country: 'US',
				number: '75653110',
				kind: 'A',
				date: '20100408',
				publication: 'US8056987B2',
				docdbApplication: 'US75653110 (A)',
			},
			{
				refType: 'priority',
				country: 'US',
				number: '75653110',
				kind: 'A',
				date: '20100408',
				publication: 'US8056987B2',
				docdbApplication: 'US75653110 (A)',
			},
			{
				refType: 'publication',
				country: 'US',
				number: '8056987',
				kind: 'B2',
				date: '20111115',
				publication: 'US8056987B2',
				docdbApplication: null,
			},
		]);
	});

	it('never leaves a DOCDB number outside the number/docdbApplication keys', async () => {
		const members = await ep2110298Family();

		// The keys allowed to carry one, and nothing else. A NEW key built from
		// the raw value fails here, which is how #419 reached a published
		// dossier in the first place.
		const offenders = members.flatMap((member) =>
			Object.entries(member)
				.filter(([key]) => key !== 'number' && key !== 'docdbApplication')
				.filter(([, value]) =>
					DOCDB_NUMBERS.some((n) => typeof value === 'string' && value.includes(n))
				)
				.map(([key, value]) => `${key}=${String(value)}`)
		);

		expect(offenders).toEqual([]);
	});

	it('leaves a priority with no publication in the family uncitable rather than guessing', async () => {
		const xml = readFileSync(
			join(import.meta.dirname, '__fixtures__/family-ep2110298.xml'),
			'utf8'
		);
		// A provisional priority: present as a priority-claim, published nowhere.
		const withProvisional = xml.replace(
			'  </ops:patent-family>',
			`    <ops:family-member family-id="40846074">
      <priority-claim sequence="1" kind="national">
        <document-id document-id-type="docdb">
          <country>US</country>
          <doc-number>4512307</doc-number>
          <kind>P</kind>
          <date>20070420</date>
        </document-id>
      </priority-claim>
    </ops:family-member>
  </ops:patent-family>`
		);

		const provisional = extractFamilyMembers(await xmlToJson(withProvisional)).find(
			(m) => m.number === '4512307'
		);

		expect(provisional).toEqual({
			refType: 'priority',
			country: 'US',
			number: '4512307',
			kind: 'P',
			date: '20070420',
			publication: null,
			docdbApplication: 'US4512307 (P)',
		});
	});

	it('keeps every kind code of a reused document number, the grant included (#455)', async () => {
		// The defect: EP2110298 A2, A3 and B1 are one document number under
		// three kind codes, and a country+number key kept only the A2 — the
		// document the user asked about, missing from its own family.
		const ep = (await ep2110298Family())
			.filter((member) => member.refType === 'publication' && member.country === 'EP')
			.map((member) => member.publication);

		expect(ep).toEqual(['EP2110298A2', 'EP2110298A3', 'EP2110298B1']);
	});

	it('returns no members for a family payload it cannot walk', async () => {
		expect(extractFamilyMembers(await xmlToJson('<ops:world-patent-data/>'))).toEqual([]);
	});
});

describe('extractFamilyRepresentatives (EP2110298 / #451)', () => {
	it('names one publication per member, including the EP grant the member rows drop', async () => {
		const xml = readFileSync(join(import.meta.dirname, '__fixtures__/family-ep2110298.xml'), 'utf8');
		const { rule, members } = extractFamilyRepresentatives(await xmlToJson(xml));

		// The EP application publishes three times; `members` deduplicates
		// publication rows on country+number, so EP2110298B1 never appears there
		// at all and a reader of that list alone sees only the A2. This block is
		// where the grant is named.
		expect({ rule, members }).toEqual({
			rule: 'first-grant-else-earliest',
			members: [
				{
					application: 'EP09250131 (A)',
					representativePublication: 'EP2110298B1',
					isGrant: true,
					publications: ['EP2110298A2', 'EP2110298A3', 'EP2110298B1'],
				},
				{
					application: 'US10374408 (A)',
					representativePublication: 'US7722129B2',
					isGrant: true,
					publications: ['US2009261648A1', 'US7722129B2'],
				},
				{
					application: 'US75653110 (A)',
					representativePublication: 'US8056987B2',
					isGrant: true,
					publications: ['US2010194184A1', 'US8056987B2'],
				},
			],
		});
	});

	it('answers with no members for a family payload it cannot walk', async () => {
		expect(
			extractFamilyRepresentatives(await xmlToJson('<ops:world-patent-data/>')).members
		).toEqual([]);
	});
});
