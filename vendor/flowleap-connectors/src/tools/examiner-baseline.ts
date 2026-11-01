/*---------------------------------------------------------------------------------------------
 *  examiner_baseline — the Examiner Baseline as one tool (#548, PRD 0019 F1b,
 *  agent-v2 ADR 0010 decision 2; in the package since #180).
 *
 *  Walks the INPADOC family of a publication (`get_family`), reads the
 *  `references-cited` block of every publication of every member
 *  (`get_bibliography`), adds the USPTO enriched office-action citations for
 *  granted US members (`get_us_grant` resolves the application number,
 *  `search_office_action_citations` reads the rows, size 1000), and returns one
 *  matrix: cited document × office.
 *
 *  A port of flowleap-cli `src/commands/examiner_baseline.rs` (cli#127). The JSON
 *  shape is that verb's `--json` output, field for field: the Find Better skill
 *  and the report writer read it. Add fields, never rename.
 *
 *  Verified-Data Contract: no model is called. Every category, claim list and
 *  count comes from a provider response, computed here, never by the agent. A
 *  member whose office returned no citation record is a gap row, never "nothing
 *  cited".
 *
 *  Every read is free on the host's own keys (EPO OPS, USPTO ODP, OpenAlex), so
 *  every host runs the tool. Split so the logic is testable without a provider:
 *  `collectBaseline` does the I/O through the sibling office tools' own
 *  handlers (in process, over the same ToolContext: the same caches and error
 *  mapping, never an HTTP self-call) and keeps every raw answer;
 *  `assembleBaseline` is pure.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';
import { getCacheKey } from '../cache-key.js';
import { recordCacheRead } from '../cache-visibility.js';
import { UpstreamUnavailableError } from '../errors.js';
import {
	NPL_RESOLVE_SHAPE_VERSION,
	SKIPPED,
	resolveNplReferences,
	type NplResolution,
	type NplResolutionStats,
	type NplWorkSummary,
} from '../npl-resolve/index.js';
import { OPS_RESPONSE_SHAPE_VERSION } from '../ops/types.js';
import type { ToolContext, ToolDefinition } from './definition.js';
import { ToolError, flexibleId, tool } from './shared.js';

/** The largest page `search_office_action_citations` serves. */
const ENRICHED_PAGE_SIZE = 1000;

const SOURCE_OPS = 'ops_biblio';
const SOURCE_ENRICHED = 'uspto_enriched';

/**
 * Version of the Baseline response shape, in the cache key. Bump it in the same
 * commit as any change to what `assembleBaseline` returns, or a warm entry keeps
 * serving the old shape for the full TTL (the #433 lesson). The key also carries
 * OPS_RESPONSE_SHAPE_VERSION, so an OPS shape bump cold-starts this tool too.
 */
export const EXAMINER_BASELINE_SHAPE_VERSION = 2;

/** Same window as the citation reads it is built from (24h). */
const BASELINE_TTL = 60 * 60 * 24;

type Json = Record<string, unknown>;

// ============================================================================
// Collection (I/O)
// ============================================================================

/** Run one sibling tool in process: input validated by its own schema, handler called directly. */
export type ToolRunner = (name: string, input: Json, ctx: ToolContext) => Promise<unknown>;

export interface ReadError {
	status: number | null;
	code: string | null;
	message: string | null;
}

/** One tool answer as the walk keeps it: the data, or a failure recorded as a gap. */
export type Read = { ok: true; data: unknown } | { ok: false; error: ReadError };

/** Everything the providers answered, before any interpretation. */
export interface Collected {
	publication: string;
	family: unknown;
	/** Biblio read per publication number. */
	biblio: Record<string, Read>;
	/** Per US representative publication: the grant read that resolves the application number. */
	usGrants: Record<string, Read>;
	/** Per USPTO application number: the enriched-citation read. */
	enriched: Record<string, Read>;
}

/**
 * Statuses a human must act on: sign-in (401/403), the subscription gate (402),
 * a rate limit (429), a retired endpoint (410). They stop the walk with the
 * facade's usual error shape instead of becoming a gap row.
 */
const STOP_STATUSES = new Set([401, 402, 403, 410, 429]);

