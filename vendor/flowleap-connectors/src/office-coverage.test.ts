import { describe, it, expect } from 'vitest';
import {
	TEXT_OFFICE_COVERAGE,
	OFFICES_WITHOUT_TEXT_SOURCE,
	FAMILY_MEMBER_WORKAROUND,
	textOfficesOf,
	servedTextOffices,
	textSourceFor,
	officeList,
	shortCoverageSentences,
	officeCoverageSentence,
	familyMemberWorkaroundParagraph,
	familyMemberWorkaroundNote,
} from './office-coverage.js';

// The module is the ONE place that says which office has text (ADR 0024).
// These tests hold the table and the no-source set consistent with each
// other and with the measured facts of the research doc; the served prose
// is asserted over HTTP in tests/routes (the spec's seam), not here.
describe('office coverage (ADR 0024)', () => {
	it('names no office both as served and as without a text source', () => {
		const served = new Set([...textOfficesOf('epo_ops'), ...textOfficesOf('bigquery')]);
		for (const office of OFFICES_WITHOUT_TEXT_SOURCE) {
			expect(served.has(office), `${office} is in both sets`).toBe(false);
		}
	});

	it('serves claims for EP, WO and US, and description for EP and WO only', () => {
		expect(TEXT_OFFICE_COVERAGE.claims).toEqual([
			{ office: 'EP', source: 'epo_ops' },
			{ office: 'WO', source: 'epo_ops' },
			{ office: 'US', source: 'bigquery' },
		]);
		expect(TEXT_OFFICE_COVERAGE.description).toEqual([
			{ office: 'EP', source: 'epo_ops' },
			{ office: 'WO', source: 'epo_ops' },
		]);
	});

	it('names the eight offices with no text source', () => {
		expect([...OFFICES_WITHOUT_TEXT_SOURCE]).toEqual(['CN', 'JP', 'KR', 'CA', 'AU', 'FR', 'DE', 'GB']);
	});

	it('carries one measured workaround share per office without text, with the data edition', () => {
		expect(FAMILY_MEMBER_WORKAROUND.tool).toBe('get_family');
		expect(FAMILY_MEMBER_WORKAROUND.dataEdition).toBe('PATSTAT 2026 Spring');
		expect(FAMILY_MEMBER_WORKAROUND.shares).toEqual({ CA: 95, AU: 88, FR: 60, DE: 55, GB: 54, JP: 48, KR: 38, CN: 13 });
		expect(Object.keys(FAMILY_MEMBER_WORKAROUND.shares).sort()).toEqual([...OFFICES_WITHOUT_TEXT_SOURCE].sort());
	});

	it('answers the offices one source serves text for', () => {
		expect([...textOfficesOf('epo_ops')]).toEqual(['EP', 'WO']);
		expect([...textOfficesOf('bigquery')]).toEqual(['US']);
	});

	it('answers every office with a text source, in table order, each once', () => {
		expect([...servedTextOffices()]).toEqual(['EP', 'WO', 'US']);
	});

	it('answers the source of one section for one office, and null where the table has none', () => {
		expect(textSourceFor('claims', 'US')).toBe('bigquery');
		expect(textSourceFor('claims', 'EP')).toBe('epo_ops');
		expect(textSourceFor('description', 'US')).toBeNull();
		expect(textSourceFor('description', 'DE')).toBeNull();
		expect(textSourceFor('claims', '')).toBeNull();
	});

	it('lists offices as words with the conjunction asked for', () => {
		expect(officeList(['EP', 'WO', 'US'], 'or')).toBe('EP, WO or US');
		expect(officeList(['EP', 'WO'])).toBe('EP and WO');
		expect(officeList(['US'])).toBe('US');
	});

	it('builds short coverage sentences that name exactly the served offices of a section', () => {
		const claims = shortCoverageSentences('claims');
		for (const token of ['EP', 'WO', 'US', 'EPO OPS', 'BigQuery', 'FULLTEXT_UNAVAILABLE']) expect(claims).toContain(token);
		const description = shortCoverageSentences('description');
		for (const token of ['EP', 'WO', 'EPO OPS', 'FULLTEXT_UNAVAILABLE']) expect(description).toContain(token);
		expect(description).not.toContain('BigQuery');
		// US is a served text office with no description source: the sentence says so beside FULLTEXT_UNAVAILABLE.
		expect(description).toMatch(/\bUS\b[^.]*FULLTEXT_UNAVAILABLE/);
		for (const sentence of [claims, description]) {
			for (const office of OFFICES_WITHOUT_TEXT_SOURCE) expect(sentence).not.toMatch(new RegExp(`\\b${office}\\b`));
			expect(sentence).not.toContain(';');
		}
	});

	it('builds office-coverage sentences that name each served office and the no_source answer, in short sentences', () => {
		const sentence = officeCoverageSentence();
		for (const token of ['EP', 'WO', 'US', 'EPO OPS', 'BigQuery', 'FULLTEXT_UNAVAILABLE', 'no_source']) {
			expect(sentence).toContain(token);
		}
		expect(sentence).not.toMatch(/not wired/i);
		// ASD-STE100: one statement per sentence, no clauses chained with a semicolon.
		expect(sentence).not.toContain(';');
	});

	it('builds a workaround paragraph that names the tool, every share, the edition and the two limits', () => {
		const paragraph = familyMemberWorkaroundParagraph();
		expect(paragraph).toContain('get_family');
		expect(paragraph).toContain('PATSTAT 2026 Spring');
		for (const [office, share] of Object.entries(FAMILY_MEMBER_WORKAROUND.shares)) {
			expect(paragraph).toContain(`${office} ${share}%`);
		}
		expect(paragraph).toContain(familyMemberWorkaroundNote());
		expect(paragraph).not.toContain(';');
	});

	it('builds a note of short sentences that carries both limits and no pending office', () => {
		const note = familyMemberWorkaroundNote();
		expect(note).toMatch(/freedom-to-operate/);
		expect(note).toMatch(/infringement/);
		expect(note).toMatch(/validity/);
		expect(note).toContain(officeList(servedTextOffices(), 'or'));
		expect(note).not.toMatch(/not wired|pending|soon/i);
		expect(note).not.toContain(';');
		// The note and the structured limits are the same text: neither can drift from the other.
		for (const limit of FAMILY_MEMBER_WORKAROUND.limits) expect(note).toContain(limit);
	});
});
