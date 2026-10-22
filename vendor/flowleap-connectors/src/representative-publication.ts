/*---------------------------------------------------------------------------------------------
 *  The representative publication of a family member (#451) — ONE definition,
 *  referenced by every surface that answers "the family".
 *
 *  ── The rule ──────────────────────────────────────────────────────────────
 *  A family MEMBER is one application. An application publishes more than once
 *  — a pre-grant A1, a corrected A3, a B1 grant — and the three surfaces that
 *  answer "the family" were each picking a different one of those rows for the
 *  same member:
 *
 *    get_patent_family (OPS /equivalents)  US2009261648, US2010194184  (A1s)
 *    get_family        (OPS INPADOC)       every row, A1s and B2s alike
 *    /v1/patstat/graph/patent              US7722129B2, US8056987B2    (grants)
 *
 *  All three were defensible alone; together, the same question asked through
 *  the chat surface, the CLI and the analytics surface gave three different
 *  sets of numbers with nothing explaining why. A pre-grant publication and a
 *  granted patent are different legal objects, so an answer built from the A1s
 *  reads as though the applications are still pending, which is how #450 got
 *  published.
 *
 *  So: **the representative publication of a member is its FIRST GRANT where
 *  one exists, else its EARLIEST publication**. That is the number a reader can
 *  act on, and it is the rule the PATSTAT graph has applied since #419, after a
 *  dossier published a DOCDB internal identifier as a US application number.
 *  It is the one behaviour here that has been through a real bug report, so it
 *  is the rule the other surfaces were brought up to — not the reverse.
 *
 *  ── What counts as a grant ────────────────────────────────────────────────
 *  The rule is one rule; the EVIDENCE for "this publication is a grant"
 *  differs by source, and each caller supplies its own:
 *
 *  - PATSTAT states it outright: `tls211_pat_publn.publn_first_grant = 'Y'`.
 *    That flag is authoritative and is passed straight through as `isGrant`.
 *  - OPS states only a kind code, so {@link isGrantKind} reads the kind letter.
 *
 *  ── Why the code is shared rather than only the rule ──────────────────────
 *  The concept had been implemented three times independently and had already
 *  drifted in a way nobody noticed: the OPS family extractor counted only `B*`
 *  as a grant while #450's coverage note counted `B*` and `C*`, so a German
 *  C-grant family got a different answer from two functions in the same
 *  module. One exported rule is what stops the fourth copy.
 *
 *  This module imports nothing from `lib/ops` or `lib/patstat-graph` — both
 *  import IT — so no cycle can form. `lib/patent-number.ts` is the only
 *  dependency, and it is leaf-level for the same reason.
 *--------------------------------------------------------------------------------------------*/

import { parsePublicationNumber } from './patent-number.js';

/**
 * The machine-readable name of the rule, carried on every response that names
 * a representative publication so a consumer can tell that two surfaces agree
 * BY CONSTRUCTION rather than by coincidence.
 */
export const REPRESENTATIVE_PUBLICATION_RULE = 'first-grant-else-earliest';

/** The rule in one sentence, for docs and for prose notes in responses. */
export const REPRESENTATIVE_PUBLICATION_RULE_TEXT =
	'The representative publication of a family member (one application) is its first grant ' +
	'where one exists, else its earliest publication.';

/** One publication of a member, as far as choosing between them needs it. */
export interface PublicationCandidate {
	/** Rendered publication number, e.g. "US7722129B2". */
	publication: string;
	/** True when THIS source says the publication is a grant — see the header. */
	isGrant: boolean;
}

/**
 * The representative publication among a member's publications: the first
 * grant, else the earliest.
 *
 * `candidates` must be ordered EARLIEST PUBLICATION FIRST — the "else earliest"
 * half of the rule is the first element, and among several grants the first one
 * is the first grant. Callers hold the dates (or a date-ordered query) and the
 * ordering is theirs to get right.
 *
 * Returns the chosen candidate so a caller can read its other fields, or null
 * when the member has no publication at all: an unpublished filing has no
 * number to cite, and saying so is the honest answer (#419).
 */
export function representativePublication<T extends PublicationCandidate>(candidates: T[]): T | null {
	return candidates.find((candidate) => candidate.isGrant) ?? candidates[0] ?? null;
}

/**
 * The same rule where the source has already resolved both halves — PATSTAT's
 * family and priority SQL computes `first_grant_publn` and `earliest_publn` per
 * application, so the choice is the one `??`. Kept here rather than inlined so
 * a reader of those two lines lands on the rule.
 */
export function representativeOf(
	firstGrantPublication: string | null | undefined,
	earliestPublication: string | null | undefined
): string | null {
	return firstGrantPublication ?? earliestPublication ?? null;
}

/**
 * True when a kind code says the publication is a granted right.
 *
 * `B` is a grant at the EPO, the USPTO (from 2001) and WIPO-aligned offices;
 * `C` is a US reissue or re-examination certificate and the German-style grant
 * after examination. Everything else — `A` included — is false rather than
 * guessed, because a pre-2001 US grant also carries `A` and a confident wrong
 * answer is the failure this whole area exists to prevent. Such a member falls
 * through to the earliest-publication half of the rule, which for those
 * families still returns a number a reader can look up.
 */
export function isGrantKind(kind: string | null | undefined): boolean {
	const letter = (kind ?? '').trim().charAt(0).toUpperCase();
	return letter === 'B' || letter === 'C';
}

/**
 * {@link isGrantKind} for a rendered publication number whose kind code is not
 * held separately, e.g. "US7722129B2" → true. False when the number carries no
 * kind code at all, which is not evidence either way and is not guessed.
 */
export function isGrantPublication(publication: string | null | undefined): boolean {
	if (!publication) {
		return false;
	}
	return isGrantKind(parsePublicationNumber(publication)?.kind);
}

/**
 * One family member — one application — and the single number to cite for it.
 *
 * The same shape on every surface that reports it, deliberately: two responses
 * that disagree should be diffable side by side.
 */
export interface RepresentativeMember {
	/**
	 * The member's application in DOCDB's format, e.g. "US10374408 (A)" — the
	 * same string `get_family` members carry as `docdbApplication`. It reads
	 * like a filing number for US and is not one (this is USPTO application
	 * 12/103,744), so never print it as one (#419).
	 *
	 * null when the read could not place a publication in a member — see
	 * {@link FamilyRepresentatives.members}.
	 */
	application: string | null;
	/**
	 * The number to cite for this member: its first grant, else its earliest
	 * publication. null when the member never published, or when this read
	 * could not determine it.
	 */
	representativePublication: string | null;
	/** True when {@link representativePublication} is a grant by its kind code. */
	isGrant: boolean;
	/** The publications of this member that THIS read listed, earliest first. */
	publications: string[];
}

/** The representative-publication block carried by a family read. */
export interface FamilyRepresentatives {
	/** {@link REPRESENTATIVE_PUBLICATION_RULE} — the same tag on every surface. */
	rule: typeof REPRESENTATIVE_PUBLICATION_RULE;
	/**
	 * One entry per family member, in the order the read lists them. An entry
	 * with a null `application` holds publications this read could not place in
	 * any member; it names no representative rather than guessing one.
	 */
	members: RepresentativeMember[];
	/** Prose the reading model acts on. */
	note: string;
}
