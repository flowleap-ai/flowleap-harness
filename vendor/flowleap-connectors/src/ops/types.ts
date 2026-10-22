/*---------------------------------------------------------------------------------------------
 *  EPO OPS API Type Definitions
 *
 *  TypeScript types for all EPO OPS API responses.
 *  These types ensure type safety and serve as documentation for the API contract.
 *--------------------------------------------------------------------------------------------*/

/**
 * The shape of everything the EPO document module puts on the wire, as a
 * number that rides in every OPS cache key (#433). Bumping it makes every
 * entry written under the old shape unreachable in BOTH cache tiers at once
 * — no flush, no restart, no deploy-time step anyone can forget.
 *
 * BUMP IT IN THE SAME COMMIT as any change to what an OPS read returns: a
 * field added, removed or renamed; the meaning or format of a value changed
 * (#431 turned DOCDB application numbers into publication numbers in
 * `extractFamilyMembers`); a section appearing or disappearing. A change to
 * WHICH documents come back, or to a TTL, is not a shape change.
 *
 * Why it is not optional: OPS entries live 12 hours to 7 days
 * (`EPO_CACHE_TTL_SECONDS`), and #431 shipped correct and kept serving the
 * pre-fix family shape for the full 24-hour family TTL to anyone who had
 * asked that question before the deploy. The symptom — a green deploy that
 * still answers wrongly — is indistinguishable from a failed one, and the two
 * were told apart only by finding a document that happened to be cold.
 *
 * Why module-wide rather than per-datum: OPS extractors are shared, so a
 * shape change crosses datums (`extractCitedReference` feeds biblio AND
 * citations; the legal-event walkers feed legal AND family-legal), and a
 * per-datum table invites bumping one and missing its sibling. The cost is
 * accepted knowingly: a bump cold-starts every EPO read, including the 7-day
 * figure binaries and the heavy claims/description fetches, against paid EPO
 * quota. A datum that cannot afford that keeps the finer lever the module
 * already uses — a `-vN` suffix in its own datum string
 * (`publication-v4:claims`, `legal-v3`). Those suffixes are why some datums
 * survived earlier shape changes and `family`, which never had one, did not.
 *
 * The OPS counterpart of GRAPH_RESPONSE_SHAPE_VERSION
 * (`lib/patstat-graph/types.ts`), deliberately the same mechanism so the two
 * paths do not diverge again.
 *
 * Initial value 1 (#433). The key format changed with it, so shipping the
 * mechanism cleared the #431 residue the issue was filed over.
 *
 * 2 — #432: every priority claim in the biblio read gained
 * `epodocApplication`, `docdbApplication`, `originalApplication` and `kind`,
 * and `dates.priority` stopped coming back empty. The first bump of this
 * constant, and the one that shows what it is for: without it, every
 * bibliography cached between #434's deploy and #432's would keep serving the
 * empty list for the full 24-hour biblio TTL, so the fix would look like it
 * had not shipped on exactly the documents anyone had already looked at.
 *
 * 3 — #451: the INPADOC family read (`family` datum) gained
 * `representatives`, the per-member representative publication, and the
 * simple-family read now READS that key off the cached extended payload to
 * name a representative for each row it returns. That second half is what
 * makes the bump load-bearing rather than tidy: without it, every family
 * cached before the deploy answers the probe with `representatives:
 * undefined`, and the simple read silently serves no representatives for the
 * full 24-hour family TTL — on exactly the documents anyone had already asked
 * about. #450's coverage block deliberately did NOT bump this, because it
 * composed outside the cache from two artifacts that did not change; that
 * reasoning (recorded in `tools/family-coverage.ts`) ends here, as it said it
 * would.
 *
 * 4 — #455: the family read's `members` list stopped deduplicating on
 * country+number, which had been discarding every republication of a document
 * number and therefore, usually, the GRANT — EP2110298B1 was absent from the
 * member list of its own family. Two things make the bump load-bearing rather
 * than tidy, and both are the kind that would otherwise look like a failed
 * deploy:
 *
 *   - It is a VALUES change on the cached artifact (rows reappear), not a
 *     field addition, so nothing about a warm entry looks stale. A family
 *     cached before the deploy keeps serving the list with the grant missing
 *     for the full 24-hour family TTL, on exactly the documents anyone had
 *     already asked about.
 *   - The simple-family read's `extendedFamily` coverage block (#450) is
 *     computed from this cached `members` list, so a warm entry also
 *     under-reports what the simple family omits — by 16 publications on
 *     EP2170959B1 — and that block is the thing telling an agent it is holding
 *     the narrow answer.
 *
 * `memberCount` and `recordCount` were added in the same commit and would have
 * required the bump on their own. GRAPH_RESPONSE_SHAPE_VERSION is deliberately
 * NOT touched: nothing in the graph response moved, and its TTL is a year.
 *
 * 5 — #548: every cited reference in the biblio read (`citedReferences`)
 * gained `categoryClaims`, each search-report category paired with its own
 * claim list. A field addition on a cached artifact: without the bump, every
 * bibliography cached before the deploy serves no pairs for the full biblio
 * TTL, and the examiner_baseline cells built from it keep the combined `X,A`
 * label on exactly the documents anyone had already read.
 *
 * 6 — #572 follow-up: the register biblio read changed what it returns.
 * `opponents` come from the current opposition block only, with the real
 * `filingDate` and a new `status`; `representatives` follow the change date,
 * so the current block is served and not the last published one;
 * `representativesChangeDate` is new; `dates` read the EP references instead
 * of null. The read had no caller before #572 (2026-10-11 06:40Z), so the
 * entries at risk are the ones written since; the rule is the same.
 *
 * 7 — #575 (2026-10-11): the claims splitter recognizes the printed claims headings (Ansprüche,
 * Claims, Revendications, …) beside the Japanese one and reads line starts
 * behind them, so a text-only WO whose paragraphs break at pages now serves
 * numbered claims where it served one unsegmented block. A cached block for
 * such a document would otherwise stay unaddressable for the claims TTL.
 *
 * 8 — #583 (2026-10-15): the register reads (`register-biblio`, and each row
 * of `register-search`) collect `opponents` across every opposition block,
 * not the current block only, and add `oppositionOutcome`. A VALUES change
 * on a cached artifact: an opposed patent whose current block is the
 * decision (EP3414489, "Opposition rejected") was cached with no opponent
 * and would keep answering none for the register TTL.
 */
