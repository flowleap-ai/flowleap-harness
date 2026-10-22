/*---------------------------------------------------------------------------------------------
 *  NPL resolution: a cited-NPL string, DOI or OpenAlex id → an OpenAlex work.
 *
 *  The strings are real: the four NPL entries of EP2771468A1's citedReferences
 *  as get_bibliography returned them on 2026-10-10. Seam: global fetch (the
 *  house pattern) behind a fake host that reads it at call time, answering
 *  the OpenAlex path each test expects. Every test uses its own reference so
 *  the read-through cache never carries one test's answer into another.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createContext } from '../context.js';
import { createFakeHost } from '../__tests__/fake-host.js';
import {
	parseNplReference,
	pickTitleMatch,
	resolveNplReference as resolveNplReferenceWith,
	resolveNplReferences,
	titleContainment,
	titleSimilarity,
	withResolvedNpl as withResolvedNplWith,
	NPL_ROWS_RESOLVED_PER_CALL,
	type NplResolution,
} from './index.js';
import type { ScholarlyWork } from '../npl-search/index.js';

const ctx = createContext(createFakeHost({ fetch: (input, init) => globalThis.fetch(input, init) }));
const resolveNplReference = (reference: string) => resolveNplReferenceWith(ctx, reference);
const withResolvedNpl = <T extends { citedReferences?: unknown }>(biblio: T) => withResolvedNplWith(ctx, biblio);

const JINEK =
	'- JINEK M. ET AL: "A PROGRAMMABLE DUAL-RNA-GUIDED DNA ENDONUCLEASE IN ADAPTIVE BACTERIAL IMMUNITY (SUPPLEMENTARY MATERIAL)", SCIENCE, vol. 337, no. 6096, pages 816 - 821, XP055067740, DOI: 10.1126/SCIENCE.1225829';
const CONG =
	'- CONG L. ET AL: "MULTIPLEX GENOME ENGINEERING USING CRISPR/CAS SYSTEMS", SCIENCE, vol. 339, no. 6121, 15 February 2013 (2013-02-15), pages 819 - 823, XP055102030';

/** An OpenAlex work as the API returns it (the `select` fields). */
function openAlexWork(id: string, title: string, date: string, doi: string | null = null) {
	return {
		id: `https://openalex.org/${id}`,
		doi: doi ? `https://doi.org/${doi}` : null,
		title,
		abstract_inverted_index: { Functional: [0], genomes: [1] },
		publication_date: date,
		type: 'article',
		cited_by_count: 10,
		open_access: { is_oa: false, oa_url: null },
		authorships: [{ author: { display_name: 'Le Cong' } }],
		primary_location: { source: { display_name: 'Science' } },
		concepts: [],
	};
}

function work(id: string, title: string, date: string): ScholarlyWork {
	return {
		id,
		doi: null,
		title,
		abstract: null,
		publicationDate: date,
		type: 'article',
		citedByCount: 0,
		isOpenAccess: false,
		openAccessUrl: null,
		authors: [],
		source: null,
		concepts: [],
	};
}

