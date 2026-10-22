/*---------------------------------------------------------------------------------------------
 *  Simple-family coverage note (#450).
 *
 *  Vocabulary (CONTEXT.md, "Family vs priority chain"): the SIMPLE family is
 *  the same invention republished across offices — the unit of COUNTING
 *  inventions. The EXTENDED (INPADOC) family adds everything linked through
 *  common priorities — divisionals, continuations, and the grants those
 *  applications issued as — and is the unit of COVERAGE, where a right
 *  reaches. CONTEXT.md's own rule is "avoid bare 'family' when you mean the
 *  extended one"; `get_patent_family` is a bare-family name on the narrow
 *  read, and #450 is what that costs.
 *
 *  The failure this module answers: asked for the US family members of
 *  EP2110298B1, an agent called the simple-family tool, got the two pre-grant
 *  A1 publications, and reported them as the family. Both applications had
 *  granted (US7722129B2, US8056987B2) and the answer never said so. A
 *  pre-grant publication and a granted patent are different legal objects, so
 *  that reads as though the applications are still pending.
 *
 *  Two earlier attempts to fix this by DESCRIPTION alone did not hold: the
 *  tool description and the served registry docs both already spell out the
 *  distinction and name the sibling tool. Name salience beats description at
 *  routing time. So the correction is moved into the RESPONSE, where the
 *  model reads it after it has already committed to the wrong tool.
 *
 *  ── Why this composes OUTSIDE the cache ──────────────────────────────────
 *  The coverage block is computed per response from two independently cached
 *  reads (`family-equivalents` and `family`), and NEITHER cached artifact
 *  changes shape. That is deliberate: OPS_RESPONSE_SHAPE_VERSION (#433) is
 *  module-wide, so bumping it cold-starts every EPO read — figure binaries and
 *  full-text included — against paid quota. Composing outside the cache buys
 *  the same staleness guarantee for free.
 *
 *  If you ever move this computation INSIDE a cachedProviderRead, that
 *  reasoning stops holding and you must bump OPS_RESPONSE_SHAPE_VERSION in the
 *  same commit.
 *
 *  ── That condition was reached (#451) ────────────────────────────────────
 *  The coverage block above still composes outside the cache. The
 *  representative-publication block below does NOT: it is READ off the cached
 *  extended-family payload, which #451 gave a new `representatives` key. A
 *  warm pre-#451 family entry answers that read with `undefined`, so
 *  OPS_RESPONSE_SHAPE_VERSION was bumped to 3 in the same commit — see that
 *  constant for the full reasoning.
 *
 *  ── What #455 changed under it ───────────────────────────────────────────
 *  The coverage block counts DISTINCT PUBLICATIONS in the extended family, off
 *  the extended read's `members` rows. Those rows used to deduplicate on
 *  country+number, so every republication of a document number — the grant
 *  among them — was missing from the count and from `missingPublications`:
 *  EP2110298's own B1 was not listed as something the simple family omits, and
 *  EP2170959B1 under-reported by 16. The rows are complete now, so this block
 *  reports more missing publications than it did, and more of them grants. The
 *  computation here is unchanged; only its input got honest.
 *
 *  ── Two blocks, one question ─────────────────────────────────────────────
 *  `extendedFamily` says what this list LEFT OUT. `representatives` says, for
 *  what it DID return, which number to cite — US2009261648 is a pre-grant
 *  publication of a member whose representative is US7722129B2. The second is
 *  #451: three surfaces answered "the family" with three different publication
 *  numbers for the same member, and the rule that settles it lives in
 *  `lib/representative-publication.ts`.
 *--------------------------------------------------------------------------------------------*/

import type { EquivalentsFamilyData, FamilyMember } from '../ops/types.js';
import {
	isGrantKind,
	REPRESENTATIVE_PUBLICATION_RULE,
	REPRESENTATIVE_PUBLICATION_RULE_TEXT,
	type FamilyRepresentatives,
	type RepresentativeMember,
} from '../representative-publication.js';
import type { ToolContext } from './definition.js';

/** Most publications we name in the note; beyond this the count still tells the truth. */
const MAX_LISTED_PUBLICATIONS = 25;

/** One extended-family publication the simple family does not list. */
export interface MissingPublication {
	/** Citable publication number, e.g. "US7722129B2". */
	publication: string;
	/** Kind code as OPS wrote it, or null when OPS served none. */
	kind: string | null;
	/**
	 * True when the kind code says this is a granted patent rather than a
	 * pre-grant publication — `isGrantKind` in
	 * `lib/representative-publication.ts`, which is also the grant half of the
	 * representative-publication rule. `A` is left false rather than guessed,
	 * because a pre-2001 US grant carries it too and an unqualified guess is
	 * exactly the kind of confident wrong answer this module exists to prevent.
	 */
	isGrant: boolean;
}

