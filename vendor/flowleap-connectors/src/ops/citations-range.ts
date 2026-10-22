/*---------------------------------------------------------------------------------------------
 *  Forward-citations range rules — single source of the "start-end" range
 *  validation (regex, ordering, max 100) used by the get_citations tool.
 *
 *  Relocated from the retired routes/ops/citations.ts adapter (PRD 0013 T10,
 *  #278): the route died with the provider surface, the rules did not.
 *--------------------------------------------------------------------------------------------*/

export class InvalidRangeError extends Error {}

/** Single source of the "start-end" range rules (regex, ordering, max 100). */
export function parseCitationsRange(rangeParam: string): { start: number; end: number } {
	const rangeMatch = rangeParam.match(/^(\d+)-(\d+)$/);
	if (!rangeMatch) {
		throw new InvalidRangeError('Invalid range format. Use format: start-end (e.g., 1-25)');
	}
	const start = parseInt(rangeMatch[1], 10);
	const end = parseInt(rangeMatch[2], 10);
	if (start < 1 || end < start || end - start + 1 > 100) {
		throw new InvalidRangeError('Invalid range. Max 100 results.');
	}
	return { start, end };
}
