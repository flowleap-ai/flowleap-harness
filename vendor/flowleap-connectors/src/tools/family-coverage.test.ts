/**
 * #450 — the simple-family tool corrects itself in its own output.
 *
 * Fixtures are the real production payloads for EP2110298B1, the document the
 * failure was found on: `/equivalents` answers with three documents and no
 * kind codes, while the extended INPADOC family holds five publications
 * including both B2 grants the reported answer missed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EquivalentsFamilyData, FamilyMember } from '../ops/types.js';
import type { FamilyRepresentatives } from '../representative-publication.js';
import { createFakeHost } from '../__tests__/fake-host.js';

const { getFamilyMock } = vi.hoisted(() => ({ getFamilyMock: vi.fn() }));

// The extended read by its package path; the context comes first, the test sees the document id.
vi.mock('../ops/direct.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../ops/direct.js')>();
	return { ...actual, getFamily: (_ctx: unknown, ...args: unknown[]) => getFamilyMock(...args) };
});

const { createConnectors } = await import('../index.js');
const { attachCoverage, attachRepresentatives, withExtendedFamilyCoverage: withExtendedFamilyCoverageWith } =
	await import('./family-coverage.js');
const ctx = { connectors: createConnectors(createFakeHost()) };
const withExtendedFamilyCoverage = (simple: EquivalentsFamilyData, documentId: string) =>
	withExtendedFamilyCoverageWith(ctx, simple, documentId);

/** POST /v1/tools/get_patent_family EP2110298B1, production, 2026-09-17. */
const SIMPLE: EquivalentsFamilyData = {
	docId: 'EP2110298',
	familyMembers: [
		{ docId: 'US2009261648', docNumber: 'US2009261648' },
		{ docId: 'US2010194184', docNumber: 'US2010194184' },
		{ docId: 'EP2110298', docNumber: 'EP2110298' },
	],
	totalCount: 3,
};

/** `flowleap ops family EP2110298B1 --json`, production, 2026-09-17. */
const EXTENDED: FamilyMember[] = [
	{ refType: 'publication', country: 'EP', number: '2110298', kind: 'A2', date: '20091021', publication: 'EP2110298A2', docdbApplication: null },
	{ refType: 'application', country: 'EP', number: '09250131', kind: 'A', date: '20090119', publication: 'EP2110298B1', docdbApplication: 'EP09250131 (A)' },
	{ refType: 'priority', country: 'US', number: '10374408', kind: 'A', date: '20080416', publication: 'US7722129B2', docdbApplication: 'US10374408 (A)' },
	{ refType: 'publication', country: 'US', number: '2009261648', kind: 'A1', date: '20091022', publication: 'US2009261648A1', docdbApplication: null },
	{ refType: 'application', country: 'US', number: '10374408', kind: 'A', date: '20080416', publication: 'US7722129B2', docdbApplication: 'US10374408 (A)' },
	{ refType: 'publication', country: 'US', number: '7722129', kind: 'B2', date: '20100525', publication: 'US7722129B2', docdbApplication: null },
	{ refType: 'publication', country: 'US', number: '2010194184', kind: 'A1', date: '20100805', publication: 'US2010194184A1', docdbApplication: null },
	{ refType: 'application', country: 'US', number: '75653110', kind: 'A', date: '20100408', publication: 'US8056987B2', docdbApplication: 'US75653110 (A)' },
	{ refType: 'priority', country: 'US', number: '75653110', kind: 'A', date: '20100408', publication: 'US8056987B2', docdbApplication: 'US75653110 (A)' },
	{ refType: 'publication', country: 'US', number: '8056987', kind: 'B2', date: '20111115', publication: 'US8056987B2', docdbApplication: null },
];

/** The `representatives` block of the same production `get_family` payload. */
const REPRESENTATIVES: FamilyRepresentatives = {
	rule: 'first-grant-else-earliest',
	members: [
		{ application: 'EP09250131 (A)', representativePublication: 'EP2110298B1', isGrant: true, publications: ['EP2110298A2', 'EP2110298A3', 'EP2110298B1'] },
		{ application: 'US10374408 (A)', representativePublication: 'US7722129B2', isGrant: true, publications: ['US2009261648A1', 'US7722129B2'] },
		{ application: 'US75653110 (A)', representativePublication: 'US8056987B2', isGrant: true, publications: ['US2010194184A1', 'US8056987B2'] },
	],
	note: 'One entry per family MEMBER (one application)…',
};

// A block body, not a concise one: vitest treats a function RETURNED from
// beforeEach as a teardown callback, so `() => mock.mockReset()` hands it the
// mock itself and calls it after every test.
beforeEach(() => {
	getFamilyMock.mockReset();
});

