/**
 * Dates, times and days left as the IPMS screens write them: times of today as `14:16`, yesterday as a word, other
 * days as a short date; due dates as a long date; days left computed from today and written out, never `117 d`.
 */

import type { IsoDate, IsoTime } from './api.ts'

/** The day of a due date relative to today. */
export type DueDay =
  | { readonly kind: 'overdue'; readonly days: number }
  | { readonly kind: 'today' }
  | { readonly kind: 'tomorrow' }
  | { readonly kind: 'left'; readonly days: number }

const DAY_MS = 86_400_000

/**
 * The Intl locale of a UI language: English dates read as in the firm's region (1 Mar 2027), not the US order.
 * @param locale - the UI language.
 * @returns the Intl locale.
 */
export function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale
}

/**
 * The calendar day of a time in a time zone, as `YYYY-MM-DD`.
 * @param time - epoch milliseconds.
 * @param timeZone - the time zone; the browser's when absent.
 * @returns the day.
 */
export function dayOf(time: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(time)
}

/**
 * Days from today to a due date.
 * @param due - the due date.
 * @param now - the time now, epoch milliseconds.
 * @param timeZone - the time zone of "today"; the browser's when absent.
 * @returns the due day.
 */
export function dueDay(due: IsoDate, now: number, timeZone?: string): DueDay {
  const days = Math.round((Date.parse(due) - Date.parse(dayOf(now, timeZone))) / DAY_MS)
  if (days < 0) return { kind: 'overdue', days: -days }
  if (days === 0) return { kind: 'today' }
  return days === 1 ? { kind: 'tomorrow' } : { kind: 'left', days }
}

/** How a list writes a time. */
export type ListTime = { readonly kind: 'today'; readonly text: string } | { readonly kind: 'yesterday' } | { readonly kind: 'date'; readonly text: string }

/**
 * A time as a list writes it: the clock time today, "yesterday", or the short date.
 * @param time - the time.
 * @param now - the time now, epoch milliseconds.
 * @param locale - the UI language.
 * @param timeZone - the time zone; the browser's when absent.
 * @returns the list time.
 */
export function listTime(time: IsoTime, now: number, locale: string, timeZone?: string): ListTime {
  const at = Date.parse(time)
  const day = dayOf(at, timeZone)
  if (day === dayOf(now, timeZone)) {
    return { kind: 'today', text: new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at) }
  }
  if (day === dayOf(now - DAY_MS, timeZone)) return { kind: 'yesterday' }
  return { kind: 'date', text: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone }).format(at) }
}

/**
 * A calendar date in the UI language.
 * @param date - the date.
 * @param locale - the UI language.
 * @param style - `short` (Mon, 1 Mar 2027) or `long` (Monday, 1 March 2027).
 * @returns the date text.
 */
export function formatDate(date: IsoDate, locale: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: style, day: 'numeric', month: style, year: 'numeric', timeZone: 'UTC',
  }).format(Date.parse(date))
}
