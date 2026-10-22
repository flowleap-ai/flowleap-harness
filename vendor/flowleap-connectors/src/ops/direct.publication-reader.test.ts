/*---------------------------------------------------------------------------------------------
 *  Publication identity and claim boundaries — recorded EPO responses, 2026-09-05.
 *
 *  The EP1234567 A2 and B1 bibliography and claims as OPS returned them
 *  (`__fixtures__/patent-reader-fixtures.md`): the reader must keep the two
 *  publications apart in text, links and cache identity, resolve a missing kind
 *  through bibliography once, refuse the wrong publication from the provider,
 *  and group claim paragraphs so claim 3's continuation stays with claim 3.
 *
 *  Over the package's fake host (ADR 0019 C1): the Map-backed cache stands in
 *  for the backend's hybrid tier, so a stale pre-fix entry is a key written to
 *  `host.store`. The OPS transport is stubbed at the package's own seam.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createFakeHost, type FakeHost } from '../__tests__/fake-host.js';
import { createConnectors, type Connectors } from '../index.js';
import { opsFetch } from './fetch.js';
import { extractClaims, xmlToJson } from './xml-to-json.js';

vi.mock('./fetch.js', () => ({ opsFetch: vi.fn(), opsFetchBinary: vi.fn() }));

const fixture = (kind: string, section: string) =>
	readFileSync(new URL(`./__fixtures__/ep1234567-${kind}-${section}.xml`, import.meta.url), 'utf8');
const fetch = vi.mocked(opsFetch);

let host: FakeHost;
let ops: Connectors['ops'];

beforeEach(() => {
	vi.clearAllMocks();
	host = createFakeHost();
	({ ops } = createConnectors(host));
	fetch.mockImplementation(async (_ctx, path) => {
		const kind = path.includes('.B1') ? 'b1' : 'a2';
		return fixture(kind, path.endsWith('/biblio') ? 'biblio' : 'claims');
	});
});

describe('publication identity and claim boundaries — recorded EPO responses, 2026-09-05', () => {
	it('keeps explicit A2 and B1 bibliography, text, links and cache identities separate', async () => {
		const a = await ops.getBiblio('EP1234567A2');
		const b = await ops.getBiblio('EP1234567B1');
		expect([a.ok && a.data.docId, b.ok && b.data.docId, b.ok && b.data.dates.publication]).toEqual([
			'EP1234567.A2',
			'EP1234567.B1',
			'20070411',
		]);
		const ac = await ops.getClaimsData('EP1234567A2');
		const bc = await ops.getClaimsData('EP1234567B1');
		expect([ac.docId, ac.totalClaims, bc.docId, bc.totalClaims]).toEqual(['EP1234567A2', 27, 'EP1234567B1', 26]);
		expect(bc.claims[0].text).toContain('Composition that comprises');
		expect(bc.claims[0].text).toContain('< 100 nm');
		expect(ac.claims[0].text).toContain('Partikuläres Kompositmaterial');
		expect(ac.language).toBe('de');
		expect(bc.language).toBe('en');
		expect((await ops.getClaims('ep 1234567 b1')).ok).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(4);
		// Four distinct cache identities: two biblio entries and two claims entries.
		expect([...host.store.keys()].filter((k) => k.includes(':biblio:') || k.includes(':claims:'))).toHaveLength(4);
	});

	it('resolves a missing kind through bibliography once and uses the returned publication for fulltext', async () => {
		const result = await ops.getClaims('EP1234567');
		expect(result.ok && result.data.docId).toBe('EP1234567A2');
		expect(fetch.mock.calls.map(([, path]) => path)).toEqual([
			'/published-data/publication/epodoc/EP1234567/biblio',
			'/published-data/publication/docdb/EP.1234567.A2/claims',
		]);
	});

	it('does not consume pre-fix kindless cache entries for explicit publications', async () => {
		host.store.set('epo:claims:EP1234567:en', { docId: 'EP1234567', lang: 'en', claims: ['stale A2'] });
		host.store.set('epo:publication-v3:claims:EP1234567B1:en', {
			docId: 'EP1234567B1',
			lang: 'en',
			claims: ['reordered text'],
		});
		const result = await ops.getClaims('EP1234567B1');
		expect(result.ok && result.data.claims[0]).toContain('Composition that comprises');
	});

	it('rejects the wrong publication from the provider for every reader section, without caching it', async () => {
		fetch.mockResolvedValue(fixture('a2', 'biblio'));
		expect((await ops.getBiblio('EP1234567B1')).ok).toBe(false);
		fetch.mockResolvedValue(fixture('a2', 'claims'));
		expect((await ops.getClaims('EP1234567B1')).ok).toBe(false);
		expect((await ops.getDescription('EP1234567B1')).ok).toBe(false);
		expect(host.store.size).toBe(0);
		fetch.mockResolvedValue(fixture('b1', 'claims'));
		expect((await ops.getClaims('EP1234567B1')).ok).toBe(true);
	});

	it('does not retry a missing requested kind as kindless or A2', async () => {
		fetch.mockRejectedValue(new Error('OPS API error: 404 requested publication unavailable'));
		expect((await ops.getClaims('EP1234567B1')).ok).toBe(false);
		expect(fetch.mock.calls.map(([, path]) => path)).toEqual(['/published-data/publication/docdb/EP.1234567.B1/claims']);
	});

	it('keeps claim 3 continuation with claim 3, and actual claim 4 at number 4', async () => {
		const result = await ops.getClaimsData('EP1234567B1');
		expect(result.claims[2]).toEqual({ number: '3', text: expect.stringContaining('(c) 20 to 90 wt.%') });
		expect(result.claims[3]).toEqual({ number: '4', text: expect.stringMatching(/^4\. Composition according to Claim 3/) });
	});

	it('joins structured claim paragraphs and preserves provider numbers including gaps', async () => {
		fetch.mockResolvedValue(
			`<world-patent-data><fulltext-documents><fulltext-document><bibliographic-data><publication-reference><document-id><country>EP</country><doc-number>1234567</doc-number><kind>B1</kind></document-id></publication-reference></bibliographic-data><claims lang="EN"><claim num="0003"><claim-text>Third claim:<claim-text>(a) nested text</claim-text></claim-text><claim-text>(b) continuation</claim-text></claim><claim num="0005"><claim-text>Fifth claim.</claim-text></claim></claims></fulltext-document></fulltext-documents></world-patent-data>`
		);
		const result = await ops.getClaimsData('EP1234567B1');
		expect(result.claims).toEqual([
			{ number: '3', text: 'Third claim:\n(a) nested text\n(b) continuation' },
			{ number: '5', text: 'Fifth claim.' },
		]);
	});

	it('also groups flat claim paragraphs for the legacy string consumer', async () => {
		const claims = extractClaims(await xmlToJson(fixture('a2', 'claims')), 'en');
		expect([claims.length, claims[2].includes('(c)'), claims[3].startsWith('4.')]).toEqual([27, true, true]);
	});

	it('selects the requested language across fulltext documents while excluding other kinds', async () => {
		const document = (kind: string, language: string, text: string) =>
			`<fulltext-document><bibliographic-data><publication-reference><document-id><country>EP</country><doc-number>1234567</doc-number><kind>${kind}</kind></document-id></publication-reference></bibliographic-data><claims lang="${language}"><claim num="4"><claim-text>${text}</claim-text></claim></claims></fulltext-document>`;
		fetch.mockResolvedValue(
			`<world-patent-data><fulltext-documents>${document('A2', 'EN', 'Wrong kind')}${document('B1', 'DE', 'Deutsch')}${document('B1', 'EN', 'English')}</fulltext-documents></world-patent-data>`
		);
		const result = await ops.getClaimsData('EP1234567B1', 'en');
		expect([result.language, result.claims]).toEqual(['en', [{ number: '4', text: 'English' }]]);
	});

	it('rejects fulltext without a verifiable publication identity', async () => {
		fetch.mockResolvedValue(
			'<world-patent-data><fulltext-documents><fulltext-document><claims lang="EN"><claim><claim-text>1. Unidentified text</claim-text></claim></claims></fulltext-document></fulltext-documents></world-patent-data>'
		);
		const result = await ops.getClaims('EP1234567B1');
		expect(!result.ok && result.body.error.code).toBe('FULLTEXT_UNAVAILABLE');
	});

	it.each([
		{
			name: 'inline elements between text nodes',
			content: 'A <b>sensor</b> coupled to a <b>processor</b> for detection.',
			expected: 'A sensor coupled to a processor for detection.',
		},
		{
			name: 'trailing restriction after nested subclauses',
			content:
				'A composition comprising:<claim-text>(a) component <b>A</b>;</claim-text><claim-text>(b) component B;</claim-text>wherein the components are substantially free of filler.',
			expected:
				'A composition comprising:\n(a) component A;\n(b) component B;\nwherein the components are substantially free of filler.',
		},
	])('preserves reading order for $name through the real claims read', async ({ content, expected }) => {
		fetch.mockResolvedValue(
			`<world-patent-data><fulltext-documents><fulltext-document><bibliographic-data><publication-reference><document-id><country>EP</country><doc-number>1234567</doc-number><kind>B1</kind></document-id></publication-reference></bibliographic-data><claims lang="EN"><claim num="1"><claim-text>${content}</claim-text></claim></claims></fulltext-document></fulltext-documents></world-patent-data>`
		);
		const result = await ops.getClaimsData('EP1234567B1');
		expect(result.claims).toEqual([{ number: '1', text: expected }]);
	});
});
