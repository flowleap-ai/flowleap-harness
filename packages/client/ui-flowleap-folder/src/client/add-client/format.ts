/**
 * The forms in which Add client shows numbers, dates and copy with emphasis.
 * @module
 */

import { createElement, Fragment, type ReactNode } from 'react'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { AddClientKey } from './locales/index.ts'

/** The name of the EPO data product as the EPO writes it; data, not copy, so no language changes it. */
export const PATSTAT = 'PATSTAT'

/** The translate function of the Add client namespace. */
export type AddClientTranslate = (key: AddClientKey, values?: Record<string, string | number>) => string

/**
 * An EP application number as the EP Register writes it.
 * @param number - `EP` and 8 digits, such as `EP23171862`.
 * @returns `EP 23 171 862`; another form stays as it is.
 */
export function applicationLabel(number: string): string {
  const parts = /^([A-Z]{2})(\d{2})(\d{3})(\d{3})$/.exec(number)
  return parts === null ? number : parts.slice(1).join(' ')
}

/**
 * An EP publication number as the EP Register writes it.
 * @param number - `EP`, 7 digits and an optional kind, such as `EP4292805A1`.
 * @returns `EP 4 292 805 A1`; another form stays as it is.
 */
export function publicationLabel(number: string): string {
  const parts = /^([A-Z]{2})(\d)(\d{3})(\d{3})([A-Z]\d?)?$/.exec(number)
  return parts === null ? number : parts.slice(1).join(' ').trim()
}

/**
 * The time of a read, such as "8 Nov 2026, 14:02".
 * @param t - the translate function.
 * @param iso - ISO-8601 instant.
 * @param locale - the UI language.
 * @returns the date and the time in the UI language.
 */
export function asOfText(t: AddClientTranslate, iso: string, locale: LocaleId): string {
  const date = new Date(iso)
  return t('asOf', {
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date),
    time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date),
  })
}

/**
 * A calendar day.
 * @param day - `YYYY-MM-DD`, or an ISO-8601 instant.
 * @param locale - the UI language.
 * @returns the day in the UI language.
 */
export function dayText(day: string, locale: LocaleId): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(day.length === 10 ? `${day}T00:00:00Z` : day))
}

/**
 * A count with its word, from the `one` and `many` keys of the count.
 * @param t - the translate function.
 * @param count - the count.
 * @param one - the key for 1.
 * @param many - the key for another count, with `{count}`.
 * @returns the words.
 */
export function counted(t: AddClientTranslate, count: number, one: AddClientKey, many: AddClientKey): string {
  return count === 1 ? t(one) : t(many, { count })
}

const MARK = '\u0001'

/**
 * Copy with parts that the page renders as elements, such as a role word in bold.
 * @param t - the translate function.
 * @param key - the key.
 * @param values - the plain values.
 * @param parts - the element of each placeholder.
 * @returns the copy with the elements in place.
 */
export function rich(
  t: AddClientTranslate, key: AddClientKey, values: Record<string, string | number>, parts: Record<string, ReactNode>,
): ReactNode {
  const marked = Object.fromEntries(Object.keys(parts).map(name => [name, `${MARK}${name}${MARK}`]))
  return t(key, { ...values, ...marked }).split(MARK).map((piece, index) =>
    createElement(Fragment, { key: index }, index % 2 === 1 ? parts[piece] : piece))
}
