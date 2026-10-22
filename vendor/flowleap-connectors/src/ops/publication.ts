/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes } from '../contract/error-codes.js';
import { UpstreamError } from '../errors.js';
import { parsePublicationNumber } from '../patent-number.js';
import { extractBiblio } from './xml-to-json.js';

/** Publication reads preserve kind; application/family lookups may still use cleanDocumentId. */
export function publicationLookup(raw: string): { docId: string; path: string; kind: string } {
  const parsed = parsePublicationNumber(raw);
  if (!parsed) {
    // Name the offending field and value, as the ODP grant lookup does and as
    // normalizeCountryFilter does for `countries`. A 422 is only actionable if
    // it says WHICH input to fix; "Invalid publication number" alone left the
    // caller guessing, and the shape is not obvious — the letter-prefixed US
    // series (D/PP/RE/H/T) ARE accepted, so a rejection here means something
    // genuinely unparseable.
    throw new UpstreamError(
      422,
      ErrorCodes.INVALID_INPUT,
      `Invalid publication number: ${raw}. Expected a country code followed by a serial and an ` +
        `optional kind code, e.g. EP1000000B1, US5443036A, USD1146627S.`,
      { parameter: 'patent_number', value: raw }
    );
  }
  // `serial`, not `digits`: the prefix of a design/plant/reissue number is part
  // of the number, and both the docId and the DOCDB path segment need it.
  const { country, serial, kind } = parsed;
  return {
    docId: `${country}${serial}${kind}`,
    path: kind ? `docdb/${country}.${serial}.${kind}` : `epodoc/${country}${serial}`,
    kind,
  };
}

/** Select and verify a provider publication, never relabel a different kind as the requested one. */
export function selectPublication(data: any, requested: string, fulltext = false): any {
  const target = publicationLookup(requested);
  const node = fulltext
    ? data?.['fulltext-documents']?.['fulltext-document']
    : data?.['exchange-documents']?.['exchange-document'] ?? data;
  const documents = Array.isArray(node) ? node : node ? [node] : [];
  const matching = documents.filter(doc => {
    const identity = extractBiblio(doc).docId;
    const parsed = identity && parsePublicationNumber(identity);
    if (!parsed?.kind) return false;
    const actual = `${parsed.country}${parsed.serial}${parsed.kind}`;
    return target.kind ? actual === target.docId : `${parsed.country}${parsed.serial}` === target.docId;
  });
  if (!matching.length) {
    throw new UpstreamError(404, fulltext ? ErrorCodes.FULLTEXT_UNAVAILABLE : ErrorCodes.NOT_FOUND,
      `The requested publication ${target.docId} was not returned by EPO OPS. No other publication kind was substituted.`);
  }
  return fulltext ? { 'fulltext-documents': { 'fulltext-document': matching } } : matching[0];
}
