import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import { createConnectors } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import * as FlowleapConnectors from '@deepseek-ai/dsh-flowleap-connectors'
import {
  createConnectorHost, createCredentialStore, interimOfficeTools, registerOfficeTools, toolInputJsonSchema,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

async function bench() {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const store = createCredentialStore(credentials)
  const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this spec')))
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
  const connectors = createConnectors(bound.host)
  return { ctx, store, bound, connectors, fetchSpy }
}

/** The text of a model-facing content block, or the block's type when it carries no text. */
function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : String(block?.type)
}

let calls = 0
const callId = (): ToolCallId => `call-${String(++calls)}` as ToolCallId

describe('registerOfficeTools', () => {
  it('registers the three interim office tools under their backend names with Zod-derived schemas, and unregisters them together', async () => {
    const { ctx, connectors, bound } = await bench()
    const dispose = registerOfficeTools(ctx, connectors, bound, interimOfficeTools())
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['search_patents', 'get_bibliography', 'search_academic'])
    const schema = toolInputJsonSchema(interimOfficeTools()[1]!)
    expect(schema).toMatchObject({ type: 'object', required: ['patentNumber'] })
    expect(JSON.stringify(schema)).toContain('"patentNumber":{"type":"string","minLength":1,"description":"Publication number, for example `EP1234567A1`')
    expect(ctx.tools.schemas()[2]?.parameters).toMatchObject({ properties: { sources: { type: 'array', items: { enum: ['scholar', 'arxiv'] } } } })
    dispose()
    expect(ctx.tools.schemas()).toEqual([])
  })

  it('rolls back on a name conflict', async () => {
    const { ctx, connectors, bound } = await bench()
    const [first] = interimOfficeTools()
    const keep = registerOfficeTools(ctx, connectors, bound, [first!])
    expect(() => registerOfficeTools(ctx, connectors, bound, interimOfficeTools())).toThrow('already registered')
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['search_patents'])
    keep()
  })

  it('answers a call without a stored key with text naming the settings card, without touching the network', async () => {
    const { ctx, connectors, bound, fetchSpy } = await bench()
    registerOfficeTools(ctx, connectors, bound, interimOfficeTools())
    const result = await ctx.tools.execute({
      callId: callId(), name: 'get_bibliography', arguments: { patentNumber: 'EP1234567A1' }, signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      error: 'missing_credentials',
      connector: 'epo-ops',
      message: 'EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again.',
    })
    expect(result.content).toEqual([{ type: 'text', text: 'EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again.' }])
    expect(fetchSpy).not.toHaveBeenCalled()

    const search = await ctx.tools.execute({
      callId: callId(), name: 'search_patents', arguments: { query: 'ti=battery' }, signal: new AbortController().signal,
    })
    expect(textOf(search.content[0])).toContain('EPO OPS key not configured')
  })

  it('rejects invalid arguments as a tool error before the handler runs', async () => {
    const { ctx, connectors, bound, fetchSpy } = await bench()
    registerOfficeTools(ctx, connectors, bound, interimOfficeTools())
    const result = await ctx.tools.execute({
      callId: callId(), name: 'search_patents', arguments: { query: '' }, signal: new AbortController().signal,
    })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toContain('invalid arguments')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('runs a keyless academic search through the library with the caller signal, folding the read result into the canonical value', async () => {
    const { ctx, connectors, bound, fetchSpy } = await bench()
    const seenSignals: (AbortSignal | undefined)[] = []
    fetchSpy.mockImplementation(() => {
      seenSignals.push(bound.host.signal?.())
      return Promise.resolve(new Response(JSON.stringify({ total: 1, data: [{ title: 'Solid electrolytes', paperId: 'p1', authors: [{ name: 'A' }], year: 2021 }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
    })
    registerOfficeTools(ctx, connectors, bound, interimOfficeTools())
    const signal = new AbortController().signal
    const result = await ctx.tools.execute({
      callId: callId(), name: 'search_academic', arguments: { query: 'solid electrolyte', sources: ['scholar'], maxResults: 1 }, signal,
    })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ total: 1, papers: [{ title: 'Solid electrolytes', source: 'scholar' }] })
    expect(seenSignals).toEqual([signal])
  })

  it('mounts as a plugin over tools and credentials, registering the tools and the Remote controller, and withdraws them on disposal', async () => {
    const ctx = new Context()
    new MemoryCredentials(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(FlowleapConnectors, { cacheEntries: 5 })
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['search_patents', 'get_bibliography', 'search_academic'])
    expect(ctx.get('flowleapConnectors')).toBeDefined()
    expect(Object.keys(await ctx.flowleapConnectors.describe())).toEqual(['epo-ops', 'uspto-odp', 'semantic-scholar', 'mistral'])
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.get('flowleapConnectors')).toBeUndefined()
  })
})