export const OPS_RESPONSE_SHAPE_VERSION = 8;

export type {
	FamilyRepresentatives,
	RepresentativeMember,
} from '../representative-publication.js';
import type { FamilyRepresentatives } from '../representative-publication.js';

// ============================================================================
// Common Types
// ============================================================================

/**
 * Standard success response wrapper
 */
export interface OpsSuccessResponse<T> {
	success: true;
	data: T;
	cached: boolean;
	executionTimeMs?: number;
}

/**
 * Standard error response
 */
export interface OpsErrorResponse {
	success: false;
	error: string;
	code?: string;
	status: number;
}

/**
 * Union type for API responses
 */
export type OpsResponse<T> = OpsSuccessResponse<T> | OpsErrorResponse;

/**
 * Legacy error response (for backwards compatibility)
 */
export type ErrorResponse = {
	error: string;
	status?: number;
};

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResultItem {
	docId: string;
	title: string | null;
	abstract: string | null;
	applicants: string[];
	publicationDate: string | null;
}

export interface SearchResponse {
	/**
	 * OPS's count for the query that was actually sent (`effectiveQuery`). With
	 * a country filter that is the count of the FILTERED match set, because the
	 * filter rides the CQL.
	 */
	total: number;
	/** Documents actually returned in `docs` on this page. */
	returned?: number;
	/**
	 * The CQL actually sent to OPS. Equal to the caller's query when no country
	 * filter applies; otherwise the query wrapped with the `pn any "…"` clause.
	 */
	effectiveQuery?: string;
	/** The country whitelist that was applied to this search, when one was. */
	countryFilter?: string[];
	range: {
		begin: number;
		end: number;
	};
	docs: string[] | SearchResultItem[];
}

