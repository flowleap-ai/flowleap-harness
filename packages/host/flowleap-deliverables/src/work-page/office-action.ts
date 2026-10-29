/**
 * Reads the findings of an office action analysis from the report body that the `recipe-office-action-response`
 * skill writes in its analysis layout: the action table of `## 1. Action`, one `### Objection` block for each
 * objection under `## 2. Objections`, and the claim tables of `## 3. Claim-by-claim comparison`. The layout keeps
 * its field labels so that a reader finds each field by its label. The parser tolerates a missing section, an
 * unknown field, or a heading without a number: a missing value is an empty string, an unknown field goes to
 * `details`. Markdown links keep only their text, and bold and code marks are removed.
 * @module
 */

import type {
  CitedDocument, CitedPassage, ClaimTable, ComparisonRow, LabelledText, Objection, OfficeActionFindings, ResponseOption,
} from './types.ts'

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/
const SECTION = /^##\s+(?:\d+\.\s*)?(.*?)\s*$/
const OBJECTION = /^###\s+Objection\b\s*(\d+)?\s*[:.\-–—]?\s*(.*?)\s*$/i
const FIELD = /^[-*]\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/
const BOLD_LINE = /^\*\*(.+?)\*\*\s*:?\s*$/
const SUB_HEADING = /^#{3,6}\s+(.+?)\s*$/

/**
 * Plain text of a Markdown value: a link keeps its text, and bold and code marks are removed.
 * @param text - the Markdown text.
 * @returns the plain text, trimmed.
 */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim()
}

/**
 * Cells of one Markdown table row; an escaped `\|` stays in its cell.
 * @param line - the row, which starts with `|`.
 * @returns the cells as plain text.
 */
export function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map(cell => plainText(cell.replace(/\\\|/g, '|')))
}

/**
 * The groups of a regular expression match; a group that did not take part, or no match, gives `undefined`.
 * @param match - the match, or `null`.
 * @returns the match and its groups.
 */
function groups(match: RegExpExecArray | null): readonly (string | undefined)[] {
  return match ?? []
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith('|')
}

function isSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{3,}/.test(line.trim())
}

/** One Markdown table: its header cells, its data rows, and the last bold line above it. */
interface Table {
  readonly header: string[]
  readonly rows: string[][]
  /** The text of the last line above the table that is bold as a whole; empty when there is none. */
  readonly caption: string
}

/**
 * The Markdown tables in some lines; the separator row of each table is left out.
 * @param lines - lines that hold tables and other text.
 * @returns the tables, in order.
 */
function tables(lines: readonly string[]): Table[] {
  const found: Table[] = []
  let current: Table | undefined
  let previous = ''
  let caption = ''
  for (const line of lines) {
    if (current !== undefined && isTableLine(line)) {
      current.rows.push(tableCells(line))
      continue
    }
    current = undefined
    if (isTableLine(previous) && isSeparatorRow(line)) {
      current = { header: tableCells(previous), rows: [], caption }
      found.push(current)
    }
    const [, bold = SUB_HEADING.exec(line.trim())?.[1]] = groups(BOLD_LINE.exec(line.trim()))
    if (bold !== undefined) caption = plainText(bold).replace(/[.:]$/, '')
    previous = line
  }
  return found
}

/**
 * Split a document into its `##` sections.
 * @param lines - the document lines.
 * @returns each section title (without its number) with the lines under it.
 */
function sections(lines: readonly string[]): { title: string; lines: string[] }[] {
  const result: { title: string; lines: string[] }[] = []
  for (const line of lines) {
    const [, title] = line.startsWith('###') ? [] : groups(SECTION.exec(line))
    if (title !== undefined) {
      result.push({ title: title.toLowerCase(), lines: [] })
      continue
    }
    result.at(-1)?.lines.push(line)
  }
  return result
}

function sectionLines(all: readonly { title: string; lines: string[] }[], title: RegExp): string[] {
  return all.find(section => title.test(section.title))?.lines ?? []
}

/**
 * Claim numbers of a `Claims hit` value: the numbers and ranges before the first parenthesis, sorted, each once. A value
 * that starts with `none` names no claim, also when it names claims after it, for example `none; relevant "1-15"`.
 * @param text - the field value, for example `1-7, 9 (A only for 8)`.
 * @returns the claim numbers.
 */
