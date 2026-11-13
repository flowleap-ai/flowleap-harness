/**
 * The run tools over the real local filesystem, the real tool pipeline, and a Firm Record double: the requests they send
 * to the seam, the results the model reads, and the refusals.
 */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId, type UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FlowleapRecordPlugin from '../src/index.ts'
import { nonEmpty } from '../src/run/args.ts'
import * as run from '../src/run/index.ts'
import type {
  DocumentSha256, DocumentText, FlowleapRecord, MatterViewResult, MyWorkResult, OutboxId, ProposalId, RecordCommandError,
  ReadingId, ReadingProposal, ReadingReceipt, RecordCommandResult, RecordSeq, ReportProposal, ReportReceipt, RunFinish,
  RunFinishReceipt, RunStartReceipt, TicketId,
} from '../src/types.ts'
import { LETTER_SHA256, VIEW } from './fixtures/record-read/view.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const RECEIPT: ReportReceipt = {
  proposalId: brandString<ProposalId>('p-1'), document: brandString<DocumentSha256>('b'.repeat(64)), recordSeq: brandNumber<RecordSeq>(10),
}
const READ: ReadingReceipt = { readingId: brandString<ReadingId>('rd-1'), recordSeq: brandNumber<RecordSeq>(11) }
const FINISHED: RunFinishReceipt = { recordSeq: brandNumber<RecordSeq>(12), outbox: { id: brandString<OutboxId>('o-1'), state: 'queued' } }

/** A Firm Record double that keeps each command and answers with the configured result. */
class RecordDouble extends Service implements FlowleapRecord {
  readonly reports: Array<{ ticket: TicketId; command: ReportProposal }> = []
  readonly readings: Array<{ ticket: TicketId; command: ReadingProposal }> = []
  reading: RecordCommandResult<ReadingReceipt> = READ
  readonly finishes: Array<{ ticket: TicketId; command: RunFinish }> = []
  readonly textReads: DocumentSha256[] = []
  readonly textProviders: string[] = []
  text: RecordCommandResult<DocumentText> = { pages: ['Page one text.', 'Page two text.'] }
  report: RecordCommandResult<ReportReceipt> = RECEIPT
  finish: RecordCommandResult<RunFinishReceipt> = FINISHED

  constructor(ctx: Context) {
    super(ctx, 'flowleapRecord')
  }

  async matterView(): Promise<MatterViewResult> { return VIEW }
  async myWork(): Promise<MyWorkResult> { return { error: 'not_configured' } }
  async runStarted(): Promise<RecordCommandResult<RunStartReceipt>> { return { error: 'ticket_not_waking' } }
  async proposeReport(ticket: TicketId, command: ReportProposal): Promise<RecordCommandResult<ReportReceipt>> {
    this.reports.push({ ticket, command })
    return this.report
  }
  async proposeReading(ticket: TicketId, command: ReadingProposal): Promise<RecordCommandResult<ReadingReceipt>> {
    this.readings.push({ ticket, command })
    return this.reading
  }
  async documentText(document: DocumentSha256, provider: string): Promise<RecordCommandResult<DocumentText>> {
    this.textReads.push(document)
    this.textProviders.push(provider)
    return this.text
  }
  async finishRun(ticket: TicketId, command: RunFinish): Promise<RecordCommandResult<RunFinishReceipt>> {
    this.finishes.push({ ticket, command })
    return this.finish
  }
}

const TEMPLATE = 'firm template bytes'