export interface SearchRequest {
	query: string;
	range?: string;
	details?: boolean;
}

// ============================================================================
// Bibliographic Data Types
// ============================================================================

/**
 * One entry of a publication's own `references-cited` block (EPO OPS
 * bibliography). Applicant-cited entries are the art the applicant disclosed;
 * examiner-cited entries come from a search report and carry the X/Y/A
 * category, the claims they were cited against, and the relevant passages.
 */
export interface CitedReference {
	/** epodoc publication number when present, else country+number+kind from docdb. */
	docId: string;
	kind?: string;
	date?: string;
	citedBy: 'applicant' | 'examiner' | 'unknown';
	/** cited-phase attribute, e.g. national-search-report. */
	phase?: string;
	/** X/Y/A (and D when the document is also cited in the application) when present. */
	category?: string;
	/**
	 * rel-claims text, e.g. "1-7,10-17,26,27": the FIRST list of the citation,
	 * verbatim. With several categories it is the first category's claims only;
	 * read `categoryClaims` for the others.
	 */
	relevantClaims?: string;
	/**
	 * Each category with its own rel-claims, in document order, e.g. X → "13",
	 * A → "1,5,9" (#548). Present only when every category has exactly one claim
	 * list, so the pairing is certain; absent otherwise.
	 */
	categoryClaims?: { category: string; claims: string | null }[];
	/** rel-passage/passage entries, in document order. */
	relevantPassages?: string[];
	/** nplcit text when the citation is non-patent literature. */
	npl?: string;
}

/**
 * One priority claim of a published document, as OPS serves it in the biblio
 * read's `priority-claims` block.
 *
 * Unlike `/family/publication`, this endpoint serves several `document-id`
 * variants per claim, and they are not equally usable (#432, measured across
 * five documents):
 *
 * - `epodoc` is present on EVERY claim and always well-formed
 *   (`<CC><4-digit year><serial>[<kind>]`), so it is the outward identifier.
 * - `docdb` is always present too, in DOCDB's own format — see
 *   {@link DocdbApplicationNumber} for why that is not a number to cite.
 * - `original` is absent on roughly half the claims and, when present, is
 *   whatever the office wrote: a complete "62/558,339" on one document, a
 *   bare "103744" with no series code on another.
 *
 * None of these is resolved to a publication. A biblio read knows the
 * application a document claims priority from, not what that application
 * published as — unlike the family read, which has sibling publication
 * references to resolve against (#431).
 */
export interface PriorityClaim {
	/** Filing date of the priority application, YYYYMMDD as OPS writes it. */
	date: string | null;
	/** Office the priority filing was made at, e.g. "US". */
	country: string;
	/**
	 * The EPO's canonical application identifier, e.g. "US20080103744" — the
	 * one to cite. Searchable at the office and in Espacenet, and the only
	 * variant OPS serves on every claim. null only if OPS omits it.
	 */
	epodocApplication: string | null;
	/** DOCDB's application-number format — see {@link DocdbApplicationNumber}. */
	docdbApplication: DocdbApplicationNumber | null;
	/**
	 * The office's own string, verbatim and unparsed, when OPS serves one.
	 *
	 * NEVER cite it alone and never derive a number from it: it carries no
	 * guaranteed format and can be incomplete. EP2110298's US priority serves
	 * "103744" here — the serial with the series code stripped, which reads
	 * like a whole number and is not one. WO2019055630's serves the complete
	 * "62/558,339". There is no field saying which kind you got.
	 */
	originalApplication: string | null;
	/** DOCDB kind code. "P" marks a US provisional, which never publishes. */
	kind: string | null;
}

