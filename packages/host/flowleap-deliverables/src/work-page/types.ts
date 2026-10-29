/**
 * Client-safe vocabulary of the office action work page: the findings that a save of an `office-action-scaffold`
 * report gives, the review fields that the attorney sets on each objection, the `<report>.work.json` file that holds
 * both, and the `flowleapWorkPages` Remote values. Types only; nothing here reaches a Host-only symbol.
 * @module @deepseek-ai/dsh-flowleap-deliverables/work-pages
 */

import type {} from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Identity of one work page: a digest of its file path, stable across saves of the same report. */
export type WorkPageId = Branded<'FlowleapWorkPageId'>

/** Review state of one objection, set by the attorney. */
export type WorkPageReviewState = 'needs_review' | 'relevant' | 'done' | 'not_relevant'

/** The fields of one objection that only the attorney changes. */
export interface ReviewFields {
  readonly state: WorkPageReviewState
  /** Free text; an empty string means no owner. */
  readonly owner: string
  /** Free text; an empty string means no note. */
  readonly note: string
}

/** One cited document of the action, from the `Cited documents` row of the action table. */
export interface CitedDocument {
  /** Label in the report, for example `D1`; empty when the report gives none. */
  readonly label: string
  /** The rest of the entry, for example `US2016107508 (A1, published 2016-04-21)`. */
  readonly text: string
}

/** One row of the cited documents table of an objection. */
export interface CitedPassage {
  readonly document: string
  readonly role: string
  /** The passage that the examiner relied on, for example `¶[0059], Fig. 6`. */
  readonly passage: string
  /** What the passage says, as the report quotes or summarizes it. */
  readonly says: string
  readonly anchor: string
}

/** One response option of an objection, from its `Options` field. */
export interface ResponseOption {
  /** The option name, for example `Argue` or `Amend`. */
  readonly label: string
  /** The text in the parentheses after the name; empty when the report gives none. */
  readonly text: string
}

/** A field of an objection block that the board shows as text, for example `Legal basis` or `Date check`. */
export interface LabelledText {
  readonly label: string
  readonly text: string
}

/** One objection of the action, read from its `### Objection` block. */
export interface Objection {
  /** The number in the heading, or the position of the block when the heading has none. */
  readonly id: string
  /** The heading text after the number. */
  readonly title: string
  readonly ground: string
  /** Claim numbers of the `Claims hit` field, ranges expanded; empty when the field names none. */
  readonly claims: readonly number[]
  /** The `Claims hit` field as written. */
  readonly claimsText: string
  /** The `Examiner's reasoning` field. */
  readonly reasoning: string
  /** The `Source of the objection` field. */
  readonly source: string
  readonly citations: readonly CitedPassage[]
  /** The text of the `Cited documents` field when it is not a table, or the text beside the table. */
  readonly citationsText: string
  /** Each `Assessment` field, with its qualifier as the label. */
  readonly assessment: readonly LabelledText[]
  readonly options: readonly ResponseOption[]
  readonly replyMustAddress: string
  /** The `Confidence and gaps` field. */
  readonly confidence: string
  readonly sources: string
  /** The other fields of the block, in report order. */
  readonly details: readonly LabelledText[]
}

/** One row of a claim table in the claim-by-claim comparison. */
export interface ComparisonRow {
  readonly element: string
  readonly examiner: string
  readonly cited: string
  readonly assessment: string
}

/** One claim table of the claim-by-claim comparison. */
export interface ClaimTable {
  /** The bold line above the table, for example `Claim 1 (system) against D1 US2016107508`. */
  readonly heading: string
  /** The claim number in the heading; `null` when the heading names none. */
  readonly claim: number | null
  readonly rows: readonly ComparisonRow[]
}

/** What the board shows of one office action analysis, read from the saved report. */
export interface OfficeActionFindings {
  /** The application number: the save's `matter`, else the `Application` row of the action table. */
  readonly application: string
  /** The `Office and action` row without its parenthetical remarks. */
  readonly communication: string
  /** First ISO 8601 date of the `Action date` row; `null` when the row has none. */
  readonly issued: string | null
  /** First ISO 8601 date of the `Last date without extension` row; `null` when the row has none. */
  readonly deadline: string | null
  /** The `Last date without extension` row as written. */
  readonly deadlineText: string
  readonly documents: readonly CitedDocument[]
  readonly objections: readonly Objection[]
  readonly comparison: readonly ClaimTable[]
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
  /** The attorney's fields by objection id; every objection of the findings has an entry. */
  readonly review: Readonly<Record<string, ReviewFields>>
}

/** One work page as the board lists it. */
export interface WorkPageSummary {
  readonly id: WorkPageId
  /** The chat whose save wrote the page; the board sends its messages there. */
  readonly sessionId: SessionId
  /** The work page file path as the save named it, relative to the chat's working directory. */
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
     * A work page was saved or the attorney changed its review fields; clients refetch `flowleapWorkPages.list()`.
     * @mode emit
     */
    'flowleap-work-pages/changed'(): void
  }
}
