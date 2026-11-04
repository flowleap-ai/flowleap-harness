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
import * as run from '../src/run/index.ts'
import type {
  DocumentSha256, FlowleapRecord, MatterViewResult, OutboxId, ProposalId, RecordCommandError, RecordCommandResult, RecordSeq,
  ReportProposal, ReportReceipt, RunFinish, RunFinishReceipt, RunStartReceipt, TicketId,
} from '../src/types.ts'
import { LETTER_SHA256, VIEW } from './fixtures/record-read/view.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const RECEIPT: ReportReceipt = {
  proposalId: brandString<ProposalId>('p-1'), document: brandString<DocumentSha256>('b'.repeat(64)), recordSeq: brandNumber<RecordSeq>(10),
}
const FINISHED: RunFinishReceipt = { recordSeq: brandNumber<RecordSeq>(12), outbox: { id: brandString<OutboxId>('o-1'), state: 'queued' } }

/** A Firm Record double that keeps each command and answers with the configured result. */
class RecordDouble extends Service implements FlowleapRecord {
  readonly reports: Array<{ ticket: TicketId; command: ReportProposal }> = []
  readonly finishes: Array<{ ticket: TicketId; command: RunFinish }> = []
  report: RecordCommandResult<ReportReceipt> = RECEIPT
  finish: RecordCommandResult<RunFinishReceipt> = FINISHED

  constructor(ctx: Context) {
    super(ctx, 'flowleapRecord')
  }

  async matterView(): Promise<MatterViewResult> { return VIEW }
  async runStarted(): Promise<RecordCommandResult<RunStartReceipt>> { return { error: 'ticket_not_waking' } }
  async proposeReport(ticket: TicketId, command: ReportProposal): Promise<RecordCommandResult<ReportReceipt>> {
    this.reports.push({ ticket, command })
    return this.report
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
  const fiber = ctx.plugin(run, { templatesDir })
  await fiber.await()
  const session = ctx.sessions.create(SessionId('webhook-run-1'), { meta: { cwd: dir } })
  const agent: Agent = {
    id: session.id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(), status: 'idle', ctx,
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
  return { ctx, record, fiber, call }
}

const reportArgs = {
  ticket_id: 'tk-1',
  file: 'out/report.docx',
  template: 'client-report.docx',
  rules_seq: 3,
  statements: [
    { text: 'The EPO intends to grant the patent.', evidence: [{ document: LETTER_SHA256, span: { page: 1, start: 120, end: 160, quote: 'intends to grant a European patent' } }] },
    { text: 'The client must instruct us by 2 February 2026.', evidence: [{ document: LETTER_SHA256 }] },
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
      fileName: 'report.docx',
      templateVersion: `sha256:${createHash('sha256').update(TEMPLATE).digest('hex')}`,
      rulesSeq: 3,
      session: 'webhook-run-1',
      toolCall: 'call-7',
      statements: reportArgs.statements,
    })
    expect(command.statements[1]?.evidence[0]).toEqual({ document: LETTER_SHA256 })
  })

  it('answers each refusal of the Firm Record with its code, a message, and the detail', async () => {
    const { call, record } = await bench()
    for (const refusal of [
      { error: 'client_rule_forbids_ai_draft', detail: 'aiLetters is not-allowed.' },
      { error: 'statement_without_evidence' },
      { error: 'ticket_not_running' },
      { error: 'not_routed_person' },
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

  it('refuses a statement without evidence, a bad hash, a bad span, a bad ticket id, and an unknown template before the Firm Record', async () => {
    const { call, record } = await bench()
    const [first] = reportArgs.statements
    for (const args of [
      { ...reportArgs, statements: [{ text: 'No source.', evidence: [] }] },
      { ...reportArgs, statements: [] },
      { ...reportArgs, statements: [{ text: 'x', evidence: [{ document: 'abc' }] }] },
      { ...reportArgs, statements: [{ ...first, evidence: [{ document: LETTER_SHA256, span: { page: 1, start: 9, end: 3, quote: 'q' } }] }] },
      { ...reportArgs, statements: [{ ...first, evidence: [{ document: LETTER_SHA256, span: { page: 1, start: 1, end: 3, quote: 'q'.repeat(201) } }] }] },
      { ...reportArgs, ticket_id: 'tk/1' },
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
  it('fails loud for a relative template folder and removes both tools when it unloads', async () => {
    const { ctx, fiber } = await bench()
    const names = () => ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('record_'))
    expect(names().sort()).toEqual(['record_finish_run', 'record_propose_report'])
    expect(ctx.tools.schemas().find(schema => schema.name === 'record_propose_report')?.description).toContain('attorney decides')
    await fiber.dispose()
    expect(names()).toEqual([])
    await expect(ctx.plugin(run, { templatesDir: 'templates' })).rejects.toThrow(/absolute path/u)
  })
})