export interface BiblioData {
	docId: string;
	title: string | null;
	abstract: string | null;
	applicants: string[];
	inventors: string[];
	ipc: string[];
	cpc: string[];
	dates: {
		filing: string | null;
		publication: string | null;
		priority: PriorityClaim[];
	};
	/** The publication's own references-cited block, when OPS supplies one. */
	citedReferences?: CitedReference[];
}

export interface BiblioBulkResponse {
	items: Record<string, BiblioData>;
	errors?: Record<string, string>;
}

// ============================================================================
// Abstract Types
// ============================================================================

export interface AbstractResponse {
	docId: string;
	lang: string | null;
	abstract: string | null;
}

// ============================================================================
// Fulltext Types
// ============================================================================

export interface FulltextInquiryResponse {
	docId: string;
	available: {
		claims: boolean;
		description: boolean;
	};
	languages: {
		claims: string[];
		description: string[];
	};
}

export interface ClaimsResponse {
	/** Source claims section whose numbering could not be established safely. */
	unsegmentedText?: string;
	numberedClaims?: { number: string; text: string }[];
	docId: string;
	lang: string;
	claims: string[];
}

export interface DescriptionResponse {
	docId: string;
	lang: string;
	description: string;
}

// ============================================================================
// Family Types
// ============================================================================

/*
 * ── Application numbers: DOCDB's is not the office's (#419) ──────────────────
 */

/**
 * An application number in DOCDB's OWN format, rendered `<country><doc-number>
 * (<kind>)`, e.g. "US10374408 (A)".
 *
 * NOT the number the office files under, and for US NOT the USPTO application
 * number: US DOCDB writes a 6-digit serial followed by the 2-digit filing
 * year, so "US10374408 (A)" is USPTO application 12/103,744 filed 2008-04-16.
 * It is a real, correctly stored identifier — it is simply not one a reader
 * can look up, so it never stands alone as the outward number. Cite
 * {@link FamilyMember.publication} instead.
 *
 * The OPS counterpart of the PATSTAT `DocdbApplicationNumber` in
 * `lib/patstat-graph/types.ts`, deliberately rendered the same way so a report
 * that mixes graph output and OPS output shows one string for one thing.
 *
 * EP is the case that hides the bug: there DOCDB's format IS the EP
 * application number ("EP09250131"), so an EP-only family looks right.
 */
export type DocdbApplicationNumber = string;

/**
 * One reference inside an INPADOC family: a publication, the application it
 * issued from, or a priority filing it claims.
 *
 * `/family/publication` is the one OPS read that serves application and
 * priority references with a `docdb` document-id and NO `epodoc` or `original`
 * sibling (the biblio endpoint serves all three). So on an `application` or
 * `priority` member there is no office-format number in the payload at all,
 * and the number OPS does give reads like a filing number without being one.
 */
export interface FamilyMember {
	refType: 'publication' | 'application' | 'priority';
	country: string;
	/**
	 * @deprecated #419 — the doc-number exactly as OPS wrote it for this
	 * refType, which is the value this key has always carried. Citable on a
	 * `publication` member; on an `application` or `priority` member it is
	 * DOCDB's application number with no country code and no marker saying so
	 * — the shape that let a dossier publish "Priority: US application
	 * 10374408". Read `publication` for a number a reader can verify, or
	 * `docdbApplication` for this same value under a name that says what it
	 * is. Removed once the CLI passthrough stops printing it.
	 */
	number: string;
	kind: string | null;
	date: string | null;
	/**
	 * The citable publication number for this member, e.g. "US7722129B2".
	 *
	 * On a `publication` member it is that publication. On an `application` or
	 * `priority` member it is the application's first grant among the family's
	 * publications, else its earliest publication — US10374408 resolves to
	 * US7722129B2, the grant a reader can look up. null when nothing in the
	 * family publishes that application: a provisional or an unpublished
	 * priority filing has no number to cite, and that is the honest answer.
	 */
	publication: string | null;
	/**
	 * DOCDB's application-number format — see {@link DocdbApplicationNumber}.
	 * null on a `publication` member, which carries no application number.
	 */
	docdbApplication: DocdbApplicationNumber | null;
}

