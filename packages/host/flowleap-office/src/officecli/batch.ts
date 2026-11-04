/**
 * Typed OfficeCLI batch items and the builders that make the item list of each document. A {@link BatchItem} is the
 * only way to write a batch: {@link serializeBatch} turns each item into OfficeCLI JSON through one row per item kind,
 * then refuses web addresses in every string. No item kind adds a diagram, an image, a link, or a table from the CSV
 * `data` property; table and sheet cells are written one item per cell.
 * @module
 */

import type { ChartRequest, LetterBlock, RedlineParagraph } from '../types.ts'
import { refuseUrls } from './command.ts'

/** A tracked change on a run or a paragraph mark. */
export interface Revision {
  /** Insertion or deletion. */
  readonly type: 'ins' | 'del'
  /** Author. */
  readonly author: string
  /** ISO-8601 date. */
  readonly date: string
}

/** Cell formats of a claim chart that change with the deployment. */
export interface ChartLook {
  /** Width of the feature-number column, in Excel character units. */
  readonly featureColumnWidth: number
  /** Width of every other column, in Excel character units. */
  readonly textColumnWidth: number
  /** Header fill as six hex digits. */
  readonly headerFill: string
  /** Header font color as six hex digits. */
  readonly headerFontColor: string
}

/** One OfficeCLI batch item. Paragraph, run, and paragraph-mark items act on the last body paragraph. */
export type BatchItem =
  | { readonly kind: 'paragraph'; readonly style?: 'Heading1' | 'Heading2'; readonly text?: string }
  | { readonly kind: 'run'; readonly text: string; readonly revision?: Revision }
  | { readonly kind: 'paragraphMark'; readonly id: number; readonly revision: Revision }
  | { readonly kind: 'table'; readonly rows: number; readonly cols: number; readonly style: string }
  | { readonly kind: 'tableCell'; readonly row: number; readonly col: number; readonly text: string; readonly strong: boolean }
  | { readonly kind: 'tableHeader' }
  | { readonly kind: 'renameSheet'; readonly from: string; readonly to: string }
  | { readonly kind: 'sheetCell'; readonly sheet: string; readonly ref: string; readonly value: string; readonly header?: { readonly fill: string; readonly fontColor: string } }
  | { readonly kind: 'column'; readonly sheet: string; readonly column: string; readonly width: number }
  | { readonly kind: 'rowHeight'; readonly sheet: string; readonly row: number; readonly points: number }
  | { readonly kind: 'sheetLayout'; readonly sheet: string; readonly autoFilter: string; readonly freeze: string }
  | { readonly kind: 'review'; readonly selector: string; readonly action: 'accept' | 'reject' }

/** One batch item as OfficeCLI reads it. */
export type BatchJson = Readonly<Record<string, string | Readonly<Record<string, string>>>>

type ItemTable = { readonly [K in BatchItem['kind']]: (item: Extract<BatchItem, { kind: K }>) => BatchJson }

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const LAST_PARAGRAPH = '/body/p[last()]'
const LAST_TABLE = '/body/tbl[last()]'

function revisionProps(revision: Revision | undefined): Record<string, string> {
  if (revision === undefined) return {}
  return { 'revision.type': revision.type, 'revision.author': revision.author, 'revision.date': revision.date }
}

/**
 * Escape text for an XML attribute value.
 * @param value - raw text.
 * @returns the escaped text.
 */
export function xmlAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;')
}

const BOLD: Readonly<Record<string, string>> = { bold: 'true' }

const CELL_FORMAT = { 'border.all': 'thin', 'alignment.wrapText': 'true', 'alignment.vertical': 'top' } as const