async function bench() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'flowleap-record-run-')))
  const templatesDir = join(dir, '.templates')
  await mkdir(templatesDir)
  await writeFile(join(templatesDir, 'client-report.docx'), TEMPLATE)
  await mkdir(join(dir, 'out'))
  await writeFile(join(dir, 'out', 'report.docx'), 'letter bytes')
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  await ctx.plugin(RecordDouble)
  const record = ctx.get('flowleapRecord')
  if (!(record instanceof RecordDouble)) throw new Error('record double not mounted')
  await ctx.plugin(FlowleapRecordPlugin)
  const fiber = ctx.plugin(run, { templatesDir })
  await fiber.await()
  const session = ctx.sessions.create(SessionId('webhook-run-1'), { meta: { cwd: dir } })
  const agent: Agent = {
    id: session.id, options: {}, session, model: { ...unsupportedModel(), current: () => ({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' }) }, inbox: unsupportedInbox(), status: 'idle', ctx,
    send: () => {}, followup: () => {}, steer: (_message: UserMessage) => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
  const call = async (name: string, args: unknown, withAgent = true) => {
    const result = await executeModelToolFixture(ctx, {
      callId: ToolCallId('call-7'), name, arguments: args, signal: new AbortController().signal, ...(withAgent ? { agent } : {}),
    })
    const [block] = result.content
    const text = block?.type === 'text' ? block.text : ''
    return { isError: result.isError, text, value: result.value }
  }
  return { ctx, record, fiber, call, agent, templatesDir }
}

const reportArgs = {
  ticket_id: 'tk-1',
  file: 'out/report.docx',
  template: 'client-report.docx',
  rules_seq: 3,
  statements: [
    { text: 'The EPO intends to grant the patent.', evidence: [{ document: LETTER_SHA256, span: { page: 1, quote: 'intends to grant a European patent' } }] },
    { text: 'The client must instruct us by 2 February 2026.', evidence: [{ document: LETTER_SHA256, span: { page: 2, quote: 'within four months' } }] },
  ],
}

describe('record_propose_report', () => {
  it('sends the letter bytes, the template version, the rules seq, the statements, the Session, and the tool call', async () => {
    const { call, record } = await bench()
    const result = await call('record_propose_report', reportArgs)
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.text)).toEqual(RECEIPT)
    expect(record.reports).toHaveLength(1)
    const [{ ticket, command }] = record.reports as [{ ticket: TicketId; command: ReportProposal }]
    expect(ticket).toBe('tk-1')
    expect(new TextDecoder().decode(command.content)).toBe('letter bytes')
    expect(command).toMatchObject({
      kind: 'client-report',
      fileName: 'report.docx',
      templateName: 'client-report.docx',
      templateVersion: `sha256:${createHash('sha256').update(TEMPLATE).digest('hex')}`,
      rulesSeq: 3,
      session: 'webhook-run-1',
      toolCall: 'call-7',
      statements: reportArgs.statements,
    })
    expect(command.statements[1]?.evidence[0]).toEqual({ document: LETTER_SHA256, span: { page: 2, quote: 'within four months' } })
  })

  it('sends the draft reply to the office as its own report kind', async () => {
    const { call, record } = await bench()
    const result = await call('record_propose_report', { ...reportArgs, kind: 'office-reply' })
    expect(result.isError).toBe(false)
    expect(record.reports.map(report => report.command.kind)).toEqual(['office-reply'])
  })

  it('names the id of a call inside a PTC program as the tool call, not the id of its root call', async () => {
    const { ctx, record, agent, templatesDir } = await bench()
    const tool = run.proposeReportTool(ctx, templatesDir)
    const exec = { callId: ToolCallId('call-7:ptc:2'), rootCallId: ToolCallId('call-7'), agent, signal: new AbortController().signal }
    expect(await tool.execute(reportArgs, exec as never)).toEqual(RECEIPT)
    expect(record.reports[0]?.command.toolCall).toBe('call-7:ptc:2')
  })

  it('answers each refusal of the Firm Record with its code, a message, and the detail', async () => {
    const { call, record } = await bench()
    for (const refusal of [
      { error: 'client_rule_forbids_ai_draft', detail: 'aiLetters is not-allowed.' },
      { error: 'statement_without_evidence' },
      { error: 'statement_without_span', detail: 'Statement 2 has no span.' },
      { error: 'quote_not_in_letter', detail: 'Statement 1: the quote is not on page 1.' },
      { error: 'quote_ambiguous', detail: 'Statement 1: the quote is on page 1 twice.' },
      { error: 'ticket_not_running' },
      { error: 'not_routed_person' },
      { error: 'idempotency_key_reused' },
    ] satisfies RecordCommandError[]) {
      record.report = refusal
      const result = await call('record_propose_report', reportArgs)
      expect(result.isError).toBe(false)
      const body = JSON.parse(result.text) as { error: string; message: string; detail?: string }
      expect(body.error).toBe(refusal.error)
      expect(body.message.length).toBeGreaterThan(0)
      expect(body.detail).toBe(refusal.detail)
    }
  })

  it('tells the model how to fix each refusal about a span', async () => {
    const { call, record } = await bench()
    const message = async (error: 'statement_without_span' | 'quote_not_in_letter' | 'quote_ambiguous') => {
      record.report = { error }
      return (JSON.parse((await call('record_propose_report', reportArgs)).text) as { message: string }).message
    }
    expect(await message('statement_without_span')).toContain('record_read_document_text')
    expect(await message('quote_not_in_letter')).toMatch(/character for character/u)
    expect(await message('quote_ambiguous')).toMatch(/longer quote/u)
  })

  it('refuses a statement without evidence, a bad hash, a bad span, a bad ticket id, and an unknown template before the Firm Record', async () => {
    const { call, record } = await bench()
    const [first] = reportArgs.statements
    for (const args of [
      { ...reportArgs, statements: [{ text: 'No source.', evidence: [] }] },
      { ...reportArgs, statements: [] },
      { ...reportArgs, statements: [{ text: 'x', evidence: [{ document: 'abc' }] }] },
      { ...reportArgs, statements: [{ text: 'No span.', evidence: [{ document: LETTER_SHA256 }] }] },
      { ...reportArgs, statements: [{ ...first, evidence: [{ document: LETTER_SHA256, span: { page: 1, quote: 'q'.repeat(201) } }] }] },
      { ...reportArgs, statements: [{ ...first, evidence: [{ document: LETTER_SHA256, span: { page: 1, quote: '' } }] }] },
      { ...reportArgs, statements: [{ ...first, evidence: [{ document: LETTER_SHA256, span: { page: 0, quote: 'q' } }] }] },
      { ...reportArgs, statements: [{ ...first, evidence: [{ document: LETTER_SHA256, span: { page: 1, quote: 'q', start: 1, end: 2 } }] }] },
      { ...reportArgs, ticket_id: 'tk/1' },
      { ...reportArgs, kind: 'office-letter' },
      { ...reportArgs, template: 'missing.docx' },
      { ...reportArgs, file: 'out/missing.docx' },
      { ...reportArgs, file: '../outside.docx' },
    ]) {
      const result = await call('record_propose_report', args)
      expect(result.isError, JSON.stringify(args)).toBe(true)
    }
    expect((await call('record_propose_report', reportArgs, false)).isError).toBe(true)
    expect(record.reports).toEqual([])
  })
})

const readingArgs = {
  ticket_id: 'tk-1',
  document: LETTER_SHA256,
  language: 'en',
  items: [{
    ground: 'Art. 84 EPC: clarity', claims: [3, 1, 1], documents: ['D1'], reasoning: 'The second layer of claim 1 has no defined location.',
    evidence: [{ page: 4, quote: 'the location of said second thermal displacement relief layer is not defined' }],
  }],
  documents: [{ label: 'D1', publication: 'DE 196 11 983 C1', evidence: [{ page: 3, quote: 'D1 DE 196 11 983 C1' }] }],
}

describe('record_propose_reading', () => {
  it('sends the objections, the cited documents, the language, the Session, and the tool call, and answers the receipt', async () => {
    const { call, record } = await bench()
    const result = await call('record_propose_reading', readingArgs)
    expect([result.isError, JSON.parse(result.text)]).toEqual([false, READ])
    expect(record.readings).toEqual([{
      ticket: 'tk-1',
      command: {
        document: LETTER_SHA256, language: 'en', noItemsReason: null, session: 'webhook-run-1', toolCall: 'call-7',
        items: [{ ...readingArgs.items[0], claims: [3, 1, 1] }], documents: readingArgs.documents,
      },
    }])
  })

  it('sends a reading with no objection with its reason', async () => {
    const { call, record } = await bench()
    const result = await call('record_propose_reading', { ticket_id: 'tk-1', document: LETTER_SHA256, language: 'de', items: [], no_items_reason: 'Die Gründe (EPA Form 2906) liegen nicht bei.' })
    expect(result.isError).toBe(false)
    expect(record.readings[0]?.command).toMatchObject({ items: [], documents: [], noItemsReason: 'Die Gründe (EPA Form 2906) liegen nicht bei.', language: 'de' })
  })

  it('answers each refusal with its code, a message that names this tool where the shared one does not fit, and the detail', async () => {
    const { call, record } = await bench()
    const answer = async (refusal: RecordCommandError) => {
      record.reading = refusal
      return JSON.parse((await call('record_propose_reading', readingArgs)).text) as { error: string; message: string; detail?: string }
    }
    expect((await answer({ error: 'statement_without_evidence' })).message).toContain('Every objection and every cited document')
    const outside = await answer({ error: 'evidence_outside_matter', detail: 'not on the matter' })
    expect([outside.message.includes('record_read'), outside.detail]).toEqual([true, 'not on the matter'])
    expect((await answer({ error: 'quote_not_in_letter' })).message).toMatch(/character for character/u)
    expect((await answer({ error: 'no_proposals' })).message).toContain('record_propose_reading')
  })

  it('refuses an objection without a passage, a bad label, a bad language and a bad hash before the Firm Record', async () => {
    const { call, record } = await bench()
    const [item] = readingArgs.items
    for (const args of [
      { ...readingArgs, items: [{ ...item, evidence: [] }] },
      { ...readingArgs, items: [{ ...item, documents: ['Doc 1'] }] },
      { ...readingArgs, documents: [{ label: 'D1', publication: 'DE 1', evidence: [] }] },
      { ...readingArgs, language: 'nl' },
      { ...readingArgs, document: 'abc' },
      { ...readingArgs, items: [{ ...item, evidence: [{ page: 0, quote: 'x' }] }] },
    ]) {
      const result = await call('record_propose_reading', args)
      expect(result.isError).toBe(true)
    }
    expect(record.readings).toEqual([])
  })
})

describe('record_read_document_text', () => {
  it('answers the page text of the document from the Firm Record', async () => {
    const { call, record } = await bench()
    const result = await call('record_read_document_text', { document: LETTER_SHA256 })
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.text)).toEqual({ pages: ['Page one text.', 'Page two text.'] })
    expect(record.textReads).toEqual([LETTER_SHA256])
    expect(record.textProviders).toEqual(['openrouter'])
  })

  it('answers a refusal with its code, a message that says what to do, and the detail', async () => {
    const { call, record } = await bench()
    record.text = { error: 'not_found', detail: 'No text layer.' }
    const missing = JSON.parse((await call('record_read_document_text', { document: LETTER_SHA256 })).text) as { error: string; message: string; detail?: string }
    expect(missing.error).toBe('not_found')
    expect(missing.message).toContain('no text layer')
    expect(missing.detail).toBe('No text layer.')
    record.text = { error: 'unreachable' }
    const down = JSON.parse((await call('record_read_document_text', { document: LETTER_SHA256 })).text) as { error: string; message: string }
    expect(down.error).toBe('unreachable')
    expect(down.message).toContain('did not answer')
    record.text = { error: 'client_rule_forbids_ai_read', detail: 'ai-not-allowed' }
    const forbidden = JSON.parse((await call('record_read_document_text', { document: LETTER_SHA256 })).text) as { error: string; message: string }
    expect(forbidden.error).toBe('client_rule_forbids_ai_read')
    expect(forbidden.message).toContain('Do not read it in another way')
  })

  it('refuses a document that is not a lower-case SHA-256, or a call with no model, before the Firm Record', async () => {
    const { call, record } = await bench()
    for (const args of [{ document: 'abc' }, { document: LETTER_SHA256.toUpperCase() }, {}, { document: LETTER_SHA256, page: 1 }]) {
      expect((await call('record_read_document_text', args)).isError, JSON.stringify(args)).toBe(true)
    }
    const outside = await call('record_read_document_text', { document: LETTER_SHA256 }, false)
    expect([outside.isError, outside.text]).toEqual([true, expect.stringContaining('needs an agent Session with a model')])
    expect(record.textReads).toEqual([])
  })
})

