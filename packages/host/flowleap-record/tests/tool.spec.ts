import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FlowleapRecordPlugin from '../src/index.ts'
import type { FlowleapRecord, MatterFileNumber, MatterViewResult } from '../src/types.ts'
import { VIEW } from './fixtures/record-read/view.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

/** A record double that answers every read with `result` and keeps the file numbers it was asked for; it takes no command. */
class RecordDouble extends Service implements FlowleapRecord {
  readonly asked: MatterFileNumber[] = []
  readonly matterView = vi.fn(async (fileNumber: MatterFileNumber, _signal: AbortSignal): Promise<MatterViewResult> => {
    this.asked.push(fileNumber)
    return this.result
  })
  readonly myWork = async () => ({ error: 'not_configured' as const })
  readonly runStarted = async () => ({ error: 'not_configured' as const })
  readonly proposeReport = async () => ({ error: 'not_configured' as const })
  readonly proposeReading = async () => ({ error: 'not_configured' as const })
  readonly finishRun = async () => ({ error: 'not_configured' as const })
  readonly documentText = async () => ({ error: 'not_configured' as const })

  constructor(ctx: Context, private readonly result: MatterViewResult) {
    super(ctx, 'flowleapRecord')
  }
}

async function host(result: MatterViewResult = VIEW) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(RecordDouble, result)
  const record = ctx.get('flowleapRecord')
  if (!(record instanceof RecordDouble)) throw new Error('record double not mounted')
  const plugin = await ctx.plugin(FlowleapRecordPlugin)
  return { ctx, record, plugin }
}

function text(blocks: readonly ContentBlock[]): string {
  return blocks.map(block => block.type === 'text' ? block.text : '').join('')
}

async function call(ctx: Context, fileNumber: unknown, signal = new AbortController().signal) {
  return executeModelToolFixture(ctx, {
    callId: 'record-call' as ToolCallId, name: 'record_read', arguments: { file_number: fileNumber }, signal,
  })
}