/**
 * Keep a per-document failure (not found, invalid number, an office-side 5xx) as
 * data, so one unreadable member becomes a gap row instead of ending the walk.
 * Everything else rethrows unchanged: the typed key errors (400
 * data_keys_required, patent_provider_key_invalid), the trial data budget, a
 * provider rate limit, and any status in STOP_STATUSES, so the route answers
 * them with its usual envelope.
 */
function softFailure(error: unknown): ReadError {
	if (error instanceof ToolError && !STOP_STATUSES.has(error.status)) {
		return { status: error.status, code: error.code, message: error.message };
	}
	if (error instanceof UpstreamUnavailableError) {
		return { status: error.statusCode, code: 'upstream_unavailable', message: error.message };
	}
	throw error;
}

async function softCall(run: ToolRunner, name: string, input: Json, ctx: ToolContext): Promise<Read> {
	try {
		return { ok: true, data: await run(name, input, ctx) };
	} catch (error) {
		return { ok: false, error: softFailure(error) };
	}
}

/** The I/O half of the tool. The family read is the walk itself: its failure fails the call. */
export async function collectBaseline(publication: string, run: ToolRunner, ctx: ToolContext): Promise<Collected> {
	const family = await run('get_family', { patent_number: publication }, ctx);
	const collected: Collected = { publication, family, biblio: {}, usGrants: {}, enriched: {} };

	for (const member of familyMembers(family, publication)) {
		for (const number of member.publications) {
			if (collected.biblio[number]) {
				continue;
			}
			collected.biblio[number] = await softCall(
				run,
				'get_bibliography',
				{ patent_number: number, include_designated_states: false },
				ctx
			);
		}

		const grantNumber = usGrantNumber(member.representative);
		if (!grantNumber) {
			continue;
		}
		const grant = await softCall(run, 'get_us_grant', { patent_number: grantNumber }, ctx);
		collected.usGrants[member.representative] = grant;
		const application = grant.ok ? usApplicationNumber(grant.data) : null;
		if (application && !collected.enriched[application]) {
			collected.enriched[application] = await softCall(
				run,
				'search_office_action_citations',
				{ application_number: application, size: ENRICHED_PAGE_SIZE, offset: 0, examiner_cited_only: false },
				ctx
			);
		}
	}
	return collected;
}

// ============================================================================
// Family reading
// ============================================================================

/** One family member (one application) as the walk sees it. */
export interface FamilyMember {
	office: string;
	/** DOCDB application value from the family read. A label only, never a filing number. */
	docdbApplication: string | null;
	representative: string;
	publications: string[];
}

function asRecord(value: unknown): Json | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function str(value: unknown, key: string): string | null {
	const raw = asRecord(value)?.[key];
	if (typeof raw !== 'string') {
		return null;
	}
	const trimmed = raw.trim();
	return trimmed ? trimmed : null;
}

/**
 * The members of a `get_family` answer, from its `representatives` block (one
 * entry per application). An answer without that block falls back to one member
 * per distinct publication row, so nothing is dropped.
 */
export function familyMembers(family: unknown, requested: string): FamilyMember[] {
	const representatives = asRecord(asRecord(family)?.representatives)?.members;
	let members: FamilyMember[];
	if (Array.isArray(representatives)) {
		members = representatives.flatMap((entry): FamilyMember[] => {
			const representative = asRecord(entry)?.representativePublication;
			if (typeof representative !== 'string') {
				return [];
			}
			const publications = asArray(asRecord(entry)?.publications).filter((p): p is string => typeof p === 'string');
			const application = asRecord(entry)?.application;
			return [{
				office: officeOf(representative),
				docdbApplication: typeof application === 'string' ? application : null,
				representative,
				publications: publications.length ? publications : [representative],
			}];
		});
	} else {
		const seen: string[] = [];
		for (const row of asArray(asRecord(family)?.members)) {
			const number = asRecord(row)?.publication;
			if (typeof number === 'string' && !seen.includes(number)) {
				seen.push(number);
			}
		}
		members = seen.map((number) => ({
			office: officeOf(number),
			docdbApplication: null,
			representative: number,
			publications: [number],
		}));
	}
	if (members.length === 0) {
		// A family read that names no member still has the requested document:
		// read it alone rather than report an empty walk.
		members.push({ office: officeOf(requested), docdbApplication: null, representative: requested, publications: [requested] });
	}
	return members;
}

