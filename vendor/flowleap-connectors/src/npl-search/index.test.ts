/*---------------------------------------------------------------------------------------------
 *  search_npl's OpenAlex query build (./index.ts): the type filter
 *  sends each publication type as a clause OpenAlex understands. OpenAlex has
 *  no `type:journal-article` and no longer matches on `type_crossref`, so
 *  journal-article is sent as `type:article` and proceedings-article as
 *  `type:conference-paper` (#565, #569).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContext } from '../context.js';
import { createFakeHost } from '../__tests__/fake-host.js';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

// The retry loop by its package path; the host comes first, the test reads the URL.
vi.mock('../fetch-with-retry.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../fetch-with-retry.js')>()),
	fetchWithRetry: (_host: unknown, ...args: unknown[]) => fetchMock(...args),
}));

import {
	NPL_PUBLICATION_TYPES,
	openAlexTypeFilter,
	runNplSearch as runNplSearchWith,
	type NplPublicationType,
	type NplSearchParams,
} from './index.js';

// No cache on the host: every search reaches the (mocked) fetch.
const ctx = createContext(createFakeHost({ noCache: true }));
const runNplSearch = (params: NplSearchParams) => runNplSearchWith(ctx, params);

function requestedFilter(): string | null {
	const url = new URL(fetchMock.mock.calls[0][0] as string);
	return url.searchParams.get('filter');
}

beforeEach(() => {
	fetchMock.mockReset();
	fetchMock.mockResolvedValue({
		json: async () => ({ meta: { count: 0, page: 1, per_page: 1 }, results: [] }),
	});
});

describe('openAlexTypeFilter', () => {
	it.each<[NplPublicationType, string]>([
		['journal-article', 'type:article'],
		['proceedings-article', 'type:conference-paper'],
		['book-chapter', 'type:book-chapter'],
		['preprint', 'type:preprint'],
		['review', 'type:review'],
		['dissertation', 'type:dissertation'],
		['standard', 'type:standard'],
	])('%s → %s', (type, clause) => {
		expect(openAlexTypeFilter(type)).toBe(clause);
	});

	it('sends every type to the OpenAlex type field, never a Crossref-only name', () => {
		for (const type of NPL_PUBLICATION_TYPES) {
			expect(openAlexTypeFilter(type)).toMatch(/^type:/);
			expect(openAlexTypeFilter(type)).not.toMatch(/^type:(journal|proceedings)-article$/);
		}
	});
});

describe('runNplSearch filter', () => {
	it('sends journal-article as type:article next to the other filters', async () => {
		await runNplSearch({
			query: 'solid state electrolyte',
			filter: { fromYear: 2020, openAccess: true, type: 'journal-article' },
		});
		expect(requestedFilter()).toBe(
			'from_publication_date:2020-01-01,open_access.is_oa:true,type:article'
		);
	});

	it('sends no filter when none is asked for', async () => {
		await runNplSearch({ query: 'solid state electrolyte' });
		expect(requestedFilter()).toBeNull();
	});
});
