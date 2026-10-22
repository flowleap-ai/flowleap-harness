/*---------------------------------------------------------------------------------------------
 *  Bibliographic priority claims (#432).
 *
 *  `dates.priority` came back `[]` for every document, because date, country
 *  and doc-number were read off `priority-claim` where they nest one level
 *  down under `document-id`, and the date filter behind them dropped the lot.
 *  An empty list is not absence — a consumer could not tell "no priority" from
 *  "we dropped it".
 *
 *  The fixture carries four real OPS blocks chosen for what they prove about
 *  the document-id variants; see its header comment.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractBiblio, xmlToJson } from './xml-to-json.js';
import type { PriorityClaim } from './types.js';

/** The four fixture documents, in file order. */
async function priorityClaimsByDocument(): Promise<PriorityClaim[][]> {
	const xml = readFileSync(
		join(import.meta.dirname, '__fixtures__/biblio-priority-claims.xml'),
		'utf8'
	);
	const parsed = await xmlToJson(xml);
	const documents = parsed['exchange-documents']['exchange-document'];
	return documents.map(
		(document: unknown) =>
			extractBiblio({ 'exchange-documents': { 'exchange-document': document } }).dates.priority
	);
}

describe('priority claims in the biblio read (#432)', () => {
	it('reads every claim, and names each number for the format it is in', async () => {
		const [us2009261648, us11000000, wo2019055630, ep1000000] =
			await priorityClaimsByDocument();

		expect({ us2009261648, us11000000, wo2019055630, ep1000000 }).toEqual({
			// docdb + epodoc, no original entry at all.
			us2009261648: [
				{
					date: '20080416',
					country: 'US',
					epodocApplication: 'US20080103744',
					docdbApplication: 'US10374408 (A)',
					originalApplication: null,
					kind: 'A',
				},
			],
			// Two claims: a provisional (kind P), then a regular filing whose
			// claim carries no original entry.
			us11000000: [
				{
					date: '20180914',
					country: 'US',
					epodocApplication: 'US201862731230P',
					docdbApplication: 'US201862731230 (P)',
					originalApplication: '62731230',
					kind: 'P',
				},
				{
					date: '20190912',
					country: 'US',
					epodocApplication: 'US201916568903',
					docdbApplication: 'US201916568903 (A)',
					originalApplication: null,
					kind: 'A',
				},
			],
			// The office's own string, complete and punctuated.
			wo2019055630: [
				{
					date: '20170913',
					country: 'US',
					epodocApplication: 'US201762558339P',
					docdbApplication: 'US201762558339 (P)',
					originalApplication: '62/558,339',
					kind: 'P',
				},
			],
			// All three variants, and a non-US priority office.
			ep1000000: [
				{
					date: '19981112',
					country: 'NL',
					epodocApplication: 'NL19981010536',
					docdbApplication: 'NL1010536 (A)',
					originalApplication: '1010536',
					kind: 'A',
				},
			],
		});
	});

	it('every claim carries an epodoc number — the variant that is always served', async () => {
		const claims = (await priorityClaimsByDocument()).flat();

		expect(claims.map((claim) => claim.epodocApplication).filter(Boolean)).toHaveLength(
			claims.length
		);
	});

	it('originalApplication is not a number to cite: present on some claims, a bare serial on others', async () => {
		const claims = (await priorityClaimsByDocument()).flat();

		// The evidence behind the field's doc comment, pinned so a future
		// change cannot quietly promote it to the outward identifier: two of
		// five claims have none at all, and EP1000000's is the NL number with
		// no country, which says nothing on its own.
		expect(claims.map((claim) => claim.originalApplication)).toEqual([
			null,
			'62731230',
			null,
			'62/558,339',
			'1010536',
		]);
	});

	it('a document with no priority-claims block gets an empty list, not a crash', async () => {
		const parsed = await xmlToJson(
			'<ops:world-patent-data xmlns:ops="http://ops.epo.org">' +
				'<exchange-documents><exchange-document country="EP" doc-number="1" kind="A1">' +
				'<bibliographic-data/></exchange-document></exchange-documents></ops:world-patent-data>'
		);

		expect(extractBiblio(parsed).dates.priority).toEqual([]);
	});
});