/**
 * What the simple family leaves out, attached to the simple-family response
 * when the extended family holds publications it does not list.
 */
export interface ExtendedFamilyCoverage {
	/** The tool that serves the extended family. Named so an agent can act on this. */
	tool: 'get_family';
	/** Distinct publications in the extended INPADOC family. */
	extendedFamilyPublications: number;
	/** How many of those this simple-family list does not contain. */
	missingPublicationCount: number;
	/** Those publications, up to {@link MAX_LISTED_PUBLICATIONS}. */
	missingPublications: MissingPublication[];
	/** How many of the missing ones are granted patents (see {@link MissingPublication.isGrant}). */
	missingGrantCount: number;
	/** Prose the reading model acts on. */
	note: string;
}

/** The simple-family response plus whichever of the two blocks it earns. */
export type EquivalentsFamilyWithCoverage = EquivalentsFamilyData & {
	extendedFamily?: ExtendedFamilyCoverage;
	/**
	 * The representative publication of each member this list returned (#451).
	 * Absent when the extended read failed, or when no listed publication could
	 * be placed in a member — never guessed.
	 */
	representatives?: FamilyRepresentatives;
};

/**
 * Compare two publication numbers by document identity, ignoring the kind code
 * and any punctuation — "US7722129B2", "US7722129 B2" and "US.7722129.B2" are
 * one document.
 *
 * The simple-family extractor writes `docId` as `<country><doc-number>[.<kind>]`
 * when OPS states a country and kind, and as the bare epodoc doc-number (which
 * already carries the country) when it does not — production returns the latter
 * for EP2110298B1. Both shapes have to key the same way, so the country is
 * prepended only when it is not already the prefix.
 */
function documentKey(country: string | null | undefined, docNumber: string, kind: string | null | undefined): string {
	const cc = (country ?? '').toUpperCase().replace(/[^A-Z]/g, '');
	let key = docNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (cc && !key.startsWith(cc)) {
		key = cc + key;
	}
	if (kind) {
		// OPS named the kind, so remove it by name rather than by pattern.
		const k = kind.toUpperCase().replace(/[^A-Z0-9]/g, '');
		if (k && key.length > k.length && key.endsWith(k)) {
			return key.slice(0, -k.length);
		}
		return key;
	}
	// No kind field: strip a trailing kind code if the string ends in one. A
	// doc-number ends in a digit, so a trailing letter can only be a kind.
	return key.replace(/[A-Z]\d?$/, '');
}

function coverageNote(
	simpleCount: number,
	extendedCount: number,
	missing: MissingPublication[],
	missingTotal: number,
	grantCount: number
): string {
	const listed = missing.map((m) => m.publication).join(', ');
	const overflow = missingTotal > missing.length ? `, and ${missingTotal - missing.length} more` : '';
	const grants = grantCount
		? ` ${grantCount} of them ${grantCount === 1 ? 'is a granted patent' : 'are granted patents'} — a grant and a pre-grant publication are different legal objects, and this list holds only what /equivalents returned.`
		: ' Their kind codes are not stated here, so whether any of them is a grant is unknown from this list alone.';
	return (
		`This is the SIMPLE family (${simpleCount} publication${simpleCount === 1 ? '' : 's'}): the same invention ` +
		`republished across offices. The EXTENDED INPADOC family holds ${extendedCount}, including ` +
		`${missingTotal} this list does not contain (${listed}${overflow}).${grants} ` +
		`Do not answer a "what is the family / where is this protected / which US members exist" question from ` +
		`this list alone — call get_family for the extended family first.`
	);
}

/**
 * Attach the coverage note to a simple-family response when the extended
 * family holds publications the simple family does not.
 *
 * Add-only and best-effort: if the extended read fails, rate-limits or returns
 * nothing more, the simple-family payload is returned exactly as before with no
 * `extendedFamily` key. A probe must never turn a working family read into an
 * error, least of all under the EPO backpressure the OPS path has already been
 * bitten by.
 */
export async function withExtendedFamilyCoverage(
	ctx: ToolContext,
	simple: EquivalentsFamilyData,
	documentId: string
): Promise<EquivalentsFamilyWithCoverage> {
	try {
		const extended = await ctx.connectors.ops.getFamily(documentId);
		if (!extended.ok) {
			return simple;
		}
		return attachRepresentatives(
			attachCoverage(simple, extended.data.members),
			extended.data.representatives
		);
	} catch {
		return simple;
	}
}

