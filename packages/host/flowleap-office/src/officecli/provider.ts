/**
 * The OfficeCLI provider of `ctx.flowleapOffice`. Each operation runs in its own new folder under the provider's state
 * folder: the input bytes are written there, OfficeCLI works on fixed file names in it, the output bytes are read back,
 * and the folder is removed. OfficeCLI never sees a workspace path. Every written file passes `validate` before it is
 * returned.
 * @module
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { FlowleapOfficeError } from '../error.ts'
import type {
  AmendRequest, AmendResult, ChartRequest, FlowleapOffice, FlowleapOfficeErrorCode, LetterRequest, OfficeReadout, ReadRequest,
  RedlineParagraph, ReviewRequest, ReviewResult, ReviewSelection, TrackedRevision,
} from '../types.ts'
import {
  chartItems, cleanClaimsItems, letterItems, markedClaimsItems, serializeBatch, type BatchItem, type ChartLook,
} from './batch.ts'
import { refuseUrls, type OfficeCommand } from './command.ts'
import { failureText, type OfficeCliRunner } from './runner.ts'

/** What the provider needs besides the runner. */
export interface OfficeCliProviderOptions {
  /** Runs the calls. */
  readonly runner: OfficeCliRunner
  /** Existing absolute folder that holds the per-operation folders. */
  readonly callsDir: string
  /** Word table style of every letter table; `''` for none. */
  readonly tableStyle: string
  /** Widths and header colors of a claim chart. */
  readonly chart: ChartLook
}

const TextElements = z.object({ elements: z.array(z.object({ path: z.string(), type: z.string(), text: z.string() })) })
const Cells = z.object({ results: z.array(z.object({ path: z.string(), text: z.string().default('') })) })
const WordOutline = z.object({ headings: z.array(z.object({ level: z.number(), text: z.string() })).default([]) })
const Revisions = z.object({
  results: z.array(z.object({
    text: z.string().default(''),
    format: z.object({
      'revision.type': z.string(),
      'revision.author': z.string().default(''),
      'revision.date': z.string().optional(),
      'revision.id': z.string().regex(/^\d+$/u),
    }),
  })),
})
const SheetText = z.object({
  sheets: z.array(z.object({
    name: z.string(),
    rows: z.array(z.object({ cells: z.record(z.string(), z.string()) })),
  })),
})
const SheetOutline = z.object({ sheets: z.array(z.object({ name: z.string(), rows: z.number(), cols: z.number() })) })
const Merged = z.object({ unresolvedPlaceholders: z.array(z.string()).default([]) })
const ValidationErrors = z.object({ errors: z.array(z.object({ description: z.string() })).default([]) })

const FIELD_NAME = /^[A-Za-z0-9_.-]+$/u
const SHEET_NAME_FORBIDDEN = /[:\\/?*[\]]/u
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u

function invalid(message: string): never {
  throw new FlowleapOfficeError('invalid_request', message)
}

/** One operation's private folder and the calls in it. */
class OfficeCall {
  constructor(private readonly runner: OfficeCliRunner, readonly dir: string, private readonly signal: AbortSignal) {}

  async write(name: string, bytes: Uint8Array | string): Promise<void> {
    await writeFile(join(this.dir, name), bytes)
  }

