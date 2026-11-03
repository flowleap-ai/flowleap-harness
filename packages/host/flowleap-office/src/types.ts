/**
 * Service Definition of the Office capability seam (`ctx.flowleapOffice`): the requests, the results, and the typed
 * failure of the five Office operations. The service takes and returns file bytes, never workspace paths, so a provider
 * works only in its own private folder. This module holds types only.
 * @module @deepseek-ai/dsh-flowleap-office/types
 */

import type {} from '@deepseek-ai/cordis'

/** A body block of a letter. */
export type LetterBlock =
  | {
    /** A heading paragraph with the Word style `Heading1` or `Heading2`. */
    readonly kind: 'heading'
    /** Heading level. */
    readonly level: 1 | 2
    /** Heading text. */
    readonly text: string
  }
  | {
    /** A body paragraph with the template's normal style. */
    readonly kind: 'paragraph'
    /** Paragraph text; a line feed is a line break in the same paragraph. */
    readonly text: string
  }
  | {
    /** A table: a header row, then the body rows, each with as many cells as the header. */
    readonly kind: 'table'
    /** Header cells, written in bold and repeated on each page. */
    readonly header: readonly string[]
    /** Body rows. */
    readonly rows: readonly (readonly string[])[]
  }

/** A letter on a firm template. */
export interface LetterRequest {
  /** The `.docx` template. */
  readonly template: Uint8Array
  /** Values of the template's `{{name}}` placeholders; every placeholder must get a value. */
  readonly fields: Readonly<Record<string, string>>
  /** Blocks added after the template body, in order. */
  readonly blocks: readonly LetterBlock[]
}

/** How one part of a tracked-change paragraph changes: unchanged, inserted, or deleted. */
export type SegmentKind = 'same' | 'ins' | 'del'

/** One text run of a tracked-change paragraph. */
export interface RedlineSegment {
  /** How the run changes. */
  readonly kind: SegmentKind
  /** Run text. */
  readonly text: string
}

/**
 * One paragraph of a marked claims copy. `mark` is the change of the paragraph mark: `ins` for a new claim, `del` for a
 * deleted claim, `same` for a claim that stays. A new claim has only `ins` segments; a deleted claim has only `del`
 * segments.
 */
export interface RedlineParagraph {
  /** Change of the paragraph mark. */
  readonly mark: SegmentKind
  /** Runs in reading order. */
  readonly segments: readonly RedlineSegment[]
}

/** A marked claims copy with tracked changes, and optionally its clean copy. */
export interface AmendRequest {
  /** The `.docx` template; absent for a blank document. */
  readonly template?: Uint8Array
  /** Heading paragraph before the claims; absent for none. */
  readonly heading?: string
  /** Claim paragraphs in order. */
  readonly paragraphs: readonly RedlineParagraph[]
  /** Author of every tracked change. */
  readonly author: string
  /** ISO-8601 date of every tracked change. */
  readonly date: string
  /** Whether to also write the clean copy: the paragraphs with insertions kept and deletions removed, as plain text. */
  readonly clean: boolean
}

/** The written claims copies. */
export interface AmendResult {
  /** The marked copy. */
  readonly marked: Uint8Array
  /** The clean copy, present when it was requested. */
  readonly clean?: Uint8Array
}

/** An Excel claim chart on one sheet. */
export interface ChartRequest {
  /** Sheet name: 1 to 31 characters, none of `: \ / ? * [ ]`. */
  readonly sheet: string
  /** Header cells. */
  readonly header: readonly string[]
  /** Body rows, each with as many cells as the header; `rows[i][0]` is the feature number, always written as text. */
  readonly rows: readonly (readonly string[])[]
}

/** The file format of a read or reviewed document. */
export type OfficeFormat = 'docx' | 'xlsx'

/** A document to read. */
export interface ReadRequest {
  /** The document. */
  readonly file: Uint8Array
  /** Its format. */
  readonly format: OfficeFormat
}

/** One heading of a Word document outline. */
export interface OutlineHeading {
  /** Heading level, 1 for `Heading 1`. */
  readonly level: number
  /** Heading text. */
  readonly text: string
}

/** One tracked change of a Word document. */
export interface TrackedRevision {
  /** The change id, as `office_review_changes` takes it. */
  readonly id: number
  /** The change type as the document records it, for example `ins`, `del`, `paraMarkIns`, or `paraMarkDel`. */
  readonly type: string
  /** Author of the change. */
  readonly author: string
  /** ISO-8601 date of the change, when the document records one. */
  readonly date?: string
  /** Changed text. */
  readonly text: string
}

