import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWithCacheVisibility } from './cache-visibility.js';
import { createContext } from './context.js';
import { createFakeHost } from './__tests__/fake-host.js';

// Mock the two data sources so this is a pure routing test (no OPS/BigQuery
// calls): the OPS reads by their package path (the context comes first), the
// US source as the host capability.
const opsClaims = vi.fn();
const opsDescription = vi.fn();
const usFulltext = vi.fn();
const opsFamily = vi.fn();

vi.mock('./ops/direct.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('./ops/direct.js')>()),
	getClaims: (_ctx: unknown, ...args: unknown[]) => opsClaims(...args),
	getDescription: (_ctx: unknown, ...args: unknown[]) => opsDescription(...args),
	getFamily: (_ctx: unknown, ...args: unknown[]) => opsFamily(...args),
}));

const routed = await import('./fulltext-router.js');
const ctx = createContext(createFakeHost({ usFulltext: { read: (docId) => usFulltext(docId) } }));
const getClaimsRouted = (docId: string, language?: string) => routed.getClaimsRouted(ctx, docId, language);
const getDescriptionRouted = (docId: string, language?: string) => routed.getDescriptionRouted(ctx, docId, language);

describe('fulltext router', () => {
	beforeEach(() => {
		opsClaims.mockReset();
		opsDescription.mockReset();
		usFulltext.mockReset();
		opsFamily.mockReset();
	});

	it('routes EP/WO to EPO OPS', async () => {
		opsClaims.mockResolvedValue({ ok: true, cached: false, data: { docId: 'EP1000000', lang: 'en', claims: ['1. x'] } });
		const res = await getClaimsRouted('EP1000000B1');
		expect(opsClaims).toHaveBeenCalledWith('EP1000000B1', 'en');
		expect(usFulltext).not.toHaveBeenCalled();
		expect(res.ok && res.data.claims).toEqual(['1. x']);
	});

	it('routes US to BigQuery and maps the result', async () => {
		usFulltext.mockResolvedValue({ ok: true, data: { publicationNumber: 'US-2026069159-A1', claims: ['1. a', '2. b'], description: '' } });
		const res = await getClaimsRouted('US20260069159.A1');
		expect(usFulltext).toHaveBeenCalled();
		expect(opsClaims).not.toHaveBeenCalled();
		expect(res.ok && res.data).toEqual({ docId: 'US-2026069159-A1', lang: 'en', claims: ['1. a', '2. b'] });
	});

	// B6: the disabled-vs-not_found distinction is the point of these tests, so
	// they assert on the structured `reason` field (never message text).
	it('returns FULLTEXT_UNAVAILABLE with reason not_configured when the BigQuery source is off', async () => {
		usFulltext.mockResolvedValue({ ok: false, reason: 'disabled' });
		const res = await getClaimsRouted('US20260069159.A1');
		expect(res.ok).toBe(false);
		expect(!res.ok && res.body.error.code).toBe('FULLTEXT_UNAVAILABLE');
		expect(!res.ok && res.body.error.reason).toBe('not_configured');
		expect(!res.ok && res.status).toBe(404);
	});

	it('returns a clean FULLTEXT_UNAVAILABLE with reason no_source when the US doc is genuinely absent', async () => {
		usFulltext.mockResolvedValue({ ok: false, reason: 'not_found' });
		const res = await getClaimsRouted('US20260069159.A1');
		expect(res.ok).toBe(false);
		expect(!res.ok && res.body.error.code).toBe('FULLTEXT_UNAVAILABLE');
		expect(!res.ok && res.body.error.reason).toBe('no_source');
		expect(!res.ok && res.status).toBe(404);
	});

	it('carries no workaround for a US publication the BigQuery table does not hold: a holding gap, not an office gap', async () => {
		usFulltext.mockResolvedValue({ ok: false, reason: 'not_found' });
		const res = await getClaimsRouted('US20260069159.A1');
		expect(!res.ok && res.body.error.reason).toBe('no_source');
		expect(!res.ok && res.body.error).not.toHaveProperty('workaround');
	});

	it('answers a US design number cleanly, without calling it a non-US document', async () => {
		// canonicalUsPubKey gives a prefixed serial no key, so the BigQuery source
		// reports `no_key` — it IS a US document, the table just cannot key it.
		// The router must still degrade to the same clean verdict.
		usFulltext.mockResolvedValue({ ok: false, reason: 'no_key' });
		const res = await getClaimsRouted('USD1146627S');
		expect(res.ok).toBe(false);
		expect(!res.ok && res.body.error.code).toBe('FULLTEXT_UNAVAILABLE');
		expect(!res.ok && res.body.error.reason).toBe('no_source');
		expect(!res.ok && res.status).toBe(404);
	});

	it('carries the family-member workaround on no_source only, never on not_configured', async () => {
		const noSource = await getClaimsRouted('DE102020215921A1');
		expect(!noSource.ok && noSource.body.error.reason).toBe('no_source');
		expect(!noSource.ok && noSource.body.error.workaround).toMatchObject({ tool: 'get_family' });
		expect(!noSource.ok && typeof (noSource.body.error.workaround as { note: unknown }).note).toBe('string');

		usFulltext.mockResolvedValue({ ok: false, reason: 'disabled' });
		const notConfigured = await getClaimsRouted('US20260069159.A1');
		expect(!notConfigured.ok && notConfigured.body.error.reason).toBe('not_configured');
		expect(!notConfigured.ok && notConfigured.body.error).not.toHaveProperty('workaround');
	});

	it('returns FULLTEXT_UNAVAILABLE (reason no_source) for DE without calling any source', async () => {
		const res = await getDescriptionRouted('DE102020215921A1');
		expect(opsDescription).not.toHaveBeenCalled();
		expect(usFulltext).not.toHaveBeenCalled();
		expect(!res.ok && res.body.error.code).toBe('FULLTEXT_UNAVAILABLE');
		expect(!res.ok && res.body.error.reason).toBe('no_source');
	});

	describe('Euro-PCT fallback', () => {
		const notFound = { ok: false, status: 404, headers: {}, body: { success: false, status: 404, error: { code: 'NOT_FOUND', message: 'OPS error 404' } } };
		// The INPADOC rows of EP4758353A1 (live OPS, 2026-10-11), trimmed.
		const euroPctFamily = {
			ok: true, cached: false, data: {
				docId: 'EP4758353',
				members: [
					{ refType: 'publication', country: 'EP', number: '4758353', kind: 'A1', date: '20260617', publication: 'EP4758353A1', docdbApplication: null },
					{ refType: 'application', country: 'EP', number: '24751719', kind: 'A', date: '20240801', publication: 'EP4758353A1', docdbApplication: 'EP24751719 (A)' },
					{ refType: 'priority', country: 'DE', number: '102023121346', kind: 'A', date: '20230810', publication: 'DE102023121346A1', docdbApplication: 'DE102023121346 (A)' },
					{ refType: 'priority', country: 'EP', number: '2024071923', kind: 'W', date: '20240801', publication: 'WO2025031952A1', docdbApplication: 'EP2024071923 (W)' },
					{ refType: 'publication', country: 'WO', number: '2025031952', kind: 'A1', date: '20250213', publication: 'WO2025031952A1', docdbApplication: null },
					{ refType: 'application', country: 'EP', number: '2024071923', kind: 'W', date: '20240801', publication: 'WO2025031952A1', docdbApplication: 'EP2024071923 (W)' },
				],
			},
		};

		it('serves the WO claims for a Euro-PCT EP with no OPS claims, and labels them', async () => {
			opsClaims.mockImplementation(async (id: string) => id === 'WO2025031952A1'
				? { ok: true, cached: false, data: { docId: 'WO2025031952A1', lang: 'de', claims: ['1. Hydraulischer Aktor'] } }
				: notFound);
			opsFamily.mockResolvedValue(euroPctFamily);
			const res = await getClaimsRouted('EP4758353A1');
			expect(opsFamily).toHaveBeenCalledWith('EP4758353');
			expect(opsClaims).toHaveBeenLastCalledWith('WO2025031952A1', 'en');
			expect(res.ok).toBe(true);
			expect(res.ok && res.data.docId).toBe('WO2025031952A1');
			expect(res.ok && res.data.fallback).toMatchObject({
				reason: 'euro_pct_fulltext_in_wo', requestedDocId: 'EP4758353A1', servedDocId: 'WO2025031952A1',
			});
		});

		it('serves the WO description the same way', async () => {
			opsDescription.mockImplementation(async (id: string) => id === 'WO2025031952A1'
				? { ok: true, cached: false, data: { docId: 'WO2025031952A1', description: 'Beschreibung', language: 'de', availableLanguages: ['DE'], requestedLanguage: 'en' } }
				: notFound);
			opsFamily.mockResolvedValue(euroPctFamily);
			const res = await getDescriptionRouted('EP4758353A1');
			expect(res.ok && res.data.fallback?.servedDocId).toBe('WO2025031952A1');
		});

		it('keeps the 404 for an EP that did not enter from a PCT application', async () => {
			opsClaims.mockResolvedValue(notFound);
			opsFamily.mockResolvedValue({
				ok: true, cached: false, data: {
					docId: 'EP1000000', members: [
						{ refType: 'publication', country: 'EP', number: '1000000', kind: 'A1', date: '20000701', publication: 'EP1000000A1', docdbApplication: null },
						{ refType: 'application', country: 'EP', number: '99999999', kind: 'A', date: '20000101', publication: 'EP1000000A1', docdbApplication: 'EP99999999 (A)' },
						// A PCT priority filed on another date: an earlier PCT, not this EP's parent.
						{ refType: 'application', country: 'US', number: '1999001', kind: 'W', date: '19990101', publication: 'WO2000000001A1', docdbApplication: 'US1999001 (W)' },
					],
				},
			});
			const res = await getClaimsRouted('EP1000000A1');
			expect(res).toBe(notFound);
			expect(opsClaims).toHaveBeenCalledTimes(1);
		});

		it('does not look up the family for a WO 404 or an EP read that succeeds', async () => {
			opsClaims.mockResolvedValueOnce(notFound);
			await getClaimsRouted('WO2025031952A1');
			opsClaims.mockResolvedValueOnce({ ok: true, cached: false, data: { docId: 'EP1000000B1', lang: 'en', claims: ['1. x'] } });
			await getClaimsRouted('EP1000000B1');
			expect(opsFamily).not.toHaveBeenCalled();
		});

		it('keeps the EP 404 when the WO read is a 404 too', async () => {
			opsClaims.mockResolvedValue(notFound);
			opsFamily.mockResolvedValue(euroPctFamily);
			const res = await getClaimsRouted('EP4758353A1');
			expect(res).toBe(notFound);
			expect(opsClaims).toHaveBeenCalledTimes(2);
		});

		it('returns a non-404 WO failure as itself, never as the EP 404', async () => {
			const throttled = { ok: false, status: 429, headers: { 'Retry-After': '30' }, body: { success: false, status: 429, error: { code: 'RATE_LIMITED', message: 'OPS 429' } } };
			opsClaims.mockImplementation(async (id: string) => id === 'WO2025031952A1' ? throttled : notFound);
			opsFamily.mockResolvedValue(euroPctFamily);
			const res = await getClaimsRouted('EP4758353A1');
			expect(res).toBe(throttled);
		});

		it('returns a non-404 family failure as itself, and keeps the EP 404 for a family 404', async () => {
			opsClaims.mockResolvedValue(notFound);
			const down = { ok: false, status: 503, headers: {}, body: { success: false, status: 503, error: { code: 'UPSTREAM_UNAVAILABLE', message: 'OPS down' } } };
			opsFamily.mockResolvedValueOnce(down);
			expect(await getClaimsRouted('EP4758353A1')).toBe(down);
			opsFamily.mockResolvedValueOnce(notFound);
			expect(await getClaimsRouted('EP4758353A1')).toBe(notFound);
			expect(opsClaims).toHaveBeenCalledTimes(2);
		});

		it('never falls back for a B kind: granted claims are not the WO claims', async () => {
			opsClaims.mockResolvedValue(notFound);
			opsFamily.mockResolvedValue(euroPctFamily);
			const res = await getClaimsRouted('EP4758353B1');
			expect(res).toBe(notFound);
			expect(opsFamily).not.toHaveBeenCalled();
		});

		it('keeps the 404 for an A kind the EPO never published', async () => {
			opsClaims.mockResolvedValue(notFound);
			opsFamily.mockResolvedValue(euroPctFamily);
			const res = await getClaimsRouted('EP4758353A2');
			expect(res).toBe(notFound);
			expect(opsClaims).toHaveBeenCalledTimes(1);
		});

		it('falls back for a kindless EP only while the EP has no grant', async () => {
			opsClaims.mockImplementation(async (id: string) => id === 'WO2025031952A1'
				? { ok: true, cached: false, data: { docId: 'WO2025031952A1', lang: 'de', claims: ['1. Hydraulischer Aktor'] } }
				: notFound);
			opsFamily.mockResolvedValueOnce(euroPctFamily);
			const pending = await getClaimsRouted('EP4758353');
			expect(pending.ok && pending.data.fallback?.servedDocId).toBe('WO2025031952A1');

			const granted = { ...euroPctFamily, data: { ...euroPctFamily.data, members: [
				...euroPctFamily.data.members,
				{ refType: 'publication', country: 'EP', number: '4758353', kind: 'B1', date: '20270301', publication: 'EP4758353B1', docdbApplication: null },
			] } };
			opsFamily.mockResolvedValueOnce(granted);
			expect(await getClaimsRouted('EP4758353')).toBe(notFound);
		});

		it('keeps the 404 when two PCT applications were filed on the EP filing date', async () => {
			opsClaims.mockResolvedValue(notFound);
			opsFamily.mockResolvedValue({ ...euroPctFamily, data: { ...euroPctFamily.data, members: [
				...euroPctFamily.data.members,
				{ refType: 'application', country: 'EP', number: '2024071924', kind: 'W', date: '20240801', publication: 'WO2025031953A1', docdbApplication: 'EP2024071924 (W)' },
			] } });
			const res = await getClaimsRouted('EP4758353A1');
			expect(res).toBe(notFound);
			expect(opsClaims).toHaveBeenCalledTimes(1);
		});

		it('reports cached: false on a fallback, because the EP 404 went upstream', async () => {
			opsClaims.mockImplementation(async (id: string) => id === 'WO2025031952A1'
				? { ok: true, cached: true, data: { docId: 'WO2025031952A1', lang: 'de', claims: ['1. x'] } }
				: notFound);
			opsFamily.mockResolvedValue({ ...euroPctFamily, cached: true });
			const { cached } = await runWithCacheVisibility(() => getClaimsRouted('EP4758353A1'));
			expect(cached).toBe(false);
		});
	});
});
