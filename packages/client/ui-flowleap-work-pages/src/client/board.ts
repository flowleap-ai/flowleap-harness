/**
 * Office action board model: the findings of one analysis (read-only), the attorney fields of each objection (state and
 * owner), and the page state. In this look-first version the findings come from the sample fixture and the attorney
 * fields live only in the browser; the planned `flowleapWorkPages` Remote replaces both (flowleap-harness#81).
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Review state of one objection, set by the attorney. */
export type ObjectionState = 'needs_review' | 'relevant' | 'done' | 'not_relevant'

/** Review states in menu order. */
export const REVIEW_STATES: readonly ObjectionState[] = ['needs_review', 'relevant', 'done', 'not_relevant']

/**
 * Read a menu item id back as a review state.
 * @param id - an item id of the state menu.
 * @returns the state.
 * @throws when the id is not a review state.
 */
export function objectionState(id: string): ObjectionState {
  const state = REVIEW_STATES.find(value => value === id)
  if (state === undefined) throw new Error(`unknown review state "${id}"`)
  return state
}

/**
 * Read the attorney fields of one objection.
 * @param attorney - attorney fields by objection.
 * @param id - the objection.
 * @returns the fields.
 * @throws when the analysis has no fields for the objection.
 */
export function attorneyFieldsOf(attorney: Readonly<Record<string, AttorneyFields>>, id: string): AttorneyFields {
  const fields = attorney[id]
  if (fields === undefined) throw new Error(`objection "${id}" has no attorney fields`)
  return fields
}

/** Legal basis of an objection; each value has its own label in the dictionaries. */
export type ObjectionBasis = 'art54' | 'art56' | 'art84'

/** Label of a cited document in the communication. */
export type CitationLabel = 'D1' | 'D2'

/** Cited document labels in list order. */
export const CITATION_ORDER: readonly CitationLabel[] = ['D1', 'D2']

/** One cited document of the communication. */
export interface CitedDocument {
  /** Publication number, for example `EP 2 987 654 A1`. */
  readonly number: string
  /** Title of the document. */
  readonly title: string
}

/** One passage of a cited document that the examiner relied on. */
export interface CitedPassage {
  readonly label: CitationLabel
  /** Location in the document, for example `[0031]` or `col. 5, l. 10-25`. */
  readonly location: string
  /** Text of the passage. */
  readonly text: string
}

/** One claim feature beside the passage that the examiner says discloses it. */
export interface FeatureComparison {
  /** Feature reference, for example `1.4`. */
  readonly feature: string
  /** Claim text of the feature. */
  readonly claimText: string
  /** Source of the passage: a cited document label with its location, or a part of the application. */
  readonly source: string
  /** Text of the passage. */
  readonly passage: string
}

/** Kind of a response option; each kind has its own label in the dictionaries. */
export type ResponseKind = 'argue' | 'amend' | 'accept'

/** One response option that the analysis offers for an objection. */
export interface ResponseOption {
  readonly kind: ResponseKind
  readonly summary: string
}

/** One objection of the communication, with the findings of the analysis. */
export interface Objection {
  readonly id: string
  readonly basis: ObjectionBasis
  /** Claim numbers that the objection hits. */
  readonly claims: readonly number[]
  /** One-sentence summary of the objection. */
  readonly summary: string
  /** Text of the examiner, quoted from the communication. */
  readonly examinerText: string
  /** Cited passages; empty for an objection without cited documents (for example Art. 84 EPC). */
  readonly citations: readonly CitedPassage[]
  readonly comparison: readonly FeatureComparison[]
  readonly options: readonly ResponseOption[]
}

/** Attorney fields of one objection: the only fields that the attorney can change. */
export interface AttorneyFields {
  readonly state: ObjectionState
  /** Free text until group sharing (work pages study, decision 5). */
  readonly owner: string
}

