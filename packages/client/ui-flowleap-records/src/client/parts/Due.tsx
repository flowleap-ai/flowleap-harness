/**
 * Days left to a due date as the screens show them (R11). An overdue date reads "Overdue by N days" after the
 * overdue mark: the warning glyph in the refused colour, which is a UI icon and none of the six status shapes, so it
 * cannot read as the state of the deadline. The text stays in the surrounding colour because
 * `--dsw-alias-state-error-primary` as text is below 4.5:1 on the base, hovered, selected and decision bar surfaces
 * (contrast.md); as an icon it is above 3:1 on each of them.
 */

import type { ReactNode } from 'react'
import { IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { dueDay } from '../format.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { dueText, type WordContext } from '../words.ts'
import type { IsoDate } from '../api.ts'
import css from './Due.module.css'

/** Stands for the due text while a sentence is split around it; it is in no dictionary. */
const DUE_MARK = '\u0000'

/**
 * Whether a due date is in the past.
 * @param words - the word context, for today.
 * @param due - the due date.
 * @returns true when the date is overdue.
 */
export function isOverdue(words: WordContext, due: IsoDate): boolean {
  return dueDay(due, words.now, words.timeZone).kind === 'overdue'
}

/**
 * Render text after the overdue mark: the 16px warning glyph in the refused colour.
 * @param props.children - the words that say what is overdue.
 * @returns the marked text; `data-overdue` names it for the tests and the design checks.
 */
export function Overdue({ children }: { children: ReactNode }) {
  return <span className={css.overdue} data-overdue><IconWarningTriangleOutlineRegular size={16} />{children}</span>
}

/**
 * Render the days left to a due date, written out; an overdue date carries the overdue mark.
 * @param props.words - the word context.
 * @param props.due - the due date.
 * @returns the due text.
 */
export function DueText({ words, due }: { words: WordContext; due: IsoDate }) {
  const text = dueText(words, due)
  return isOverdue(words, due) ? <Overdue>{text}</Overdue> : <>{text}</>
}

/**
 * Render a dictionary sentence whose `{due}` parameter is the due text of a date.
 * @param words - the word context.
 * @param key - the sentence.
 * @param params - the other parameters of the sentence.
 * @param due - the due date.
 * @returns the sentence with the due text marked when it is overdue.
 */
export function dueSentence(words: WordContext, key: FlowleapRecordsKey, params: Record<string, unknown>, due: IsoDate): ReactNode {
  const [before, after = ''] = words.t(key, { ...params, due: DUE_MARK }).split(DUE_MARK)
  return <>{before}<DueText words={words} due={due} />{after}</>
}
