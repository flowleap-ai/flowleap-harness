/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractNumberedClaims, xmlToJson } from './xml-to-json.js';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}-claims.xml`, import.meta.url), 'utf8');

describe('OPS text-only claim numbering', () => {
	it('recovers all eleven WO9951190A1 printed claims from one raw OPS paragraph', async () => {
		const result = extractNumberedClaims(await xmlToJson(fixture('wo-9951190-a1'), { preserveClaimOrder: true }));
		expect({ language: result.language, numbers: result.claims.map(claim => claim.number) }).toEqual({ language: 'ja', numbers: Array.from({ length: 11 }, (_, index) => String(index + 1)) });
		expect(result.claims[2].text).toContain('<img class="EMIRef"');
		expect(result.claims[2].text).toContain('請求項 1に記載');
		expect(result.claims[9].text).toMatch(/^1 0 \./);
		expect(result.claims[10].text).toMatch(/^1 1 \./);
	});

	it('recovers the twelve WO2025031952A1 claims behind a German heading and a page break inside claim 1', async () => {
		// Live OPS text-only shape (2026-10-11): paragraph one is "Ansprüche", a line break and claim 1 up to a page break,
		// paragraph two starts mid-sentence and holds the rest of claim 1 and claims 2 to 12.
		const result = extractNumberedClaims(await xmlToJson(fixture('wo-2025031952-a1'), { preserveClaimOrder: true }));
		expect({ language: result.language, numbers: result.claims.map(claim => claim.number) }).toEqual({ language: 'de', numbers: Array.from({ length: 12 }, (_, index) => String(index + 1)) });
		expect(result.claims[0].text).toMatch(/^Ansprüche\n1\. Hydraulischer Aktor/);
		expect(result.claims[0].text).toContain('unterbrochen werden');
		expect(result.claims[0].text).toContain('kann, wenn der Druck in der zweiten Leitung (7b) oberhalb eines Schwellenwertes liegt.');
		expect(result.claims[1].text).toMatch(/^2\. Hydraulischer Aktor \(1\) nach Anspruch 1/);
		expect(result.claims[11].text).toMatch(/^12\. Hydraulischer Aktor/);
		expect(result.unsegmentedText).toBeUndefined();
	});

	it.each([
		'Claims', 'CLAIMS', 'Patentansprüche', 'Ansprüche', 'Revendications', 'What is claimed is:', 'We claim:', 'I claim:',
	])('treats a known claims heading as the preamble of claim 1, on its own line or on claim 1\'s line: %s', heading => {
		const ownLine = extractNumberedClaims({ claim: { 'claim-text': `${heading}\n1. First claim.\n2. Second claim.` } });
		const sameLine = extractNumberedClaims({ claim: { 'claim-text': `${heading} 1. First claim.\n2. Second claim.` } });
		expect(ownLine.claims.map(claim => [claim.number, claim.text])).toEqual([['1', `${heading}\n1. First claim.`], ['2', '2. Second claim.']]);
		expect(sameLine.claims.map(claim => [claim.number, claim.text])).toEqual([['1', `${heading} 1. First claim.`], ['2', '2. Second claim.']]);
	});

	it.each([
		['a blank line after the heading', 'Claims\n\n1. First claim.\n2. Second claim.'],
		['CRLF line ends', 'Claims\r\n1. First claim.\r\n2. Second claim.'],
		['a blank line after the Japanese heading, as main segmented it', '請求の範囲\n\n1. First claim.\n2. Second claim.'],
		['CRLF after the Japanese heading, as main segmented it', '請求の範囲\r\n1. First claim.\r\n2. Second claim.'],
	])('reads the claims behind a heading followed by %s', (_case, text) => {
		expect(extractNumberedClaims({ claim: { 'claim-text': text } }).claims.map(claim => claim.number)).toEqual(['1', '2']);
	});

	it('answers a heading followed by a long run of blanks in linear time', () => {
		// Review of #575: two adjacent optional blank runs in the heading regex backtracked
		// quadratically (0.9 s at 20k blanks, 90 s at 200k, all inside the 2 MB cap).
		const text = `Claims${' '.repeat(200_000)}x`;
		const started = performance.now();
		const result = extractNumberedClaims({ claim: { 'claim-text': text } });
		expect(performance.now() - started).toBeLessThan(200);
		expect(result).toEqual({ claims: [], language: 'en', unsegmentedText: text });
	});

	it('keeps the gate behind a known heading: a broken run or an inner numbered list stays unaddressed', () => {
		for (const text of ['Claims\n1. First claim.\n3. Third claim.', 'Ansprüche\n1. A claim with a list:\n1. Inner item.\n2. Inner item.']) {
			expect(extractNumberedClaims({ claim: { 'claim-text': text } })).toEqual({ claims: [], language: 'en', unsegmentedText: text });
		}
	});

	it('keeps the already segmented EP0983762A1 claims and continuation paragraphs unchanged', async () => {
		const result = extractNumberedClaims(await xmlToJson(fixture('ep-0983762-a1'), { preserveClaimOrder: true }));
		expect({ language: result.language, numbers: result.claims.map(claim => claim.number) }).toEqual({ language: 'en', numbers: ['1', '2', '3', '4', '5', '6', '7', '8'] });
		expect(result.claims[0].text).toContain('(d) a polymerization initiator.');
		expect(result.claims[1].text).toContain('(e) a glass powder');
	});
	it.each([
		'Unnumbered claims text.',
		'1. First claim.\n3. Missing claim two.',
		'1. First claim.\n2. Second claim.\n2. Duplicate number.',
		'Unknown heading\n1. First claim.\n2. Second claim.',
		'1. Claim with numeric subclauses:\n1. Inner item.\n2. Inner item.',
		'1. Claim with a numbered continuation:\n2. Inner item.',
	])('retains ambiguous source text without inventing claim anchors: %s', async text => {
		const result = extractNumberedClaims({ claim: { 'claim-text': text } });
		expect(result).toEqual({ claims: [], language: 'en', unsegmentedText: text });
	});

	it('preserves explicit provider numbers and does not split numbered subclauses', () => {
		expect(extractNumberedClaims({ claim: [{ '@num': '0003', 'claim-text': 'A device:\n1. Inner item\n2. Inner item' }, { '@num': '0005', 'claim-text': 'Another claim.' }] })).toEqual({ language: 'en', claims: [{ number: '3', text: 'A device:\n1. Inner item\n2. Inner item' }, { number: '5', text: 'Another claim.' }] });
	});

	it('does not turn decimal values or inline claim references into boundaries', () => {
		const text = ['1. A composition with 2.5 parts.\n0. 01 parts catalyst.', '2. A composition according to claim 1. With another component.'];
		expect(extractNumberedClaims({ claim: { 'claim-text': text } }).claims).toEqual([{ number: '1', text: '1. A composition with 2.5 parts.\n0. 01 parts catalyst.' }, { number: '2', text: '2. A composition according to claim 1. With another component.' }]);
	});

});