export function claimNumbers(text: string): number[] {
  if (/^none\b/i.test(text.trim())) return []
  const [head = ''] = text.split('(')
  const numbers = new Set<number>()
  for (const match of head.matchAll(/(\d+)\s*(?:[-–]\s*(\d+))?/g)) {
    const [, first, last] = groups(match)
    const from = Number(first)
    const to = last === undefined ? from : Number(last)
    // A reversed or very long range is a typing error; it keeps only its first number.
    const end = to >= from && to - from < 500 ? to : from
    for (let claim = from; claim <= end; claim++) numbers.add(claim)
  }
  return [...numbers].sort((left, right) => left - right)
}

/**
 * Split an `Options` value into its options at each `;` outside parentheses. A part that starts in lower case belongs to
 * the option before it.
 * @param text - the field value, for example `Argue (…); Amend (…, basis ¶[0012]); Interview`.
 * @returns the options; a short name before `(` is the label, else the first word is.
 */
export function responseOptions(text: string): ResponseOption[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '(') depth++
    if (character === ')') depth = Math.max(0, depth - 1)
    if (character === ';' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  const options: ResponseOption[] = []
  for (const part of parts.map(entry => entry.trim().replace(/\.$/, '')).filter(entry => entry !== '')) {
    const previous = options.at(-1)
    // A part that starts in lower case continues the option before it, for example `Amend (…); the attorney decides`.
    if (previous !== undefined && /^\p{Ll}/u.test(part)) {
      options[options.length - 1] = { label: previous.label, text: previous.text === '' ? part : `${previous.text}; ${part}` }
      continue
    }
    const [, name = '', inner = ''] = groups(/^([^()]+?)\s*\((.*)\)$/s.exec(part))
    if (name !== '' && name.split(/\s+/).length <= 5) {
      options.push({ label: name, text: inner.trim() })
      continue
    }
    const [label = part, ...rest] = part.split(/\s+/)
    options.push({ label, text: rest.join(' ') })
  }
  return options
}

/** The rows of the action table of `## 1. Action`, by the lower-case field name. */
function actionRows(lines: readonly string[]): Map<string, string> {
  const rows = new Map<string, string>()
  for (const table of tables(lines)) {
    for (const row of table.rows) {
      const [field = '', value = ''] = row
      if (field !== '' && !rows.has(field.toLowerCase())) rows.set(field.toLowerCase(), value)
    }
  }
  return rows
}

function rowStarting(rows: ReadonlyMap<string, string>, prefix: string): string {
  for (const [field, value] of rows) if (field.startsWith(prefix)) return value
  return ''
}

/**
 * The first ISO 8601 date of a row; a row that starts with `not computable`, `none` or `unknown` has no date, also when it
 * names an indicative one after that.
 * @param text - the row value.
 * @returns the date, or `null`.
 */
function firstDate(text: string): string | null {
  if (/^(not computable|none|unknown)\b/i.test(text.trim())) return null
  return ISO_DATE.exec(text)?.[1] ?? null
}

/**
 * Cited documents of the `Cited documents` row: one entry per `;`-separated part, with its `D<n>` label.
 * @param text - the row value.
 * @returns the documents.
 */
function citedDocuments(text: string): CitedDocument[] {
  return text.split(';').map(part => part.trim()).filter(part => part !== '').map((part) => {
    const [, label = '', rest = part] = groups(/^(D\d+)\b[\s:,]*(.*)$/.exec(part))
    return { label, text: rest }
  })
}

/** One field of an objection block: its label, its first line, and the lines under it. */
interface RawField {
  readonly label: string
  readonly lines: string[]
}

function fieldsOf(lines: readonly string[]): RawField[] {
  const fields: RawField[] = []
  for (const line of lines) {
    const [, label, first = ''] = groups(FIELD.exec(line))
    if (label !== undefined) {
      fields.push({ label: label.replace(/:\s*$/, '').trim(), lines: [first] })
      continue
    }
    fields.at(-1)?.lines.push(line)
  }
  return fields
}

/** The text of a field: its lines without the tables, as plain text with blank lines removed. */
function fieldText(lines: readonly string[]): string {
  return lines.filter(line => !isTableLine(line)).map(line => plainText(line)).filter(line => line !== '').join('\n')
}

function citedPassages(lines: readonly string[]): CitedPassage[] {
  return tables(lines).flatMap(table => table.rows.map(([document = '', role = '', passage = '', says = '', anchor = '']) => (
    { document, role, passage, says, anchor }
  )))
}