describe('record_finish_run', () => {
  it('sends the deadline summary with the Session and answers the receipt', async () => {
    const { call, record } = await bench()
    const result = await call('record_finish_run', { ticket_id: 'tk-1', deadline_id: 'd-1', deadline_state: 'proposed', record_seq: 7 })
    expect(JSON.parse(result.text)).toEqual(FINISHED)
    const none = await call('record_finish_run', { ticket_id: 'tk-1', deadline_id: 'none-yet', deadline_state: 'none-yet', record_seq: 7 })
    expect(none.isError).toBe(false)
    expect(record.finishes.map(entry => entry.command)).toEqual([
      { session: 'webhook-run-1', deadline: { id: 'd-1', state: 'proposed', seq: 7 } },
      { session: 'webhook-run-1', deadline: { id: 'none-yet', state: 'none-yet', seq: 7 } },
    ])
  })

  it('refuses a summary where only one of id and state is none-yet', async () => {
    const { call, record } = await bench()
    for (const args of [
      { ticket_id: 'tk-1', deadline_id: 'none-yet', deadline_state: 'active', record_seq: 7 },
      { ticket_id: 'tk-1', deadline_id: 'd-1', deadline_state: 'none-yet', record_seq: 7 },
      { ticket_id: 'tk-1', deadline_id: 'd-1', deadline_state: 'confirmed', record_seq: 7 },
      { ticket_id: 'tk-1', deadline_id: 'd-1', deadline_state: 'active', record_seq: -1 },
    ]) {
      expect((await call('record_finish_run', args)).isError).toBe(true)
    }
    expect(record.finishes).toEqual([])
  })

  it('answers no_proposals with what to do next', async () => {
    const { call, record } = await bench()
    record.finish = { error: 'no_proposals' }
    const result = await call('record_finish_run', { ticket_id: 'tk-1', deadline_id: 'd-1', deadline_state: 'active', record_seq: 7 })
    const body = JSON.parse(result.text) as { error: string; message: string }
    expect(body.error).toBe('no_proposals')
    expect(body.message).toContain('record_propose_report')
  })
})