describe('record_read', () => {
  it('answers the view as JSON text that names the record position and the view hash', async () => {
    const { ctx, record } = await host()
    const result = await call(ctx, ' FL-2026-0001 ')
    expect(result.isError).toBe(false)
    expect(result.value).toEqual(VIEW)
    const rendered = text(result.content)
    expect(JSON.parse(rendered)).toEqual(VIEW)
    expect(rendered).toContain('"recordSeq":7')
    expect(rendered).toContain(`"viewHash":"${VIEW.viewHash}"`)
    expect(record.asked).toEqual(['FL-2026-0001'])
  })

  it('answers the view of an R0 Firm Record without the R1 fields, not with empty lists', async () => {
    const { recordSeq, viewHash, matter, deadlines } = VIEW
    const r0: MatterViewResult = { recordSeq, viewHash, matter, deadlines }
    const { ctx } = await host(r0)
    const result = await call(ctx, 'FL-2026-0001')
    expect(result.isError).toBe(false)
    const rendered = JSON.parse(text(result.content)) as Record<string, unknown>
    expect(rendered).toEqual(r0)
    expect(Object.keys(rendered).sort()).toEqual(['deadlines', 'matter', 'recordSeq', 'viewHash'])
    expect(ctx.tools.schemas().find(candidate => candidate.name === 'record_read')?.description)
      .toContain('A Firm Record before R1 holds none of clientRules, officeEvents, tickets, and documents')
  })

  it('gives the model a view whose responsible attorney has no display name yet and whose letter has no code and date yet, and says what each null means', async () => {
    const [event] = VIEW.officeEvents
    const view: MatterViewResult = {
      ...VIEW,
      matter: { ...VIEW.matter, responsible: null },
      officeEvents: [{ ...event!, code: null, documentDate: null, state: 'unclassified' }],
    }
    const { ctx } = await host(view)
    const result = await call(ctx, 'FL-2026-0001')
    expect(result.isError).toBe(false)
    expect(JSON.parse(text(result.content))).toEqual(view)
    const description = ctx.tools.schemas().find(candidate => candidate.name === 'record_read')?.description
    expect(description).toContain('responsible is null while the responsible attorney has no display name yet')
    expect(description).toContain('Every matter has a responsible attorney')
    expect(description).toContain('code and documentDate are null')
  })

  it('gives the model the application number of the matter, null when the record holds none, and tells it to use the number', async () => {
    const { ctx } = await host()
    const result = await call(ctx, 'FL-2026-0001')
    expect(result.isError).toBe(false)
    expect(JSON.parse(text(result.content))).toMatchObject({ matter: { applicationNumber: 'EP24166597' } })
    const none: MatterViewResult = { ...VIEW, matter: { ...VIEW.matter, applicationNumber: null } }
    const { ctx: noneCtx } = await host(none)
    const noneResult = await call(noneCtx, 'FL-2026-0001')
    expect(noneResult.isError).toBe(false)
    expect(text(noneResult.content)).toContain('"applicationNumber":null')
    const description = ctx.tools.schemas().find(candidate => candidate.name === 'record_read')?.description
    expect(description).toContain('matter.applicationNumber is the application number of the matter')
    expect(description).toContain('do not ask the person for a publication number or an application number')
    expect(description).toContain('applicationNumber is null when the record holds none')
  })

  it('rejects a view whose application number is missing or is neither a string nor null', async () => {
    const { applicationNumber: _applicationNumber, ...withoutField } = VIEW.matter
    for (const matter of [{ ...VIEW.matter, applicationNumber: 7 }, { ...VIEW.matter, applicationNumber: {} }, withoutField]) {
      const { ctx } = await host(JSON.parse(JSON.stringify({ ...VIEW, matter })) as MatterViewResult)
      const result = await call(ctx, 'FL-2026-0001')
      expect(result.isError).toBe(true)
      expect(text(result.content)).toContain('returned invalid output')
    }
  })

  it('passes the call signal to the seam', async () => {
    const { ctx, record } = await host()
    const controller = new AbortController()
    await call(ctx, 'FL-2026-0001', controller.signal)
    const [, signal] = record.matterView.mock.calls[0]!
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('refuses a file number that cannot name a matter without asking the seam', async () => {
    const { ctx, record } = await host()
    for (const input of ['', '   ', '-FL', 'FL\n2026', 'x'.repeat(65), 'a?b']) {
      const result = await call(ctx, input)
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({ error: 'invalid_file_number' })
    }
    expect(record.asked).toEqual([])
  })

  it('answers each seam refusal with the code and a message', async () => {
    for (const error of ['not_found', 'not_configured', 'no_key', 'refused', 'unreachable', 'service_error', 'invalid_answer'] as const) {
      const { ctx } = await host({ error })
      const result = await call(ctx, 'FL-2026-0001')
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({ error })
      const body = JSON.parse(text(result.content)) as { error: string; message: string }
      expect(body.error).toBe(error)
      expect(body.message.length).toBeGreaterThan(0)
    }
  })

  it('reports a missing argument as a tool error', async () => {
    const { ctx } = await host()
    const result = await call(ctx, undefined)
    expect(result.isError).toBe(true)
  })

  it('declares the schema with the read-only rule, names the matter on the pending card, and removes the tool when the plugin unloads', async () => {
    const { ctx, plugin } = await host()
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'record_read')
    expect(schema?.description).toContain('read-only')
    expect(schema?.description).toContain('Records app')
    expect(ctx.tools.get('record_read')?.presentCall?.({ file_number: 'FL-2026-0001' }))
      .toMatchObject({ card: 'generic', kind: 'read', rawInput: 'FL-2026-0001' })
    await plugin.dispose()
    expect(ctx.tools.schemas().some(candidate => candidate.name === 'record_read')).toBe(false)
  })
})