/** The number and the title of an `### Objection` heading. */
interface ObjectionHeading {
  readonly id: string | undefined
  readonly title: string
}

/**
 * Read one `### Objection` block.
 * @param heading - the heading match.
 * @param lines - the lines under the heading.
 * @param position - the 1-based position of the block, used as the id when the heading has no number.
 * @returns the objection.
 */
function objectionOf(heading: ObjectionHeading, lines: readonly string[], position: number): Objection {
  const fields = fieldsOf(lines)
  const text = (prefix: string): string => {
    const field = fields.find(entry => entry.label.toLowerCase().replace(/[’']/g, '\'').startsWith(prefix))
    return field === undefined ? '' : fieldText(field.lines)
  }
  const known = ['ground', 'claims hit', 'examiner\'s reasoning', 'source of the objection', 'cited documents', 'assessment', 'options',
    'reply must address', 'confidence and gaps', 'sources']
  const citations = fields.find(field => field.label.toLowerCase().startsWith('cited documents'))
  const claimsText = text('claims hit')
  return {
    id: heading.id ?? String(position),
    title: plainText(heading.title),
    ground: text('ground'),
    claims: claimNumbers(claimsText),
    claimsText,
    reasoning: text('examiner\'s reasoning'),
    source: text('source of the objection'),
    citations: citations === undefined ? [] : citedPassages(citations.lines),
    citationsText: citations === undefined ? '' : fieldText(citations.lines),
    assessment: fields.filter(field => field.label.toLowerCase().startsWith('assessment')).map(field => ({
      label: field.label, text: fieldText(field.lines),
    })),
    options: responseOptions(text('options')),
    replyMustAddress: text('reply must address'),
    confidence: text('confidence and gaps'),
    sources: text('sources'),
    details: fields
      .filter(field => !known.some(prefix => field.label.toLowerCase().replace(/[’']/g, '\'').startsWith(prefix)))
      .map((field): LabelledText => ({ label: field.label, text: fieldText(field.lines) })),
  }
}

function objectionsOf(lines: readonly string[]): Objection[] {
  // A `null` heading is another third-level heading: it ends the block, and its lines belong to no objection.
  const blocks: { heading: ObjectionHeading | null; lines: string[] }[] = []
  for (const line of lines) {
    if (line.startsWith('### ')) {
      const [matched, id, title = ''] = groups(OBJECTION.exec(line))
      blocks.push({ heading: matched === undefined ? null : { id, title }, lines: [] })
      continue
    }
    blocks.at(-1)?.lines.push(line)
  }
  return blocks.flatMap(block => block.heading === null ? [] : [{ heading: block.heading, lines: block.lines }])
    .map((block, index) => objectionOf(block.heading, block.lines, index + 1))
}

/**
 * Claim tables of the comparison: each table whose header starts with `Element`, named by the bold line above it.
 * @param lines - the section lines.
 * @returns the tables, in report order.
 */
function comparisonOf(lines: readonly string[]): ClaimTable[] {
  return tables(lines).filter(table => /^element/i.test(table.header.join(''))).map((table) => {
    const [, claim] = groups(/\bclaim\s+(\d+)/i.exec(table.caption))
    return {
      heading: table.caption,
      claim: claim === undefined ? null : Number(claim),
      rows: table.rows.map(([element = '', examiner = '', cited = '', assessment = '']): ComparisonRow => (
        { element, examiner, cited, assessment }
      )),
    }
  })
}

/**
 * Read the findings of an office action analysis.
 * @param report - the report body in the analysis layout.
 * @param matter - the application number that the save names; empty or omitted to use the action table.
 * @returns the findings; a report without the layout gives empty findings.
 */
export function parseOfficeActionReport(report: string, matter?: string): OfficeActionFindings {
  const all = sections(report.split(/\r?\n/))
  const action = actionRows(sectionLines(all, /^action\b/))
  const deadlineText = rowStarting(action, 'last date without extension')
  return {
    application: matter?.trim() || rowStarting(action, 'application'),
    communication: rowStarting(action, 'office and action').replace(/\s*\([^)]*\)/g, '').trim(),
    issued: firstDate(rowStarting(action, 'action date')),
    deadline: firstDate(deadlineText),
    deadlineText,
    documents: citedDocuments(rowStarting(action, 'cited documents')),
    objections: objectionsOf(sectionLines(all, /^objections\b/)),
    comparison: comparisonOf(sectionLines(all, /comparison/)),
  }
}