/**
 * The extended (INPADOC) family, at BOTH grains, counted separately (#455).
 *
 * A family MEMBER is one application; a family RECORD is one row OPS served.
 * The payload carries both because each answers a different question, and the
 * two were being confused: `members` is named for the first and holds the
 * second, which is how EP2110298B1 went missing from the member list of its
 * own family for a year. The counts below state which is which in the payload
 * itself, so a reader never has to infer the grain from a length.
 *
 * Read {@link representatives} to answer "which members exist and did they
 * grant". Read {@link members} for the rows underneath — publication dates,
 * priority filings, the DOCDB application of each.
 */
export interface FamilyResponse {
	docId: string;
	familyId?: string;
	/**
	 * The family RECORDS: publication, application and priority rows,
	 * deduplicated by country + number + kind. NOT one row per member — see
	 * {@link representatives} for that, and {@link recordCount} /
	 * {@link memberCount} for how many of each this family has.
	 *
	 * Kept at record grain deliberately (#455): the shipped consumers compute
	 * on `refType` and `date` here, and the member-grain view they render is
	 * {@link representatives}, which has held it since #451. Reshaping this key
	 * would have repurposed a field consumers already compute on, which is the
	 * one thing responses here never do (#419) — so the defect was fixed in the
	 * VALUES (the grant is no longer deduplicated away) and the grain was made
	 * explicit rather than swapped underneath a name.
	 */
	members: FamilyMember[];
	/**
	 * The representative publication of each family MEMBER — one entry per
	 * application (#451).
	 *
	 * This is the member list. `members` above is the row list it was computed
	 * from, and because it is computed from the RAW OPS response it was already
	 * complete while `members` was dropping grants (#455).
	 *
	 * Read this to answer "which number should I cite for this member", which
	 * is the question `members` alone was being made to answer and got wrong —
	 * see `lib/representative-publication.ts` for the rule and for why three
	 * surfaces had three answers.
	 */
	representatives: FamilyRepresentatives;
	/**
	 * How many MEMBERS this family has — applications, i.e.
	 * `representatives.members.length`. The number to report as "the family
	 * has N members".
	 */
	memberCount: number;
	/**
	 * How many RECORDS back that member list — `members.length`. Reported
	 * beside {@link memberCount} rather than left implicit, because a member
	 * count alone hides the reshaping: EP2110298 is 3 members from 12 records,
	 * and a reader told only "3" cannot tell that from a 3-record family.
	 */
	recordCount: number;
}

// ============================================================================
// Legal Status Types
// ============================================================================

export interface LegalEvent extends LegalEventDetailFields {
	code: string;
	date: string;
	country: string | null;
	text: string | null;
	gazette?: {
		number: string | null;
		date: string | null;
	};
}

/**
 * The `L500EP` detail block of one INPADOC legal event, shared by the per-document and
 * the per-family event shapes — the same OPS block feeds both, so they must not drift.
 */
export interface LegalEventDetailFields {
	/** Contracting state the event applies to (OPS `L501EP`), e.g. `DE` for an EP patent lapsed in Germany. */
	state?: string;
	/** Date the event took effect (OPS `L525EP`), `YYYY-MM-DD`. */
	effectiveDate?: string;
	/** Free-format reason text for the event (OPS `L510EP`). */
	detail?: string;
	/** Date an annual fee was paid (OPS `L518EP`), `YYYY-MM-DD`. */
	paymentDate?: string;
	/** Year of fee payment for a renewal-fee event (OPS `L520EP`). */
	feeYear?: number;
	/** Designated contracting states of an AK event (OPS `L507EP`) — the EPC states an EP filing covers. */
	designatedStates?: string[];
	/** Extension/validation states of an AX event (OPS `L524EP`, labelled "Validation States"). */
	extensionStates?: string[];
}