/** The office of a publication number: its two-letter prefix. */
function officeOf(publication: string): string {
	return publication.slice(0, 2).toUpperCase();
}

/**
 * The bare patent number of a US grant publication (`US7722129B2` → `7722129`),
 * the input `get_us_grant` takes. Null for anything that is not a US utility
 * grant (B1/B2): only a grant resolves this way.
 */
export function usGrantNumber(publication: string): string | null {
	const match = /^US(?<digits>\d+)(?<kind>B1|B2)$/.exec(publication);
	return match?.groups?.digits ?? null;
}

/** The USPTO application number a `get_us_grant` answer names. */
function usApplicationNumber(grant: unknown): string | null {
	const record = asRecord(grant);
	const direct = record?.applicationNumberText;
	if (typeof direct === 'string' && direct) {
		return direct;
	}
	const nested = asRecord(asArray(record?.patentFileWrapperDataBag)[0])?.applicationNumberText;
	return typeof nested === 'string' && nested ? nested : null;
}

// ============================================================================
// The Baseline (the response shape)
// ============================================================================

/** One category with the claims the search report cites it against (OPS pairs them). */
export interface CategoryClaims {
	category: string;
	claims: string | null;
}

export interface Citation {
	/** `ops_biblio` or `uspto_enriched`. */
	source: typeof SOURCE_OPS | typeof SOURCE_ENRICHED;
	/** The citing publication (OPS) or the USPTO application number (enriched). */
	citing: string;
	/** `examiner`, `applicant` or `unknown`, as the source states it. */
	citedBy: string;
	category?: string;
	/** OPS: the claims the search report names (first list, verbatim). Enriched: the rejected claims. */
	relevantClaims?: string;
	/**
	 * OPS only: each category with its own claim list, when the search report
	 * pairs them (a combined `X,A` then says which claims are X). Additive (#548).
	 */
	categoryClaims?: CategoryClaims[];
	phase?: string;
	relevantPassages?: string[];
	officeActionDate?: string;
	officeActionType?: string;
}

export interface OfficeCell {
	/** The rendered cell: category and cited claims, or `applicant` when only the applicant cited it. */
	text: string;
	/** Every citation behind the cell, verbatim from its source. */
	citations: Citation[];
}

export interface CitedDocument {
	/** Dedupe key: country + number without kind (`US4964287`), or `NPL: <text>`. */
	document: string;
	/** Kind codes seen across the citations. */
	kinds: string[];
	/** Always null today: no cited document's family is read. */
	familyId: null;
	npl?: string;
	/**
	 * NPL rows only: the cited paper's OpenAlex record (get_npl_work), or why
	 * there is none. Added after assembly; `matched` is the only status whose
	 * `work` is the cited record.
	 */
	nplWork?: NplWorkSummary;
	/** Per office code. An office absent here did not cite the document (or is in `gaps`). */
	cells: Record<string, OfficeCell>;
}

export interface PublicationRead {
	publication: string;
	/** `read`, `no_citation_record` (the read worked and carried no block) or `read_failed`. */
	status: 'read' | 'no_citation_record' | 'read_failed';
	/** The office's own count of entries in the block. */
	citedCount: number;
	examinerCount: number;
	applicantCount: number;
	error?: ReadError;
}

export interface EnrichedRead {
	applicationNumber: string | null;
	status: 'read' | 'no_citation_record' | 'not_resolved' | 'read_failed';
	rows: number;
	total: number | null;
	/** Rows that name no cited document (kept in the count, not in the matrix). */
	unidentifiedRows: number;
	error?: ReadError;
}

export interface MemberWalked {
	office: string;
	representativePublication: string;
	/** The DOCDB application value from the family read. A label, never a filing number. */
	docdbApplication: string | null;
	publications: PublicationRead[];
	/** Only on members with a US grant. */
	usptoEnriched?: EnrichedRead;
}

export interface Gap {
	office: string;
	/** The member's representative publication. */
	member: string;
	source: typeof SOURCE_OPS | typeof SOURCE_ENRICHED;
	reason: 'no_citation_record' | 'read_failed' | 'not_resolved';
	message: string;
}

