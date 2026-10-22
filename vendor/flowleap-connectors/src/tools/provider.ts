/*---------------------------------------------------------------------------------------------
 *  Patent number provider detection & normalization
 *
 *  The tool facade auto-routes by number shape (like the Patent Connector CLI).
 *  EPO OPS is a worldwide database, so retrieval tools accept any country's
 *  publication number via OPS; detection mainly steers search and the
 *  USPTO-only tools (continuity, office-action citations).
 *--------------------------------------------------------------------------------------------*/

export type DetectedPatentProvider = 'epo_ops' | 'uspto' | 'unknown';

/** Uppercase and strip whitespace, commas, slashes and hyphens. */
export function normalizePatentNumber(input: string): string {
	return input.toUpperCase().replace(/[\s,/-]+/g, '');
}

/**
 * Best-effort provider detection from a patent/application number.
 * - `US…` prefixes and bare 7-8 digit numbers → USPTO
 * - any other two-letter country prefix (EP, WO, DE, JP, …) → EPO OPS
 */
export function detectPatentProvider(input: string): DetectedPatentProvider {
	const normalized = normalizePatentNumber(input);
	if (!normalized) {
		return 'unknown';
	}
	if (normalized.startsWith('US')) {
		return 'uspto';
	}
	if (/^[A-Z]{2}/.test(normalized)) {
		return 'epo_ops';
	}
	// Bare digits: USPTO patent numbers (7-8 digits) or application numbers (8 digits).
	if (/^\d{7,8}$/.test(normalized)) {
		return 'uspto';
	}
	return 'unknown';
}