export interface LegalResponse {
	docId: string;
	events: LegalEvent[];
	/**
	 * The EPC states this filing designates, rolled up from the AK event with the latest
	 * date — for an EP regional filing this IS its designated-state coverage, which no
	 * other read carries (family members name offices, not designations). Empty for a
	 * document with no AK event, e.g. any non-EP publication.
	 */
	designatedStates: string[];
	/** Extension/validation states, rolled up from the AX event with the latest date. Empty when there is none. */
	extensionStates: string[];
}

// ============================================================================
// Classification Types
// ============================================================================

export interface CpcClassification {
	code: string;
	title: string | null;
	level: 'section' | 'class' | 'subclass' | 'group' | 'subgroup';
	notes?: string[];
	children?: string[];
	parents?: string[];
}

export interface CpcSearchResponse {
	query: string;
	total: number;
	results: Array<{
		code: string;
		title: string | null;
		relevance?: number;
	}>;
}

// ============================================================================
// Number Conversion Types
// ============================================================================

export interface NumberConvertResponse {
	input: string;
	inputFormat: 'epodoc' | 'docdb' | 'original';
	outputFormat: 'epodoc' | 'docdb';
	converted: string;
}

// ============================================================================
// Images Types
// ============================================================================

export interface ImageInfo {
	format: string;
	pages: number;
	url: string;
}

export interface ImagesResponse {
	docId: string;
	images: ImageInfo[];
}

// ============================================================================
// Figures Types (Enhanced Images API)
// ============================================================================

/**
 * One drawing PAGE of a publication. A page is not a figure: one page can hold
 * several figures (FIG. 1, FIG. 2a, ...), so there is no figure label (#589).
 */
export interface FigureData {
	/** 1-based page number in the EPO image document. */
	page: number;
	format: 'png' | 'jpeg' | 'tiff' | 'pdf';
	base64?: string; // Only present when include_images=true
	/** Pixel width; present with fit=compact. */
	width?: number;
	/** Pixel height; present with fit=compact. */
	height?: number;
	/** Encoded size in bytes (before base64); present with fit=compact. */
	bytes?: number;
}

/**
 * Response from figures endpoint
 */
export interface FiguresResponse {
	docId: string;
	totalFigures: number;
	availableFormats: string[];
	/** 1-based page where the DRAWINGS section starts (earlier pages are cover/biblio/description). */
	drawingStartPage?: number;
	figures: FigureData[];
	/** fit=compact only: true when the response budget stopped the page list early. */
	truncated?: boolean;
	/** fit=compact only: the requested pages that were not returned, in request order. */
	remainingPages?: number[];
}

/**
 * One compact drawing page (fit=compact, #589): the encoded image and its
 * size, as cached by getFigurePageCompact.
 */
export interface CompactFigurePage {
	base64: string;
	format: 'png' | 'jpeg';
	width: number;
	height: number;
	/** Encoded size in bytes (before base64). */
	bytes: number;
}

/**
 * Internal type for parsed image inquiry response
 */
export interface ImageInquiryData {
	docId: string;
	formats: Array<{
		format: string;
		pages: number;
		link: string;
		availableFormats?: string[];
		drawingStartPage?: number;
		/** Every document section by name with its 1-based start page (#589). */
		sections?: Record<string, number>;
	}>;
}

// ============================================================================
// Equivalents Types
// ============================================================================

export interface EquivalentPatent {
	country: string;
	number: string;
	kind: string | null;
}