export interface Baseline {
	publication: string;
	/** Column order of the matrix: the requested office first, then the offices of the members walked. */
	offices: string[];
	membersWalked: MemberWalked[];
	/** Matrix rows: examiner-cited first, then category-only, then the rest; alphabetical within a group. */
	documents: CitedDocument[];
	/** Members or sources that returned no citation record. A gap is not "nothing cited". */
	gaps: Gap[];
	/** Country + number, kind dropped. Family-level dedupe is not applied. */
	dedupe: 'docdb-number';
	/** How the NPL rows resolved to OpenAlex records (absent before resolution runs). */
	nplResolution?: NplResolutionStats;
}

/** Build the Baseline from the raw answers. Pure: no I/O, no model. */
export function assembleBaseline(collected: Collected): Baseline {
	const members = familyMembers(collected.family, collected.publication);
	const offices: string[] = [];
	const requestedOffice = officeOf(collected.publication);
	if (members.some((m) => m.office === requestedOffice)) {
		offices.push(requestedOffice);
	}
	for (const member of members) {
		if (!offices.includes(member.office)) {
			offices.push(member.office);
		}
	}

	const rows = new Map<string, CitedDocument>();
	const membersWalked: MemberWalked[] = [];
	const gaps: Gap[] = [];

	for (const member of members) {
		const publications = member.publications.map((number) =>
			readPublication(number, collected.biblio[number], member.office, rows)
		);
		for (const failed of publications.filter((p) => p.status === 'read_failed')) {
			gaps.push({
				office: member.office,
				member: member.representative,
				source: SOURCE_OPS,
				reason: 'read_failed',
				message: `could not read citations from ${member.office} (${failed.publication})${describeError(failed.error)}`,
			});
		}
		if (publications.every((p) => p.status !== 'read')) {
			gaps.push({
				office: member.office,
				member: member.representative,
				source: SOURCE_OPS,
				reason: 'no_citation_record',
				message: `no citation record from ${member.office} (${member.representative})`,
			});
		}

		let usptoEnriched: EnrichedRead | undefined;
		if (usGrantNumber(member.representative)) {
			usptoEnriched = readEnriched(collected, member.representative, member.office, rows);
			if (usptoEnriched.status !== 'read') {
				gaps.push({
					office: member.office,
					member: member.representative,
					source: SOURCE_ENRICHED,
					reason: usptoEnriched.status,
					message: enrichedGapMessage(member.representative, usptoEnriched),
				});
			}
		}

		const walked: MemberWalked = {
			office: member.office,
			representativePublication: member.representative,
			docdbApplication: member.docdbApplication,
			publications,
		};
		if (usptoEnriched) {
			walked.usptoEnriched = usptoEnriched;
		}
		membersWalked.push(walked);
	}

	const documents = [...rows.values()];
	for (const document of documents) {
		for (const cell of Object.values(document.cells)) {
			cell.text = cellText(cell.citations);
		}
	}
	documents.sort((a, b) => examinerRank(b) - examinerRank(a) || compareStrings(a.document, b.document));

	return { publication: collected.publication, offices, membersWalked, documents, gaps, dedupe: 'docdb-number' };
}

/** Byte order, as the reference implementation sorts (not locale order). */
function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function enrichedGapMessage(representative: string, enriched: EnrichedRead): string {
	const application = enriched.applicationNumber ?? '?';
	switch (enriched.status) {
		case 'not_resolved':
			return `US application number not resolved for ${representative}${describeError(enriched.error)}`;
		case 'read_failed':
			return `could not read USPTO enriched citations for ${representative} (application ${application})${describeError(enriched.error)}`;
		default:
			return `no USPTO enriched-citation record for ${representative} (application ${application})`;
	}
}

function describeError(error: ReadError | undefined): string {
	if (!error) {
		return '';
	}
	const parts = [error.status === null ? null : String(error.status), error.code].filter((p): p is string => !!p);
	return parts.length ? `: ${parts.join(' ')}` : '';
}

/** 2: any examiner citation; 1: a category but no examiner citation; 0: the rest. */
function examinerRank(document: CitedDocument): number {
	let rank = 0;
	for (const cell of Object.values(document.cells)) {
		for (const citation of cell.citations) {
			if (citation.citedBy === 'examiner') {
				return 2;
			}
			if (citation.category !== undefined) {
				rank = 1;
			}
		}
	}
	return rank;
}

