/**
 * Evidence (R14): each statement and each read value points to an exact span of its source, a quote and its page;
 * a click on the quote shows the span on its page of the letter. A statement without a span shows "Missing evidence", why, and
 * the two ways out; the screen then blocks Accept in the decision bar.
 */

import type { ReactNode } from 'react'
import { Button, IconCloseOutlineRegular, IconSearchOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Span } from '../api.ts'
import css from './Evidence.module.css'

/** Copy of a quote: the page reference and the name of the act that shows the quote in the letter. */
export interface QuoteLabels {
  /** The page reference, such as "p. 1". */
  readonly page: string
  /** The accessible name of the act, such as "Show on page 1 of the letter". */
  readonly show: string
}

/**
 * Render a quoted span and its page as one button: a click shows the span marked on its page of the letter.
 * @param props.span - the exact span.
 * @param props.labels - the page reference and the name of the act.
 * @param props.onShow - show the span in the letter.
 * @returns the quote.
 */
export function EvidenceQuote({ span, labels, onShow }: { span: Pick<Span, 'quote'>; labels: QuoteLabels; onShow: () => void }) {
  return (
    <button type="button" className={css.spanRef} onClick={onShow} title={labels.show} aria-label={`${span.quote} · ${labels.show}`}>
      {/* The quote shows in the main view, so the deny-list reads it (R19). */}
      <span className={css.quote} data-fdl-part="quote">{span.quote}</span>
      <span className={css.pageRef}>{labels.page}</span>
    </button>
  )
}

/**
 * Render a record as the source of a statement, such as "Deadline, active".
 * @param props.icon - a 16px UI icon.
 * @param props.children - the record and its state.
 * @returns the chip.
 */
export function RecordSource({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className={css.source} data-fdl-part="chip">{icon}{children}</span>
}

/** Copy of the missing-evidence state. */
export interface MissingLabels {
  /** "Missing evidence". */
  readonly title: string
  /** One sentence why, such as "The letter does not state the amount." */
  readonly why: string
  /** "Find the source". */
  readonly find: string
  /** "Remove from the draft". */
  readonly remove: string
}

/**
 * Render the missing-evidence state of a statement.
 * @param props.labels - the copy.
 * @param props.onFind - look for the source in the letter.
 * @param props.onRemove - take the statement out of the draft.
 * @returns the state.
 */
export function MissingEvidence({ labels, onFind, onRemove }: { labels: MissingLabels; onFind: () => void; onRemove: () => void }) {
  return (
    <span className={css.missingBlock}>
      <span className={css.missing} data-fdl-part="chip"><IconWarningTriangleOutlineRegular size={16} />{labels.title}</span>
      <span className={css.why}>{labels.why}</span>
      <span className={css.missingActs}>
        <Button variant="ghost" size="sm" icon={<IconSearchOutlineRegular size={16} />} onClick={onFind}>{labels.find}</Button>
        <Button variant="ghost" size="sm" icon={<IconCloseOutlineRegular size={16} />} onClick={onRemove}>{labels.remove}</Button>
      </span>
    </span>
  )
}

/** The column headers of a statement table. */
export interface StatementHeaders {
  readonly number: string
  readonly says: string
  readonly source: string
}

/**
 * Render a statement table: number, what the draft says, and its source in the letter.
 * @param props.headers - the column headers.
 * @param props.children - the `StatementRow`s.
 * @returns the table.
 */
export function StatementTable({ headers, children }: { headers: StatementHeaders; children: ReactNode }) {
  return (
    <div className={css.table} role="table">
      <div className={css.statementHead} role="row">
        <span role="columnheader">{headers.number}</span>
        <span role="columnheader">{headers.says}</span>
        <span role="columnheader" className={css.sourceHead}>{headers.source}</span>
      </div>
      <div className={css.statements} role="rowgroup">{children}</div>
    </div>
  )
}

/**
 * Render one statement of a draft with its sources; a statement with missing evidence takes the waits tint.
 * @param props.number - its number in the draft.
 * @param props.text - what the draft says, or another row's subject, such as an objection with its claims.
 * @param props.missing - the statement has no span.
 * @param props.children - the quotes, record sources, or the missing-evidence state.
 * @returns the row.
 */
export function StatementRow({ number, text, missing = false, children }: {
  number: number
  text: ReactNode
  missing?: boolean
  children: ReactNode
}) {
  return (
    <div className={css.statement} role="row" data-missing={missing || undefined}>
      <span className={css.number} role="cell">{number}</span>
      <span role="cell">{text}</span>
      <span className={css.sources} role="cell">{children}</span>
    </div>
  )
}
