/**
 * CSV Generation Utilities for EPO OPS Patent Data
 *
 * Converts EPO bibliographic data to CSV format for export.
 */

import type { BiblioData } from './types.js';

/**
 * CSV column headers for EPO biblio data
 */
const CSV_HEADERS = [
	'Document ID',
	'Title',
	'Abstract',
	'Applicants',
	'Inventors',
	'Filing Date',
	'Publication Date',
	'Priority Dates',
	'IPC Codes',
	'CPC Codes',
];

/**
 * Options for CSV generation
 */
export interface EPOCSVOptions {
	/** Field delimiter (default: comma) */
	delimiter?: string;
}

/**
 * Escape a field for CSV format
 *
 * @param field - Field value to escape
 * @returns Escaped field value
 */
function escapeCSVField(field: string | null | undefined, delimiter: string = ','): string {
	if (field === null || field === undefined) {
		return '';
	}

	const str = String(field);

	if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}

	return str;
}

/**
 * Convert EPO bibliographic data to CSV string
 *
 * @param items - Map of docId to BiblioData
 * @param options - CSV generation options
 * @returns CSV string
 */
export function epoBiblioToCSV(
	items: Record<string, BiblioData>,
	options: EPOCSVOptions = {}
): string {
	const { delimiter = ',' } = options;

	const rows: string[] = [CSV_HEADERS.join(delimiter)];

	for (const [docId, biblio] of Object.entries(items)) {
		const row = [
			escapeCSVField(biblio.docId || docId, delimiter),
			escapeCSVField(biblio.title, delimiter),
			escapeCSVField(biblio.abstract, delimiter),
			escapeCSVField(biblio.applicants.join('; '), delimiter),
			escapeCSVField(biblio.inventors.join('; '), delimiter),
			escapeCSVField(biblio.dates.filing, delimiter),
			escapeCSVField(biblio.dates.publication, delimiter),
			// The citable identifier per claim (#432) — the raw objects would
			// have rendered as [object Object] the moment the list stopped
			// coming back empty.
			escapeCSVField(
				biblio.dates.priority
					.map(claim => claim.epodocApplication ?? claim.docdbApplication ?? '')
					.filter(Boolean)
					.join('; '),
				delimiter
			),
			escapeCSVField(biblio.ipc.join('; '), delimiter),
			escapeCSVField(biblio.cpc.join('; '), delimiter),
		];

		rows.push(row.join(delimiter));
	}

	return rows.join('\r\n');
}

/**
 * Generate filename for EPO CSV export
 *
 * @param prefix - Filename prefix (default: 'epo_patents')
 * @returns Filename with date stamp
 */
export function generateEPOCSVFilename(prefix: string = 'epo_patents'): string {
	const date = new Date().toISOString().split('T')[0];
	return `${prefix}_${date}.csv`;
}