describe('attachCoverage — EP2110298B1, the case that failed', () => {
	it('names the two grants the simple family left out, and nothing else about the payload moves', () => {
		const result = attachCoverage(SIMPLE, EXTENDED);
		expect(result).toEqual({
			...SIMPLE,
			extendedFamily: {
				tool: 'get_family',
				extendedFamilyPublications: 5,
				missingPublicationCount: 2,
				missingPublications: [
					{ publication: 'US7722129B2', kind: 'B2', isGrant: true },
					{ publication: 'US8056987B2', kind: 'B2', isGrant: true },
				],
				missingGrantCount: 2,
				note:
					'This is the SIMPLE family (3 publications): the same invention republished across offices. ' +
					'The EXTENDED INPADOC family holds 5, including 2 this list does not contain ' +
					'(US7722129B2, US8056987B2). 2 of them are granted patents — a grant and a pre-grant ' +
					'publication are different legal objects, and this list holds only what /equivalents ' +
					'returned. Do not answer a "what is the family / where is this protected / which US ' +
					'members exist" question from this list alone — call get_family for the extended family first.',
			},
		});
	});

	it('matches EP2110298 against EP2110298A2 across the missing kind code', () => {
		// The simple family serves no kind codes at all, so a naive string
		// comparison would report EP2110298A2 as missing too.
		const result = attachCoverage(SIMPLE, EXTENDED);
		expect(result.extendedFamily?.missingPublications.map((m) => m.publication)).not.toContain(
			'EP2110298A2'
		);
	});

	it('says nothing when the simple family already holds every publication', () => {
		const complete = attachCoverage(SIMPLE, EXTENDED.filter((m) => m.kind !== 'B2'));
		expect(complete).toEqual(SIMPLE);
	});

	it('leaves isGrant false for a pre-grant kind rather than guessing', () => {
		const result = attachCoverage(
			{ docId: 'EP2110298', familyMembers: [], totalCount: 0 },
			[EXTENDED[3]]
		);
		expect(result.extendedFamily?.missingPublications).toEqual([
			{ publication: 'US2009261648A1', kind: 'A1', isGrant: false },
		]);
		expect(result.extendedFamily?.missingGrantCount).toBe(0);
		expect(result.extendedFamily?.note).toContain('whether any of them is a grant is unknown');
	});
});

describe('withExtendedFamilyCoverage — the probe never breaks a working read', () => {
	it('attaches the note when the extended read succeeds', async () => {
		getFamilyMock.mockResolvedValue({
			ok: true,
			cached: true,
			data: { docId: 'EP2110298', members: EXTENDED, representatives: REPRESENTATIVES },
		});
		const result = await withExtendedFamilyCoverage(SIMPLE, 'EP2110298B1');
		expect(getFamilyMock).toHaveBeenCalledWith('EP2110298B1');
		expect({
			missingGrants: result.extendedFamily?.missingGrantCount,
			cite: result.representatives?.members.map((m) => m.representativePublication),
		}).toEqual({ missingGrants: 2, cite: ['US7722129B2', 'US8056987B2', 'EP2110298B1'] });
	});

	it('serves the simple family unchanged when the extended read fails', async () => {
		getFamilyMock.mockResolvedValue({
			ok: false,
			status: 429,
			headers: {},
			body: { success: false, status: 429, error: { code: 'rate_limit_exceeded', message: 'EPO throttled' } },
		});
		expect(await withExtendedFamilyCoverage(SIMPLE, 'EP2110298B1')).toEqual(SIMPLE);
	});

	it('serves the simple family unchanged when the extended read throws', async () => {
		getFamilyMock.mockImplementation(async () => {
			throw new Error('socket hang up');
		});
		expect(await withExtendedFamilyCoverage(SIMPLE, 'EP2110298B1')).toEqual(SIMPLE);
	});
});


describe('attachRepresentatives — which number to cite for what this list DID return', () => {
	it('maps every listed publication to its member\u2019s representative', () => {
		const result = attachRepresentatives(SIMPLE, REPRESENTATIVES);
		expect(result.representatives).toEqual({
			rule: 'first-grant-else-earliest',
			members: [
				{ application: 'US10374408 (A)', representativePublication: 'US7722129B2', isGrant: true, publications: ['US2009261648'] },
				{ application: 'US75653110 (A)', representativePublication: 'US8056987B2', isGrant: true, publications: ['US2010194184'] },
				{ application: 'EP09250131 (A)', representativePublication: 'EP2110298B1', isGrant: true, publications: ['EP2110298'] },
			],
			note: expect.stringContaining(
				'3 publications listed here are NOT the representative of their member: cite ' +
					'US7722129B2, US8056987B2, EP2110298B1 instead.'
			),
		});
	});

	it('names no representative for a publication it cannot place, and keeps the row', () => {
		const withStranger = {
			...SIMPLE,
			familyMembers: [...SIMPLE.familyMembers, { docId: 'JP2009123456', docNumber: 'JP2009123456' }],
		};
		const members = attachRepresentatives(withStranger, REPRESENTATIVES).representatives?.members;
		expect(members?.at(-1)).toEqual({
			application: null,
			representativePublication: null,
			isGrant: false,
			publications: ['JP2009123456'],
		});
	});

	it('says nothing when the extended read carried no representatives at all', () => {
		// A pre-#451 family payload out of a warm cache, which is the case
		// OPS_RESPONSE_SHAPE_VERSION 3 exists to make impossible.
		expect(attachRepresentatives(SIMPLE, undefined)).toEqual(SIMPLE);
		expect(attachRepresentatives(SIMPLE, { ...REPRESENTATIVES, members: [] })).toEqual(SIMPLE);
	});
});
