/**
 * USPTO Open Data Portal Types
 *
 * Types for the Enriched Citation API and other ODP APIs.
 */

/**
 * Citation category codes
 * X = Destroys novelty alone
 * Y = Affects inventiveness (combined with other refs)
 * A = Background/technological context
 */
export type CitationCategory = 'X' | 'Y' | 'A';

/**
 * Office action categories
 */
export type OfficeActionCategory =
	| 'CTNF' // Non-final rejection
	| 'CTFR' // Final rejection
	| 'NOA' // Notice of allowance
	| 'EX_Q' // Examiner's answer
	| 'OTHER';

/**
 * Raw citation record from the API
 */
export interface CitationRecord {
	/** Unique record ID */
	id: string;
	/** Patent application number (e.g., "16000001") */
	patentApplicationNumber: string;
	/** Date of the office action */
	officeActionDate: string;
	/** Office action category (CTNF, CTFR, etc.) */
	officeActionCategory: OfficeActionCategory;
	/** Cited document identifier (e.g., "US 20150284881 A1") */
	citedDocumentIdentifier: string;
	/** Country code of cited document */
	countryCode: string;
	/** Publication number of cited document */
	publicationNumber: string;
	/** Kind code of cited document (A1, B1, etc.) */
	kindCode: string;
	/** Citation category (X, Y, A) */
	citationCategoryCode: CitationCategory;
	/** Claims that were rejected */
	relatedClaimNumberText: string;
	/** Specific passages/locations cited */
	passageLocationText: string[];
	/** Whether this was cited by the examiner */
	examinerCitedReferenceIndicator: boolean;
	/** Whether this was cited by the applicant */
	applicantCitedExaminerReferenceIndicator: boolean;
	/** Whether this is non-patent literature */
	nplIndicator: boolean;
	/** Inventor name */
	inventorNameText: string;
	/** Technology center */
	techCenter: string;
	/** Group art unit number */
	groupArtUnitNumber: string;
	/** Work group number */
	workGroupNumber: string;
	/** Quality summary (AOK = OK) */
	qualitySummaryText: string;
	/** Record creation timestamp */
	createDateTime: string;
	/** System user that created the record */
	createUserIdentifier: string;
	/** Obsolete document identifier */
	obsoleteDocumentIdentifier: string;
}

/**
 * API response for citation search
 */
export interface CitationSearchResponse {
	response: {
		numFound: number;
		docs: CitationRecord[];
	};
}

/**
 * Normalized citation for API response
 */
export interface NormalizedCitation {
	/** Unique record ID */
	id: string;
	/** Patent application number */
	applicationNumber: string;
	/** Cited document (patent number or NPL reference) */
	citedDocument: string;
	/** Country code */
	country: string;
	/** Citation category (X = novelty, Y = inventiveness, A = background) */
	category: CitationCategory;
	/** Category description */
	categoryDescription: string;
	/** Rejected claims */
	rejectedClaims: string;
	/** Cited passages/sections */
	citedPassages: string[];
	/** Whether examiner cited this */
	examinerCited: boolean;
	/** Whether applicant cited this */
	applicantCited: boolean;
	/** Whether this is non-patent literature */
	isNPL: boolean;
	/** Office action date */
	officeActionDate: string;
	/** Office action type */
	officeActionType: string;
	/** Inventor name */
	inventor: string;
	/** Tech center */
	techCenter: string;
}

/**
 * Search options for citation queries
 */
export interface CitationSearchOptions {
	/** Number of results (default 100, max 1000) */
	size?: number;
	/** Offset for pagination */
	offset?: number;
	/** Filter by citation category */
	category?: CitationCategory;
	/** Filter by examiner-cited only */
	examinerCitedOnly?: boolean;
	/** Filter by date range */
	dateRange?: {
		from?: string;
		to?: string;
	};
}

/**
 * Search result with metadata
 */
export interface CitationSearchResult {
	success: boolean;
	total?: number;
	data?: NormalizedCitation[];
	error?: string;
	status?: number;
}