/** The pure half: the subset comparison, with no upstream call in it. */
export function attachCoverage(
	simple: EquivalentsFamilyData,
	members: FamilyMember[]
): EquivalentsFamilyWithCoverage {
	const simpleMembers = simple.familyMembers ?? [];
	const simpleKeys = new Set(
		simpleMembers.map((m) => documentKey(m.country, m.docNumber ?? m.docId, m.kind))
	);

	// One entry per distinct publication. `application` and `priority` members
	// resolve to a publication that the family's own publication rows already
	// carry, so counting only publication rows counts each document once.
	const extendedPublications = new Map<string, MissingPublication>();
	for (const member of members) {
		if (member.refType !== 'publication' || !member.publication) {
			continue;
		}
		const key = documentKey(member.country, member.number, member.kind);
		if (!extendedPublications.has(key)) {
			extendedPublications.set(key, {
				publication: member.publication,
				kind: member.kind,
				isGrant: isGrantKind(member.kind),
			});
		}
	}

	const missing = [...extendedPublications.entries()]
		.filter(([key]) => !simpleKeys.has(key))
		.map(([, publication]) => publication);
	if (missing.length === 0) {
		return simple;
	}

	const listed = missing.slice(0, MAX_LISTED_PUBLICATIONS);
	const missingGrantCount = missing.filter((m) => m.isGrant).length;
	return {
		...simple,
		extendedFamily: {
			tool: 'get_family',
			extendedFamilyPublications: extendedPublications.size,
			missingPublicationCount: missing.length,
			missingPublications: listed,
			missingGrantCount,
			note: coverageNote(
				simpleMembers.length,
				extendedPublications.size,
				listed,
				missing.length,
				missingGrantCount
			),
		},
	};
}


/**
 * Name the representative publication of every member this simple-family list
 * returned, using the member grouping the extended read already carries (#451).
 *
 * The simple family is a flat list of publications with no application behind
 * them — `/equivalents` serves no grouping at all — so the members come from
 * the extended read's `representatives` block. That is deliberate rather than
 * convenient: reusing the extended read's own answer is what makes the two OPS
 * tools agree by construction, where computing it twice is how they came to
 * disagree in the first place.
 *
 * Add-only: a listed publication that cannot be placed in any member is
 * gathered into a trailing entry that names no representative, and when NO row
 * can be placed the block is omitted entirely rather than served empty.
 */
export function attachRepresentatives(
	simple: EquivalentsFamilyWithCoverage,
	extended: FamilyRepresentatives | undefined
): EquivalentsFamilyWithCoverage {
	if (!extended) {
		return simple;
	}

	// One lookup from any publication of a member to that member.
	const memberOfPublication = new Map<string, RepresentativeMember>();
	for (const member of extended.members) {
		for (const publication of member.publications) {
			memberOfPublication.set(documentKey(undefined, publication, null), member);
		}
	}

	// Entries in the order the members first appear among the listed rows, so
	// the block reads down beside `familyMembers`.
	const listed = new Map<RepresentativeMember, string[]>();
	const unplaced: string[] = [];
	for (const row of simple.familyMembers ?? []) {
		const member = memberOfPublication.get(documentKey(row.country, row.docNumber ?? row.docId, row.kind));
		if (!member) {
			unplaced.push(row.docId);
			continue;
		}
		listed.set(member, [...(listed.get(member) ?? []), row.docId]);
	}
	if (listed.size === 0) {
		return simple;
	}

	const members: RepresentativeMember[] = [...listed.entries()].map(([member, publications]) => ({
		application: member.application,
		representativePublication: member.representativePublication,
		isGrant: member.isGrant,
		publications,
	}));
	if (unplaced.length > 0) {
		members.push({
			application: null,
			representativePublication: null,
			isGrant: false,
			publications: unplaced,
		});
	}

	const pregrant = members.filter(
		(m) => m.representativePublication && !m.publications.includes(m.representativePublication)
	);
	const correction = pregrant.length
		? ` ${pregrant.length === 1 ? 'One publication' : `${pregrant.length} publications`} listed here ` +
			`${pregrant.length === 1 ? 'is' : 'are'} NOT the representative of ${pregrant.length === 1 ? 'its' : 'their'} ` +
			`member: cite ${pregrant.map((m) => m.representativePublication).join(', ')} instead.`
		: '';
	return {
		...simple,
		representatives: {
			rule: REPRESENTATIVE_PUBLICATION_RULE,
			members,
			note:
				`One entry per family MEMBER (one application) behind the publications this list ` +
				`returned. ${REPRESENTATIVE_PUBLICATION_RULE_TEXT} ` +
				`\`publications\` is what THIS list returned for that member; ` +
				`\`representativePublication\` is the number to cite for it, read from the extended ` +
				`INPADOC family (get_family), which is where the grouping lives.${correction} ` +
				`get_family and the PATSTAT graph (/v1/patstat/graph/patent) apply the same rule, so ` +
				`the three surfaces name the same number for the same member.` +
				(unplaced.length > 0
					? ` ${unplaced.length} listed publication${unplaced.length === 1 ? '' : 's'} could not be ` +
						`placed in any member and ${unplaced.length === 1 ? 'names' : 'name'} no representative.`
					: ''),
		},
	};
}