/** One office action analysis: the findings, the form inputs, and the attorney fields as the run left them. */
export interface OfficeActionAnalysis {
  /** Application number as the attorney wrote it, for example `EP 3 456 789`. */
  readonly application: string
  /** Title of the communication, for example `Communication under Article 94(3) EPC`. */
  readonly communication: string
  /** Date of the communication, ISO 8601 date. */
  readonly issued: string
  /** Time limit for the reply, ISO 8601 date. */
  readonly deadline: string
  /** Responsible attorney of the matter. */
  readonly owner: string
  /** File name of the office action PDF, when the attorney gave one. */
  readonly pdf: string | null
  /** Display name of the agent that runs the analysis. */
  readonly agent: string
  /** Display names of the agents that the form offers. */
  readonly agents: readonly string[]
  /** Gateway budget of the attorney, in whole currency units. */
  readonly budget: { readonly left: number; readonly limit: number; readonly currency: string }
  /** Progress of the run that fills the board. */
  readonly run: { readonly step: number; readonly steps: number }
  readonly documents: Readonly<Record<CitationLabel, CitedDocument>>
  readonly objections: readonly Objection[]
  readonly attorney: Readonly<Record<string, AttorneyFields>>
}

/** Action that the sample cannot do yet; each has a notice in the dictionaries. */
export type DeferredAction = 'plan' | 'export' | 'chat' | 'run'

/** Browser state of the board page. */
export interface BoardState {
  readonly attorney: Readonly<Record<string, AttorneyFields>>
  /** Objection open in the side panel. */
  readonly selected: string | null
  readonly formOpen: boolean
  /** Last deferred action that the attorney clicked, shown as a notice. */
  readonly notice: DeferredAction | null
}

/** The board of one analysis: its findings, its browser state, and the attorney actions. */
export interface Board {
  readonly analysis: OfficeActionAnalysis
  readonly hooks: { readonly board: SnapshotStore<BoardState> }
  /**
   * Set the review state of one objection.
   * @param id - the objection.
   * @param state - the new state.
   */
  readonly setState: (id: string, state: ObjectionState) => void
  /**
   * Set the owner of one objection.
   * @param id - the objection.
   * @param owner - free text; an empty string clears the owner.
   */
  readonly setOwner: (id: string, owner: string) => void
  /**
   * Open one objection in the side panel, or close the panel.
   * @param id - the objection, or `null` to close.
   */
  readonly select: (id: string | null) => void
  /**
   * Open or close the analysis form.
   * @param open - the new form state.
   */
  readonly setFormOpen: (open: boolean) => void
  /**
   * Show the notice of an action that the sample cannot do yet; `null` hides it.
   * @param action - the clicked action.
   */
  readonly notify: (action: DeferredAction | null) => void
}

/**
 * Create the board of one analysis with its attorney fields as the run left them.
 * @param analysis - the findings and the initial attorney fields.
 * @returns the board.
 */
export function createBoard(analysis: OfficeActionAnalysis): Board {
  const board = createSnapshotStore<BoardState>({ attorney: analysis.attorney, selected: null, formOpen: false, notice: null })
  const change = (next: Partial<BoardState>) => { board.set({ ...board.getSnapshot(), ...next }) }
  const patch = (id: string, fields: Partial<AttorneyFields>) => {
    const { attorney } = board.getSnapshot()
    const current = attorney[id]
    if (current !== undefined) change({ attorney: { ...attorney, [id]: { ...current, ...fields } } })
  }
  return {
    analysis,
    hooks: { board },
    setState: (id, state) => { patch(id, { state }) },
    setOwner: (id, owner) => { patch(id, { owner }) },
    select: (selected) => { change({ selected }) },
    setFormOpen: (formOpen) => { change({ formOpen }) },
    notify: (notice) => { change({ notice }) },
  }
}

/**
 * Count the objections in the `needs_review` state.
 * @param attorney - attorney fields by objection.
 * @returns the count.
 */
export function needsReviewCount(attorney: Readonly<Record<string, AttorneyFields>>): number {
  return Object.values(attorney).filter(fields => fields.state === 'needs_review').length
}

const DAY_MS = 86_400_000

/**
 * Whole calendar days from `now` to the deadline date, in UTC; negative after the deadline.
 * @param deadline - ISO 8601 date.
 * @param now - the current time in milliseconds.
 * @returns the day count.
 */
export function daysUntil(deadline: string, now: number): number {
  const today = new Date(now)
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((Date.parse(deadline) - start) / DAY_MS)
}
