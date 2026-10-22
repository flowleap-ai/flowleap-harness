/*---------------------------------------------------------------------------------------------
 *  Full-text country-code router.
 *
 *  Makes get_claims / get_description provider-agnostic. EPO OPS serves full text
 *  only for EP/WO and 404s (raw `CLIENT.InvalidCountryCode` XML) for every other
 *  office. This router keeps OPS for the offices it covers, routes US claims to
 *  the BigQuery materialized full-text table, and returns a CLEAN "unavailable"
 *  result (not raw upstream XML) for every office and section with no source.
 *  So an agent can always tell "no source for this office" from a backend
 *  failure. The office coverage comes from ./office-coverage.ts; ADR 0024
 *  decided that no office outside EP, WO and US gets a text source until a
 *  customer names one, and that the `no_source` failure names the family-member
 *  workaround (get_family) instead of a pending office.
 *
 *  In the package since ADR 0019 C2a, so get_claims and get_description are
 *  defined once for both hosts. The BigQuery arm is a host capability
 *  (`ConnectorHost.usFulltext`, ./host.ts): the backend wires its table; a
 *  host without it answers US claims `not_configured` and names the paid
 *  route (the backend's get_claims over the FlowLeap MCP row), because on a
 *  self-hosted harness that gap is by design (ADR 0019 decision 3), not a
 *  misconfiguration the firm can fix.
 *--------------------------------------------------------------------------------------------*/

import { recordCacheRead } from './cache-visibility.js';
import type { ConnectorContext } from './context.js';
import { ErrorCodes } from './contract/error-codes.js';
import type { UsFulltextResult } from './host.js';
import { getClaims as getOpsClaims, getDescription as getOpsDescription, getFamily } from './ops/direct.js';
import { parseDocumentId } from './ops/utils.js';
import {
	FAMILY_MEMBER_WORKAROUND,
	familyMemberWorkaroundNote,
	officeCoverageSentence,
	officeList,
	paidTextRoute,
	servedTextOffices,
	textSourceFor,
	textSourceLabel,
	type PaidTextRoute,
	type TextSection,
} from './office-coverage.js';
import type { ProviderReadResult, ProviderReadFailure } from './cached-provider-read.js';
import type { ClaimsResponse, DescriptionData, FamilyMember } from './ops/types.js';

/**
 * Why full text is unavailable (cold-start walkthrough B6 / LB-2) — a
 * structured field alongside the frozen FULLTEXT_UNAVAILABLE code, so clients
 * can tell a switched-off feature from a genuine coverage gap without
 * matching message text:
 *  - 'not_configured': the table has a source for this office and section,
 *    but this host cannot read it — the backend with BigQuery US full text
 *    switched off, or a host with no US source at all (a self-hosted harness;
 *    the failure then also names the paid route in `paidRoute`);
 *  - 'no_source': no source covers this office/section at all.
 */
type FulltextUnavailableReason = 'not_configured' | 'no_source';

/**
 * The family-member workaround as structured data beside the message, so a
 * client acts on a field and never on message text (ADR 0014). On `no_source`
 * only: a configuration gap has no workaround.
 */
export interface FulltextWorkaround {
	tool: typeof FAMILY_MEMBER_WORKAROUND.tool;
	note: string;
}

/**
 * A clean, non-upstream failure telling the caller no source covers this
 * office/section. The message names the office coverage of the text tier and
 * the workaround tool, and no office as pending (ADR 0024).
 */
function unavailable(country: string, docId: string, section: string): ProviderReadFailure {
	const workaround: FulltextWorkaround = { tool: FAMILY_MEMBER_WORKAROUND.tool, note: familyMemberWorkaroundNote() };
	return fulltextFailure(
		'no_source',
		`No full-text source serves ${section} for ${country} publication ${docId}. ` +
			`${officeCoverageSentence()} ` +
			`Workaround: call ${workaround.tool} to find the ${officeList(servedTextOffices(), 'or')} member of the family. ` +
			`Then read its ${section}. The limits are in the workaround field beside this message.`,
		workaround,
	);
}

/**
 * The BigQuery US full-text table does not hold this publication. A holding
 * gap, not an office gap: the office is served, so the failure names the
 * table and carries no family-member workaround. The reason stays
 * `no_source` (the frozen values).
 */
function notHeld(docId: string, section: string): ProviderReadFailure {
	return fulltextFailure(
		'no_source',
		`The ${textSourceLabel('bigquery')} US full-text table does not hold ${section} for publication ${docId}.`,
	);
}

/**
 * The BigQuery US full-text source is switched off on this server. Distinct
 * from unavailable(): advertising "US claims via BigQuery" coverage while the
 * feature is off sent users chasing a data gap that is really a config gap.
 */
