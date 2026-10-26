/*---------------------------------------------------------------------------------------------
 *  search_patents (provider=uspto): the model-facing strings for range_filters,
 *  sort and facets, parsed into the arrays the USPTO ODP search body accepts.
 *
 *  ODP answers 400 "Bad Request" (no detail) to a string in any of these three
 *  fields; it accepts only `rangeFilters: [{ field, valueFrom, valueTo }]`,
 *  `sort: [{ field, order }]` and `facets: [field, …]` (live check 2026-10-26).
 *  The tool keeps one short string form per field, refuses a malformed one at
 *  the input with the expected form and an example, and sends the array form.
 *  A range with only one end, or a reversed range, gets no records from ODP
 *  (400 or an empty result), so both ends are required and from <= to.
 *--------------------------------------------------------------------------------------------*/

import type { ODPRangeFilter, ODPSortField } from '../uspto-odp/patent-search.js';

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const FIELD_PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const INTEGER = /^-?\d+$/;

export const RANGE_FILTERS_FORM =
	'"<field> <from> <to>": a field path, then both ends (dates YYYY-MM-DD or integers), separated by spaces, ' +
	'e.g. "applicationMetaData.filingDate 1900-01-01 2008-04-16" (filed before a 2008-04-17 priority date)';
export const SORT_FORM = '"<field> asc|desc", e.g. "applicationMetaData.filingDate desc"';
export const FACETS_FORM =
	'one field path or a comma-separated list, e.g. "applicationMetaData.applicationTypeLabelName,applicationMetaData.applicationStatusDescriptionText"';

function isCalendarDate(value: string): boolean {
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function refused(param: string, form: string, value: string, why: string): { ok: false; message: string } {
	return { ok: false, message: `${param}: ${why}. Expected ${form}. Got ${JSON.stringify(value)}.` };
}

export function parseRangeFilter(value: string): Parsed<ODPRangeFilter> {
	const parts = value.trim().split(/\s+/);
	if (parts.length !== 3) {
		return refused('range_filters', RANGE_FILTERS_FORM, value, 'expected three space-separated parts');
	}
	const [field, from, to] = parts as [string, string, string];
	if (!FIELD_PATH.test(field)) {
		return refused('range_filters', RANGE_FILTERS_FORM, value, `"${field}" is not a field path`);
	}
	const bothDates = isCalendarDate(from) && isCalendarDate(to);
	const bothIntegers = INTEGER.test(from) && INTEGER.test(to);
	if (!bothDates && !bothIntegers) {
		return refused('range_filters', RANGE_FILTERS_FORM, value, 'both ends must be dates (YYYY-MM-DD) or both integers');
	}
	// ISO dates compare as strings; integers compare as numbers.
	const reversed = bothDates ? from > to : Number(from) > Number(to);
	if (reversed) {
		return refused('range_filters', RANGE_FILTERS_FORM, value, 'the range is reversed (from is after to)');
	}
	return { ok: true, value: { field, valueFrom: from, valueTo: to } };
}

export function parseSort(value: string): Parsed<ODPSortField> {
	const parts = value.trim().split(/\s+/);
	const order = parts[1]?.toLowerCase();
	if (parts.length !== 2 || !FIELD_PATH.test(parts[0]!) || (order !== 'asc' && order !== 'desc')) {
		return refused('sort', SORT_FORM, value, 'expected a field path and asc or desc');
	}
	return { ok: true, value: { field: parts[0]!, order } };
}

export function parseFacets(value: string): Parsed<string[]> {
	const fields = value.split(',').map((field) => field.trim());
	if (fields.some((field) => !FIELD_PATH.test(field))) {
		return refused('facets', FACETS_FORM, value, 'every entry must be a field path');
	}
	return { ok: true, value: fields };
}
