/**
 * The status of a record: the atlas state's shape and its word, never the shape alone (R11). The word is an
 * `AtlasWord`, which only `atlasWord` makes from the locale dictionary, so a status cannot render with no word or
 * with another text. The one exception is `RowStatusIcon`, the `aria-hidden` icon of a row or a card under a header
 * that carries the same state's word.
 */

import clsx from 'clsx'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { atlasKey, shapeOf, type AtlasRef } from '../atlas.ts'
import css from './Status.module.css'

/** The word of an atlas state in the UI language. */
export type AtlasWord = Branded<'AtlasWord'>

/** The translate function, for the atlas word keys. */
export type AtlasTranslate = (key: ReturnType<typeof atlasKey>) => string

/**
 * The word of an atlas state, from the `atlas.<machine>.<state>` dictionary key.
 * @param t - the translate function of the namespace.
 * @param ref - the machine and the state.
 * @returns the word.
 */
export function atlasWord(t: AtlasTranslate, ref: AtlasRef): AtlasWord {
  return t(atlasKey(ref)) as AtlasWord
}

/**
 * Render a status as its icon and word, inline.
 * @param props.status - the atlas state.
 * @param props.word - its word, from `atlasWord`.
 * @param props.className - extra class for layout placement.
 * @returns the status; `data-atlas` names the state for the design checks.
 */
export function AtlasStatus({ status, word, className }: { status: AtlasRef; word: AtlasWord; className?: string | undefined }) {
  return (
    <span className={clsx(css.status, className)} data-atlas={`${status.machine}.${status.state}`}>
      <StateDot shape={shapeOf(status)} />{word}
    </span>
  )
}

/**
 * Render a fact's status with its label first, such as "Report · Sent" or "Reply · Sent", so two records whose
 * states share a shape and a word never look the same (R11). The status word is never cut: by default the label and
 * the status wrap onto two lines when they do not fit; on one line, the label is cut and the full fact shows on hover.
 * @param props.label - what the fact is about, such as "Report".
 * @param props.status - the atlas state.
 * @param props.word - its word, from `atlasWord`.
 * @param props.oneLine - keep the fact on one line, as a board card's chip does.
 * @param props.className - extra class for the chip, such as a card's box.
 * @returns the labelled status.
 */
export function FactStatus({ label, status, word, oneLine = false, className }: {
  label: string
  status: AtlasRef
  word: AtlasWord
  oneLine?: boolean
  className?: string | undefined
}) {
  return (
    <span className={clsx(css.fact, oneLine && css.oneLine, className)} title={oneLine ? `${label} · ${word}` : undefined}>
      <span className={css.factLabel}>{label}<span aria-hidden="true"> ·</span></span>
      <AtlasStatus status={status} word={word} />
    </span>
  )
}

/**
 * Render a status as the pill of a header eyebrow; a page shows its subject's status once.
 * @param props.status - the atlas state.
 * @param props.word - its word, from `atlasWord`.
 * @returns the pill.
 */
export function AtlasPill({ status, word }: { status: AtlasRef; word: AtlasWord }) {
  return <span className={css.pill} data-atlas={`${status.machine}.${status.state}`}><Tag shape={shapeOf(status)}>{word}</Tag></span>
}

/**
 * Render the icon of a row or a card that sits under a header of the same state; the header carries the word.
 * @param props.status - the atlas state of the header.
 * @returns the `aria-hidden` icon.
 */
export function RowStatusIcon({ status }: { status: AtlasRef }) {
  return <StateDot shape={shapeOf(status)} />
}
