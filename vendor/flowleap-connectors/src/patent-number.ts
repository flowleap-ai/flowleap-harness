/*---------------------------------------------------------------------------------------------
 *  Patent publication-number canonicalization for the US full-text lookup.
 *
 *  EPO OPS and Google Patents BigQuery represent the SAME US publication with
 *  different digit strings: OPS keeps a 7-digit pre-grant serial with its leading
 *  zero (`US20260069159`), while Google Patents drops one leading zero, storing the
 *  same document as `US-2026069159-A1`. Point-matching the raw strings therefore
 *  misses. Both sides are reconciled through ONE canonical key, computed identically
 *  here (TypeScript, at lookup time) and in SQL (at table-build time — see
 *  `usPubKeySql`). The key is kind-aware: pre-grant (kind A*) is `US<year><int serial>`,
 *  granted (kind B*, or a bare number) is `US<int number>`.
 *--------------------------------------------------------------------------------------------*/

/** Lowest 4-digit year we accept as a US pre-grant year prefix. */
const MIN_PREGRANT_YEAR = 1976;
const MAX_PREGRANT_YEAR = 2099;

export interface ParsedNumber {
	country: string;
	/**
	 * Letter prefix on the serial, e.g. 'D' from `USD1146627`, or '' when the
	 * serial is bare. See SERIAL_PREFIXES.
	 */
	serialPrefix: string;
	/**
	 * The NUMERIC part of the serial only, with any serial prefix removed. This
	 * is what the US pre-grant year/serial arithmetic below operates on — never
	 * concatenate it back onto the country code by itself, or a prefixed number
	 * collapses onto a different document (`USD1146627` -> `US1146627`). Use
	 * `serial` for that.
	 */
	digits: string;
	/** The serial as written, prefix included: 'D1146627', '1000000'. */
	serial: string;
	/** Kind code without its trailing digit, e.g. 'A' from 'A1', or '' if absent. */
	kindLetter: string;
	/** Full kind code as written, e.g. 'A1', 'B1', or '' if absent. */
	kind: string;
}

/**
 * Letter prefixes that sit between the country code and the serial. Each names
 * a US publication series with its OWN numbering sequence, so the prefix is
 * part of the number, not decoration: US D1,146,627 (design) and US 1,146,627
 * (utility) are two unrelated patents.
 *
 *   D  design            (kind S)     PP  plant                (kind P)
 *   RE reissue           (kind E)     RX  reissue of an X-patent
 *   H  statutory invention registration (kind H)
 *   T  defensive publication (kind I)  AI  additional improvement
 *   X  pre-1836 X-patent
 *
 * Matched longest-first so `PP`/`RE`/`RX`/`AI` win over the single letters.
 *
 * US ONLY, enforced in the parse. The same letters lead other offices' numbering
 * with an unrelated meaning — `JPH11123456` is Heisei year 11, not a statutory
 * invention registration — so a country-blind prefix would split those wrongly
 * and, worse, silently reroute them in the graph resolver. Non-US era prefixes
 * are out of scope here and stay unparseable, as they were before this support.
 */
const SERIAL_PREFIXES = ['PP', 'RE', 'RX', 'AI', 'D', 'H', 'T', 'X'] as const;

/** The only country whose serials carry a SERIAL_PREFIXES letter prefix. */
const SERIAL_PREFIX_COUNTRY = 'US';

const PUBLICATION_NUMBER_RE = new RegExp(
	`^([A-Z]{2})(${SERIAL_PREFIXES.join('|')})?(\\d+)([A-Z]\\d?)?$`,
);

/**
 * Split a raw publication number into country, serial and kind code.
 * Accepts OPS/DOCDB-ish inputs: `US20260069159`, `US-2026069159-A1`,
 * `US 2026/0069159 A1`, `EP1000000B1`. Returns null when there is no country+serial.
 * Also the parse step of the PATSTAT graph engine's `resolve` (#226).
 *
 * The serial may carry one of the SERIAL_PREFIXES — `USD1146627.S` is a design
 * patent, `USPP12345.P2` a plant patent, `USRE45123.E` a reissue. Those arrive
 * unannounced in any search page over a large US portfolio, so refusing them
 * is not an option: the earlier bare-digits regex returned null for every one,
 * and the resulting throw failed the WHOLE page (see publicationLookup).
 */
