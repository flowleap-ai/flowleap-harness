/*---------------------------------------------------------------------------------------------
 *  EPO document module — per-datum XML extraction (PRD #94, fan-out #98)
 *
 *  The parse layer of the EPO document module: every walker that turns
 *  xmlToJson output into a normalized per-datum shape lives here (moved
 *  verbatim from the ops routes and the legacy direct-call functions), next to
 *  the shared extractors in xml-to-json.ts. Routes never import this file —
 *  they consume the module operations in direct.ts.
 *--------------------------------------------------------------------------------------------*/

import {
	isGrantKind,
	isGrantPublication,
	REPRESENTATIVE_PUBLICATION_RULE,
	REPRESENTATIVE_PUBLICATION_RULE_TEXT,
	representativePublication,
	type FamilyRepresentatives,
	type RepresentativeMember,
} from '../representative-publication.js';
import type {
	AbstractResponse,
	DocdbApplicationNumber,
	EquivalentPatent,
	EquivalentsFamilyData,
	FamilyBiblioMember,
	FamilyLegalEvent,
	FamilyMember,
	FulltextInquiryResponse,
	FulltextSectionsData,
	ImageInquiryData,
	LegalEvent,
	ProceduralStep,
	RegisterBiblioResponse,
	RegisterSearchItem,
	RegisterOpponent,
	RegisterOppositionOutcome,
	RegisterParty,
	RegisterEvent,
	UnitaryPatentResponse,
} from './types.js';

// ============================================================================
// Search (published-data search results — shared by search + citations)
// ============================================================================

/** A publication reference from a search result, before formatting. */
export interface PublicationRef {
	country: string;
	number: string;
	kind: string;
	date: string | null;
}

/**
 * Extract the total count and publication references from a search response.
 * Handles every key spelling the old walkers tolerated ('ops:'-prefixed and
 * plain, wrapped and unwrapped).
 */
export function extractSearchRefs(json: any): { total: number; refs: PublicationRef[] } {
	const biblioSearch =
		json?.['ops:world-patent-data']?.['ops:biblio-search'] ||
		json?.['ops:biblio-search'] ||
		json?.['biblio-search'] ||
		json?.['search-result'] ||
		json;

	const searchResult =
		biblioSearch?.['ops:search-result'] || biblioSearch?.['search-result'] || biblioSearch;

	const total = parseInt(
		searchResult?.['@total-result-count'] || biblioSearch?.['@total-result-count'] || '0',
		10
	);

	const refs: PublicationRef[] = [];
	const pubRefs =
		searchResult?.['ops:publication-reference'] || searchResult?.['publication-reference'];

	if (pubRefs) {
		const refList = Array.isArray(pubRefs) ? pubRefs : [pubRefs];
		for (const ref of refList) {
			const docIdData = ref?.['document-id'];
			const docIdObj = Array.isArray(docIdData) ? docIdData[0] : docIdData;

			const country = docIdObj?.country || '';
			const number = docIdObj?.['doc-number'] || '';
			const kind = docIdObj?.kind || '';

			if (`${country}${number}`) {
				refs.push({ country, number, kind, date: docIdObj?.date || null });
			}
		}
	}

	return { total, refs };
}

/** Format a publication reference as the EPODOC-style docId the routes emit. */
export function formatRefDocId(ref: PublicationRef): string {
	return ref.kind
		? `${ref.country}${ref.number}.${ref.kind}`
		: `${ref.country}${ref.number}`;
}

// ============================================================================
// Abstract
// ============================================================================

/** Extract the abstract (English preferred) from an exchange-document response. */
export function extractAbstract(data: any): Pick<AbstractResponse, 'abstract' | 'lang'> {
	// Navigate to exchange-document
	let doc = data;

	if (data?.['exchange-documents']) {
		const exchangeDocs = data['exchange-documents'];
		if (exchangeDocs?.['exchange-document']) {
			doc = Array.isArray(exchangeDocs['exchange-document'])
				? exchangeDocs['exchange-document'][0]
				: exchangeDocs['exchange-document'];
		}
	}

	// Extract abstract
	const abstracts = doc?.abstract;
	if (!abstracts) {
		return { abstract: null, lang: null };
	}

	// Handle array of abstracts (multiple languages)
	if (Array.isArray(abstracts)) {
		// Prefer English abstract
		const enAbstract = abstracts.find((a: any) => a?.['@lang'] === 'en');
		const targetAbstract = enAbstract || abstracts[0];

		const abstractText = targetAbstract?.p || targetAbstract;
		const lang = targetAbstract?.['@lang'] || null;

		// Handle nested p element
		const text = typeof abstractText === 'object' && abstractText?.text
			? abstractText.text
			: abstractText;

		return {
			abstract: typeof text === 'string' ? text : null,
			lang,
		};
	}

	// Single abstract
	const abstractText = abstracts?.p || abstracts;
	const lang = abstracts?.['@lang'] || null;

	const text = typeof abstractText === 'object' && abstractText?.text
		? abstractText.text
		: abstractText;

	return {
		abstract: typeof text === 'string' ? text : null,
		lang,
	};
}

// ============================================================================
// Fulltext availability
// ============================================================================

/**
 * Extract fulltext availability from an inquiry response
 * (fulltext-inquiry → inquiry-result[] → fulltext-instance[]).
 */
export function extractFulltextAvailability(data: any): FulltextInquiryResponse {
	const result: FulltextInquiryResponse = {
		docId: '',
		available: {
			claims: false,
			description: false,
		},
		languages: {
			claims: [],
			description: [],
		},
	};

	// Navigate to fulltext-inquiry
	const inquiry = data?.['fulltext-inquiry'];
	if (!inquiry) {
		return result;
	}

	// Extract document ID
	const pubRef = inquiry?.['publication-reference'];
	if (pubRef?.['document-id']) {
		const docIdObj = pubRef['document-id'];
		result.docId = `${docIdObj?.country || ''}${docIdObj?.['doc-number'] || ''}`;
	}

	// Navigate to inquiry-result which contains the fulltext instances
	const inquiryResults = inquiry?.['inquiry-result'];
	if (!inquiryResults) {
		return result;
	}

	const resultList = Array.isArray(inquiryResults) ? inquiryResults : [inquiryResults];

	for (const inquiryResult of resultList) {
		// Extract available instances from each result
		const instances = inquiryResult?.['fulltext-instance'];
		if (!instances) continue;

		const instanceList = Array.isArray(instances) ? instances : [instances];

		for (const inst of instanceList) {
			const desc = inst?.['@desc'];
			const lang = inst?.['@lang'];

			if (desc === 'claims') {
				result.available.claims = true;
				if (lang && !result.languages.claims.includes(lang)) {
					result.languages.claims.push(lang);
				}
			} else if (desc === 'description') {
				result.available.description = true;
				if (lang && !result.languages.description.includes(lang)) {
					result.languages.description.push(lang);
				}
			}
		}
	}

	return result;
}

/**
 * Legacy fulltext-availability walker (fulltext-documents → fulltext-format)
 * behind the direct-call getFulltextAvailability surface.
 */
