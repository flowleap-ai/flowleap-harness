/*---------------------------------------------------------------------------------------------
 *  extractEquivalentsFamily regression tests
 *
 *  Asserted against a saved real EPO OPS /published-data/.../equivalents response.
 *  The endpoint returns <ops:equivalents-inquiry> with <ops:inquiry-result> entries —
 *  not <exchange-documents> — so the walker must read the inquiry structure or the
 *  family comes back empty for every patent (broke get_patent_family, get_patent_summary
 *  and USPTO enrichment's EPO family field).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { xmlToJson } from './xml-to-json.js';
import { extractEquivalentsFamily } from './extract.js';
import type { EquivalentsFamilyData } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, './__fixtures__/ep1000000-equivalents.xml');

describe('extractEquivalentsFamily (EP1000000)', () => {
	let family: EquivalentsFamilyData;

	beforeAll(async () => {
		const xml = readFileSync(fixturePath, 'utf8');
		family = extractEquivalentsFamily(await xmlToJson(xml), 'EP1000000');
	});

	it('extracts every inquiry-result member', () => {
		expect(family.familyMembers.map((m) => m.docId)).toEqual([
			'US6093011',
			'EP1000000',
			'ATE232441T',
			'NL1010536C',
		]);
	});

	it('reports the member count and echoes the queried docId', () => {
		expect(family.totalCount).toBe(4);
		expect(family.docId).toBe('EP1000000');
	});
});