/** The OfficeCLI JSON row of each item kind. */
const ITEMS: ItemTable = {
  paragraph: item => ({
    command: 'add', parent: '/body', type: 'paragraph',
    props: { ...(item.style === undefined ? {} : { style: item.style }), ...(item.text === undefined ? {} : { text: item.text }) },
  }),
  run: item => ({ command: 'add', parent: LAST_PARAGRAPH, type: 'run', props: { text: item.text, ...revisionProps(item.revision) } }),
  // OfficeCLI has no paragraph-mark deletion, and its paragraph-mark insertion copies the mark into later runs, which
  // fails validation. The mark is written into the paragraph properties after the paragraph's runs instead.
  paragraphMark: item => ({
    command: 'raw-set', part: '/document', xpath: '/w:document/w:body/w:p[last()]/w:pPr', action: 'append',
    xml: `<w:rPr xmlns:w="${WORD_NAMESPACE}"><w:${item.revision.type} w:id="${String(item.id)}" w:author="${xmlAttribute(item.revision.author)}" w:date="${xmlAttribute(item.revision.date)}"/></w:rPr>`,
  }),
  table: item => ({
    command: 'add', parent: '/body', type: 'table',
    props: { rows: String(item.rows), cols: String(item.cols), ...(item.style === '' ? {} : { style: item.style }) },
  }),
  tableCell: item => ({
    command: 'set', path: `${LAST_TABLE}/tr[${String(item.row)}]/tc[${String(item.col)}]`,
    props: { text: item.text, ...(item.strong ? BOLD : {}) },
  }),
  tableHeader: () => ({ command: 'set', path: `${LAST_TABLE}/tr[1]`, props: { header: 'true' } }),
  renameSheet: item => ({ command: 'set', path: `/${item.from}`, props: { name: item.to } }),
  sheetCell: item => ({
    command: 'set', path: `/${item.sheet}/${item.ref}`,
    props: {
      value: item.value, type: 'string', ...CELL_FORMAT,
      ...(item.header === undefined ? {} : { 'font.bold': 'true', fill: item.header.fill, 'font.color': item.header.fontColor }),
    },
  }),
  column: item => ({ command: 'set', path: `/${item.sheet}/col[${item.column}]`, props: { width: String(item.width) } }),
  rowHeight: item => ({ command: 'set', path: `/${item.sheet}/row[${String(item.row)}]`, props: { height: `${String(item.points)}pt` } }),
  sheetLayout: item => ({
    command: 'set', path: `/${item.sheet}`,
    props: { autoFilter: item.autoFilter, freeze: item.freeze, orientation: 'landscape', fitToPage: '1x0', printTitleRows: '1:1' },
  }),
  review: item => ({ command: 'set', path: item.selector, props: { 'revision.action': item.action } }),
}

/**
 * The OfficeCLI JSON of a batch.
 * @param items - the typed items.
 * @returns one JSON object per item.
 * @throws {FlowleapOfficeError} `url_refused` when a string starts with `http://` or `https://`.
 */
export function serializeBatch(items: readonly BatchItem[]): BatchJson[] {
  // The table is keyed by kind; the cast picks the row whose parameter type is this item's member.
  const json = items.map(item => (ITEMS[item.kind] as (item: BatchItem) => BatchJson)(item))
  refuseUrls(json)
  return json
}

/**
 * Word text: a line feed becomes a line break inside the same paragraph, because OfficeCLI starts a new paragraph at a
 * line feed.
 * @param text - text with any line endings.
 * @returns the text with each line ending as a vertical tab.
 */
export function wordText(text: string): string {
  return text.replace(/\r\n|\r|\n/gu, '\v')
}

/**
 * The items of a letter body.
 * @param blocks - the blocks in order.
 * @param tableStyle - the Word table style of every table; `''` for none.
 * @returns the items.
 */
export function letterItems(blocks: readonly LetterBlock[], tableStyle: string): BatchItem[] {
  return blocks.flatMap((block): BatchItem[] => {
    switch (block.kind) {
      case 'heading': return [{ kind: 'paragraph', style: block.level === 1 ? 'Heading1' : 'Heading2', text: wordText(block.text) }]
      case 'paragraph': return [{ kind: 'paragraph', text: wordText(block.text) }]
      case 'table': return [
        { kind: 'table', rows: block.rows.length + 1, cols: block.header.length, style: tableStyle },
        ...[block.header, ...block.rows].flatMap((row, r) => row.map((text, c): BatchItem => ({
          kind: 'tableCell', row: r + 1, col: c + 1, text: wordText(text), strong: r === 0,
        }))),
        { kind: 'tableHeader' },
      ]
    }
  })
}

/**
 * The items of a marked claims copy. Each claim is one paragraph with one run per segment; a changed paragraph mark is
 * written after its runs with ids from `firstId` upward, below the ids OfficeCLI assigns (from 1048576).
 * @param heading - heading paragraph text; `undefined` for none.
 * @param paragraphs - the claim paragraphs.
 * @param author - author of every change.
 * @param date - ISO-8601 date of every change.
 * @param firstId - the id of the first paragraph mark change; above every `w:id` of the template.
 * @returns the items.
 */
