/**
 * The three text helpers the copied IDE modules took from `vs/base` and
 * `util/node/crypto`, reproduced so the report core imports nothing outside
 * this package.
 * @module
 */

import { createHash } from 'node:crypto'

/**
 * Escape the three characters that would start HTML inside a Markdown table cell.
 * @param html - the raw text.
 * @returns the text with `<`, `>` and `&` escaped.
 */
export function escape(html: string): string {
  return html.replace(/[<>&]/g, match => HTML_ESCAPES[match as keyof typeof HTML_ESCAPES])
}

const HTML_ESCAPES = { '<': '&lt;', '>': '&gt;', '&': '&amp;' } as const

/**
 * Escape regular-expression metacharacters so a value matches literally.
 * @param value - the literal text.
 * @returns the escaped pattern source.
 */
export function escapeRegExpCharacters(value: string): string {
  return value.replace(/[\\{}*+?|^$.[\]()]/g, '\\$&')
}

/**
 * SHA-256 hex digest of text or bytes; the receipt binds a report and its evidence companion with it.
 * @param value - the content to digest.
 * @returns the lowercase hex digest.
 */
export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
