/**
 * USPTO Open Data Portal Library — the types of the ODP client.
 *
 * The functions are bound to a host by `createConnectors(host).odp`
 * (../index.ts); this barrel keeps the public type names in one place.
 *
 * @module uspto-odp
 */

export type {
	CitationCategory,
	OfficeActionCategory,
	CitationRecord,
	CitationSearchResponse,
	NormalizedCitation,
	CitationSearchOptions,
	CitationSearchResult,
} from './types.js';

export type {
	ODPSearchRequest,
	ODPApplicationMetaData,
	ODPApplicationRecord,
	ODPSearchResponse,
	ODPSearchError,
	ODPSearchResult,
} from './patent-search.js';
export { parseODPError, ODP_DEFAULT_FIELDS } from './patent-search.js';

export type {
	ODPDownloadOption,
	ODPDocumentRecord,
	ODPDocumentsResponse,
	ODPDocumentsResult,
	ODPDocumentText,
} from './documents.js';

export type { EnrichmentKey, EpoEnrichment } from './enrichment.js';
export { parseEnrichKeys } from './enrichment.js';
