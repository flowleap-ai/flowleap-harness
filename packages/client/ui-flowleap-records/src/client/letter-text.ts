/**
 * The words of a letter that its drawing shows: for each value that reader 1 read, the line of the page that holds
 * the value and the line directly above it, as the page text around the read span has them. Nothing is translated or
 * added; a value whose span has no page text around it shows as its quote alone.
 */

import type { Span } from './api.ts'

/** A run of one line: words of the page, or a read value, which the drawing marks. */
export interface LetterRun {
  readonly text: string
  readonly read: boolean
}

/** One cell of a line: the page text puts runs of spaces between the columns of a line. */
export type LetterCell = readonly LetterRun[]

/** One line of the drawing: cells of the page in their order, or one column of a table of the page. */
export interface LetterLine {
  /** The page, the offset of the first page line in the page text and the column, unique in a letter. */
  readonly key: string
  readonly cells: readonly LetterCell[]
}

/** A line of the page text, with the read spans in it as offsets from its first character. */
interface Line {
  readonly page: number
  readonly start: number
  text: string
  readonly marks: [number, number][]
}

/** Two or more spaces: the page text of `pdftotext -layout` puts them between columns. */
const COLUMN_GAP = /\s{2,}/u

/**
 * Split the text of one line into its cells, with each read span as a marked run.
 * @param line - the line.
 * @returns the cells, with no empty cell and no white space at the start of a cell.
 */
function cellsOf(line: Line): LetterRun[][] {
  const runs: LetterRun[] = []
  let at = 0
  for (const [from, to] of line.marks.toSorted((left, right) => left[0] - right[0])) {
    if (from < at) continue
    runs.push({ text: line.text.slice(at, from), read: false }, { text: line.text.slice(from, to), read: true })
    at = to
  }
  runs.push({ text: line.text.slice(at), read: false })
  const cells: LetterRun[][] = []
  let cell: LetterRun[] = []
  for (const run of runs) {
    if (run.read) {
      cell.push(run)
      continue
    }
    run.text.split(COLUMN_GAP).forEach((part, index) => {
      if (index > 0) {
        cells.push(cell)
        cell = []
      }
      if (part !== '') cell.push({ text: part, read: false })
    })
  }
  cells.push(cell)
  return cells
    .map(cell => cell.map((run, index) => index === 0 && !run.read ? { ...run, text: run.text.trimStart() } : run).filter(run => run.text !== ''))
    .filter(cell => cell.length > 0)
}

/**
 * The lines of the letter that hold its read values, in page order, with each read value marked. Page lines that
 * follow each other with the same number of cells, such as the labels and the values of a header table, give one
 * line for each column, so each label stands before its value ("Ref. FL-2026-0001") and the drawing stays narrow.
 * @param spans - the read spans of the letter's values.
 * @returns the lines.
 */
export function letterLines(spans: readonly Span[]): LetterLine[] {
  const lines = new Map<string, Line>()
  const add = (page: number, start: number, text: string, mark: [number, number] | null) => {
    const key = `${page}:${start}`
    const line = lines.get(key) ?? { page, start, text, marks: [] }
    // Two spans on one line can see its end differently, as each excerpt stops after 160 characters.
    if (text.length > line.text.length) line.text = text
    if (mark !== null) line.marks.push(mark)
    lines.set(key, line)
  }
  for (const span of spans) {
    if (span.excerpt === null) {
      add(span.page, span.start, span.quote, [0, span.quote.length])
      continue
    }
    const { before, after } = span.excerpt
    const lineBreak = before.lastIndexOf('\n')
    const head = before.slice(lineBreak + 1)
    const tail = after.slice(0, after.includes('\n') ? after.indexOf('\n') : after.length)
    const start = span.start - head.length
    add(span.page, start, `${head}${span.quote}${tail}`, [head.length, head.length + span.quote.length])
    // The line above, when the excerpt holds all of it: in a header table it holds the column labels.
    const aboveBreak = lineBreak === -1 ? -1 : before.lastIndexOf('\n', lineBreak - 1)
    const above = before.slice(aboveBreak + 1, lineBreak)
    const fromPageStart = span.start === before.length
    if (lineBreak !== -1 && (aboveBreak !== -1 || fromPageStart) && above.trim() !== '') add(span.page, start - 1 - above.length, above, null)
  }
  const blocks: { key: string; columns: number; rows: LetterRun[][][]; end: Line }[] = []
  for (const line of [...lines.values()].toSorted((left, right) => left.page - right.page || left.start - right.start)) {
    const cells = cellsOf(line)
    const last = blocks.at(-1)
    const next = last !== undefined && last.end.page === line.page && last.end.start + last.end.text.length + 1 === line.start
    if (next && last.columns === cells.length) {
      last.rows.push(cells)
      last.end = line
    } else blocks.push({ key: `${line.page}:${line.start}`, columns: cells.length, rows: [cells], end: line })
  }
  return blocks.flatMap(({ key, columns, rows }) => rows.length === 1
    ? rows.map(cells => ({ key, cells }))
    : Array.from({ length: columns }, (_, column) => ({ key: `${key}:${column}`, cells: rows.flatMap(cells => cells.slice(column, column + 1)) })))
}
