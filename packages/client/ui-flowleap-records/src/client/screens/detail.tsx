/**
 * Pieces of the matter, deadline and work pages: the detail table (a 32px column header and 44px rows that start
 * with the status and its word), the fact chips under a title, a person with the name, and the words of a deadline
 * rule. A row opens its record through the button in its main cell, so Tab, ↵ and a click open the same record.
 */

import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar, AvatarStack } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DocumentId, IsoDate, Person } from '../api.ts'
import { intlLocale } from '../format.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { avatarOf, letterTitle, personName, type Translate } from '../words.ts'
import type { Property } from '../parts/Layout.tsx'
import type { ScreenContext } from './context.ts'
import css from './Detail.module.css'

/**
 * Render a detail table: the column header and the rows on one column grid.
 * @param props.label - the table's accessible name.
 * @param props.variant - `detail` (a table inside a page, 8px inset) or `list` (a page-wide list with 16px side
 * padding and a column header that sticks while the list scrolls).
 * @param props.grid - the class of `Detail.module.css` that sets the table's column grid: `--detail-columns` for the
 * header and the rows, the status column first, and `--detail-columns-narrow` at 390px, where the cells marked `wide`
 * hide.
 * @param props.header - one header cell for each column; `null` hides the header (a table with one kind of row).
 * @param props.children - the rows.
 * @returns the table.
 */
export function DetailTable({ label, variant = 'detail', grid, header, children }: {
  label: string
  variant?: 'detail' | 'list'
  grid: string | undefined
  header: readonly HeaderCell[] | null
  children: ReactNode
}) {
  return (
    <div className={clsx(css.table, grid, variant === 'list' && css.list)} role="table" aria-label={label}>
      {header !== null && (
        <div className={css.thead} role="row">
          {header.map((cell, index) => (
            <span key={index} role="columnheader" className={clsx(cell.end === true && css.end, cell.endNarrow === true && css.endNarrow, cell.wide === true && css.wide)}>{cell.text}</span>
          ))}
        </div>
      )}
      <div role="rowgroup">{children}</div>
    </div>
  )
}

/** One cell of a detail table's column header. */
export interface HeaderCell {
  readonly text: string
  /** Right-aligned, over a time or a count. */
  readonly end?: boolean
  /** Right-aligned at 390px only, over a value that moves to the right edge there. */
  readonly endNarrow?: boolean
  /** Hidden at 390px. */
  readonly wide?: boolean
}

/**
 * Render one 44px row of a detail table. Hover shows only on a row that opens a record.
 * @param props.children - the `Cell`s and the `OpenCell`.
 * @param props.opens - the row opens a record from its main cell.
 * @returns the row.
 */
export function DetailRow({ children, opens = false }: { children: ReactNode; opens?: boolean }) {
  return <div role="row" className={css.row} data-opens={opens || undefined}>{children}</div>
}

/**
 * Render one cell of a detail table row.
 * @param props.kind - `status` (the status and its word), `main` (primary text, truncates), `meta` (secondary text),
 * `end` (secondary, right-aligned, tabular figures) or `icon`.
 * @param props.wide - hidden at 390px.
 * @param props.children - the value.
 * @returns the cell.
 */
export function Cell({ kind, wide = false, children }: { kind: 'status' | 'main' | 'meta' | 'end' | 'icon'; wide?: boolean; children?: ReactNode }) {
  return <span role="cell" className={clsx(css[kind], wide && css.wide)}>{children}</span>
}

/**
 * Render the main cell of a row that opens a record: a text button that fills the cell.
 * @param props.children - the cell text.
 * @param props.onOpen - open the record.
 * @param props.label - the button's accessible name when the text alone does not name the record.
 * @returns the cell.
 */
export function OpenCell({ children, onOpen, label }: { children: ReactNode; onOpen: () => void; label?: string | undefined }) {
  return (
    <span role="cell" className={css.main}>
      <button type="button" className={css.open} aria-label={label} data-open-row="" onClick={onOpen}>{children}</button>
    </span>
  )
}

/** One fact chip under a title: the count, its text, and whether it counts overdue records. */
export interface Fact {
  readonly key: string
  readonly count: number
  readonly text: string
  /** The count is of overdue records, so the chip carries the overdue mark. */
  readonly overdue?: boolean
}

/**
 * Render a person as a 20px avatar and the name: the display name, or the words for a person the os does not name.
 * @param props.t - the translate function.
 * @param props.person - the person.
 * @returns the person.
 */
export function Who({ t, person }: { t: Translate; person: Person }) {
  return <span className={css.who}><Avatar person={avatarOf(t, person)} nameShown />{personName(t, person)}</span>
}

/**
 * The Responsible row of a properties panel, as the dossier and the work page show it.
 * @param t - the translate function.
 * @param person - the responsible person, or null for none.
 * @returns the row.
 */
export function responsibleRow(t: Translate, person: Person | null): Property {
  return { label: t('prop.responsible'), value: person === null ? t('matter.none') : <Who t={t} person={person} /> }
}

/**
 * Render a team as an avatar stack and its size, such as "3 people".
 * @param props.t - the translate function.
 * @param props.team - the team.
 * @returns the team.
 */
export function Team({ t, team }: { t: Translate; team: readonly Person[] }) {
  return <span className={css.who}><AvatarStack people={team.map(person => avatarOf(t, person))} />{t('matter.people', { count: team.length })}</span>
}

/** The words of a deadline rule. */
export interface RuleWords {
  /** The short name, such as "Rule 71(3) EPC". */
  readonly short: string
  /** The rule and what it is about, such as "Rule 71(3) EPC: intention to grant". */
  readonly full: string
  /** The key of the period sentence, which takes the letter's `{date}`; null for a rule the views do not word. */
  readonly period: FlowleapRecordsKey | null
  /** The period, such as "4 months". */
  readonly months: string | null
}

/** The rules of the deadline engine that the views word; another rule shows the letter's title. */
const RULES: Readonly<Record<string, Readonly<Record<'short' | 'full' | 'period' | 'months', FlowleapRecordsKey>>>> = {
  'EPO:R71(3)': { short: 'deadline.rule.r71Short', full: 'deadline.rule.r71', period: 'deadline.rule.r71Period', months: 'deadline.rule.r71Months' },
}

/**
 * The words of the rule that an office event code triggers.
 * @param t - the translate function.
 * @param code - the office event code.
 * @returns the rule's words, or the letter's title for a rule the views do not word.
 */
export function ruleWords(t: Translate, code: string | null): RuleWords {
  const rule = code === null ? undefined : RULES[code]
  if (rule === undefined) {
    const title = letterTitle(t, code)
    return { short: title, full: title, period: null, months: null }
  }
  return { short: t(rule.short), full: t(rule.full), period: rule.period, months: t(rule.months) }
}

/**
 * The office of an office event code, such as `EPO` of `EPO:R71(3)`.
 * @param code - the code.
 * @returns the office, or null.
 */
export function officeOf(code: string | null): string | null {
  return code?.split(':')[0] ?? null
}

/**
 * A calendar date without the weekday, in the UI language's medium style: "30 Oct 2026", "30.10.2026".
 * @param date - the date.
 * @param locale - the UI language.
 * @returns the date text.
 */
export function formatDay(date: IsoDate, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(date))
}

/**
 * Open a document's bytes in a new tab: a PDF shows inline, another file downloads.
 * @param ctx - the screen context.
 * @param document - the document.
 */
export function openDocument(ctx: ScreenContext, document: DocumentId): void {
  window.open(ctx.contentHref(document), '_blank', 'noopener')
}
