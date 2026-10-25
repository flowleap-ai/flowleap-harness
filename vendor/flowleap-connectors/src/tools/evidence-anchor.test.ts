/*---------------------------------------------------------------------------------------------
 *  The anchor format is the IDE's, byte for byte (S5 D0.2). The expected
 *  strings below are what flowleap-agent-v2's `evidenceAnchor` answers for the
 *  same references; a change on either side must change both.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { evidenceAnchor, evidenceAnchorLabel, evidenceSource, withEvidenceAnchor } from './evidence-anchor.js';

describe('evidenceAnchor()', () => {
	it('joins publication, section, claim number and language with colons, skipping what is absent', () => {
		expect([
			evidenceAnchor({ publicationNumber: 'EP1234567B1', section: 'bibliography' }),
			evidenceAnchor({ publicationNumber: 'EP1234567B1', section: 'abstract' }),
			evidenceAnchor({ publicationNumber: 'EP1234567B1', section: 'claims' }, 'en'),
			evidenceAnchor({ publicationNumber: 'EP1234567B1', section: 'claims', claimNumber: '4' }, 'en'),
			evidenceAnchor({ publicationNumber: 'WO9951190A1', section: 'description' }, 'ja'),
			evidenceAnchor({ publicationNumber: 'US7650331B1', section: 'claims', claimNumber: '12' }),
		]).toEqual([
			'EP1234567B1:bibliography',
			'EP1234567B1:abstract',
			'EP1234567B1:claims:en',
			'EP1234567B1:claims:4:en',
			'WO9951190A1:description:ja',
			'US7650331B1:claims:12',
		]);
	});

	it('treats an empty language as absent, as the IDE does', () => {
		expect(evidenceAnchor({ publicationNumber: 'EP1234567B1', section: 'claims' }, '')).toBe('EP1234567B1:claims');
	});

	it('prints the IDE label around the anchor', () => {
		expect(evidenceAnchorLabel('EP1234567B1:claims:4:en')).toBe('[source anchor: EP1234567B1:claims:4:en]');
	});
});

describe('evidenceSource()', () => {
	it('derives the anchor from the reference and language and carries the exact text', () => {
		const reference = { publicationNumber: 'EP1234567B1', section: 'claims' as const, claimNumber: '1' };
		expect(evidenceSource(reference, '1. A thing.', 'en')).toEqual({
			anchor: 'EP1234567B1:claims:1:en',
			reference,
			language: 'en',
			text: '1. A thing.',
			retrieval: 'returned',
		});
	});

	it('omits text and language when there are none, and marks unsegmented text', () => {
		const reference = { publicationNumber: 'EP1234567B1', section: 'bibliography' as const };
		expect(evidenceSource(reference, undefined)).toEqual({ anchor: 'EP1234567B1:bibliography', reference, retrieval: 'returned' });
		expect(evidenceSource({ ...reference, section: 'claims' }, '1. First.\n3. Uncertain.', 'ja', 'unsegmented')).toMatchObject({
			anchor: 'EP1234567B1:claims:ja',
			retrieval: 'unsegmented',
		});
	});
});

describe('withEvidenceAnchor()', () => {
	it('adds the anchor of the document reference, with the returned language, and nothing else', () => {
		const document = { docId: 'EP1234567B1', documentReference: { publicationNumber: 'EP1234567B1', section: 'claims' as const } };
		expect(withEvidenceAnchor(document, 'en')).toEqual({ ...document, anchor: 'EP1234567B1:claims:en' });
		expect(withEvidenceAnchor({ docId: 'x', documentReference: null })).toEqual({ docId: 'x', documentReference: null });
	});
});