function readPublication(
	publication: string,
	read: Read | undefined,
	office: string,
	rows: Map<string, CitedDocument>
): PublicationRead {
	const result: PublicationRead = { publication, status: 'no_citation_record', citedCount: 0, examinerCount: 0, applicantCount: 0 };
	if (!read || !read.ok) {
		result.status = 'read_failed';
		if (read && !read.ok) {
			result.error = read.error;
		}
		return result;
	}
	const references = asRecord(read.data)?.citedReferences;
	if (!Array.isArray(references) || references.length === 0) {
		return result;
	}
	result.status = 'read';
	result.citedCount = references.length;
	for (const reference of references) {
		const citedBy = str(reference, 'citedBy') ?? 'unknown';
		if (citedBy === 'examiner') {
			result.examinerCount++;
		} else if (citedBy === 'applicant') {
			result.applicantCount++;
		}
		const npl = str(reference, 'npl');
		const docId = str(reference, 'docId');
		const key = docId ? docKey(docId) : npl ? `NPL: ${npl}` : null;
		if (!key) {
			continue;
		}
		const citation: Citation = { source: SOURCE_OPS, citing: publication, citedBy };
		assignIfPresent(citation, 'category', str(reference, 'category'));
		assignIfPresent(citation, 'relevantClaims', str(reference, 'relevantClaims'));
		const pairs = categoryClaimsOf(reference);
		if (pairs.length) {
			citation.categoryClaims = pairs;
		}
		assignIfPresent(citation, 'phase', str(reference, 'phase'));
		const passages = asArray(asRecord(reference)?.relevantPassages).filter((p): p is string => typeof p === 'string');
		if (passages.length) {
			citation.relevantPassages = passages;
		}
		addCitation(rows, key, str(reference, 'kind'), docId ? null : npl, office, citation);
	}
	return result;
}

function categoryClaimsOf(reference: unknown): CategoryClaims[] {
	return asArray(asRecord(reference)?.categoryClaims).flatMap((pair): CategoryClaims[] => {
		const category = str(pair, 'category');
		return category ? [{ category, claims: str(pair, 'claims') }] : [];
	});
}

function assignIfPresent<K extends 'category' | 'relevantClaims' | 'phase' | 'officeActionDate' | 'officeActionType'>(
	citation: Citation,
	key: K,
	value: string | null
): void {
	if (value !== null) {
		citation[key] = value;
	}
}

function readEnriched(
	collected: Collected,
	representative: string,
	office: string,
	rows: Map<string, CitedDocument>
): EnrichedRead {
	const result: EnrichedRead = { applicationNumber: null, status: 'not_resolved', rows: 0, total: null, unidentifiedRows: 0 };
	const grant = collected.usGrants[representative];
	if (!grant) {
		return result;
	}
	if (!grant.ok) {
		result.error = grant.error;
		return result;
	}
	result.applicationNumber = usApplicationNumber(grant.data);
	const application = result.applicationNumber;
	if (!application) {
		return result;
	}
	const read = collected.enriched[application];
	if (!read || !read.ok) {
		result.status = 'read_failed';
		if (read && !read.ok) {
			result.error = read.error;
		}
		return result;
	}
	const total = asRecord(read.data)?.total;
	result.total = typeof total === 'number' ? total : null;
	const citations = asArray(asRecord(read.data)?.citations);
	result.rows = citations.length;
	result.status = citations.length ? 'read' : 'no_citation_record';
	for (const row of citations) {
		const record = asRecord(row);
		const isNpl = record?.isNPL === true;
		const citedText = str(row, 'citedDocument');
		const reference = str(record?.documentReference, 'publicationNumber');
		let key: string;
		let npl: string | null = null;
		if (isNpl && citedText) {
			key = `NPL: ${citedText}`;
			npl = citedText;
		} else if (reference) {
			key = docKey(reference);
		} else if (citedText) {
			key = docKey(citedText);
		} else {
			result.unidentifiedRows++;
			continue;
		}
		const citedBy = record?.examinerCited === true ? 'examiner' : record?.applicantCited === true ? 'applicant' : 'unknown';
		const citation: Citation = { source: SOURCE_ENRICHED, citing: application, citedBy };
		assignIfPresent(citation, 'category', str(row, 'category'));
		assignIfPresent(citation, 'relevantClaims', str(row, 'rejectedClaims'));
		assignIfPresent(citation, 'officeActionDate', str(row, 'officeActionDate')?.slice(0, 10) ?? null);
		assignIfPresent(citation, 'officeActionType', str(row, 'officeActionType'));
		addCitation(rows, key, null, npl, office, citation);
	}
	return result;
}