/** One sheet of an Excel workbook. */
export interface SheetSummary {
  /** Sheet name. */
  readonly name: string
  /** Used rows. */
  readonly rows: number
  /** Used columns. */
  readonly cols: number
}

/** What a read finds in a document. */
export type OfficeReadout =
  | {
    /** A Word document. */
    readonly format: 'docx'
    /** Paragraph text, one paragraph per line; a table is one line per row with tab-separated cells. */
    readonly text: string
    /** Headings in document order. */
    readonly headings: readonly OutlineHeading[]
    /** Tracked changes. */
    readonly revisions: readonly TrackedRevision[]
  }
  | {
    /** An Excel workbook. */
    readonly format: 'xlsx'
    /** Cell values, one row per line as `A1=value` pairs separated by tabs, under one `=== Sheet: name ===` line per sheet. */
    readonly text: string
    /** Sheets in workbook order. */
    readonly sheets: readonly SheetSummary[]
  }

/** Which tracked changes a review applies to. */
export type ReviewSelection =
  | {
    /** Every tracked change. */
    readonly kind: 'all'
  }
  | {
    /** Every tracked change of one author. */
    readonly kind: 'author'
    /** The author. */
    readonly author: string
  }
  | {
    /** The tracked changes with these ids. */
    readonly kind: 'ids'
    /** Change ids that the document holds. */
    readonly ids: readonly number[]
  }

/** Accept or reject tracked changes of a Word document. */
export interface ReviewRequest {
  /** The document; it is not changed. */
  readonly file: Uint8Array
  /** What to do with the selected changes. */
  readonly action: 'accept' | 'reject'
  /** Which changes. */
  readonly selection: ReviewSelection
}

/** The reviewed copy. */
export interface ReviewResult {
  /** The copy with the selected changes accepted or rejected. */
  readonly file: Uint8Array
  /** How many tracked changes the review removed. */
  readonly changed: number
}

/**
 * Why an Office operation failed. `url_refused`: a value starts with `http://` or `https://`. `invalid_request`: the
 * request breaks a rule of this definition. `missing_fields`: template placeholders got no value. `invalid_document`: an
 * input file is not a document of the format, or a template holds tracked changes. `invalid_output`: the written file
 * does not pass validation. `engine_failed`: the engine reported a failure. `timeout`: the engine did not finish in time.
 * `output_too_large`: the engine wrote more output than allowed. `aborted`: the caller cancelled.
 */
export type FlowleapOfficeErrorCode =
  | 'url_refused'
  | 'invalid_request'
  | 'missing_fields'
  | 'invalid_document'
  | 'invalid_output'
  | 'engine_failed'
  | 'timeout'
  | 'output_too_large'
  | 'aborted'

/**
 * The Office operations. Every method rejects with a `FlowleapOfficeError` (`@deepseek-ai/dsh-flowleap-office`), and never
 * changes its input bytes.
 */
export interface FlowleapOffice {
  /**
   * Write a letter: the template with its placeholders filled, then the blocks.
   * @param request - template, field values, and blocks.
   * @param signal - caller cancellation.
   * @returns the `.docx` bytes.
   */
  letter(request: LetterRequest, signal: AbortSignal): Promise<Uint8Array>
  /**
   * Write a marked claims copy with a tracked insertion or deletion for each changed segment and paragraph mark.
   * @param request - paragraphs, author, date, and the clean-copy choice.
   * @param signal - caller cancellation.
   * @returns the marked copy and the clean copy when requested.
   */
  amendClaims(request: AmendRequest, signal: AbortSignal): Promise<AmendResult>
  /**
   * Write an Excel claim chart.
   * @param request - sheet name, header, and rows.
   * @param signal - caller cancellation.
   * @returns the `.xlsx` bytes.
   */
  claimChart(request: ChartRequest, signal: AbortSignal): Promise<Uint8Array>
  /**
   * Read the text and the structure of a document.
   * @param request - the document and its format.
   * @param signal - caller cancellation.
   * @returns what the document holds.
   */
  read(request: ReadRequest, signal: AbortSignal): Promise<OfficeReadout>
  /**
   * Accept or reject tracked changes on a copy of a Word document.
   * @param request - the document, the action, and the selection.
   * @param signal - caller cancellation.
   * @returns the reviewed copy and the number of changes it removed.
   */
  reviewChanges(request: ReviewRequest, signal: AbortSignal): Promise<ReviewResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Word and Excel files for FlowLeap tools; the `@deepseek-ai/dsh-flowleap-office/officecli` row provides it. */
    flowleapOffice: FlowleapOffice
  }
}