/** Stub fetch: `routes` maps a URL predicate to the response body (null = 404). */
function stubOpenAlex(route: (url: URL) => unknown | null) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const body = route(new URL(String(input)));
		return body === null
			? new Response('{"error":"not found"}', { status: 404 })
			: new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('parseNplReference', () => {
	it('reads the title, DOI, XP number and year of an EPO search-report string', () => {
		expect(parseNplReference(JINEK)).toStrictEqual({
			doi: '10.1126/science.1225829',
			openalexId: null,
			title: 'A PROGRAMMABLE DUAL-RNA-GUIDED DNA ENDONUCLEASE IN ADAPTIVE BACTERIAL IMMUNITY (SUPPLEMENTARY MATERIAL)',
			year: null,
			xpNumber: 'XP055067740',
		});
		expect(parseNplReference(CONG)).toMatchObject({ doi: null, year: 2013, xpNumber: 'XP055102030' });
	});

	it('takes the year from the ISO date, not from a page range', () => {
		expect(parseNplReference('X: "Some long title here", J, pages 1998 - 2004, 3 May 2001 (2001-05-03)').year).toBe(2001);
	});

	it('trims sentence punctuation from a DOI but keeps balanced parentheses', () => {
		expect(parseNplReference('see doi:10.1016/S0140-6736(20)30183-5.').doi).toBe('10.1016/s0140-6736(20)30183-5');
		expect(parseNplReference('(DOI 10.1038/nbt.2501)').doi).toBe('10.1038/nbt.2501');
	});

	it('recognises a bare OpenAlex id or URL', () => {
		expect(parseNplReference('W2045435533').openalexId).toBe('W2045435533');
		expect(parseNplReference('https://openalex.org/w2045435533').openalexId).toBe('W2045435533');
	});
});

describe('title matching', () => {
	it('scores the same title in another case and punctuation as identical', () => {
		expect(titleSimilarity('MULTIPLEX GENOME ENGINEERING USING CRISPR/CAS SYSTEMS', 'Multiplex Genome Engineering Using CRISPR/Cas Systems')).toBe(1);
	});

	it('gives a short title no containment score', () => {
		expect(titleContainment('Introduction', 'Smith, Introduction, Nature 2001')).toBe(0);
	});

	it('matches a near-identical title and refuses a year two off', () => {
		const parsed = parseNplReference(CONG);
		const right = work('W1', 'Multiplex Genome Engineering Using CRISPR/Cas Systems', '2013-01-03');
		expect(pickTitleMatch(CONG, parsed, [right])).toMatchObject({ status: 'matched', method: 'title', confidence: 1 });

		const wrongYear = work('W2', 'Multiplex Genome Engineering Using CRISPR/Cas Systems', '2016-01-01');
		const result = pickTitleMatch(CONG, parsed, [wrongYear]);
		expect(result.status).toBe('candidates');
		expect(result.work).toBeNull();
	});

	it('does not choose between two works with the same title', () => {
		const parsed = parseNplReference(CONG);
		const twins = [
			work('W1', 'Multiplex genome engineering using CRISPR/Cas systems', '2013-01-03'),
			work('W2', 'Multiplex genome engineering using CRISPR/Cas systems', '2013-02-15'),
		];
		expect(pickTitleMatch(CONG, parsed, twins).status).toBe('candidates');
	});

	it('answers not_found when nothing is similar', () => {
		const parsed = parseNplReference(CONG);
		expect(pickTitleMatch(CONG, parsed, [work('W9', 'Superconductivity in cuprates', '2013-01-01')]).status).toBe('not_found');
	});
});

