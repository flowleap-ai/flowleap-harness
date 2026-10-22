/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parsePublicationNumber } from '../patent-number.js';

/** Navigation into retrieved patent data. Clients choose how to display it; this is not a snapshot. */
export interface DocumentReference {
	publicationNumber: string;
	section: 'bibliography' | 'abstract' | 'claims' | 'description';
	claimNumber?: string;
}

export function patentDocumentReference(number: string, section: DocumentReference['section'] = 'bibliography', country?: string): DocumentReference | null {
	const parsed = parsePublicationNumber(number)
		?? (country && /^[A-Z]{2}$/i.test(country) ? parsePublicationNumber(`${country}${number}`) : null);
	return parsed ? { publicationNumber: `${parsed.country}${parsed.serial}${parsed.kind}`, section } : null;
}

/** Enrich after cache reads so old cached records also receive the additive reference field. */
export function withDocumentReference<T extends { docId: string }>(document: T, section: DocumentReference['section'] = 'bibliography'): T & { documentReference: DocumentReference | null } {
	return { ...document, documentReference: patentDocumentReference(document.docId, section) };
}

/** Links the cited publication, never the citing application or non-patent literature. */
export function withCitationDocumentReference<T extends { citedDocument: string; country: string; isNPL: boolean }>(citation: T): T & { documentReference: DocumentReference | null } {
	return { ...citation, documentReference: citation.isNPL ? null : patentDocumentReference(citation.citedDocument, 'bibliography', citation.country) };
}