export interface EquivalentsResponse {
	docId: string;
	equivalents: EquivalentPatent[];
}

// ============================================================================
// Register Types (EP Register)
// ============================================================================

/**
 * A party named in the EP Register (a representative or an opponent): the
 * register's `addressbook` flattened. `address` keeps the register's own lines
 * in order; `country` is the address country, not a nationality.
 */
export interface RegisterParty {
	name: string;
	country: string | null;
	address: string[];
}

export interface RegisterOpponent extends RegisterParty {
	/** YYYYMMDD the opposition was filed (`date-opposition-filed`), when the register records it. */
	filingDate: string | null;
	/**
	 * The register's `opponent-status`, e.g. "ADMISSIBLE"; null when the
	 * register has not recorded one. Additive (#572 follow-up).
	 */
	status: string | null;
}

/** The register's decision on an opposition: `date-rejected` is the one decision element verified live (#583). */
export interface RegisterOppositionOutcome {
	status: 'rejected';
	/** YYYYMMDD of the decision, when the register dates it. */
	date: string | null;
}

/**
 * One EP application as a page of an EP Register search lists it: the
 * register biblio record (the same fields get_register_biblio answers for
 * one application), plus the application number.
 */
export interface RegisterSearchItem extends Omit<RegisterBiblioResponse, 'docId'> {
	/** The application's earliest EP publication in epodoc form (EP4671722); null while the register has published none. */
	docId: string | null;
	/** The EP application number in epodoc form (EP25183540), when the register names it. */
	applicationNumber: string | null;
}

/**
 * The cached register-search datum. The search_register tool adds an optional
 * `hint` on top of it (lib/ops/register-hint.ts, #582) after the cache read,
 * so the hint is never part of this shape or of the cache.
 */
export interface RegisterSearchResponse {
	/** OPS's count for the whole query, capped by OPS at 10000. */
	total: number;
	/** This page's size. */
	returned: number;
	/** The register CQL that was sent, echoed. */
	query: string;
	range: { begin: number; end: number };
	docs: RegisterSearchItem[];
}

export interface RegisterBiblioResponse {
	docId: string;
	title: string | null;
	applicants: string[];
	/**
	 * The professional representatives (agents) of record before the EPO, from
	 * the register's current `agents` block. Empty when the register names
	 * none, which is common for applicants who act for themselves.
	 */
	representatives: RegisterParty[];
	/**
	 * EP Bulletin number (YYYY/WW) of the current representatives block. Null
	 * when none is recorded, and while the register says "N/P": the change is
	 * recorded but its Bulletin is not yet published (see the change date).
	 */
	representativesChangeGazette: string | null;
	/** YYYYMMDD the current representatives block was recorded (`change-date`), when the register gives one. Additive. */
	representativesChangeDate: string | null;
	/**
	 * The opponents of every opposition block, each once. Empty when no
	 * opposition is recorded. The register repeats the block per change, so an
	 * earlier rendering of the same party is not a second opponent; a decision
	 * block that names no opponent does not drop them (#583).
	 */
	opponents: RegisterOpponent[];
	/**
	 * The decision that ended the opposition, when the register records one
	 * (`date-rejected`). Absent while the register records no decision; a
	 * revoked patent says so in `status`, a withdrawn opposition in the
	 * opponent's `status`. Additive (#583).
	 */
	oppositionOutcome?: RegisterOppositionOutcome;
	status: string | null;
	dates: {
		filing: string | null;
		publication: string | null;
	};
}

export interface RegisterEvent {
	code: string;
	date: string;
	description: string | null;
	gazette?: {
		number: string | null;
		date: string | null;
	};
}

export interface RegisterEventsResponse {
	docId: string;
	events: RegisterEvent[];
}

export interface ProceduralStep {
	phase: string;
	description: string | null;
	date: string | null;
	status: string | null;
}

export interface ProceduralStepsResponse {
	docId: string;
	steps: ProceduralStep[];
}

