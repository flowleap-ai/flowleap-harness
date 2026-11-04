/**
 * Days left to a due date as the screens show them (R11). An overdue date reads "Overdue by N days" with the stale shape
 * in the refused colour beside it; the text stays in the surrounding colour because `--dsw-alias-state-error-primary`
 * as text is below 4.5:1 on the base, hovered, selected and decision bar surfaces (contrast.md).
 */

import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { dueDay } from '../format.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { dueText, type WordContext } from '../words.ts'
import type { IsoDate } from '../api.ts'
import css from './Due.module.css'

/** Stands for the due text while a sentence is split around it; it is in no dictionary. */
const DUE_MARK = '\u0000'

/**
 * Render the days left to a due date, written out; an overdue date carries `data-overdue` and the stale shape.
 * @param props.words - the word context.
 * @param props.due - the due date.
 * @returns the due text.
 */
export function DueText({ words, due }: { words: WordContext; due: IsoDate }) {
  const text = dueText(words, due)
  if (dueDay(due, words.now, words.timeZone).kind !== 'overdue') return <>{text}</>
  return <span className={css.overdue} data-overdue><StateDot shape="stale" size={12} />{text}</span>
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