  async bytes(name: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.dir, name)))
  }

  /**
   * Run a call that must succeed.
   * @returns the reply data.
   */
  async ok<T>(command: Exclude<OfficeCommand, { kind: 'version' }>, schema: z.ZodType<T>, failure: FlowleapOfficeErrorCode = 'engine_failed'): Promise<T> {
    const reply = await this.runner.reply(command, this.dir, this.signal)
    if (!reply.success) throw new FlowleapOfficeError(failure, `The Office engine refused ${command.kind}: ${failureText(reply)}`)
    const data = schema.safeParse(reply.data)
    if (!data.success) throw new FlowleapOfficeError('engine_failed', `The Office engine's ${command.kind} reply has unexpected fields.`)
    return data.data
  }

  async batch(file: string, items: readonly BatchItem[]): Promise<void> {
    const json = serializeBatch(items)
    if (json.length === 0) return
    await this.write(`${file}.batch.json`, JSON.stringify(json))
    await this.ok({ kind: 'batch', file, input: `${file}.batch.json` }, z.unknown())
  }

  async validate(file: string): Promise<void> {
    const reply = await this.runner.reply({ kind: 'validate', file }, this.dir, this.signal)
    if (reply.success) return
    const errors = ValidationErrors.safeParse(reply.data)
    const first = errors.success ? errors.data.errors[0]?.description : undefined
    throw new FlowleapOfficeError('invalid_output', `The written file does not pass validation: ${first ?? failureText(reply)}`)
  }

  /**
   * Refuse a template that holds tracked changes. In a claims copy their ids could collide with the ids of the new
   * changes; in a letter they would carry edits that the attorney does not see in the tool result.
   */
  async refuseTrackedChanges(file: string): Promise<void> {
    if ((await this.revisions(file, 'invalid_document')).length > 0) {
      throw new FlowleapOfficeError('invalid_document', 'The template holds tracked changes; use a template without tracked changes.')
    }
  }

  async revisions(file: string, failure: FlowleapOfficeErrorCode): Promise<TrackedRevision[]> {
    const data = await this.ok({ kind: 'query', file, selector: 'revision' }, Revisions, failure)
    return data.results.map(({ text, format }) => ({
      id: Number(format['revision.id']),
      type: format['revision.type'],
      author: format['revision.author'],
      ...(format['revision.date'] === undefined ? {} : { date: format['revision.date'] }),
      text,
    }))
  }
}

/** Provider of `ctx.flowleapOffice` over a verified OfficeCLI binary. */
export class OfficeCliProvider extends Service implements FlowleapOffice {
  private readonly options: OfficeCliProviderOptions

  /**
   * @param ctx - the provider row's context.
   * @param options - runner, folders, and formats.
   */
  constructor(ctx: Context, options: OfficeCliProviderOptions) {
    super(ctx, 'flowleapOffice')
    this.options = options
  }