function addCitation(
	rows: Map<string, CitedDocument>,
	key: string,
	kind: string | null,
	npl: string | null,
	office: string,
	citation: Citation
): void {
	let row = rows.get(key);
	if (!row) {
		row = { document: key, kinds: [], familyId: null, cells: {} };
		if (npl) {
			row.npl = npl;
		}
		rows.set(key, row);
	}
	if (kind && !row.kinds.includes(kind)) {
		row.kinds.push(kind);
	}
	const cell = (row.cells[office] ??= { text: '', citations: [] });
	const signature = JSON.stringify(citation);
	if (!cell.citations.some((c) => JSON.stringify(c) === signature)) {
		cell.citations.push(citation);
	}
}

/**
 * The dedupe key of a cited patent document: country + number, uppercase,
 * punctuation and kind code removed, so OPS's `US2007052285` and USPTO's
 * `US 2007/0052285` (or `US20070052285`) meet on one row.
 */
export function docKey(raw: string): string {
	const compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
	if (compact.length < 3) {
		return compact;
	}
	const country = compact.slice(0, 2);
	let body = compact.slice(2);
	// Drop a trailing kind code (A, A1, B2, …) that follows a digit.
	let end = body.length;
	if (end >= 2 && /\d/.test(body[end - 1]) && /[A-Z]/.test(body[end - 2])) {
		end -= 2;
	} else if (end >= 1 && /[A-Z]/.test(body[end - 1])) {
		end -= 1;
	}
	if (end > 0 && /\d/.test(body[end - 1])) {
		body = body.slice(0, end);
	}
	// USPTO writes pre-grant publications as year + 7 digits; DOCDB as year + 6.
	// The extra digit is a leading zero.
	if (country === 'US' && /^(19|20)\d{2}0\d{6}$/.test(body)) {
		return `US${body.slice(0, 4)}${body.slice(5)}`;
	}
	return `${country}${body}`;
}

/**
 * The OPS label of one categorised citation. With per-category claim lists
 * (`categoryClaims`) each category names its own claims (`X cl. 13, A cl.
 * 1,5,9`); without them, the combined category and the one claim list.
 */
function categoryLabel(citation: Citation, category: string): string {
	if (citation.categoryClaims?.length) {
		return citation.categoryClaims.map((p) => (p.claims ? `${p.category} cl. ${p.claims}` : p.category)).join(', ');
	}
	return citation.relevantClaims ? `${category} cl. ${citation.relevantClaims}` : category;
}

/**
 * The cell text for one office: each distinct citation as category plus cited
 * claims, the citing side named when it is not the examiner. A bare `applicant`
 * (or `examiner`) appears only when no citation of the document in that office
 * carries a category.
 */
export function cellText(citations: Citation[]): string {
	const labelled: string[] = [];
	const bare: string[] = [];
	for (const citation of citations) {
		if (citation.category === undefined) {
			if (!bare.includes(citation.citedBy)) {
				bare.push(citation.citedBy);
			}
			continue;
		}
		let label = categoryLabel(citation, citation.category);
		if (citation.source === SOURCE_ENRICHED) {
			label += citation.officeActionDate ? ` (US OA ${citation.officeActionDate})` : ' (US OA)';
		}
		if (citation.citedBy !== 'examiner') {
			label += ` [${citation.citedBy}]`;
		}
		if (!labelled.includes(label)) {
			labelled.push(label);
		}
	}
	if (labelled.length) {
		return labelled.join('; ');
	}
	return (bare.includes('examiner') ? bare.filter((b) => b !== 'applicant') : bare).join('; ');
}

// ============================================================================
// Tool definition
// ============================================================================

