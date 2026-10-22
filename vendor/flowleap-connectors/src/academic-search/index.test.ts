import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeHost, hostCredentials, userCredentials, type FakeHost } from '../__tests__/fake-host.js';
import { getCacheKey } from '../cache-key.js';
import { createContext, type ConnectorContext } from '../context.js';
import { ACADEMIC_RESPONSE_SHAPE_VERSION, buildArxivQuery, mergeRanked, parseArxivXML, runAcademicSearch } from './index.js';
import { KEY_REJECTED_REASON } from './reasons.js';

// The host (ADR 0019 C1): an in-memory cache whose writes the tests count, the global
// fetch the tests stub, and the Semantic Scholar key the tests set per case.
let host: FakeHost;
let ctx: ConnectorContext;
let cacheSet: ReturnType<typeof vi.spyOn>;

/** Run `fn` with the caller's own Semantic Scholar key (the backend's forwarded header). */
async function runWithSemanticScholarKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
	host.setCredentials('semanticScholar', userCredentials<'semanticScholar'>({ apiKey: key }));
	return fn();
}

function arxivFeed(entries: Array<{ id: string; title: string; doi?: string; year?: string }>, total = entries.length) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">${total}</opensearch:totalResults>
  ${entries
		.map(
			(e) => `<entry>
    <id>http://arxiv.org/abs/${e.id}</id>
    <published>${e.year ?? '2021'}-03-01T00:00:00Z</published>
    <title>${e.title}</title>
    <summary>An abstract with &lt;100nm films.</summary>
    <author><name>Ada Lovelace</name></author>
    ${e.doi ? `<arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">${e.doi}</arxiv:doi>` : ''}
  </entry>`
		)
		.join('\n')}
</feed>`;
}

function s2Body(papers: Array<{ title: string; doi?: string; arxiv?: string; citations?: number }>, total = 1234) {
	return JSON.stringify({
		total,
		data: papers.map((p, i) => ({
			paperId: `p${i}`,
			title: p.title,
			authors: [{ name: 'Grace Hopper' }],
			year: 2020,
			citationCount: p.citations ?? 10,
			url: `https://www.semanticscholar.org/paper/p${i}`,
			externalIds: { DOI: p.doi, ArXiv: p.arxiv },
		})),
	});
}

type Route = (url: string) => Response;
function stubFetch(routes: { arxiv?: Route; s2?: Route }) {
	const fetchMock = vi.fn(async (url: string) => {
		if (url.includes('export.arxiv.org')) return routes.arxiv!(url);
		if (url.includes('api.semanticscholar.org')) return routes.s2!(url);
		throw new Error(`unexpected ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

beforeEach(() => {
	host = createFakeHost({ fetch: (input, init) => globalThis.fetch(input, init) });
	ctx = createContext(host);
	cacheSet = vi.spyOn(host.cache!, 'set');
	// Retry back-off sleeps would make the 429 cases slow; make them instant.
	vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('buildArxivQuery', () => {
	it('requires every word and drops stopwords', () => {
		expect(buildArxivQuery('solid state electrolyte for a lithium battery')).toBe(
			'all:solid AND all:state AND all:electrolyte AND all:lithium AND all:battery'
		);
	});
	it('keeps quoted phrases as phrases', () => {
		expect(buildArxivQuery('"solid state electrolyte" lithium')).toBe('all:"solid state electrolyte" AND all:lithium');
	});
	it('strips query syntax characters', () => {
		expect(buildArxivQuery('li-ion (anode): graphite!')).toBe('all:li-ion AND all:anode AND all:graphite');
	});
	it('can join with OR for the fallback', () => {
		expect(buildArxivQuery('graphene anode', true)).toBe('all:graphene OR all:anode');
	});
	it('keeps quoted phrases required in the any-word fallback', () => {
		expect(buildArxivQuery('"solid state electrolyte" lithium', true)).toBe('all:"solid state electrolyte" AND all:lithium');
		expect(buildArxivQuery('"solid state electrolyte" lithium anode', true)).toBe(
			'all:"solid state electrolyte" AND (all:lithium OR all:anode)'
		);
	});
	it('reads curly and angled double quotes as quotes, strict and loose', () => {
		expect(buildArxivQuery('\u201Csolid state electrolyte\u201D lithium anode')).toBe(
			'all:"solid state electrolyte" AND all:lithium AND all:anode'
		);
		expect(buildArxivQuery('\u201Csolid state electrolyte\u201D lithium anode', true)).toBe(
			'all:"solid state electrolyte" AND (all:lithium OR all:anode)'
		);
		expect(buildArxivQuery('\u00ABsolid state electrolyte\u00BB lithium', true)).toBe(
			'all:"solid state electrolyte" AND all:lithium'
		);
	});
	it('loose equals strict with phrases only', () => {
		expect(buildArxivQuery('"solid state electrolyte" "lithium anode"', true)).toBe(
			'all:"solid state electrolyte" AND all:"lithium anode"'
		);
	});
	it('returns undefined when nothing searchable remains', () => {
		expect(buildArxivQuery('the of !!')).toBeUndefined();
	});
});

describe('parseArxivXML', () => {
	it('reads total hits, arXiv id, DOI and decodes entities', () => {
		const { papers, totalHits } = parseArxivXML(
			arxivFeed([{ id: '1702.04009v1', title: 'LiPON &amp; ALD', doi: '10.1021/acs.chemmater.7b00805' }], 57)
		);
		expect(totalHits).toBe(57);
		expect(papers[0]).toMatchObject({
			title: 'LiPON & ALD',
			url: 'https://arxiv.org/abs/1702.04009v1',
			arxivId: '1702.04009',
			doi: '10.1021/acs.chemmater.7b00805',
			abstract: 'An abstract with <100nm films.',
			year: '2021',
			source: 'arxiv',
		});
	});
	it('treats an arXiv query error entry as a failure', () => {
		const xml = `<feed><entry><id>http://arxiv.org/api/errors#incorrect_id_format</id><title>Error</title><summary>bad query</summary></entry></feed>`;
		expect(() => parseArxivXML(xml)).toThrow(/arXiv rejected the query/);
	});
});

describe('mergeRanked', () => {
	it('interleaves sources and merges duplicates by DOI, arXiv id and title', () => {
		const merged = mergeRanked([
			[
				{ title: 'Paper A', authors: [], url: 's2/a', source: 'scholar', doi: '10.1/A', citations: 50 },
				{ title: 'Paper B', authors: [], url: 's2/b', source: 'scholar', arxivId: '2101.00001', citations: 40 },
				{ title: 'Paper C: A Study', authors: [], url: 's2/c', source: 'scholar', citations: 30 },
			],
			[
				{ title: 'Paper A (preprint)', authors: [], url: 'ax/a', source: 'arxiv', doi: '10.1/a' },
				{ title: 'Paper B', authors: [], url: 'ax/b', source: 'arxiv', arxivId: '2101.00001' },
				{ title: 'paper c - a study', authors: [], url: 'ax/c', source: 'arxiv', arxivId: '2101.00002' },
				{ title: 'Paper D', authors: [], url: 'ax/d', source: 'arxiv' },
			],
		]);
		expect(merged.map((p) => p.url)).toEqual(['s2/a', 's2/b', 's2/c', 'ax/d']);
		expect(merged[0].alsoIn).toEqual(['arxiv']);
		expect(merged[2]).toMatchObject({ arxivId: '2101.00002', alsoIn: ['arxiv'] });
		expect(merged[3].alsoIn).toBeUndefined();
	});
	it('puts arXiv rank 1 second, not below every cited paper', () => {
		const merged = mergeRanked([
			[1, 2, 3].map((n) => ({ title: `S${n}`, authors: [], url: `s${n}`, source: 'scholar', citations: 1000 })),
			[{ title: 'X1', authors: [], url: 'x1', source: 'arxiv' }],
		]);
		expect(merged.map((p) => p.url)).toEqual(['s1', 'x1', 's2', 's3']);
	});
});

describe('runAcademicSearch', () => {
	it('reports each source, dedupes across them, and caches a clean result', async () => {
		stubFetch({
			arxiv: () => new Response(arxivFeed([{ id: '2101.00001v2', title: 'Shared' }, { id: '2101.00009v1', title: 'Only arXiv' }], 812)),
			s2: () => new Response(s2Body([{ title: 'Shared', arxiv: '2101.00001' }, { title: 'Only S2' }], 9000)),
		});
		const result = await runAcademicSearch(ctx, { query: 'solid electrolyte', maxResults: 10 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.papers.map((p) => p.title)).toEqual(['Shared', 'Only S2', 'Only arXiv']);
		expect(result.data.total).toBe(3);
		expect(result.data.sources).toEqual([
			{ source: 'scholar', status: 'ok', returned: 2, totalHits: 9000 },
			{ source: 'arxiv', status: 'ok', returned: 2, totalHits: 812 },
		]);
		expect(cacheSet).toHaveBeenCalledTimes(1);
	});

	it('keys the cache on the response shape version, so pre-deploy entries are not served', async () => {
		stubFetch({
			arxiv: () => new Response(arxivFeed([{ id: '2101.00009v1', title: 'Only arXiv' }])),
			s2: () => new Response(s2Body([])),
		});
		await runAcademicSearch(ctx, { query: 'solid electrolyte' });
		const [key] = cacheSet.mock.calls[0] as unknown as [string];
		// Pinned to the literal: a bump is deliberate (#568 added the version, #570 bumped it).
		expect(ACADEMIC_RESPONSE_SHAPE_VERSION).toBe(3);
		// The key is the md5 of the params, so the version is checked through the same derivation.
		expect(key).toBe(
			getCacheKey('academic-search', {
				shape: 3,
				query: 'solid electrolyte',
				sources: ['arxiv', 'scholar'],
				maxResults: 10,
				fromYear: undefined,
				toYear: undefined,
			})
		);
	});

	it('names a rate-limited source, returns the rest, and does not cache the partial result', async () => {
		stubFetch({
			arxiv: () => new Response(arxivFeed([{ id: '2101.00009v1', title: 'Only arXiv' }])),
			s2: () => new Response('Too Many Requests', { status: 429, headers: { 'retry-after': '0' } }),
		});
		const result = await runAcademicSearch(ctx, { query: 'solid electrolyte', maxResults: 4 });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.papers).toHaveLength(1);
		expect(result.data.sources[0]).toMatchObject({ source: 'scholar', status: 'rate_limited', returned: 0 });
		expect(result.data.sources[1]).toMatchObject({ source: 'arxiv', status: 'ok' });
		expect(cacheSet).not.toHaveBeenCalled();
	});

	it('fails the call when every source fails', async () => {
		stubFetch({
			arxiv: () => new Response('bad', { status: 400 }),
			s2: () => new Response('nope', { status: 403 }),
		});
		const result = await runAcademicSearch(ctx, { query: 'solid electrolyte' });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(503);
		expect(result.body.error.code).toBe('upstream_unavailable');
		expect(result.body.error.message).toContain('Semantic Scholar (Semantic Scholar answered HTTP 403)');
		expect(cacheSet).not.toHaveBeenCalled();
	});

	it('answers 429 when every source is rate limited', async () => {
		stubFetch({ s2: () => new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }) });
		const result = await runAcademicSearch(ctx, { query: 'x ray', sources: ['scholar'] });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(429);
	});

	it('sends the year filter to both sources, https and relevance-sorted for arXiv, and the S2 key', async () => {
		host.setCredentials('semanticScholar', hostCredentials<'semanticScholar'>({ apiKey: 'k-123' }));
		const fetchMock = stubFetch({
			arxiv: () => new Response(arxivFeed([{ id: '2201.00001v1', title: 'New' }])),
			s2: () => new Response(s2Body([])),
		});
		await runAcademicSearch(ctx, { query: 'graphene anode', maxResults: 5, filter: { fromYear: 2020, toYear: 2022 } });
		const arxivUrl = new URL(fetchMock.mock.calls.find(([u]) => u.includes('arxiv'))![0]);
		expect(arxivUrl.protocol).toBe('https:');
		expect(arxivUrl.searchParams.get('search_query')).toBe(
			'(all:graphene AND all:anode) AND submittedDate:[202001010000 TO 202212312359]'
		);
		expect(arxivUrl.searchParams.get('sortBy')).toBe('relevance');
		expect(arxivUrl.searchParams.get('max_results')).toBe('5');
		const [s2Url, s2Init] = fetchMock.mock.calls.find(([u]) => u.includes('semanticscholar'))! as unknown as [string, RequestInit];
		expect(new URL(s2Url).searchParams.get('year')).toBe('2020-2022');
		expect(new URL(s2Url).searchParams.get('limit')).toBe('5');
		expect((s2Init.headers as Record<string, string>)['x-api-key']).toBe('k-123');
	});

	it("prefers the caller's own Semantic Scholar key over S2_API_KEY", async () => {
		host.setCredentials('semanticScholar', hostCredentials<'semanticScholar'>({ apiKey: 'server-key' }));
		const fetchMock = stubFetch({ s2: () => new Response(s2Body([])) });
		await runWithSemanticScholarKey('user-key', () => runAcademicSearch(ctx, { query: 'user key', sources: ['scholar'] }));
		const [, s2Init] = fetchMock.mock.calls.find(([u]) => u.includes('semanticscholar'))! as unknown as [string, RequestInit];
		expect((s2Init.headers as Record<string, string>)['x-api-key']).toBe('user-key');
	});

	it("names the caller's key when Semantic Scholar rejects it", async () => {
		stubFetch({
			arxiv: () => new Response(arxivFeed([{ id: '2201.00001v1', title: 'Still here' }])),
			s2: () => new Response('forbidden', { status: 403 }),
		});
		const result = await runWithSemanticScholarKey('bad-key', () => runAcademicSearch(ctx, { query: 'rejected key' }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const s2 = result.data.sources.find((r) => r.source === 'scholar')!;
		expect(s2.status).toBe('error');
		// Clients match the structured reason, never the message text (ADR 0014).
		expect(s2.reason).toBe(KEY_REJECTED_REASON);
		expect(s2.message).toContain('rejected your API key');
		expect(s2.message).toContain('HTTP 403');
	});

	it('falls back to any-word arXiv matching when requiring every word finds nothing', async () => {
		const fetchMock = stubFetch({
			arxiv: (url) =>
				new URL(url).searchParams.get('search_query')!.includes(' OR ')
					? new Response(arxivFeed([{ id: '2201.00001v1', title: 'Loose hit' }]))
					: new Response(arxivFeed([], 0)),
		});
		const result = await runAcademicSearch(ctx, { query: 'graphene quantum anode', sources: ['arxiv'] });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.ok && result.data.papers.map((p) => p.title)).toEqual(['Loose hit']);
	});

	it('does not retry arXiv when the loose query equals the strict one (a phrase plus one word)', async () => {
		const fetchMock = stubFetch({ arxiv: () => new Response(arxivFeed([], 0)) });
		const result = await runAcademicSearch(ctx, { query: '"solid state electrolyte" anode', sources: ['arxiv'] });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('search_query')).toBe(
			'all:"solid state electrolyte" AND all:anode'
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.papers).toEqual([]);
		expect(result.data.sources).toEqual([{ source: 'arxiv', status: 'ok', returned: 0, totalHits: 0 }]);
	});

	it('keeps the quoted phrase required in the arXiv fallback', async () => {
		const fetchMock = stubFetch({
			arxiv: (url) =>
				new URL(url).searchParams.get('search_query')!.includes(' OR ')
					? new Response(arxivFeed([{ id: '2201.00002v1', title: 'Phrase kept' }]))
					: new Response(arxivFeed([], 0)),
		});
		const result = await runAcademicSearch(ctx, { query: '"solid state electrolyte" lithium anode', sources: ['arxiv'] });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const queries = fetchMock.mock.calls.map(([u]) => new URL(u).searchParams.get('search_query'));
		expect(queries[0]).toBe('all:"solid state electrolyte" AND all:lithium AND all:anode');
		expect(queries[1]).toBe('all:"solid state electrolyte" AND (all:lithium OR all:anode)');
		expect(result.ok && result.data.papers.map((p) => p.title)).toEqual(['Phrase kept']);
	});
});