export function extractFulltextSections(json: any, cleanedDoc: string): FulltextSectionsData {
	const sections: FulltextSectionsData['availableSections'] = [];

	if (json?.['fulltext-documents']?.['fulltext-document']) {
		const doc = Array.isArray(json['fulltext-documents']['fulltext-document'])
			? json['fulltext-documents']['fulltext-document'][0]
			: json['fulltext-documents']['fulltext-document'];

		if (doc?.['fulltext-format']) {
			const formats = Array.isArray(doc['fulltext-format'])
				? doc['fulltext-format']
				: [doc['fulltext-format']];

			for (const format of formats) {
				sections.push({
					section: format?.['@section'],
					language: format?.['@lang'],
					format: format?.['@format'],
				});
			}
		}
	}

	return {
		docId: cleanedDoc,
		availableSections: sections,
		hasFulltext: sections.length > 0,
	};
}

// ============================================================================
// Description language detection
// ============================================================================

/** Available description languages from a fulltext response (upper-cased). */
export function extractDescriptionLanguages(json: any): string[] {
	const fulltextDocs = json?.['fulltext-documents']?.['fulltext-document'];
	const availableLanguages: string[] = [];

	if (fulltextDocs) {
		const docs = Array.isArray(fulltextDocs) ? fulltextDocs : [fulltextDocs];
		for (const doc of docs) {
			const lang = doc?.description?.['@lang'];
			if (lang) {
				availableLanguages.push(lang.toUpperCase());
			}
		}
	}

	return availableLanguages;
}

// ============================================================================
// Family (INPADOC family — /family/publication)
// ============================================================================

/** The docdb document-id of a reference, or undefined when the ref is absent. */
function firstDocumentId(ref: any): any | undefined {
	if (!ref) return undefined;
	const list = Array.isArray(ref) ? ref : [ref];
	// /family/publication serves exactly one document-id per application and
	// priority reference and it is always the docdb one, so there is no epodoc
	// or original entry to prefer here (unlike the biblio reads, which do get
	// all three). Publication references carry docdb first, then epodoc.
	return list.find((d: any) => d?.['@document-id-type'] === 'docdb') ?? list[0];
}

/** `<country><doc-number><kind>`, the form an office and a reader both accept. */
function publicationNumber(country: string, number: string, kind: string | null): string {
	return `${country}${number}${kind ?? ''}`;
}

/** DOCDB's own application-number rendering — see {@link DocdbApplicationNumber}. */
function docdbApplicationNumber(
	country: string,
	number: string,
	kind: string | null
): DocdbApplicationNumber {
	return kind ? `${country}${number} (${kind})` : `${country}${number}`;
}

/** Key an application by country + DOCDB doc-number, the only id a priority-claim shares with it. */
function applicationKey(country: string, number: string): string {
	return `${country}${number}`;
}

interface FamilyPublicationRef {
	country: string;
	number: string;
	kind: string | null;
	date: string | null;
}

/** One application in the family, with the publications that issued from it. */
interface FamilyApplication {
	country: string;
	number: string;
	kind: string | null;
	/** Earliest publication first — the order the representative rule needs. */
	publications: FamilyPublicationRef[];
}

/** Earliest first; an undated ref sorts last rather than winning by default. */
function byPublicationDate(a: FamilyPublicationRef, b: FamilyPublicationRef): number {
	return (a.date ?? '99999999').localeCompare(b.date ?? '99999999');
}

/**
 * The citable number for an application: its first grant among the family's
 * publications, else its earliest publication — the one rule, from
 * `lib/representative-publication.ts` (#451), shared with the PATSTAT graph and
 * with the simple-family read so the three surfaces name one number per member.
 *
 * OPS states no grant flag, so the evidence is the kind code ({@link
 * isGrantKind}). A pre-2001 US grant (kind `A`) falls through to the
 * earliest-publication half, which for those families still returns a number a
 * reader can look up.
 */
function citablePublication(refs: FamilyPublicationRef[] | undefined): string | null {
	if (!refs || refs.length === 0) return null;
	const chosen = representativePublication(
		[...refs].sort(byPublicationDate).map(ref => ({
			publication: publicationNumber(ref.country, ref.number, ref.kind),
			isGrant: isGrantKind(ref.kind),
		}))
	);
	return chosen?.publication ?? null;
}

/**
 * Map every application in the family to the publications that issued from it,
 * so an application or priority reference can be resolved to a citable number.
 *
 * The pairing is free: each `family-member` wraps one publication-reference and
 * the application-reference it issued from, so walking the members once builds
 * the whole map with no extra OPS call.
 */
function applicationsInFamily(memberList: any[]): Map<string, FamilyApplication> {
	const byApplication = new Map<string, FamilyApplication>();

	for (const member of memberList) {
		const pubRef = firstDocumentId(member?.['publication-reference']?.['document-id']);
		const appRef = firstDocumentId(member?.['application-reference']?.['document-id']);
		if (!pubRef || !appRef) continue;

		const appCountry = appRef?.country || '';
		const appNumber = appRef?.['doc-number'] || '';
		if (!appNumber) continue;

		const key = applicationKey(appCountry, appNumber);
		const application: FamilyApplication = byApplication.get(key) ?? {
			country: appCountry,
			number: appNumber,
			kind: appRef?.kind || null,
			publications: [],
		};
		application.publications.push({
			country: pubRef?.country || '',
			number: pubRef?.['doc-number'] || '',
			kind: pubRef?.kind || null,
			date: pubRef?.date || null,
		});
		byApplication.set(key, application);
	}

	for (const application of byApplication.values()) {
		application.publications.sort(byPublicationDate);
	}

	return byApplication;
}

/**
 * The representative publication of every member of the family — one entry per
 * APPLICATION, which is what a family member is, where `members` is a flat list
 * of publication, application and priority rows (#451).
 *
 * This is the block that stops an agent citing a pre-grant publication for a
 * member that has granted: the EP member of EP2110298's family publishes as
 * A2, A3 and B1, and the representative here is EP2110298B1 rather than the
 * A2 that comes first by date.
 *
 * It is computed from the RAW response rather than from `members`, which is
 * why it was already right when `members` was dropping the grant (#455); that
 * independence is kept deliberately, and `tests/family-representative-lockstep`
 * now asserts the two agree instead of leaving it to be hoped for.
 */
