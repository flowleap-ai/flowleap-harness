import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as FlowleapRecordPlugin from '../src/index.ts'
import type { FlowleapRecord, MyWorkResult } from '../src/types.ts'
import { MY_WORK } from './fixtures/record-read/my-work.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

/** A record double that answers every work read with `result`; it answers no view and takes no command. */
class RecordDouble extends Service implements FlowleapRecord {
  readonly myWork = vi.fn(async (_signal: AbortSignal): Promise<MyWorkResult> => this.result)
  readonly matterView = async () => ({ error: 'not_configured' as const })
  readonly runStarted = async () => ({ error: 'not_configured' as const })
  readonly proposeReport = async () => ({ error: 'not_configured' as const })
  readonly finishRun = async () => ({ error: 'not_configured' as const })
  readonly documentText = async () => ({ error: 'not_configured' as const })

  constructor(ctx: Context, private readonly result: MyWorkResult) {
    super(ctx, 'flowleapRecord')
  }
}

async function host(result: MyWorkResult = MY_WORK) {
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

async function call(ctx: Context, signal = new AbortController().signal) {
  return executeModelToolFixture(ctx, { callId: 'my-work-call' as ToolCallId, name: 'record_my_work', arguments: {}, signal })
}

describe('record_my_work', () => {
  it('answers the work of the person as JSON text that names the record position, also for a person with no display name', async () => {
    const { ctx, record } = await host()
    const result = await call(ctx)
    expect(result.isError).toBe(false)
    expect(result.value).toEqual(MY_WORK)
    const rendered = text(result.content)
    expect(JSON.parse(rendered)).toEqual(MY_WORK)
    expect(rendered).toContain('"recordSeq":45')
    expect(rendered).toContain('"person":{"id":"admin","name":null}')
    expect(record.myWork).toHaveBeenCalledOnce()
  })

  it('gives the model the application number of each matter, null when the record holds none, and tells it to use the number', async () => {
    const { ctx } = await host()
    const result = await call(ctx)
    expect(result.isError).toBe(false)
    const { matters } = JSON.parse(text(result.content)) as { matters: Array<{ fileNumber: string; applicationNumber: string | null }> }
    expect(matters.map(({ fileNumber, applicationNumber }) => [fileNumber, applicationNumber]))
      .toEqual([['FL-2026-0001', 'EP24166597'], ['FL-2026-0002', null]])
    const description = ctx.tools.schemas().find(candidate => candidate.name === 'record_my_work')?.description
    expect(description).toContain('applicationNumber, the application number of the matter')
    expect(description).toContain('do not ask the person for a publication number or an application number')
    expect(description).toContain('applicationNumber is null when the record holds none')
  })

  it('answers a person with no matter and no work', async () => {
    const empty: MyWorkResult = { ...MY_WORK, matters: [], work: [] }
    const { ctx } = await host(empty)
    const result = await call(ctx)
    expect(result.isError).toBe(false)
    expect(JSON.parse(text(result.content))).toEqual(empty)
  })

  it('gives the model work of a kind that the harness does not know, unchanged', async () => {
    const [item] = MY_WORK.work
    const unknown: MyWorkResult = {
      ...MY_WORK,
      work: [{ ...item!, id: 'day-check:2026-11-09', kind: 'day-check', title: 'Check the deadlines due today', act: 'deadlines/today' }],
    }
    const { ctx } = await host(unknown)
    const result = await call(ctx)
    expect(result.isError).toBe(false)
    expect(JSON.parse(text(result.content))).toEqual(unknown)
  })

  it('rejects an answer that breaks the output schema', async () => {
    const [matter] = MY_WORK.matters
    const [item] = MY_WORK.work
    for (const broken of [
      { ...MY_WORK, person: { id: 'admin' } },
      { ...MY_WORK, matters: [{ ...matter!, role: 'owner' }] },
      { ...MY_WORK, matters: [{ ...matter!, applicationNumber: 7 }] },
      { ...MY_WORK, matters: [{ ...matter!, applicationNumber: {} }] },
      { ...MY_WORK, matters: [{ ...matter!, applicationNumber: undefined }] },
      { ...MY_WORK, work: [{ ...item!, kind: 7 }] },
      { ...MY_WORK, work: [{ ...item!, why: undefined }] },
      { ...MY_WORK, work: [{ ...item!, matter: undefined }] },
    ]) {
      const { ctx } = await host(JSON.parse(JSON.stringify(broken)) as MyWorkResult)
      const result = await call(ctx)
      expect(result.isError).toBe(true)
      expect(text(result.content)).toContain('returned invalid output')
    }
  })

  it('answers each seam refusal with the code and a message', async () => {
    for (const error of ['not_configured', 'no_key', 'refused', 'unreachable', 'service_error', 'invalid_answer'] as const) {
      const { ctx } = await host({ error })
      const result = await call(ctx)
      expect(result.isError).toBe(false)
      expect(result.value).toMatchObject({ error })
      const body = JSON.parse(text(result.content)) as { error: string; message: string }
      expect(body.error).toBe(error)
      expect(body.message.length).toBeGreaterThan(0)
    }
  })

  it('passes the call signal to the seam', async () => {
    const { ctx, record } = await host()
    const controller = new AbortController()
    await call(ctx, controller.signal)
    const [signal] = record.myWork.mock.calls[0]!
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
  })

  it('declares no parameter, says what a null name means, and removes the tool when the plugin unloads', async () => {
    const { ctx, plugin } = await host()
    const schema = ctx.tools.schemas().find(candidate => candidate.name === 'record_my_work')
    expect(schema?.description).toContain('read-only')
    expect(schema?.description).toContain('no display name yet')
    expect(schema?.description).toContain('record_read')
    expect(schema?.description).toContain('also for a kind that you do not know')
    expect(schema?.description).toContain('you cannot read such a letter before it is filed')
    expect(JSON.stringify(schema?.parameters)).not.toContain('person')
    expect(ctx.tools.get('record_my_work')?.presentCall?.({}))
      .toMatchObject({ card: 'generic', kind: 'read', title: 'Read my work' })
    await plugin.dispose()
    expect(ctx.tools.schemas().some(candidate => candidate.name === 'record_my_work')).toBe(false)
  })
})
