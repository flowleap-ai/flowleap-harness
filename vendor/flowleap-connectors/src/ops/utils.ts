// Regex pattern for parsing document ID (country code + number)
const DOCUMENT_ID_REGEX = /^([A-Z]{2})(\d+)$/;

/**
 * Clean a number for legacy application/family OPS lookups.
 *
 * Strips separators (dots/spaces/commas/hyphens/slashes between segments), then a
 * trailing kind code (single letter + optional digit) that directly follows the number.
 * US6021533A → US6021533 ; US.6021533.A → US6021533 ; EP1000000.B1 → EP1000000 ;
 * WO2020/123456 → WO2020123456 ; "US 6,021,533 A" → US6021533
 *
 * Do not use this for publication text or bibliography: publicationLookup uses
 * DOCDB URLs to preserve kind codes for those reads.
 */
export function cleanDocumentId(docId: string): string {
  if (!docId) {
    return docId;
  }
  const compact = docId.trim().toUpperCase().replace(/[.\s,/-]/g, "");
  return compact.replace(/(?<=\d)[A-Z]\d?$/, "");
}

/**
 * Extract country code and number from document ID
 * e.g., EP4001234 -> { country: 'EP', number: '4001234' }
 */
export function parseDocumentId(
  docId: string
): { country: string; number: string } | null {
  const clean = cleanDocumentId(docId);
  const match = clean.match(DOCUMENT_ID_REGEX);
  if (!match) {
    return null;
  }
  return {
    country: match[1],
    number: match[2],
  };
}
