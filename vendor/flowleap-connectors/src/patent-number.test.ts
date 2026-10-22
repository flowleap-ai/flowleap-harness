import { describe, it, expect } from 'vitest';
import { canonicalUsPubKey, parsePublicationNumber } from './patent-number.js';

describe('canonicalUsPubKey', () => {
	it('reconciles the OPS and BigQuery forms of the same US pre-grant publication', () => {
		// OPS keeps the 7-digit serial's leading zero; BigQuery drops it — same doc.
		const ops = canonicalUsPubKey('US20260069159.A1'); // OPS / FlowLeap search form
		const bq = canonicalUsPubKey('US-2026069159-A1'); // Google Patents DOCDB form
		expect(ops).toBe('US202669159');
		expect(bq).toBe('US202669159');
		expect(ops).toBe(bq);
	});

	it('canonicalizes across separators, kind codes, and casing to one key', () => {
		const forms = [
			'US-2025241553-A1',
			'us 2025/241553 a1',
			'US2025241553A1',
			'US-2025241553', // no kind → year-prefix heuristic → pre-grant
		];
		const keys = forms.map(canonicalUsPubKey);
		expect(new Set(keys)).toEqual(new Set(['US2025241553']));
	});

	it('treats granted patents (kind B / short numbers) as plain numbers', () => {
		expect(canonicalUsPubKey('US-7650331-B1')).toBe('US7650331');
		expect(canonicalUsPubKey('US7650331B2')).toBe('US7650331');
		expect(canonicalUsPubKey('US7650331')).toBe('US7650331'); // no kind, not a year prefix
	});

	it('returns null for non-US publications', () => {
		expect(canonicalUsPubKey('EP1000000B1')).toBeNull();
		expect(canonicalUsPubKey('WO2026047639A1')).toBeNull();
		expect(canonicalUsPubKey('')).toBeNull();
		expect(canonicalUsPubKey('not a number')).toBeNull();
	});
});

describe('parsePublicationNumber — letter-prefixed US series', () => {
	it('parses the design number that used to fail a whole search page', () => {
		// USD1146627.S came back inside an ordinary `pa=bayer` page and, being
		// unparseable, took every other hit on that page down with it.
		expect(parsePublicationNumber('USD1146627.S')).toEqual({
			country: 'US',
			serialPrefix: 'D',
			digits: '1146627',
			serial: 'D1146627',
			kindLetter: 'S',
			kind: 'S',
		});
	});

	it('parses the other prefixed series that share the shape', () => {
		const serialOf = (raw: string) => {
			const parsed = parsePublicationNumber(raw);
			return parsed && `${parsed.country}${parsed.serial}${parsed.kind}`;
		};
		expect(serialOf('USPP12345.P2')).toBe('USPP12345P2'); // plant
		expect(serialOf('USRE45123.E')).toBe('USRE45123E'); // reissue
		expect(serialOf('USH1234.H')).toBe('USH1234H'); // statutory invention registration
		expect(serialOf('UST100201.I')).toBe('UST100201I'); // defensive publication
		expect(serialOf('USX8207')).toBe('USX8207'); // X-patent, no kind
		expect(serialOf('USRX123.E')).toBe('USRX123E'); // reissue of an X-patent
		expect(serialOf('USAI50.I')).toBe('USAI50I'); // additional improvement
	});

	it('matches the two-letter prefixes whole, never as their first letter', () => {
		// The alternation is ordered longest-first. If 'R' or 'A' won instead,
		// 'RX123' would read as serial 'X123' under a prefix that is not there.
		expect(parsePublicationNumber('USRX123E')).toMatchObject({ serialPrefix: 'RX', digits: '123' });
		expect(parsePublicationNumber('USAI50I')).toMatchObject({ serialPrefix: 'AI', digits: '50' });
		expect(parsePublicationNumber('USPP12345P2')).toMatchObject({ serialPrefix: 'PP', digits: '12345' });
	});

	it('reads the prefix through the same separator and casing normalization', () => {
		const forms = ['USD1146627S', 'US-D1146627-S', 'us d1146627 s', 'USD1146627.S'];
		expect(new Set(forms.map(f => parsePublicationNumber(f)?.serial))).toEqual(new Set(['D1146627']));
	});

	it('leaves bare serials unprefixed, so nothing else shifts', () => {
		expect(parsePublicationNumber('EP1000000B1')).toMatchObject({
			country: 'EP',
			serialPrefix: '',
			digits: '1000000',
			serial: '1000000',
			kind: 'B1',
		});
	});

	it('still rejects what is genuinely not a publication number', () => {
		expect(parsePublicationNumber('USZ1146627')).toBeNull(); // Z is not a series
		expect(parsePublicationNumber('USD')).toBeNull(); // prefix, no serial
		expect(parsePublicationNumber('not a number')).toBeNull();
		expect(parsePublicationNumber('')).toBeNull();
	});

	it('reads a serial prefix on US numbers ONLY', () => {
		// These are US publication series. The same letters lead other offices'
		// numbering with a different meaning — JPH11123456 is Heisei year 11, not
		// a statutory invention registration — so a country-blind prefix would
		// mis-split them. They stay unparseable, exactly as before this series
		// support landed: the graph resolver then falls back to its applicant
		// text search instead of hunting a publn_nr that does not exist.
		expect(parsePublicationNumber('JPH11123456A')).toBeNull();
		expect(parsePublicationNumber('JPH07123456')).toBeNull();
		expect(parsePublicationNumber('WOX123')).toBeNull();
		expect(parsePublicationNumber('EPD1146627')).toBeNull();
		// The US ones are untouched.
		expect(parsePublicationNumber('USD1146627S')).toMatchObject({ serialPrefix: 'D' });
	});

	it('gives a prefixed US number NO full-text key, rather than the utility patent it shares digits with', () => {
		// USD1146627 and US1146627 are unrelated patents. A bare-digit key would
		// serve the second one's claims for the first.
		expect(canonicalUsPubKey('USD1146627.S')).toBeNull();
		expect(canonicalUsPubKey('USRE45123E')).toBeNull();
		expect(canonicalUsPubKey('US1146627')).toBe('US1146627');
	});
});