export const EXAMINER_BASELINE_DESCRIPTION =
	'Examiner Baseline — every document cited across a granted patent\'s family, by office; computed, not assembled. ' +
	'One call walks the INPADOC family (get_family), reads the references-cited block of every publication of every ' +
	'member (EPO OPS bibliography) and, for each US grant, the USPTO enriched office-action citations ' +
	'(get_us_grant then search_office_action_citations), and returns one matrix: `documents[]` (one row per cited ' +
	'document, deduplicated by DOCDB number, kind dropped; family dedupe not applied, so `familyId` is null) × ' +
	'`offices[]`. Provenance: every category, claim list and count is copied from those office records by code, ' +
	'never inferred by a model; each cell keeps its `citations[]` verbatim with `source` (ops_biblio or ' +
	'uspto_enriched) and `citing` (the citing publication or US application). `membersWalked[]` gives each ' +
	'office\'s own counts per publication. `categoryClaims` pairs each search-report category with its own claims ' +
	'where OPS separates them (`category` and `relevantClaims` stay verbatim). A `gaps[]` row means that office ' +
	'returned no citation record or could not be read for that member: report it as a gap, never as "nothing cited". ' +
	'Each non-patent row (`npl`) carries `nplWork`: its OpenAlex record (title, DOI, abstract preview) when `status` ' +
	'is matched, similar works under `candidates` when none is certain, or why there is none; `nplResolution` counts them. ' +
	'Cite the Baseline from this tool; do not rebuild it from the individual reads.';

/**
 * Give every NPL row its OpenAlex record, through the get_npl_work handler (the
 * same cache and matching as the tool). A failed lookup stays on its row as
 * `lookup_failed`; it never fails the Baseline. Mutates and returns `baseline`.
 */
export async function attachNplWorks(baseline: Baseline, run: ToolRunner, ctx: ToolContext): Promise<Baseline> {
	const rows = baseline.documents.filter((d) => d.npl);
	const { byReference, stats } = await resolveNplReferences(
		rows.map((d) => d.npl as string),
		async (reference) => (await run('get_npl_work', { reference }, ctx)) as NplResolution
	);
	for (const row of rows) {
		row.nplWork = byReference.get(row.npl as string) ?? SKIPPED;
	}
	baseline.nplResolution = stats;
	return baseline;
}

/** True when any read behind the Baseline failed (a biblio, grant, enriched or NPL read with an error). */
function hasFailedRead(baseline: Baseline): boolean {
	if ((baseline.nplResolution?.failed ?? 0) > 0) {
		return true;
	}
	return baseline.membersWalked.some((member) =>
		member.publications.some((p) => p.status === 'read_failed') ||
		member.usptoEnriched?.status === 'read_failed' ||
		member.usptoEnriched?.error !== undefined
	);
}

/**
 * The tool, bound to a runner over the office tools' own handlers. One call
 * fans out to about ten upstream reads (a biblio per family publication, a
 * grant and an enriched read per US grant), so a host that rate-limits per
 * tool gives it a lower limit (the backend: 10 per minute).
 */
export function examinerBaselineTool(run: ToolRunner): ToolDefinition {
	return tool({
		name: 'examiner_baseline',
		annotations: { title: 'Examiner Baseline' },
		access: 'epoOps',
		description: EXAMINER_BASELINE_DESCRIPTION,
		input: z.object({
			publication: flexibleId(2).describe(
				'Publication number of a family member with its kind, e.g. EP2110298B1 or US7722129B2. The whole INPADOC family is walked.'
			),
		}),
		handler: async (input, ctx) => {
			const publication = input.publication.trim();
			const cacheKey = getCacheKey('examiner-baseline', {
				shape: EXAMINER_BASELINE_SHAPE_VERSION,
				ops: OPS_RESPONSE_SHAPE_VERSION,
				npl: NPL_RESOLVE_SHAPE_VERSION,
				publication,
			});
			const { cache } = ctx.connectors.host;
			const cached = await cache?.get<Baseline>(cacheKey);
			if (cached !== undefined && cached !== null) {
				recordCacheRead(true);
				return structuredClone(cached);
			}
			const baseline = await attachNplWorks(assembleBaseline(await collectBaseline(publication, run, ctx)), run, ctx);
			// A failed read is transient: never cache a Baseline that carries one.
			if (!hasFailedRead(baseline)) {
				await cache?.set(cacheKey, structuredClone(baseline), BASELINE_TTL);
			}
			return baseline;
		},
	});
}