export function extractFamilyRepresentatives(data: any): FamilyRepresentatives {
	const familyMembers = data?.['patent-family']?.['family-member'];
	const memberList = familyMembers
		? (Array.isArray(familyMembers) ? familyMembers : [familyMembers])
		: [];

	const members: RepresentativeMember[] = [...applicationsInFamily(memberList).values()].map(
		application => {
			const representative = citablePublication(application.publications);
			return {
				application: docdbApplicationNumber(
					application.country,
					application.number,
					application.kind
				),
				representativePublication: representative,
				isGrant: isGrantPublication(representative),
				publications: application.publications.map(ref =>
					publicationNumber(ref.country, ref.number, ref.kind)
				),
			};
		}
	);

	return {
		rule: REPRESENTATIVE_PUBLICATION_RULE,
		members,
		note:
			`One entry per family MEMBER (one application), where \`members\` is a flat list of ` +
			`publication, application and priority rows. ${REPRESENTATIVE_PUBLICATION_RULE_TEXT} ` +
			`Cite \`representativePublication\` for a member: \`publications\` holds every row OPS ` +
			`serves for it, pre-grant publications of members that have since granted included, and a ` +
			`grant and a pre-grant publication are different legal objects. get_patent_family and the ` +
			`PATSTAT graph (/v1/patstat/graph/patent) apply the same rule, so the three surfaces name ` +
			`the same number for the same member.`,
	};
}

/**
 * Extract the family RECORDS: the publication, application and priority rows
 * OPS serves, deduplicated by country + number + kind.
 *
 * Record grain, not member grain — a member that published three times has
 * three publication rows here, and its application appears once. The member
 * list, one entry per application, is {@link extractFamilyRepresentatives};
 * the two are counted separately in the response (`recordCount` /
 * `memberCount`) so neither grain can be mistaken for the other (#455).
 *
 * Every record carries `publication`, the number to cite. Application and
 * priority records carry their raw DOCDB value as `docdbApplication` too, named
 * for what it is — #419 and its PATSTAT fix in `lib/patstat-graph` are the same
 * bug on the other path, and the two now name the two numbers the same way.
 */
