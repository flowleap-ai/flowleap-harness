/*---------------------------------------------------------------------------------------------
 *  Zero-result hint for search_register (#582): a role-specific name index
 *  (re, op, ia, pa, in) that answers 0 gets a suggestion to retry with nm=,
 *  the index that matches a name in any role. Pure rewrite of the CQL, no
 *  upstream call.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { registerZeroHitHint } from './register-hint.js';

describe('registerZeroHitHint', () => {
	it('swaps a bare role index to nm=', () => {
		expect(registerZeroHitHint('re=Boniberger')).toBe(
			'No results for re=Boniberger. The name can be in a different role (applicant, inventor, representative, opponent). Retry with nm=Boniberger.'
		);
	});

	it('suggests a quoted "First Last" value surname-first, with the surname alone as the alternative', () => {
		expect(registerZeroHitHint('re="Bernhard Boniberger"')).toBe(
			'No results for re="Bernhard Boniberger". The name can be in a different role (applicant, inventor, representative, opponent). Retry with nm="Boniberger, Bernhard" (the register stores names surname-first), or with the surname alone: nm=Boniberger.'
		);
	});

	it('rewrites a First Last value per term inside a compound query', () => {
		expect(registerZeroHitHint('re="Bernhard Boniberger" and pd>=20200101')).toBe(
			'No results for re="Bernhard Boniberger" and pd>=20200101. The name can be in a different role (applicant, inventor, representative, opponent). Retry with nm="Boniberger, Bernhard" and pd>=20200101 (the register stores names surname-first), or with the surname alone: nm=Boniberger and pd>=20200101.'
		);
		expect(registerZeroHitHint('in="Anna Maria Muster" or op=Siemens')).toBe(
			'No results for in="Anna Maria Muster" or op=Siemens. The name can be in a different role (applicant, inventor, representative, opponent). Retry with nm="Muster, Anna Maria" or nm=Siemens (the register stores names surname-first), or with the surname alone: nm=Muster or nm=Siemens.'
		);
	});

	it('keeps a quoted surname-first value as it is', () => {
		expect(registerZeroHitHint('op="Boniberger, Bernhard"')).toBe(
			'No results for op="Boniberger, Bernhard". The name can be in a different role (applicant, inventor, representative, opponent). Retry with nm="Boniberger, Bernhard".'
		);
	});

	it('swaps every role term of a compound query and leaves the other terms as they are', () => {
		expect(registerZeroHitHint('re=Boniberger and pd>=20200101')).toBe(
			'No results for re=Boniberger and pd>=20200101. The name can be in a different role (applicant, inventor, representative, opponent). Retry with nm=Boniberger and pd>=20200101.'
		);
		expect(registerZeroHitHint('(re="Kreuels" or op=Siemens) not in=Muster')).toBe(
			'No results for (re="Kreuels" or op=Siemens) not in=Muster. The name can be in a different role (applicant, inventor, representative, opponent). Retry with (nm="Kreuels" or nm=Siemens) not nm=Muster.'
		);
	});

	it('does not read a role index inside a quoted value or inside a longer index name', () => {
		expect(registerZeroHitHint('ti="in situ"')).toBeUndefined();
		expect(registerZeroHitHint('pn=EP0000000')).toBeUndefined();
		expect(registerZeroHitHint('nm=Boniberger')).toBeUndefined();
		expect(registerZeroHitHint('ti=repair')).toBeUndefined();
	});

	it('falls back to a generic hint when the rewrite is not safe', () => {
		const generic =
			'The name can be in a different role (applicant, inventor, representative, opponent). Retry with the nm= index, which matches a name in any role.';
		expect(registerZeroHitHint('re="Bernhard Boniberger')).toBe('No results for re="Bernhard Boniberger. ' + generic);
		expect(registerZeroHitHint('re within "a b"')).toBe('No results for re within "a b". ' + generic);
	});
});