function notConfigured(docId: string, section: string): ProviderReadFailure {
	return fulltextFailure(
		'not_configured',
		`US full-text lookup is not configured on this server (${section} for ${docId}).`,
	);
}

/**
 * This host has no source for this section of this office at all (a self-hosted
 * harness running the office connectors on the firm's keys): the text is a paid
 * FlowLeap service, read by the backend's tool of the SAME name over the FlowLeap
 * MCP row (ADR 0019 decisions 3 and 5). The office-coverage table names that route
 * (`paidTextRoute`); the message names it so the model takes the paid route instead
 * of giving up on the text, and `paidRoute` carries it as a field (ADR 0014: clients
 * act on fields). Falls back to the plain not_configured when the table names no
 * paid route for the pair.
 */
function noHostSource(docId: string, section: TextSection, office: string): ProviderReadFailure {
	const route = paidTextRoute(section, office, docId);
	if (!route) return notConfigured(docId, section);
	return fulltextFailure(
		'not_configured',
		`This host has no ${textSourceLabel(route.source)} source. ${office} ${section} for ${docId} are a paid FlowLeap service, ` +
			`read by the backend's ${route.tool} (not this host's ${route.tool}): call ${route.mcpTool} with this number.`,
		undefined,
		route,
	);
}

function fulltextFailure(
	reason: FulltextUnavailableReason,
	message: string,
	workaround?: FulltextWorkaround,
	paidRoute?: PaidTextRoute,
): ProviderReadFailure {
	return {
		ok: false,
		status: 404,
		headers: {},
		body: {
			success: false,
			status: 404,
			error: {
				code: ErrorCodes.FULLTEXT_UNAVAILABLE,
				reason,
				message,
				// Additive (ADR 0014): present on `no_source` only.
				...(workaround ? { workaround } : {}),
				// Additive: present only when this host has no source for the pair and the
				// table names a paid route (the backend's tool over the FlowLeap MCP row).
				...(paidRoute ? { paidRoute } : {}),
			},
		},
	};
}

function countryOf(docId: string): string {
	return parseDocumentId(docId)?.country ?? '';
}

/** The host's US full-text source; a host without one has it switched off. */
function readUsFulltext(ctx: ConnectorContext, docId: string): Promise<UsFulltextResult> {
	const source = ctx.host.usFulltext;
	return source ? source.read(docId) : Promise.resolve({ ok: false, reason: 'disabled' });
}

/** The full-text sections the router serves; the name appears in the fallback note. */
type FulltextSection = 'claims' | 'description';

/**
 * Says that a full-text section came from the WO publication and not from the
 * EP number that was asked for. Add-only: present only on a fallback read.
 */
export interface EuroPctFallback {
	reason: 'euro_pct_fulltext_in_wo';
	requestedDocId: string;
	servedDocId: string;
	note: string;
}

export type RoutedClaims = ClaimsResponse & { fallback?: EuroPctFallback };
export type RoutedDescription = DescriptionData & { fallback?: EuroPctFallback };

/** An EP publication request: the number and the kind code as typed ('' when none was given). */
interface EpRequest {
	number: string;
	kind: string;
}

function parseEpRequest(docId: string): EpRequest | null {
	const compact = docId.trim().toUpperCase().replace(/[.\s,/-]/g, '');
	const match = compact.match(/^EP(\d+)([A-Z]\d?)?$/);
	return match ? { number: match[1], kind: match[2] ?? '' } : null;
}

/**
 * The fallback serves pre-grant text for pre-grant requests only. A granted EP
 * (B kind) has claims that the WO publication does not have, so a B read that
 * 404s stays a 404.
 */
function isPreGrantRequest(ep: EpRequest): boolean {
	return ep.kind === '' || ep.kind.startsWith('A');
}

/**
 * The WO publication of the PCT application that an EP publication is the
 * regional phase of, or null when the family does not show one.
 *
 * EPO full text holds no claims or description for most Euro-PCT EP A
 * publications: the text was published once, in the WO document. The link is
 * the INPADOC family: the PCT application (kind W) that was filed on the same
 * date as the EP application is the one the EP entered from.
 *
 * Null, and so no fallback, when:
 *  - the requested kind is not among the family's EP publications (a kind
 *    OPS never published is unavailable, not a Euro-PCT gap: "never
 *    substitute another kind" holds);
 *  - no kind was requested and the EP has a grant (the agent must name the
 *    kind it wants);
 *  - the EP application is not in the family, or has no filing date;
 *  - zero, or more than one, PCT application was filed on that date (two
 *    same-day PCTs in one family: no way to tell which one the EP entered from).
 */
