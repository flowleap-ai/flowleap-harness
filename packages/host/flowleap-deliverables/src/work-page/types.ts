/**
 * Client-safe vocabulary of the office action work page: the findings that an `office-action-scaffold` save gives in
 * its `officeAction` input, the review fields that the attorney sets on each objection, the `<report>.work.json` file
 * that holds both, the `flowleapWorkPages` Remote values, and the review constants that the Host and the client share.
 * Nothing here reaches a Host-only symbol.
 * @module @deepseek-ai/dsh-flowleap-deliverables/work-pages
 */

import type {} from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Identity of one work page: a digest of its file path, stable across saves of the same report. */
export type WorkPageId = Branded<'FlowleapWorkPageId'>

/** Review states in the order the board offers them. */
export const REVIEW_STATES = ['needs_review', 'relevant', 'done', 'not_relevant'] as const

/** Review state of one objection, set by the attorney. */
export type WorkPageReviewState = typeof REVIEW_STATES[number]

/** Most characters of an owner. */
export const MAX_OWNER_LENGTH = 200

/** Most characters of a note. */
export const MAX_NOTE_LENGTH = 4000

/** The fields of one objection that only the attorney changes. */
export interface ReviewFields {
  readonly state: WorkPageReviewState
  /** Free text; an empty string means no owner. */
  readonly owner: string
  /** Free text; an empty string means no note. */
  readonly note: string
}

/** The review fields of an objection that no attorney has changed. */
export const NEW_REVIEW: ReviewFields = { state: 'needs_review', owner: '', note: '' }

/**
 * The review fields of one objection in the file, with the ground and the title of the objection they were set on.
 * A later save keeps the fields only for an objection with the same id, ground and title.
 */
export interface ReviewEntry extends ReviewFields {
  readonly ground: string
  readonly title: string
}

/** One row of the action table. */
export interface ActionRow {
  readonly field: string
  readonly value: string
  readonly source: string
}

/** One cited document of the action. */
export interface CitedDocument {
  /** Label in the report, for example `D1`. */
  readonly label: string
  /** The document, for example `US2016107508A1 (published 2016-04-21)`. */
  readonly text: string
}

/** One row of the cited documents table of an objection. */
export interface CitedPassage {
  readonly document: string
  readonly role: string
  /** The passage that the examiner relied on, for example `¶[0059], Fig. 6`. */
  readonly passage: string
  /** What the passage says, quoted or summarized. */
  readonly says: string
  readonly anchor: string
}

/** One response option of an objection. */
export interface ResponseOption {
  /** The option name, for example `Argue` or `Amend`. */
  readonly label: string
  readonly text: string
}

/** One objection of the action. */
export interface Objection {
  /** The objection number, for example `1` or `1.2`; unique in the analysis. */
  readonly id: string
  readonly title: string
  readonly ground: string
  readonly legalBasis: string
  /** The claim numbers that the objection hits; empty when it hits none. */
  readonly claims: readonly number[]
  readonly reasoning: string
  /** Where the objection comes from, for example the action text or the search report categories. */
  readonly source: string
  readonly citations: readonly CitedPassage[]
  readonly assessment: string
  readonly options: readonly ResponseOption[]
  readonly replyMustAddress: string
  readonly confidence: string
  readonly sources: string
}

/** Assessment of one claim element against the cited passage. */
export type ElementAssessment = 'disclosed' | 'not disclosed' | 'disputable' | 'not read'

/** One row of a claim table. */
export interface ComparisonRow {
  readonly element: string
  readonly examiner: string
  readonly cited: string
  readonly assessment: ElementAssessment
}

/** One claim table of the claim-by-claim comparison. */
export interface ClaimTable {
  /** The independent claim that the table compares; an objection of the analysis hits it. */
  readonly claim: number
  /** The line above the table, for example `Claim 1 (system) against D1 US2016107508A1`. */
  readonly heading: string
  /** The interpretation of the disputed terms; empty when no term is disputed. */
  readonly interpretation: string
  readonly rows: readonly ComparisonRow[]
  /** The line on the arrangement of the elements below the table. */
  readonly arrangement: string
}

/** The findings of one office action analysis: the `officeAction` input of its save. */
export interface OfficeActionFindings {
  readonly application: string
  /** The office and the action, for example `EPO, communication under Art. 94(3) EPC`. */
  readonly communication: string
  /** The action date; `null` when the action states none. */
  readonly issued: string | null
  /** The last date without extension; `null` when it cannot be computed. */
  readonly deadline: string | null
  readonly summary: string
  readonly action: readonly ActionRow[]
  readonly documents: readonly CitedDocument[]
  readonly objections: readonly Objection[]
  readonly comparison: readonly ClaimTable[]
  /** One line for each dependent claim that the action names; empty when it names none. */
  readonly dependentClaims: string
}

/** The `<report>.work.json` file beside an office action analysis. */
export interface WorkPageFile {
  readonly schemaVersion: 1
  readonly kind: 'office-action'
  /** One sentence for a reader of the file: which fields the attorney sets and which come from the report. */
  readonly about: string
  /** File name of the report in the same folder. */
  readonly report: string
  readonly findings: OfficeActionFindings
  /** The attorney's fields by objection id; the keys are the objection ids. */
  readonly review: Readonly<Record<string, ReviewEntry>>
}

/** One work page as the board lists it. */
export interface WorkPageSummary {
  readonly id: WorkPageId
  /** The chat whose save wrote the page; the board sends its messages there. */
  readonly sessionId: SessionId
  /** The report path as the save named it, relative to the chat's working directory. */
  readonly report: string
  /** The work page file path as the save named it. */
  readonly path: string
  readonly application: string
  readonly communication: string
  /** RFC 3339 UTC time of the save that wrote the page. */
  readonly savedAt: string
  readonly objections: number
  /** Objections in the `needs_review` state. */
  readonly needsReview: number
}

/** One work page with its file. */
export interface WorkPageView {
  readonly summary: WorkPageSummary
  readonly file: WorkPageFile
}

/** A change of the review fields of one objection; an omitted field keeps its value. */
export interface WorkPageReviewRequest {
  readonly id: WorkPageId
  readonly objection: string
  readonly state?: WorkPageReviewState
  readonly owner?: string
  readonly note?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A save wrote a work page, or the attorney changed its review fields.
     * @mode emit
     * @param view - the page after the change; it reaches only the callers that may see its chat.
     */
    'flowleap-work-pages/changed'(view: WorkPageView): void
  }
}