export function markedClaimsItems(
  heading: string | undefined, paragraphs: readonly RedlineParagraph[], author: string, date: string, firstId: number,
): BatchItem[] {
  let nextId = firstId
  const items: BatchItem[] = heading === undefined ? [] : [{ kind: 'paragraph', style: 'Heading1', text: wordText(heading) }]
  for (const paragraph of paragraphs) {
    items.push({ kind: 'paragraph' })
    for (const segment of paragraph.segments) {
      if (segment.text === '') continue
      const text = wordText(segment.text)
      items.push(segment.kind === 'same' ? { kind: 'run', text } : { kind: 'run', text, revision: { type: segment.kind, author, date } })
    }
    if (paragraph.mark !== 'same') items.push({ kind: 'paragraphMark', id: nextId++, revision: { type: paragraph.mark, author, date } })
  }
  return items
}

/**
 * The text of a claim paragraph after its changes: inserted and unchanged runs.
 * @param paragraph - the claim paragraph.
 * @returns the text, or `undefined` for a deleted claim.
 */
export function cleanText(paragraph: RedlineParagraph): string | undefined {
  if (paragraph.mark === 'del') return undefined
  return paragraph.segments.filter(segment => segment.kind !== 'del').map(segment => segment.text).join('')
}

/**
 * The items of a clean claims copy: plain paragraphs of the texts after the changes, with no tracked change.
 * @param heading - heading paragraph text; `undefined` for none.
 * @param paragraphs - the claim paragraphs.
 * @returns the items.
 */
export function cleanClaimsItems(heading: string | undefined, paragraphs: readonly RedlineParagraph[]): BatchItem[] {
  const items: BatchItem[] = heading === undefined ? [] : [{ kind: 'paragraph', style: 'Heading1', text: wordText(heading) }]
  for (const paragraph of paragraphs) {
    const text = cleanText(paragraph)
    if (text !== undefined) items.push({ kind: 'paragraph', text: wordText(text) })
  }
  return items
}

/**
 * The Excel column name of a zero-based column index.
 * @param index - zero-based column.
 * @returns `A` for 0, `Z` for 25, `AA` for 26.
 */
export function columnName(index: number): string {
  let name = ''
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name
  }
  return name
}

/** Height of one wrapped text line in points at the default 11 pt font. */
const LINE_POINTS = 15
/** Space above and below the text of a cell in points. */
const ROW_PADDING_POINTS = 3

/**
 * The height of a sheet row whose cells wrap: the cell with the most lines decides. A column of width `w` holds about
 * `w` characters on one line.
 * @param cells - the cell texts.
 * @param widths - the column widths in character units.
 * @returns the row height in points.
 */
export function rowPoints(cells: readonly string[], widths: readonly number[]): number {
  const lines = cells.map((text, c) => {
    const perLine = Math.max(1, Math.floor(widths[c] ?? 1))
    return text.split(/\r\n|\r|\n/u).reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / perLine)), 0)
  })
  return Math.max(1, ...lines) * LINE_POINTS + ROW_PADDING_POINTS
}

/** The sheet OfficeCLI's `create` makes in a new workbook. */
export const FIRST_SHEET = 'Sheet1'

/**
 * The items of a claim chart: every cell as text with borders, wrap, and top alignment, a bold filled header, the
 * column widths, a row height for each row, the filter, the frozen header, and a landscape print fitted to the page
 * width.
 * @param request - sheet name, header, and rows.
 * @param look - the deployment's widths and header colors.
 * @returns the items.
 */
export function chartItems(request: ChartRequest, look: ChartLook): BatchItem[] {
  const { sheet } = request
  const table = [request.header, ...request.rows]
  const widths = request.header.map((_cell, c) => c === 0 ? look.featureColumnWidth : look.textColumnWidth)
  const header = { fill: look.headerFill, fontColor: look.headerFontColor }
  const last = `${columnName(request.header.length - 1)}${String(table.length)}`
  return [
    ...(sheet === FIRST_SHEET ? [] : [{ kind: 'renameSheet', from: FIRST_SHEET, to: sheet } as const]),
    ...table.flatMap((row, r) => row.map((value, c): BatchItem => ({
      kind: 'sheetCell', sheet, ref: `${columnName(c)}${String(r + 1)}`, value, ...(r === 0 ? { header } : {}),
    }))),
    ...widths.map((width, c): BatchItem => ({ kind: 'column', sheet, column: columnName(c), width })),
    ...table.map((row, r): BatchItem => ({ kind: 'rowHeight', sheet, row: r + 1, points: rowPoints(row, widths) })),
    { kind: 'sheetLayout', sheet, autoFilter: `A1:${last}`, freeze: 'A2' },
  ]
}