export interface UnitaryPatentProtection {
	country: string;
	status: string | null;
	date: string | null;
}

export interface UnitaryPatentResponse {
	docId: string;
	hasUnitaryEffect: boolean;
	protections: UnitaryPatentProtection[];
}

// ============================================================================
// Family Extended Types
// ============================================================================

export interface FamilyBiblioMember {
	docId: string;
	title: string | null;
	applicants: string[];
	country: string;
	kind: string | null;
	date: string | null;
}

export interface FamilyBiblioResponse {
	docId: string;
	familyId?: string;
	members: FamilyBiblioMember[];
}

export interface FamilyLegalEvent extends LegalEventDetailFields {
	familyMemberDocId: string;
	code: string;
	date: string;
	country: string | null;
	text: string | null;
}

/**
 * No top-level state roll-up here, unlike `LegalResponse`: a family spans members from
 * several offices, so one designated-state list for the whole family would have no single
 * subject. Roll up per member from that member's own AK/AX events.
 */
export interface FamilyLegalResponse {
	docId: string;
	events: FamilyLegalEvent[];
}

// ============================================================================
// EPO document module — normalized per-datum shapes (PRD #94)
// ============================================================================

/**
 * Rich description shape returned by the module's getDescription operation:
 * the raw extracted text plus the language detection the legacy direct-call
 * surface performs (actual language, available languages, requested language).
 */
export interface DescriptionData {
	docId: string;
	/** Raw extractDescription output — may be '' when nothing was found. */
	description: string;
	/** Actual language returned ('none' when no description at all). */
	language: string;
	availableLanguages: string[];
	requestedLanguage: string;
}

/**
 * Legacy fulltext-availability shape (fulltext-documents walker) behind the
 * direct-call getFulltextAvailability surface.
 */
export interface FulltextSectionsData {
	docId: string;
	availableSections: Array<{
		section?: string;
		language?: string;
		format?: string;
	}>;
	hasFulltext: boolean;
}

/**
 * Legacy family shape (published-data equivalents endpoint, exchange-documents
 * walker) behind the direct-call getFamilyData surface and the EPO Enrichment
 * family field.
 */
export interface EquivalentsFamilyData {
	docId: string;
	familyMembers: Array<{
		docId: string;
		country?: string;
		docNumber?: string;
		kind?: string;
	}>;
	totalCount: number;
}

/** Citation item with basic biblio data (forward citations). */
export interface CitationItem {
	docId: string;
	title: string | null;
	applicants: string[];
	publicationDate: string | null;
	citedIn?: string; // 'examination' | 'opposition' | 'applicant' | 'other'
}

/** Forward citations response. */
export interface CitationsResponse {
	docId: string;
	total: number;
	citations: CitationItem[];
}

// ============================================================================
// Cache Types
// ============================================================================

export const OPS_CACHE_TTL = {
	SEARCH: 21600,           // 6 hours
	BIBLIO: 86400,           // 24 hours
	ABSTRACT: 86400,         // 24 hours
	FULLTEXT: 86400,         // 24 hours
	FAMILY: 86400,           // 24 hours
	LEGAL: 43200,            // 12 hours
	CLASSIFICATION: 604800,  // 7 days
	NUMBER_CONVERT: 604800,  // 7 days
	FIGURES_METADATA: 86400, // 24 hours - figure availability rarely changes
	FIGURES_BINARY: 604800,  // 7 days - images never change
	EQUIVALENTS: 86400,      // 24 hours
	REGISTER_BIBLIO: 86400,  // 24 hours
	REGISTER_EVENTS: 43200,  // 12 hours
	REGISTER_PROCEDURAL: 43200, // 12 hours
	REGISTER_UPP: 86400,     // 24 hours
	FAMILY_BIBLIO: 86400,    // 24 hours
	FAMILY_LEGAL: 43200,     // 12 hours
} as const;