describe('the run plugin', () => {
  it('fails loud for a relative template folder and removes its tools when it unloads', async () => {
    const { ctx, fiber } = await bench()
    const names = () => ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('record_'))
    const description = (name: string) => ctx.tools.schemas().find(schema => schema.name === name)?.description
    expect(names().sort()).toEqual([
      'record_finish_run', 'record_my_work', 'record_propose_reading', 'record_propose_report', 'record_read', 'record_read_document_text',
    ])
    expect(description('record_propose_reading')).toContain('what the examiner said, and nothing else')
    expect(description('record_propose_reading')).toContain('never translated')
    expect(ctx.tools.get('record_propose_reading')?.presentCall?.(readingArgs)).toMatchObject({ card: 'generic', title: 'Propose the reading: 1 objection(s)' })
    expect(ctx.tools.get('record_propose_reading')?.presentCall?.({ ...readingArgs, items: [] })).toMatchObject({ card: 'generic', title: 'Propose the reading' })
    expect(description('record_propose_report')).toContain('Nothing goes to the client or to the office before the attorney decides')
    expect(description('record_propose_report')).toContain('firm addresses only')
    expect(description('record_propose_report')).toContain('record_read_document_text')
    expect(description('record_propose_report')).toContain('character for character')
    expect(description('record_read_document_text')).toContain('The tool changes nothing in the record')
    expect(description('record_finish_run')).toContain('queues one reply to firm addresses only')
    expect(description('record_finish_run')).toContain('Nothing goes to the client')
    expect(ctx.tools.get('record_propose_report')?.presentCall?.(reportArgs))
      .toMatchObject({ card: 'generic', title: 'Propose the report letter', locations: [{ path: 'out/report.docx' }] })
    expect(ctx.tools.get('record_propose_report')?.presentCall?.({ ...reportArgs, kind: 'office-reply', file: 'out/reply.docx' }))
      .toMatchObject({ card: 'generic', title: 'Propose the draft reply', locations: [{ path: 'out/reply.docx' }] })
    expect(ctx.tools.get('record_read_document_text')?.presentCall?.({ document: LETTER_SHA256 }))
      .toMatchObject({ card: 'generic', title: 'Read the document text', kind: 'read' })
    expect(ctx.tools.get('record_finish_run')?.presentCall?.({ ticket_id: 'tk-1', deadline_id: 'd-1', deadline_state: 'active', record_seq: 7 })).toMatchObject({ card: 'generic', title: 'Finish the run' })
    expect(() => nonEmpty([])).toThrow(/must not be empty/u)
    await fiber.dispose()
    expect(names().sort()).toEqual(['record_my_work', 'record_read', 'record_read_document_text'])
    await expect(ctx.plugin(run, { templatesDir: 'templates' })).rejects.toThrow(/absolute path/u)
  })
})