describe('resolveNplReference (OpenAlex seam)', () => {
	it('resolves by DOI first', async () => {
		const fetchMock = stubOpenAlex((url) =>
			url.pathname === '/works/doi:10.1126/science.1225829'
				? openAlexWork('W2045435533', 'A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity', '2012-06-29', '10.1126/science.1225829')
				: undefined
		);
		const result = await resolveNplReference(JINEK);
		expect(result.ok).toBe(true);
		const data = (result as { data: NplResolution }).data;
		expect(data).toMatchObject({ status: 'matched', method: 'doi', confidence: 1 });
		expect(data.work).toMatchObject({ id: 'W2045435533', doi: '10.1126/science.1225829', abstract: 'Functional genomes' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('falls back to the title when OpenAlex does not know the DOI', async () => {
		const reference = '- MALI P. ET AL: "RNA-GUIDED HUMAN GENOME ENGINEERING VIA CAS9", SCIENCE, vol. 339, 15 February 2013 (2013-02-15), DOI: 10.9999/UNKNOWN.1';
		stubOpenAlex((url) => {
			if (url.pathname.startsWith('/works/doi:')) return null;
			expect(url.searchParams.get('filter')).toBe('title.search:rna guided human genome engineering via cas9');
			return { results: [openAlexWork('W2064815984', 'RNA-Guided Human Genome Engineering via Cas9', '2013-01-04', '10.1126/science.1232033')] };
		});
		const result = await resolveNplReference(reference);
		expect((result as { data: NplResolution }).data).toMatchObject({ status: 'matched', method: 'title', work: { id: 'W2064815984' } });
	});

	it('answers not_found for an unknown bare DOI without a title search', async () => {
		const fetchMock = stubOpenAlex(() => null);
		const result = await resolveNplReference('https://doi.org/10.9999/nothing.here');
		expect((result as { data: NplResolution }).data.status).toBe('not_found');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('returns the unified error envelope when OpenAlex is down', async () => {
		stubOpenAlex(() => {
			throw new Error('socket hang up');
		});
		const result = await resolveNplReference('"An OpenAlex outage title for the test", 2020');
		expect(result.ok).toBe(false);
	});
});

describe('resolveNplReferences / withResolvedNpl', () => {
	const matched = (reference: string): NplResolution => ({
		reference,
		parsed: parseNplReference(reference),
		status: 'matched',
		method: 'title',
		confidence: 1,
		work: { ...work('W1', 'T', '2013-01-01'), abstract: 'x'.repeat(2000) },
		candidates: [],
	});

	it('keeps a failed lookup on its row and counts it', async () => {
		const { byReference, stats } = await resolveNplReferences(['a', 'b', 'a'], async (r) => {
			if (r === 'b') throw Object.assign(new Error('down'), { code: 'upstream_unavailable' });
			return matched(r);
		});
		expect(stats).toStrictEqual({ references: 2, matched: 1, candidates: 0, notFound: 0, failed: 1, skipped: 0 });
		expect(byReference.get('b')).toMatchObject({ status: 'lookup_failed', error: 'upstream_unavailable' });
		// The row carries an abstract preview, not the whole abstract.
		expect(byReference.get('a')?.work?.abstract?.length).toBe(1201);
	});

	it('skips references past the per-call cap', async () => {
		const references = Array.from({ length: NPL_ROWS_RESOLVED_PER_CALL + 2 }, (_, i) => `ref ${i}`);
		const lookup = vi.fn(async (r: string) => matched(r));
		const { stats } = await resolveNplReferences(references, lookup);
		expect(lookup).toHaveBeenCalledTimes(NPL_ROWS_RESOLVED_PER_CALL);
		expect(stats.skipped).toBe(2);
	});

	it('adds nplWork to the NPL entries of a bibliography and leaves patent entries alone', async () => {
		stubOpenAlex((url) =>
			url.searchParams.get('filter')?.startsWith('title.search:')
				? { results: [openAlexWork('W2', 'Efficient genome editing in zebrafish using a CRISPR-Cas system', '2013-01-29', '10.1038/nbt.2501')] }
				: null
		);
		const biblio = {
			docId: 'EP2771468.A1',
			citedReferences: [
				{ docId: 'WO2014093661', citedBy: 'applicant' },
				{ docId: '', citedBy: 'applicant', npl: '- WOONG Y HWANG ET AL: "EFFICIENT GENOME EDITING IN ZEBRAFISH USING A CRISPR-CAS SYSTEM", NATURE BIOTECHNOLOGY, vol. 31, March 2013 (2013-03-01)' },
			],
		};
		const out = await withResolvedNpl(biblio);
		expect(out.citedReferences[0]).toStrictEqual({ docId: 'WO2014093661', citedBy: 'applicant' });
		expect(out.citedReferences[1]).toMatchObject({ nplWork: { status: 'matched', work: { openalexId: 'W2', doi: '10.1038/nbt.2501' } } });
		expect(out.nplResolution).toMatchObject({ references: 1, matched: 1 });
	});
});