export function parsePublicationNumber(raw: string): ParsedNumber | null {
	if (!raw) {
		return null;
	}
	const compact = raw.trim().toUpperCase().replace(/[.\s,/_-]/g, '');
	const match = compact.match(PUBLICATION_NUMBER_RE);
	if (!match) {
		return null;
	}
	const country = match[1];
	const serialPrefix = match[2] ?? '';
	// See SERIAL_PREFIXES: these series are US-only. Another office's number
	// that happens to start with the same letter is not one of them, and a
	// wrong split is worse than no parse.
	if (serialPrefix && country !== SERIAL_PREFIX_COUNTRY) {
		return null;
	}
	const digits = match[3];
	return {
		country,
		serialPrefix,
		digits,
		serial: `${serialPrefix}${digits}`,
		kindLetter: (match[4] ?? '').charAt(0),
		kind: match[4] ?? '',
	};
}

/** Strip leading zeros from a digit string, keeping at least one digit. */
export function stripLeadingZeros(digits: string): string {
	const trimmed = digits.replace(/^0+/, '');
	return trimmed.length > 0 ? trimmed : '0';
}

/**
 * Whether a digit string looks like a US pre-grant publication number: an 11- or
 * 10-digit string whose first four digits are a plausible publication year. Used
 * only when no kind code disambiguates.
 */
export function looksPreGrant(digits: string): boolean {
	if (digits.length < 8) {
		return false;
	}
	const year = Number(digits.slice(0, 4));
	return year >= MIN_PREGRANT_YEAR && year <= MAX_PREGRANT_YEAR;
}

/**
 * Canonical US full-text lookup key for a publication number, or null if the
 * number is not US. Reconciles the OPS/BigQuery leading-zero divergence:
 *
 *   US20260069159 (OPS)      → year 2026, serial 0069159 → 69159 → "US202669159"
 *   US-2026069159-A1 (BQ)    → year 2026, serial 069159  → 69159 → "US202669159"
 *   US-7650331-B1 (granted)  → number 7650331            →         "US7650331"
 *
 * When no kind code is present, the pre-grant vs granted split falls back to the
 * year-prefix heuristic (`looksPreGrant`).
 */
export function canonicalUsPubKey(raw: string): string | null {
	const parsed = parsePublicationNumber(raw);
	if (!parsed || parsed.country !== 'US') {
		return null;
	}
	const { digits, kindLetter, serialPrefix } = parsed;

	// A prefixed series (design D, plant PP, reissue RE, …) has NO key. The
	// materialized table is keyed by usPubKeySql, whose digit capture
	// (`^US-?(\d+)`) does not match a prefixed BigQuery number ('US-D1146627-S')
	// and yields NULL, which CONCAT then propagates — so no row carries such a
	// key and a lookup could only ever miss. Returning a bare-digit key instead
	// would be worse than a miss: it would serve the UTILITY patent's claims
	// (US1146627) for a design number. No key => the full-text router answers
	// its clean FULLTEXT_UNAVAILABLE verdict, which is the truth here.
	if (serialPrefix) {
		return null;
	}

	const isPreGrant = kindLetter === 'A' || (kindLetter === '' && looksPreGrant(digits));
	const isGranted = kindLetter === 'B' || (kindLetter === '' && !looksPreGrant(digits));

	if (isPreGrant && digits.length >= 5) {
		const year = digits.slice(0, 4);
		const serial = stripLeadingZeros(digits.slice(4));
		return `US${year}${serial}`;
	}
	if (isGranted) {
		return `US${stripLeadingZeros(digits)}`;
	}
	// pre-grant but too short to carry a serial — treat the whole thing as a number.
	return `US${stripLeadingZeros(digits)}`;
}

/**
 * The SQL expression that produces the SAME canonical key from a BigQuery
 * `patents-public-data.patents.publications` row, given the publication_number
 * column expression `col` (e.g. `p.publication_number`, form `US-2026069159-A1`).
 * MUST stay in lockstep with `canonicalUsPubKey`. Returns NULL for non-US rows,
 * and — because the digit capture `^US-?(\d+)` finds no digits after the country
 * code, and CONCAT propagates that NULL — also for the prefixed US series
 * (`US-D1146627-S`, `US-RE45123-E`, …). `canonicalUsPubKey` returns null for
 * exactly those, so both sides agree: they are simply not in the table.
 */
export function usPubKeySql(col: string): string {
	// digits = the run between the country prefix and the kind suffix
	const digits = `REGEXP_EXTRACT(${col}, r'^US-?(\\d+)')`;
	const kindLetter = `REGEXP_EXTRACT(${col}, r'-([A-Z])\\d?$')`;
	return `CASE
		WHEN ${col} NOT LIKE 'US-%' THEN NULL
		WHEN COALESCE(${kindLetter}, '') = 'A' AND LENGTH(${digits}) >= 5
			THEN CONCAT('US', SUBSTR(${digits}, 1, 4), CAST(SAFE_CAST(SUBSTR(${digits}, 5) AS INT64) AS STRING))
		ELSE CONCAT('US', CAST(SAFE_CAST(${digits} AS INT64) AS STRING))
	END`;
}
