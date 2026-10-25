/*---------------------------------------------------------------------------------------------
 *  Evidence anchors (slice S5 D0.2).
 *
 *  A report writer validates every quoted passage against the session's
 *  recorded retrievals, each recorded under an anchor: the stable identity of
 *  one publication section or one claim. The model can only cite anchors it
 *  has seen, so the tools that return passages print them in their results —
 *  the `anchor` beside each section and each claim, and nothing else: the
 *  passage itself is already the result's own text, and a host's ledger
 *  derives its record (`evidenceSource`) from that text, the
 *  `documentReference` and the language. A result never repeats its passages.
 *
 *  `evidenceAnchor` is a verbatim copy of the IDE's function, so both products
 *  produce the same string for the same passage:
 *    flowleap-agent-v2 extensions/copilot/src/extension/patentai/vscode-node/patentExecutionLedger.ts
 *    (`evidenceAnchor`, introduced in 13bdc8c06f2 (#313), read at 33efdf7ebee).
 *  The `[source anchor: …]` label is the one `getPatentDetailsTool.ts` prints
 *  beside each passage in the same repository, at the same commit.
 *  Change the IDE first, then this file, never one alone.
 *--------------------------------------------------------------------------------------------*/

import type { DocumentReference } from './document-reference.js';

/** Stable section/claim identity; never infer a claim or paragraph number from prose. */
export function evidenceAnchor(reference: DocumentReference, language?: string): string {
	return [reference.publicationNumber, reference.section, reference.claimNumber, language].filter(Boolean).join(':');
}

/** The label the IDE prints beside a passage, for a host that renders a result as text. */
export function evidenceAnchorLabel(anchor: string): string {
	return `[source anchor: ${anchor}]`;
}

/**
 * Add the evidence anchor of a document's reference beside it, when it has
 * one: the identity a report cites the section (or the claim) under. The
 * language is the one the read returned, which is what the IDE passes.
 */
export function withEvidenceAnchor<T extends { documentReference: DocumentReference | null }>(
	document: T,
	language?: string
): T & { anchor?: string } {
	return document.documentReference ? { ...document, anchor: evidenceAnchor(document.documentReference, language) } : document;
}

/**
 * One recorded passage: what a HOST's ledger stores under the anchor, built
 * by the host from a result's own text (a tool result does not carry it).
 * Mirrors the IDE's `PatentEvidenceSource` without its constant fields
 * (`review`, `completeness`), which the recorder adds. `text` is absent on a
 * bibliography source whose publication has no abstract, as in the IDE.
 */
export interface EvidenceSource {
	anchor: string;
	reference: DocumentReference;
	language?: string;
	/** The exact returned text; a quotation is checked against it verbatim. */
	text?: string;
	/** `unsegmented`: the claims section whose claim numbers could not be established. */
	retrieval: 'returned' | 'unsegmented';
}

/** Build one source; the anchor is derived from the reference and the language, never passed in. */
export function evidenceSource(
	reference: DocumentReference,
	text: string | undefined,
	language?: string,
	retrieval: EvidenceSource['retrieval'] = 'returned'
): EvidenceSource {
	return {
		anchor: evidenceAnchor(reference, language),
		reference,
		...(language ? { language } : {}),
		...(text !== undefined ? { text } : {}),
		retrieval,
	};
}
