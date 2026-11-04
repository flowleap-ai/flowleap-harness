/**
 * Parsers for the JSON that the Records API sends: each one checks a value at the wire boundary and returns it typed,
 * or throws a `WireError` that names the path of the first value that does not match. Object parsers keep only the
 * fields they name, so a field the server adds later does not reach the views.
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** A value of the answer did not match the Records API contract. */
export class WireError extends Error {
  /**
   * @param path - where the value is, such as `rows[3].state`.
   * @param expected - what the contract wants there.
   */
  constructor(readonly path: string, expected: string) {
    super(`${path}: expected ${expected}`)
    this.name = 'WireError'
  }
}

/** A parser of one value at a path. */
export type Parse<T> = (value: unknown, path: string) => T

/** The type that a parser returns. */
export type Parsed<P> = P extends Parse<infer T> ? T : never

/**
 * A string.
 * @param value - the wire value.
 * @param path - where it is.
 * @returns the string.
 */
export const str: Parse<string> = (value, path) => {
  if (typeof value !== 'string') throw new WireError(path, 'a string')
  return value
}

/**
 * A finite number.
 * @param value - the wire value.
 * @param path - where it is.
 * @returns the number.
 */
export const num: Parse<number> = (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new WireError(path, 'a number')
  return value
}

/**
 * A boolean.
 * @param value - the wire value.
 * @param path - where it is.
 * @returns the boolean.
 */
export const bool: Parse<boolean> = (value, path) => {
  if (typeof value !== 'boolean') throw new WireError(path, 'true or false')
  return value
}

/**
 * A string that matches a pattern, with a brand.
 * @param pattern - the pattern the whole string matches.
 * @param expected - what the contract wants, for the error.
 * @returns the parser.
 */
export function branded<B extends Branded<string>>(pattern: RegExp, expected: string): Parse<B> {
  return (value, path) => {
    const text = str(value, path)
    if (!pattern.test(text)) throw new WireError(path, expected)
    return text as B
  }
}

/**
 * One of the given strings.
 * @param values - the allowed strings.
 * @returns the parser.
 */
export function oneOf<const L extends string>(values: readonly L[]): Parse<L> {
  const allowed = new Set<string>(values)
  return (value, path) => {
    const text = str(value, path)
    if (!allowed.has(text)) throw new WireError(path, `one of ${values.join(', ')}`)
    return text as L
  }
}

/**
 * Null, or a value of the parser.
 * @param parse - the parser of the value.
 * @returns the parser.
 */
export function nullable<T>(parse: Parse<T>): Parse<T | null> {
  return (value, path) => value === null ? null : parse(value, path)
}

/**
 * An array whose items match the parser.
 * @param parse - the parser of one item.
 * @returns the parser.
 */
export function arrayOf<T>(parse: Parse<T>): Parse<readonly T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) throw new WireError(path, 'an array')
    return value.map((item, index) => parse(item, `${path}[${index}]`))
  }
}

/**
 * The value as a JSON object.
 * @param value - the value.
 * @param path - where it is.
 * @returns the object.
 */
export function objectAt(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new WireError(path, 'an object')
  return value as Readonly<Record<string, unknown>>
}

/** Field parsers of an object. */
type Shape = Readonly<Record<string, Parse<unknown>>>

/**
 * An object with the named fields; other fields are dropped.
 * @param shape - one parser for each field.
 * @returns the parser.
 */
export function obj<S extends Shape>(shape: S): Parse<{ readonly [K in keyof S]: Parsed<S[K]> }> {
  return (value, path) => {
    const source = objectAt(value, path)
    const out: Record<string, unknown> = {}
    for (const [key, parse] of Object.entries(shape)) out[key] = parse(source[key], `${path}.${key}`)
    return out as { readonly [K in keyof S]: Parsed<S[K]> }
  }
}

/**
 * An object whose fields are a subset of the keys; each present field matches the parser.
 * @param keys - the allowed keys; another key is dropped.
 * @param parse - the parser of a field.
 * @returns the parser.
 */
export function partialRecord<const K extends string, T>(keys: readonly K[], parse: Parse<T>): Parse<Partial<Readonly<Record<K, T>>>> {
  return (value, path) => {
    const source = objectAt(value, path)
    const out: Partial<Record<K, T>> = {}
    for (const key of keys) if (source[key] !== undefined) out[key] = parse(source[key], `${path}.${key}`)
    return out
  }
}

/** A JSON object with fields of any value, kept as it is (an event's detail, which only Audit shows). */
export const anyObject: Parse<Readonly<Record<string, unknown>>> = objectAt

/** An ISO 8601 UTC time, such as `2026-11-04T14:16:00Z`. */
export type IsoTime = Branded<'IsoTime'>
/** A calendar date, `YYYY-MM-DD`. */
export type IsoDate = Branded<'IsoDate'>

/**
 * An ISO 8601 time that `Date.parse` reads.
 * @param value - the wire value.
 * @param path - where it is.
 * @returns the time.
 */
export const isoTime: Parse<IsoTime> = (value, path) => {
  const text = str(value, path)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) throw new WireError(path, 'an ISO 8601 time')
  return text as IsoTime
}

/**
 * A real calendar date `YYYY-MM-DD`.
 * @param value - the wire value.
 * @param path - where it is.
 * @returns the date.
 */
export const isoDate: Parse<IsoDate> = (value, path) => {
  const text = str(value, path)
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const date = parsed === null ? null : new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])))
  if (date === null || date.toISOString().slice(0, 10) !== text) throw new WireError(path, 'a date YYYY-MM-DD')
  return text as IsoDate
}