function euroPctWoPublication(ep: EpRequest, members: FamilyMember[]): string | null {
	const epPublications = members.filter(m =>
		m.refType === 'publication' && m.country === 'EP' && m.number === ep.number);
	const requestedExists = ep.kind
		? epPublications.some(m => m.kind === ep.kind)
		: epPublications.length > 0 && epPublications.every(m => m.kind?.startsWith('A'));
	if (!requestedExists) return null;
	// The application row's `publication` is the citable one (first grant, else
	// earliest), so compare numbers, not the full publication string.
	const epApplication = members.find(m =>
		m.refType === 'application' && m.country === 'EP' && m.kind !== 'W'
		&& m.publication !== null && parseDocumentId(m.publication)?.number === ep.number);
	if (!epApplication?.date) return null;
	const woPublications = new Set(members
		.filter(m => m.refType === 'application' && m.kind === 'W' && m.date === epApplication.date
			&& m.publication?.startsWith('WO'))
		.map(m => m.publication as string));
	return woPublications.size === 1 ? [...woPublications][0] : null;
}

function euroPctFallback(requestedDocId: string, servedDocId: string, section: FulltextSection): EuroPctFallback {
	return {
		reason: 'euro_pct_fulltext_in_wo',
		requestedDocId,
		servedDocId,
		note: `${requestedDocId} is the European regional phase of a PCT application. EPO full text has no ${section} ` +
			`for it, so this is the ${section} text of ${servedDocId}, as published in the international phase. ` +
			`The European-phase text can differ if the applicant amended it on entry or in examination.`,
	};
}

/**
 * Read an EP/WO section from OPS; on a 404 for a pre-grant Euro-PCT EP, read
 * the same section from its WO publication and say so in `fallback`.
 *
 * Only a 404 is replaced. A family read or a WO read that fails for another
 * reason (429 rate limit, 503, a key refusal) is returned as that failure, so
 * a throttled agent sees the throttle and not a false NOT_FOUND.
 */
async function withEuroPctFallback<T extends { fallback?: EuroPctFallback }>(
	ctx: ConnectorContext,
	docId: string,
	section: FulltextSection,
	read: (id: string) => Promise<ProviderReadResult<T>>,
): Promise<ProviderReadResult<T>> {
	const primary = await read(docId);
	if (primary.ok || primary.status !== 404) return primary;
	const ep = parseEpRequest(docId);
	if (!ep || !isPreGrantRequest(ep)) return primary;
	const family = await getFamily(ctx, `EP${ep.number}`);
	if (!family.ok) return family.status === 404 ? primary : family;
	const wo = euroPctWoPublication(ep, family.data.members);
	if (!wo) return primary;
	const secondary = await read(wo);
	if (!secondary.ok) return secondary.status === 404 ? primary : secondary;
	// Cache honesty (./cache-visibility.ts): the EP 404 went
	// upstream (failures are never cached) and the family read has its own
	// bit; the tool's unwrapRead records the WO read's.
	recordCacheRead(false);
	recordCacheRead(family.cached);
	return { ...secondary, data: { ...secondary.data, fallback: euroPctFallback(docId, wo, section) } };
}

/**
 * Claims text for any publication number, routed by the office-coverage
 * table: EPO OPS for its offices (a pre-grant Euro-PCT EP falls back to its WO
 * publication), BigQuery for its offices, a clean unavailable result otherwise.
 */
export async function getClaimsRouted(
	ctx: ConnectorContext,
	docId: string,
	language = 'en',
): Promise<ProviderReadResult<RoutedClaims>> {
	const country = countryOf(docId);
	const source = textSourceFor('claims', country);

	if (source === 'epo_ops') {
		return withEuroPctFallback<RoutedClaims>(ctx, docId, 'claims', id => getOpsClaims(ctx, id, language));
	}
	if (source === 'bigquery') {
		const res = await readUsFulltext(ctx, docId);
		if (res.ok) {
			return { ok: true, cached: false, data: { docId: res.data.publicationNumber, lang: 'en', claims: res.data.claims } };
		}
		if (res.reason === 'disabled') {
			return ctx.host.usFulltext === undefined ? noHostSource(docId, 'claims', country) : notConfigured(docId, 'claims');
		}
		if (res.reason === 'not_found') {
			return notHeld(docId, 'claims');
		}
	}
	return unavailable(country || '??', docId, 'claims');
}

/**
 * Description text for any publication number, routed by the office-coverage
 * table (see getClaimsRouted). The table has no BigQuery row for description:
 * the US full-text table is claims-only (description was ~90% of its size), so
 * a US description is a clean unavailable result, never raw upstream XML.
 */
export async function getDescriptionRouted(
	ctx: ConnectorContext,
	docId: string,
	language = 'en',
): Promise<ProviderReadResult<RoutedDescription>> {
	const country = countryOf(docId);

	if (textSourceFor('description', country) === 'epo_ops') {
		return withEuroPctFallback<RoutedDescription>(ctx, docId, 'description', id => getOpsDescription(ctx, id, language));
	}
	return unavailable(country || '??', docId, 'description');
}