export function extractFamilyMembers(data: any): FamilyMember[] {
	const members: FamilyMember[] = [];

	// Navigate to patent-family
	const patentFamily = data?.['patent-family'];
	if (!patentFamily) {
		return members;
	}

	// Get family members
	const familyMembers = patentFamily?.['family-member'];
	if (!familyMembers) {
		return members;
	}

	const memberList = Array.isArray(familyMembers) ? familyMembers : [familyMembers];
	const byApplication = applicationsInFamily(memberList);

	for (const member of memberList) {
		// Publication reference
		const pubRef = member?.['publication-reference']?.['document-id'];
		if (pubRef) {
			const pubRefObj = firstDocumentId(pubRef);
			const country = pubRefObj?.country || '';
			const number = pubRefObj?.['doc-number'] || '';
			const kind = pubRefObj?.kind || null;
			members.push({
				refType: 'publication',
				country,
				number,
				kind,
				date: pubRefObj?.date || null,
				publication: number ? publicationNumber(country, number, kind) : null,
				docdbApplication: null,
			});
		}

		// Application reference
		const appRef = member?.['application-reference']?.['document-id'];
		if (appRef) {
			const appRefObj = firstDocumentId(appRef);
			const country = appRefObj?.country || '';
			const number = appRefObj?.['doc-number'] || '';
			const kind = appRefObj?.kind || null;
			members.push({
				refType: 'application',
				country,
				number,
				kind,
				date: appRefObj?.date || null,
				publication: citablePublication(byApplication.get(applicationKey(country, number))?.publications),
				docdbApplication: number ? docdbApplicationNumber(country, number, kind) : null,
			});
		}

		// Priority claims
		const priorityClaims = member?.['priority-claim'];
		if (priorityClaims) {
			const prioList = Array.isArray(priorityClaims) ? priorityClaims : [priorityClaims];
			for (const prio of prioList) {
				const prioDocId = prio?.['document-id'];
				if (prioDocId) {
					const prioObj = firstDocumentId(prioDocId);
					const country = prioObj?.country || '';
					const number = prioObj?.['doc-number'] || '';
					const kind = prioObj?.kind || null;
					members.push({
						refType: 'priority',
						country,
						number,
						kind,
						date: prioObj?.date || null,
						publication: citablePublication(byApplication.get(applicationKey(country, number))?.publications),
						docdbApplication: number ? docdbApplicationNumber(country, number, kind) : null,
					});
				}
			}
		}
	}

	// Deduplicate each row against its own IDENTITY, which is not the same for
	// the three refTypes (#455):
	//
	//  - A PUBLICATION is country + number + KIND. One document number is
	//    reused across kind codes — EP2110298 A2, A3 and B1 are three
	//    publications of one application — so the old country+number key kept
	//    the first and threw the rest away. The one it threw away is usually
	//    THE GRANT, because the A publication comes first by date, which is how
	//    EP2110298B1 came to be absent from the member list of its own family.
	//    Measured on production: 2 publication rows lost on EP2110298, 16 on
	//    EP2170959B1, 11 on US8399514B2, every one a republication or a grant.
	//
	//  - An APPLICATION or a PRIORITY filing is country + number, unchanged.
	//    DOCDB's kind letter there marks the reference type, not a second
	//    filing, and `applicationKey` (which groups the member list) already
	//    ignores it. Keying on it would print one filing as two under two
	//    `docdbApplication` strings — the #419 failure, in a new place — and
	//    would put the row list and the member list out of step.
	const seen = new Set<string>();
	return members.filter(m => {
		const identity =
			m.refType === 'publication' ? `${m.country}${m.number}:${m.kind ?? ''}` : `${m.country}${m.number}`;
		const key = `${m.refType}:${identity}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Legacy family walker over the published-data equivalents endpoint
 * (exchange-documents), behind the direct-call getFamilyData surface and the
 * EPO Enrichment family field.
 */
export function extractEquivalentsFamily(json: any, cleanedDoc: string): EquivalentsFamilyData {
	const familyMembers: EquivalentsFamilyData['familyMembers'] = [];

	// The /equivalents endpoint answers with <ops:equivalents-inquiry> holding one
	// <ops:inquiry-result> per family member, each wrapping a publication-reference.
	const inquiry =
		json?.['equivalents-inquiry'] ??
		json?.['world-patent-data']?.['equivalents-inquiry'] ??
		json?.['ops:world-patent-data']?.['ops:equivalents-inquiry'];
	const inquiryResults = inquiry?.['inquiry-result'] ?? inquiry?.['ops:inquiry-result'];
	if (inquiryResults) {
		const results = Array.isArray(inquiryResults) ? inquiryResults : [inquiryResults];
		for (const result of results) {
			const ref =
				result?.['publication-reference'] ?? result?.['ops:publication-reference'];
			const idNode = ref?.['document-id'];
			const ids = Array.isArray(idNode) ? idNode : [idNode];
			// Prefer the epodoc id (single sortable string); fall back to the first entry.
			const docIdEntry =
				ids.find((d: any) => d?.['@document-id-type'] === 'epodoc') ?? ids[0];
			const rawNumber = docIdEntry?.['doc-number'];
			const docNumber = typeof rawNumber === 'string' ? rawNumber : rawNumber?.text;
			if (docNumber) {
				const country = typeof docIdEntry?.country === 'string' ? docIdEntry.country : undefined;
				const kind = typeof docIdEntry?.kind === 'string' ? docIdEntry.kind : undefined;
				familyMembers.push({
					docId: country ? `${country}${docNumber}${kind ? `.${kind}` : ''}` : docNumber,
					country,
					docNumber,
					kind,
				});
			}
		}
		return {
			docId: cleanedDoc,
			familyMembers,
			totalCount: familyMembers.length,
		};
	}

	if (json?.['exchange-documents']?.['exchange-document']) {
		const docs = Array.isArray(json['exchange-documents']['exchange-document'])
			? json['exchange-documents']['exchange-document']
			: [json['exchange-documents']['exchange-document']];

		for (const doc of docs) {
			const biblioData = doc?.['bibliographic-data'];
			const pubRef = biblioData?.['publication-reference']?.['document-id'];

			let docId: string | null = null;
			if (Array.isArray(pubRef)) {
				const epodoc = pubRef.find(
					(d: any) => d?.['@document-id-type'] === 'epodoc'
				);
				if (epodoc) {
					docId = epodoc?.['doc-number'];
				}
			} else if (pubRef) {
				const cc = pubRef?.country;
				const nr = pubRef?.['doc-number'];
				const kind = pubRef?.kind;
				docId = `${cc}${nr}${kind ? `.${kind}` : ''}`;
			}

			if (docId) {
				familyMembers.push({
					docId,
					country: doc?.['@country'],
					docNumber: doc?.['@doc-number'],
					kind: doc?.['@kind'],
				});
			}
		}
	}

	return {
		docId: cleanedDoc,
		familyMembers,
		totalCount: familyMembers.length,
	};
}

// ============================================================================
// Legal status (INPADOC legal — /legal/publication)
// ============================================================================

/**
 * Read one child of an OPS `L500EP` detail block. The xml-to-json layer keeps a child
 * that carries attributes as `{ text }` and collapses an attribute-less child to a bare
 * string, so both shapes have to be handled.
 */
function readLegalDetailField(block: any, key: string): string | null {
	const node = block?.[key];
	const raw = typeof node === 'string' ? node : typeof node?.text === 'string' ? node.text : null;
	const trimmed = raw?.trim();
	return trimmed ? trimmed : null;
}

/**
 * Read an OPS detail field that holds a whitespace-separated list of two-letter state codes
 * (`L507EP` designated states, `L524EP` extension/validation states) as an array. Codes are
 * upper-cased and de-duplicated, order preserved. A missing or code-less field yields null,
 * so an absent list never reads as "designates nothing".
 */
function readLegalStateList(block: any, key: string): string[] | null {
	const raw = readLegalDetailField(block, key);
	if (!raw) return null;

	const states: string[] = [];
	for (const token of raw.split(/\s+/)) {
		const code = token.trim().toUpperCase();
		if (!/^[A-Z]{2}$/.test(code)) continue;
		if (!states.includes(code)) states.push(code);
	}

	return states.length ? states : null;
}

/** Normalize an OPS `YYYYMMDD` date to `YYYY-MM-DD`; anything else passes through unchanged. */
function normalizeOpsDate(value: string | null): string | undefined {
	if (!value) return undefined;
	const match = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})$/.exec(value);
	return match ? `${match.groups!.year}-${match.groups!.month}-${match.groups!.day}` : value;
}

/** The per-event `L500EP` detail fields shared by the publication and family legal extractors. */
interface LegalEventDetails {
	state?: string;
	effectiveDate?: string;
	detail?: string;
	paymentDate?: string;
	feeYear?: number;
	designatedStates?: string[];
	extensionStates?: string[];
}

/**
 * Read the `L500EP` detail block of one legal event: the contracting state the event
 * applies to (`L501EP`, the field that says whether an EP patent is still live in DE or
 * FR), the reason text, the effective and payment dates, the fee year, and the state
 * lists an EP filing's coverage is written in — the designated contracting states of an
 * AK event (`L507EP`) and the extension/validation states of an AX event (`L524EP`).
 * Absent or malformed blocks yield an empty object rather than throwing.
 */
function extractLegalEventDetails(evt: any): LegalEventDetails {
	const block = evt?.['L500EP'];
	if (!block || typeof block !== 'object') return {};

	const details: LegalEventDetails = {};

	const state = readLegalDetailField(block, 'L501EP');
	if (state) details.state = state.toUpperCase();

	const effectiveDate = normalizeOpsDate(readLegalDetailField(block, 'L525EP'));
	if (effectiveDate) details.effectiveDate = effectiveDate;

	const detail = readLegalDetailField(block, 'L510EP');
	if (detail) details.detail = detail;

	const paymentDate = normalizeOpsDate(readLegalDetailField(block, 'L518EP'));
	if (paymentDate) details.paymentDate = paymentDate;

	const feeYear = Number.parseInt(readLegalDetailField(block, 'L520EP') ?? '', 10);
	if (Number.isFinite(feeYear)) details.feeYear = feeYear;

	const designatedStates = readLegalStateList(block, 'L507EP');
	if (designatedStates) details.designatedStates = designatedStates;

	// OPS labels L524EP "Validation States"; it carries the states of the AX
	// extension request, which is what covers both extension and validation states.
	const extensionStates = readLegalStateList(block, 'L524EP');
	if (extensionStates) details.extensionStates = extensionStates;

	return details;
}

/**
 * Extract legal events (patent-family format, events nested under
 * family-member.legal), sorted newest first.
 */
export function extractLegalEvents(data: any): LegalEvent[] {
	const events: LegalEvent[] = [];

	// Navigate to patent-family.family-member
	const patentFamily = data?.['patent-family'];
	if (!patentFamily) {
		return events;
	}

	const familyMembers = patentFamily?.['family-member'];
	if (!familyMembers) {
		return events;
	}

	const memberList = Array.isArray(familyMembers) ? familyMembers : [familyMembers];

	for (const member of memberList) {
		// Get legal events array
		const legalEvents = member?.legal;
		if (!legalEvents) continue;

		const eventList = Array.isArray(legalEvents) ? legalEvents : [legalEvents];

		for (const evt of eventList) {
			// Extract date - try multiple sources
			let eventDate = '';

			// Try L019EP (Date first created) - most reliable
			if (evt?.['L019EP']?.text) {
				eventDate = evt['L019EP'].text;
			}
			// Fallback to L007EP (Gazette date)
			if (!eventDate && evt?.['L007EP']?.text) {
				eventDate = evt['L007EP'].text;
			}
			// Fallback to L500EP.L525EP (Effective date)
			if (!eventDate && evt?.['L500EP']?.['L525EP']?.text) {
				eventDate = evt['L500EP']['L525EP'].text;
			}

			// Extract gazette info
			const gazetteDate = evt?.['L007EP']?.text || null;

			// Extract description text
			const desc = evt?.['@desc'] || evt?.text || null;

			// Extract country code from L001EP
			const country = evt?.['L001EP']?.text || null;

			events.push({
				code: evt?.['@code']?.trim() || '',
				date: eventDate,
				country,
				text: desc,
				gazette: gazetteDate ? {
					number: null,
					date: gazetteDate,
				} : undefined,
				...extractLegalEventDetails(evt),
			});
		}
	}

	// Sort by date (newest first)
	events.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.localeCompare(a.date);
	});

	return events;
}

/**
 * One legal event as the state roll-up reads it: the code, the date, and the two lists.
 * `date` is optional here because `extractLegalEvents` writes `''` when the OPS record
 * carries none, and an empty date must sort oldest rather than throw off the compare.
 */
type StateCoverageEvent = Pick<LegalEvent, 'code' | 'designatedStates' | 'extensionStates'> & {
	date?: string;
};

/**
 * Roll the per-event state lists up into one reading of what an EP filing covers:
 * the designated contracting states of its most recent AK event and the
 * extension/validation states of its most recent AX event.
 *
 * Most recent, not the union of every event: an EP application republishes AK at each
 * publication (A1, then B1) and the set can be NARROWED in between when the applicant
 * drops designations, so the latest event is the current designation and a union would
 * report states that are no longer designated.
 *
 * Recency is read off the event date here, not off the order the events arrive in. Both
 * legal extractors do sort newest first, but a roll-up that silently depends on that
 * would answer the WIDER, superseded designation set the day the sort changes — the
 * exact failure the union was rejected for. A dated event always beats an undated one;
 * among events that are all undated, the first one wins, which keeps the caller's order.
 *
 * An event whose list did not parse is skipped, and an older AK event can then answer.
 * That is deliberate: a malformed OPS block is a gap in the record, not a statement that
 * the filing designates nothing, and reporting [] for it would be indistinguishable from
 * the genuine "designates no states" answer this function gives a non-EP document. The
 * cost is that the answer can then be a superseded, WIDER set; the tool docs say so.
 *
 * Non-EP documents and pre-AK applications simply have no such events: both lists come
 * back empty, which reads as "this record designates no states", never as an error.
 */
export function extractStateCoverage(events: ReadonlyArray<StateCoverageEvent>): {
	designatedStates: string[];
	extensionStates: string[];
} {
	// OPS writes dates as YYYYMMDD, but the same field is normalized to YYYY-MM-DD
	// elsewhere in this file. Compare on digits only so the two forms cannot rank against
	// each other wrongly; an absent date yields '' and sorts oldest.
	const rank = (date: string | undefined): string => (date ?? '').replace(/\D/g, '');

	const latest = (code: string, field: 'designatedStates' | 'extensionStates'): string[] => {
		let winner: StateCoverageEvent | undefined;

		for (const event of events) {
			if (event.code !== code || !event[field]?.length) continue;
			// An undated event never displaces a dated one; ties keep the first seen.
			if (!winner || rank(event.date) > rank(winner.date)) winner = event;
		}

		return winner?.[field] ?? [];
	};

	return {
		designatedStates: latest('AK', 'designatedStates'),
		extensionStates: latest('AX', 'extensionStates'),
	};
}

// ============================================================================
// Equivalents
// ============================================================================

/** Extract equivalent publications (equivalents-inquiry / patent-family). */
export function extractEquivalents(data: any): EquivalentPatent[] {
	const equivalents: EquivalentPatent[] = [];

	const inquiry = data?.['equivalents-inquiry'] || data?.['patent-family'];
	if (!inquiry) return equivalents;

	const members = inquiry?.['family-member'] || inquiry?.['equivalents-member'];
	if (!members) return equivalents;

	const memberList = Array.isArray(members) ? members : [members];

	for (const member of memberList) {
		const pubRef = member?.['publication-reference']?.['document-id'];
		if (!pubRef) continue;

		const refObj = Array.isArray(pubRef) ? pubRef[0] : pubRef;
		equivalents.push({
			country: refObj?.country || '',
			number: refObj?.['doc-number'] || '',
			kind: refObj?.kind || null,
		});
	}

	return equivalents;
}

// ============================================================================
// Number service
// ============================================================================

/** Extract the converted number from a standardization response. */
export function extractConvertedNumber(data: any): string {
	const output = data?.['standardization']?.['output'] ||
		data?.['ops:standardization']?.['ops:output'];
	if (!output) return '';

	const docId = output?.['publication-reference']?.['document-id'] ||
		output?.['document-id'];
	if (!docId) return '';

	const ref = Array.isArray(docId) ? docId[0] : docId;
	const country = ref?.country || '';
	const number = ref?.['doc-number'] || '';
	const kind = ref?.kind || '';

	return `${country}${number}${kind ? '.' + kind : ''}`.trim();
}

// ============================================================================
// EP Register (biblio / events / procedural steps / UPP)
// ============================================================================

/** Locate the register-document node in any of its wrapper spellings. */
function findRegisterDocument(data: any): any {
	// register-search → register-documents → register-document
	const regSearch = data?.['register-search'];
	if (regSearch) {
		const regDocs = regSearch?.['register-documents']?.['register-document'];
		return Array.isArray(regDocs) ? regDocs[0] : regDocs;
	}
	// Direct register-documents wrapper
	const regDocs = data?.['register-documents']?.['register-document'];
	if (regDocs) return Array.isArray(regDocs) ? regDocs[0] : regDocs;
	// Direct register-document
	const regDoc = data?.['register-document'];
	return Array.isArray(regDoc) ? regDoc[0] : regDoc;
}

/** Extract EP Register bibliographic data (title, applicants, status, dates). */
export function extractRegisterBiblio(data: any, docId: string): RegisterBiblioResponse {
	const doc = findRegisterDocument(data);
	if (!doc) {
		return emptyRegisterBiblio(docId);
	}
	return extractRegisterDocument(doc, docId);
}

/**
 * One page of an EP Register search with the `biblio` constituent
 * (`/register/search/biblio`): OPS's total for the query and one row per
 * register document, each the same register document the biblio read
 * parses, so the rows reuse that parser. A row is keyed by the application's
 * earliest EP publication; a document the register has not published yet
 * keeps a null `docId` and its application number.
 */
export function extractRegisterSearch(data: any): { total: number; docs: RegisterSearchItem[] } {
	const regSearch = data?.['register-search'];
	const total = Number.parseInt(regSearch?.['@total-result-count'] ?? '0', 10) || 0;
	const docs = asList(regSearch?.['register-documents']?.['register-document']).map(doc => {
		const biblioData = doc?.['bibliographic-data'];
		const docId = registerEpodocId(registerEpPublications(biblioData)[0]);
		return {
			...extractRegisterDocument(doc, docId ?? ''),
			docId,
			applicationNumber: registerEpodocId(registerEpApplication(biblioData)),
		};
	});
	return { total, docs };
}

/** A register `document-id` as an epodoc number (EP4671722), or null without country or number. */
function registerEpodocId(documentId: any): string | null {
	const country = registerText(documentId?.country);
	const number = registerText(documentId?.['doc-number']);
	return country && number ? `${country}${number}` : null;
}

function emptyRegisterBiblio(docId: string): RegisterBiblioResponse {
	return {
		docId,
		title: null,
		applicants: [],
		representatives: [],
		representativesChangeGazette: null,
		representativesChangeDate: null,
		opponents: [],
		status: null,
		dates: { filing: null, publication: null },
	};
}

/**
 * The EP application reference of a register document. The register lists
 * one reference per document: the EP application and the PCT it entered
 * from. A reference without a country (seen in fixtures, not in the
 * register) is taken as the EP one when no reference names EP.
 */
function registerEpApplication(biblioData: any): any {
	const applicationIds = registerDocumentIds(biblioData?.['application-reference']);
	return applicationIds.find(d => d?.country === 'EP')
		?? applicationIds.find(d => !d?.country && typeof d?.date === 'string');
}

/** The dated EP publications of a register document, earliest first (the WO publication is left out). */
function registerEpPublications(biblioData: any): any[] {
	const datedPublications = registerDocumentIds(biblioData?.['publication-reference'])
		.filter(d => typeof d?.date === 'string');
	return (datedPublications.some(d => d?.country === 'EP')
		? datedPublications.filter(d => d.country === 'EP')
		: datedPublications.filter(d => !d?.country))
		.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** One register document (the biblio read's, or one row of a search page) to the biblio shape. */
function extractRegisterDocument(doc: any, docId: string): RegisterBiblioResponse {
	const biblioData = doc?.['bibliographic-data'];

	// Status from @status attribute on register-document
	const status = doc?.['@status'] || null;

	let title: string | null = null;
	const titleNode = biblioData?.['invention-title'];
	if (titleNode) {
		const titles = Array.isArray(titleNode) ? titleNode : [titleNode];
		const enTitle = titles.find((t: any) => t?.['@lang'] === 'en') || titles[0];
		title = typeof enTitle === 'string' ? enTitle : (enTitle?.['$'] || enTitle?.text || null);
	}

	const applicants: string[] = [];
	const applicantsNode = biblioData?.['parties']?.['applicants'];
	if (applicantsNode) {
		const appEntries = Array.isArray(applicantsNode) ? applicantsNode : [applicantsNode];
		for (const entry of appEntries) {
			// Can be entry.applicant or entry itself
			const applicant = entry?.['applicant'] || entry;
			const appList = Array.isArray(applicant) ? applicant : [applicant];
			for (const app of appList) {
				const name = app?.['addressbook']?.name ||
					app?.['applicant-name']?.name ||
					app?.['applicant-name']?.['$'] ||
					null;
				if (name && !applicants.includes(name)) applicants.push(name);
			}
		}
	}

	// The EP filing date and the first EP publication are the ones the read
	// always promised; a lookup on the reference array itself answered null (#572).
	const epApplication = registerEpApplication(biblioData);
	const epPublications = registerEpPublications(biblioData);

	const agentsBlock = currentRegisterBlock(biblioData?.['parties']?.['agents']);
	const representatives = asList(agentsBlock?.['agent'])
		.map(registerParty)
		.filter((p): p is RegisterParty => p !== null);

	const oppositionBlocks = registerBlocksOldestFirst(biblioData?.['opposition-data']);
	const oppositionOutcome = registerOppositionOutcome(oppositionBlocks);

	return {
		docId,
		title,
		applicants,
		representatives,
		representativesChangeGazette: bulletinNumber(agentsBlock?.['@change-gazette-num']),
		representativesChangeDate: registerText(agentsBlock?.['@change-date']),
		opponents: extractRegisterOpponents(oppositionBlocks),
		...(oppositionOutcome ? { oppositionOutcome } : {}),
		status,
		dates: {
			filing: registerText(epApplication?.date),
			publication: registerText(epPublications[0]?.date),
		},
	};
}

/** Every `document-id` under one or more `*-reference` nodes, in document order. */
function registerDocumentIds(referenceNode: any): any[] {
	return asList(referenceNode).flatMap(ref => asList(ref?.['document-id']));
}

/**
 * An EP Bulletin number as the register writes it (YYYY/WW), else null. The
 * register writes "N/P" on a change whose Bulletin is not yet published; that
 * is not a Bulletin number, so it reads as null beside the change date.
 */
function bulletinNumber(value: unknown): string | null {
	return typeof value === 'string' && /^\d{4}\/\d{1,2}$/.test(value) ? value : null;
}

function asList(node: any): any[] {
	if (node === null || node === undefined) return [];
	return Array.isArray(node) ? node : [node];
}

function registerText(node: any): string | null {
	if (typeof node === 'string') return node.trim() || null;
	const text = node?.['$'] ?? node?.text;
	return typeof text === 'string' ? text.trim() || null : null;
}

/**
 * The register repeats a block (`agents`, `opposition-data`) once per recorded
 * change, each stamped with its change date (`change-date`, YYYYMMDD) and the
 * Bulletin it appeared in (`change-gazette-num`, YYYY/WW, or "N/P" while the
 * Bulletin is not yet published). The current block is the latest change. A
 * block is dated by its change date, else by the week its Bulletin names, so
 * the two kinds order together; a pending Bulletin ranks above every date, and
 * the first block wins a tie.
 *
 * Live EP2771468B1 (#572 review): the current agents block was "N/P" with a
 * change date, and a string compare on the Bulletin picked the 2014 block.
 */
function currentRegisterBlock(node: any): any {
	const blocks = asList(node);
	let current: any = blocks[0] ?? null;
	let currentDate = current ? registerChangeDate(current) : -1;
	for (const block of blocks.slice(1)) {
		const date = registerChangeDate(block);
		if (date > currentDate) {
			current = block;
			currentDate = date;
		}
	}
	return current;
}

/**
 * When a register block was recorded, as a YYYYMMDD number: its change date,
 * else the first day of the week its Bulletin names (Bulletin YYYY/WW is the
 * WWth week of YYYY, so 2015/40 is early October 2015), else 0. A pending
 * Bulletin ("N/P") is the latest change there is.
 */
function registerChangeDate(block: any): number {
	const changeDate = block?.['@change-date'];
	if (typeof changeDate === 'string' && /^\d{8}$/.test(changeDate)) return Number(changeDate);
	const gazette = block?.['@change-gazette-num'];
	if (gazette === 'N/P') return Number.MAX_SAFE_INTEGER;
	const match = typeof gazette === 'string' ? gazette.match(/^(\d{4})\/(\d{1,2})$/) : null;
	if (!match) return 0;
	const day = new Date(Date.UTC(Number(match[1]), 0, 1 + 7 * (Number(match[2]) - 1)));
	return Number(day.toISOString().slice(0, 10).replace(/-/g, ''));
}

/** One register party (`agent`, `opponent`) from its `addressbook`. */
function registerParty(entry: any): RegisterParty | null {
	const book = entry?.['addressbook'] ?? entry;
	const name = registerText(book?.['name']) ?? registerText(book?.['orgname']);
	if (!name) return null;
	const addressNode = book?.['address'];
	const address: string[] = [];
	if (addressNode && typeof addressNode === 'object') {
		for (const [key, value] of Object.entries(addressNode)) {
			if (!/^address-\d+$/.test(key)) continue;
			const line = registerText(value);
			if (line) address.push(line);
		}
	}
	const country = registerText(addressNode?.['country']) ?? registerText(book?.['country']);
	return { name, country, address };
}

/** The repeated blocks of a register node, oldest change first (a tie keeps document order). */
function registerBlocksOldestFirst(node: any): any[] {
	return asList(node)
		.map((block, index) => ({ block, index, date: registerChangeDate(block) }))
		.sort((a, b) => a.date - b.date || a.index - b.index)
		.map(entry => entry.block);
}

/**
 * The opponents of every opposition block, oldest block first: the register
 * repeats the block per change, and a party renamed between renderings
 * ("Schlich, George" then "Schlich, George William") is one opponent, not
 * two. The `sequence` attribute names the party across blocks; the name is
 * the fallback. The latest rendering wins the name, address and status, so a
 * later status change is kept; the filing date is the first one recorded.
 *
 * Live EP3414489 (#583): the current block holds only the decision
 * (`date-rejected`) and names no opponent, so the current block alone
 * answered no opponents for an opposed patent.
 */
function extractRegisterOpponents(oppositionBlocks: any[]): RegisterOpponent[] {
	const opponents = new Map<string, RegisterOpponent>();
	for (const block of oppositionBlocks) {
		for (const entry of asList(block?.['opponent'])) {
			const party = registerParty(entry);
			if (!party) continue;
			const key = registerText(entry?.['@sequence']) ?? party.name;
			const earlier = opponents.get(key);
			opponents.set(key, {
				...party,
				filingDate: earlier?.filingDate ?? registerText(entry?.['date-opposition-filed']?.['date']),
				status: registerText(entry?.['opponent-status']?.['@status']) ?? earlier?.status ?? null,
			});
		}
	}
	return [...opponents.values()];
}

/**
 * The decision that ended the opposition, from the latest block that records
 * one. `date-rejected` is the one decision element seen live (EP3414489,
 * #583); a revocation shows in the patent status and a withdrawal in the
 * opponent status, so neither is read here.
 */
function registerOppositionOutcome(oppositionBlocks: any[]): RegisterOppositionOutcome | undefined {
	for (const block of [...oppositionBlocks].reverse()) {
		const rejected = block?.['date-rejected'];
		if (rejected === undefined || rejected === null) continue;
		return { status: 'rejected', date: registerText(rejected?.['date']) ?? registerText(rejected) };
	}
	return undefined;
}

/** Extract EP Register events (procedural-data or ep-patent-statuses), newest first. */
export function extractRegisterEvents(data: any): RegisterEvent[] {
	const events: RegisterEvent[] = [];

	const doc = findRegisterDocument(data);
	if (!doc) return events;

	// Events can be under procedural-data or directly under register-document
	const procSteps = doc?.['procedural-data']?.['procedural-step'] ||
		doc?.['ep-patent-statuses']?.['ep-patent-status'];
	if (!procSteps) return events;

	const stepList = Array.isArray(procSteps) ? procSteps : [procSteps];

	for (const step of stepList) {
		// Handle ep-patent-status format
		if (step?.['@status-code'] !== undefined) {
			events.push({
				code: step['@status-code'] || '',
				date: step['@change-date'] || '',
				description: step?.text || null,
				gazette: undefined,
			});
			continue;
		}

		const code = step?.['procedural-step-code']?.['$'] ||
			step?.['procedural-step-code'] || '';
		const date = step?.['procedural-step-date']?.['$'] ||
			step?.['procedural-step-date'] || '';
		const desc = step?.['procedural-step-text']?.['$'] ||
			step?.['procedural-step-text'] || null;
		const gazetteNum = step?.['gazette-reference']?.['gazette-num']?.['$'] ||
			step?.['gazette-reference']?.['gazette-num'] || null;
		const gazetteDate = step?.['gazette-reference']?.['date']?.['$'] ||
			step?.['gazette-reference']?.['date'] || null;

		events.push({
			code: typeof code === 'string' ? code : '',
			date: typeof date === 'string' ? date : '',
			description: typeof desc === 'string' ? desc : null,
			gazette: gazetteNum || gazetteDate ? {
				number: typeof gazetteNum === 'string' ? gazetteNum : null,
				date: typeof gazetteDate === 'string' ? gazetteDate : null,
			} : undefined,
		});
	}

	events.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.localeCompare(a.date);
	});

	return events;
}

/** Extract EP Register procedural steps with phase, newest first. */
export function extractProceduralSteps(data: any): ProceduralStep[] {
	const steps: ProceduralStep[] = [];

	const doc = findRegisterDocument(data);
	if (!doc) return steps;

	const procData = doc?.['procedural-data']?.['procedural-step'];
	if (!procData) return steps;

	const stepList = Array.isArray(procData) ? procData : [procData];

	for (const step of stepList) {
		const phase = step?.['@procedure-step-phase'] || '';

		// Description: can be string, object with text, or array
		let desc: string | null = null;
		const textNode = step?.['procedural-step-text'];
		if (typeof textNode === 'string') {
			desc = textNode;
		} else if (Array.isArray(textNode)) {
			const descEntry = textNode.find((t: any) => t?.['@step-text-type'] === 'STEP_DESCRIPTION');
			desc = descEntry?.text || textNode[0]?.text || null;
		} else if (textNode?.text) {
			desc = textNode.text;
		}

		// Date: can be string, or object with date
		let date: string | null = null;
		const dateNode = step?.['procedural-step-date'];
		if (typeof dateNode === 'string') {
			date = dateNode;
		} else if (dateNode?.date) {
			date = dateNode.date;
		}

		const code = step?.['procedural-step-code'] || '';

		steps.push({
			phase: typeof phase === 'string' ? phase : '',
			description: desc ? `${code ? code + ': ' : ''}${desc}` : (typeof code === 'string' && code ? code : null),
			date,
			status: null,
		});
	}

	steps.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.localeCompare(a.date);
	});

	return steps;
}

/** Extract Unitary Patent Protection data. */
export function extractUnitaryPatent(data: any, docId: string): UnitaryPatentResponse {
	const protections: UnitaryPatentResponse['protections'] = [];

	const doc = findRegisterDocument(data);
	if (!doc) {
		return { docId, hasUnitaryEffect: false, protections };
	}

	const uppData = doc?.['unitary-patent-protection'] || doc?.['upp-data'];
	if (!uppData) {
		return { docId, hasUnitaryEffect: false, protections };
	}

	const countries = uppData?.['participating-state'] || uppData?.['country'];
	if (countries) {
		const countryList = Array.isArray(countries) ? countries : [countries];
		for (const c of countryList) {
			const country = typeof c === 'string' ? c : (c?.['$'] || c?.country || '');
			const status = c?.['@status'] || c?.status || null;
			const date = c?.['@date'] || c?.date || null;

			if (country) {
				protections.push({
					country,
					status: typeof status === 'string' ? status : null,
					date: typeof date === 'string' ? date : null,
				});
			}
		}
	}

	return {
		docId,
		hasUnitaryEffect: protections.length > 0,
		protections,
	};
}

// ============================================================================
// Family biblio / family legal (/family/publication .../biblio, .../legal)
// ============================================================================

/** Extract family members with bibliographic details (title, applicants). */
export function extractFamilyBiblioMembers(data: any): { members: FamilyBiblioMember[]; familyId?: string } {
	const members: FamilyBiblioMember[] = [];

	const patentFamily = data?.['patent-family'];
	if (!patentFamily) return { members };

	const familyId = patentFamily?.['@family-id'] || undefined;
	const familyMembers = patentFamily?.['family-member'];
	if (!familyMembers) return { members, familyId };

	const memberList = Array.isArray(familyMembers) ? familyMembers : [familyMembers];

	for (const member of memberList) {
		const pubRef = member?.['publication-reference']?.['document-id'];
		if (!pubRef) continue;

		const refObj = Array.isArray(pubRef) ? pubRef[0] : pubRef;
		const country = refObj?.country || '';
		const number = refObj?.['doc-number'] || '';
		const kind = refObj?.kind || null;
		const date = refObj?.date || null;
		const docId = `${country}${number}`;

		let title: string | null = null;
		const titleNode = member?.['exchange-document']?.['bibliographic-data']?.['invention-title'];
		if (titleNode) {
			const titles = Array.isArray(titleNode) ? titleNode : [titleNode];
			const enTitle = titles.find((t: any) => t?.['@lang'] === 'en') || titles[0];
			title = typeof enTitle === 'string' ? enTitle : (enTitle?.['$'] || enTitle?.text || null);
		}

		const applicants: string[] = [];
		const applicantNode = member?.['exchange-document']?.['bibliographic-data']?.['parties']?.['applicants']?.['applicant'];
		if (applicantNode) {
			const appList = Array.isArray(applicantNode) ? applicantNode : [applicantNode];
			for (const app of appList) {
				const name = app?.['applicant-name']?.name || app?.['applicant-name']?.['$'] || null;
				if (name) applicants.push(name);
			}
		}

		members.push({ docId, title, applicants, country, kind, date });
	}

	return { members, familyId };
}

/** Extract legal events for every family member, newest first. */
export function extractFamilyLegalEvents(data: any): FamilyLegalEvent[] {
	const events: FamilyLegalEvent[] = [];

	const patentFamily = data?.['patent-family'];
	if (!patentFamily) return events;

	const familyMembers = patentFamily?.['family-member'];
	if (!familyMembers) return events;

	const memberList = Array.isArray(familyMembers) ? familyMembers : [familyMembers];

	for (const member of memberList) {
		// Get member doc ID
		const pubRef = member?.['publication-reference']?.['document-id'];
		const refObj = Array.isArray(pubRef) ? pubRef?.[0] : pubRef;
		const memberDocId = refObj ? `${refObj?.country || ''}${refObj?.['doc-number'] || ''}` : '';

		const legalEvents = member?.legal;
		if (!legalEvents) continue;

		const eventList = Array.isArray(legalEvents) ? legalEvents : [legalEvents];

		for (const evt of eventList) {
			let eventDate = '';
			if (evt?.['L019EP']?.text) eventDate = evt['L019EP'].text;
			if (!eventDate && evt?.['L007EP']?.text) eventDate = evt['L007EP'].text;
			if (!eventDate && evt?.['L500EP']?.['L525EP']?.text) eventDate = evt['L500EP']['L525EP'].text;

			const country = evt?.['L001EP']?.text || null;
			const desc = evt?.['@desc'] || evt?.text || null;

			events.push({
				familyMemberDocId: memberDocId,
				code: evt?.['@code']?.trim() || '',
				date: eventDate,
				country,
				text: desc,
				...extractLegalEventDetails(evt),
			});
		}
	}

	events.sort((a, b) => {
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.localeCompare(a.date);
	});

	return events;
}

// ============================================================================
// Images / figures
// ============================================================================

/** Extract image inquiry metadata (formats, page counts, drawing start page). */
export function extractImageInquiry(json: any, cleanedDoc: string): ImageInquiryData {
	const result: ImageInquiryData = {
		docId: cleanedDoc,
		formats: [],
	};

	// Navigate: world-patent-data > document-inquiry > inquiry-result(s)
	// Note: xmlToJson strips namespace prefixes (ops: removed)
	const inquiry =
		json?.['world-patent-data']?.['document-inquiry'] ||
		json?.['document-inquiry'];

	if (!inquiry) return result;

	// There may be multiple inquiry-result blocks (one per kind code: A1, A2, B1...)
	const inquiryResults = inquiry?.['inquiry-result'];
	const resultList = Array.isArray(inquiryResults) ? inquiryResults : inquiryResults ? [inquiryResults] : [];

	for (const ir of resultList) {
		// Each inquiry-result has document-instance entries
		const instances = ir?.['document-instance'];
		if (!instances) continue;

		const instanceList = Array.isArray(instances) ? instances : [instances];

		for (const inst of instanceList) {
			const desc = inst?.['@desc'];
			const link = inst?.['@link'] || '';

			// Only interested in Drawing/FullDocument with fullimage links
			if (desc !== 'Drawing' && desc !== 'FullDocument') continue;
			if (link.includes('thumbnail')) continue;

			const pages = Number.parseInt(inst?.['@number-of-pages'] || '1', 10);

			// Extract available formats from document-format-options
			const formatOptions = inst?.['document-format-options']?.['document-format'];
			const availableFormats: string[] = [];
			if (formatOptions) {
				const fmtList = Array.isArray(formatOptions) ? formatOptions : [formatOptions];
				for (const f of fmtList) {
					const mimeType = typeof f === 'string' ? f : f?.text || f;
					if (typeof mimeType === 'string') {
						// Convert MIME type to short format: application/tiff -> tiff, image/png -> png
						const short = mimeType.split('/').pop() || mimeType;
						availableFormats.push(short.toLowerCase());
					}
				}
			}

			// Every document section with its 1-based start page (#589): a
			// FullDocument instance lists ABSTRACT, BIBLIOGRAPHY, DESCRIPTION,
			// CLAIMS, DRAWINGS and, on an A1, SEARCH_REPORT. The drawings end
			// where the next section starts, so the caller needs them all.
			const sectionNodes = inst?.['document-section'];
			const sectionList = Array.isArray(sectionNodes) ? sectionNodes : sectionNodes ? [sectionNodes] : [];
			const sections: Record<string, number> = {};
			for (const section of sectionList) {
				const name = section?.['@name'];
				const startPage = Number.parseInt(section?.['@start-page'] || '', 10);
				if (typeof name === 'string' && name && Number.isFinite(startPage)) {
					sections[name] = startPage;
				}
			}
			const drawingSection = sectionList.find((s: any) => s?.['@name'] === 'DRAWINGS');
			const drawingStartPage = drawingSection
				? Number.parseInt(drawingSection?.['@start-page'] || '1', 10)
				: undefined;

			result.formats.push({
				format: availableFormats[0] || 'tiff',
				pages,
				link,
				availableFormats,
				drawingStartPage,
				sections,
			});
		}
	}

	return result;
}