  /**
   * Run one operation in a new private folder and remove the folder at the end. A failure that is not a
   * `FlowleapOfficeError`, for example a full disk or a file the engine did not write, becomes `aborted` when the
   * signal is aborted and `engine_failed` otherwise, with its message.
   */
  private async inCall<T>(signal: AbortSignal, work: (call: OfficeCall) => Promise<T>): Promise<T> {
    try {
      signal.throwIfAborted()
      const dir = await mkdtemp(join(this.options.callsDir, 'call-'))
      try {
        return await work(new OfficeCall(this.options.runner, dir, signal))
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    } catch (error) {
      if (error instanceof FlowleapOfficeError) throw error
      throw new FlowleapOfficeError(signal.aborted ? 'aborted' : 'engine_failed', `The Office operation failed: ${String(error)}`)
    }
  }

  async letter(request: LetterRequest, signal: AbortSignal): Promise<Uint8Array> {
    for (const name of Object.keys(request.fields)) {
      if (!FIELD_NAME.test(name)) invalid(`Field name "${name}" may use only letters, digits, "_", "." and "-".`)
    }
    for (const block of request.blocks) {
      if (block.kind === 'table') checkTable(block.header, block.rows, 'A letter table')
    }
    refuseUrls(request.fields)
    const items = letterItems(request.blocks, this.options.tableStyle)
    serializeBatch(items)
    return this.inCall(signal, async (call) => {
      await call.write('template.docx', request.template)
      await call.refuseTrackedChanges('template.docx')
      await call.write('fields.json', JSON.stringify(request.fields))
      const merged = await call.ok({ kind: 'merge', template: 'template.docx', output: 'letter.docx', data: 'fields.json' }, Merged, 'invalid_document')
      if (merged.unresolvedPlaceholders.length > 0) {
        throw new FlowleapOfficeError('missing_fields', `The template needs values for: ${merged.unresolvedPlaceholders.join(', ')}.`)
      }
      await call.batch('letter.docx', items)
      await call.validate('letter.docx')
      return call.bytes('letter.docx')
    })
  }

  async amendClaims(request: AmendRequest, signal: AbortSignal): Promise<AmendResult> {
    checkAmend(request)
    const marked = markedClaimsItems(request.heading, request.paragraphs, request.author, request.date)
    const clean = cleanClaimsItems(request.heading, request.paragraphs)
    serializeBatch(marked)
    serializeBatch(clean)
    return this.inCall(signal, async (call) => {
      const start = async (file: string) => {
        if (request.template === undefined) {
          await call.ok({ kind: 'create', file }, z.unknown())
          return
        }
        await call.write(file, request.template)
      }
      if (request.template !== undefined) {
        await call.write('template.docx', request.template)
        await call.refuseTrackedChanges('template.docx')
      }
      await start('marked.docx')
      await call.batch('marked.docx', marked)
      await call.validate('marked.docx')
      const markedBytes = await call.bytes('marked.docx')
      if (!request.clean) return { marked: markedBytes }
      await start('clean.docx')
      await call.batch('clean.docx', clean)
      await call.validate('clean.docx')
      return { marked: markedBytes, clean: await call.bytes('clean.docx') }
    })
  }

  async claimChart(request: ChartRequest, signal: AbortSignal): Promise<Uint8Array> {
    const name = request.sheet
    if (name.trim() === '' || Array.from(name).length > 31 || SHEET_NAME_FORBIDDEN.test(name) || name.startsWith('\'') || name.endsWith('\'')) {
      invalid(`Sheet name "${name}" must have 1 to 31 characters, none of : \\ / ? * [ ], and no apostrophe at the start or end.`)
    }
    checkTable(request.header, request.rows, 'The chart')
    const items = chartItems(request, this.options.chart)
    serializeBatch(items)
    return this.inCall(signal, async (call) => {
      await call.ok({ kind: 'create', file: 'chart.xlsx' }, z.unknown())
      await call.batch('chart.xlsx', items)
      await call.validate('chart.xlsx')
      return call.bytes('chart.xlsx')
    })
  }

  async read(request: ReadRequest, signal: AbortSignal): Promise<OfficeReadout> {
    return this.inCall(signal, async (call) => {
      const file = `document.${request.format}`
      await call.write(file, request.file)
      if (request.format === 'xlsx') {
        const text = await call.ok({ kind: 'view', file, mode: 'text' }, SheetText, 'invalid_document')
        const outline = await call.ok({ kind: 'view', file, mode: 'outline' }, SheetOutline, 'invalid_document')
        return {
          format: 'xlsx',
          text: text.sheets.map(sheet => [
            `=== Sheet: ${sheet.name} ===`,
            ...sheet.rows.map(row => Object.entries(row.cells).map(([ref, value]) => `${ref}=${value}`).join('\t')),
          ].join('\n')).join('\n'),
          sheets: outline.sheets,
        }
      }
      const text = await call.ok({ kind: 'view', file, mode: 'text' }, TextElements, 'invalid_document')
      const cells = await call.ok({ kind: 'query', file, selector: 'cell' }, Cells, 'invalid_document')
      const outline = await call.ok({ kind: 'view', file, mode: 'outline' }, WordOutline, 'invalid_document')
      const revisions = await call.revisions(file, 'invalid_document')
      return { format: 'docx', text: wordReadText(text.elements, cells.results), headings: outline.headings, revisions }
    })
  }

  async reviewChanges(request: ReviewRequest, signal: AbortSignal): Promise<ReviewResult> {
    const { selection } = request
    if (selection.kind === 'author' && (selection.author.trim() === '' || selection.author.includes(']'))) {
      invalid('The author must be a non-empty name without "]".')
    }
    if (selection.kind === 'ids' && selection.ids.length === 0) invalid('Name at least one change id.')
    refuseUrls(selection)
    return this.inCall(signal, async (call) => {
      await call.write('review.docx', request.file)
      const before = await call.revisions('review.docx', 'invalid_document')
      if (selection.kind === 'ids') {
        const known = new Set(before.map(revision => revision.id))
        const unknown = selection.ids.filter(id => !known.has(id))
        if (unknown.length > 0) invalid(`The document holds no tracked change with id ${unknown.join(', ')}.`)
      }
      await call.batch('review.docx', selectors(selection).map(selector => ({ kind: 'review', selector, action: request.action })))
      const after = await call.revisions('review.docx', 'engine_failed')
      await call.validate('review.docx')
      return { file: await call.bytes('review.docx'), changed: before.length - after.length }
    })
  }
}

/**
 * The OfficeCLI paths of a review selection.
 * @param selection - which changes.
 * @returns one `/revision` path per item.
 */
export function selectors(selection: ReviewSelection): string[] {
  switch (selection.kind) {
    case 'all': return ['/revision']
    case 'author': return [`/revision[@author=${selection.author}]`]
    case 'ids': return selection.ids.map(id => `/revision[@id=${String(id)}]`)
  }
}

/** The most columns of an Excel sheet. */
const MAX_COLUMNS = 16_384

function checkTable(header: readonly string[], rows: readonly (readonly string[])[], what: string): void {
  if (header.length === 0) invalid(`${what} needs at least one header cell.`)
  if (header.length > MAX_COLUMNS) invalid(`${what} has ${String(header.length)} columns; at most ${String(MAX_COLUMNS)} are allowed.`)
  rows.forEach((row, index) => {
    if (row.length !== header.length) invalid(`${what} row ${String(index + 1)} has ${String(row.length)} cells; the header has ${String(header.length)}.`)
  })
}

/**
 * Check the rules of an amendment that the types do not express.
 * @param request - the amendment.
 * @throws {FlowleapOfficeError} `invalid_request` naming the first broken rule.
 */
export function checkAmend(request: AmendRequest): void {
  if (request.paragraphs.length === 0) invalid('Name at least one claim.')
  if (request.author.trim() === '') invalid('The revision author must not be empty.')
  if (Array.from(request.author).some(char => char.charCodeAt(0) < 0x20 && char !== '\t')) invalid('The revision author must not hold control characters.')
  if (!ISO_DATE.test(request.date) || Number.isNaN(Date.parse(request.date))) invalid(`The revision date "${request.date}" is not an ISO-8601 date and time.`)
  request.paragraphs.forEach((paragraph: RedlineParagraph, index) => {
    if (paragraph.segments.every(segment => segment.text === '')) invalid(`Claim paragraph ${String(index + 1)} has no text.`)
    if (paragraph.mark !== 'same' && paragraph.segments.some(segment => segment.kind !== paragraph.mark)) {
      invalid(`Claim paragraph ${String(index + 1)} is ${paragraph.mark === 'ins' ? 'new' : 'deleted'}, so every segment must be ${paragraph.mark}.`)
    }
  })
}

const TABLE_PATH = /^\/body\/tbl\[(\d+)\]$/u
const CELL_PATH = /^\/body\/tbl\[(\d+)\]\/tr\[(\d+)\]\/tc\[\d+\]$/u

/**
 * The read text of a Word document: one line per paragraph, and for each table one line per row with tab-separated
 * cells. A line break inside a paragraph also starts a line.
 * @param elements - the body elements of `view text`.
 * @param cells - the table cells of `query cell`.
 * @returns the text.
 */
export function wordReadText(
  elements: readonly { path: string; type: string; text: string }[], cells: readonly { path: string; text: string }[],
): string {
  const tables = new Map<string, Map<string, string[]>>()
  for (const cell of cells) {
    const match = CELL_PATH.exec(cell.path)
    if (match === null) continue
    const [, table = '', row = ''] = match
    const rows = tables.get(table) ?? new Map<string, string[]>()
    tables.set(table, rows)
    rows.set(row, [...rows.get(row) ?? [], cell.text])
  }
  return elements.map((element) => {
    const table = element.type === 'table' ? TABLE_PATH.exec(element.path)?.[1] : undefined
    const rows = table === undefined ? undefined : tables.get(table)
    if (rows === undefined) return element.text.replace(/\v/gu, '\n')
    return [...rows.values()].map(row => row.join('\t').replace(/\v/gu, ' ')).join('\n')
  }).join('\n')
}
