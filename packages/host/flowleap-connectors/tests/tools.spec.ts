import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import { createConnectors, officeTools } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import * as FlowleapConnectors from '@deepseek-ai/dsh-flowleap-connectors'
import {
  createConnectorHost, createCredentialStore, modelInputSchema, registerOfficeTools,
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
  it('registers the library\'s 33 office tools under their backend names with the library\'s JSON schemas, and unregisters them together', async () => {
    const { ctx, connectors, bound } = await bench()
    const dispose = registerOfficeTools(ctx, connectors, bound, officeTools())
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toHaveLength(33)
    expect(names).toEqual(officeTools().map(definition => definition.name))
    expect(names.slice(0, 4)).toEqual(['search_patents', 'get_search_syntax', 'search_register', 'get_bibliography'])
    expect(names).toEqual(expect.arrayContaining(['get_claims', 'get_legal_status', 'get_us_grant', 'search_academic', 'search_npl', 'get_npl_work']))
    const bibliography = officeTools().find(definition => definition.name === 'get_bibliography')!
    const schema = modelInputSchema(bibliography)
    expect(schema).toMatchObject({ type: 'object' })
    expect(schema).not.toHaveProperty('$schema')
    expect(ctx.tools.schemas().find(tool => tool.name === 'get_bibliography')?.parameters).toEqual(schema)
    dispose()
    expect(ctx.tools.schemas()).toEqual([])
  })

  it('rolls back on a name conflict', async () => {
    const { ctx, connectors, bound } = await bench()
    const [first] = officeTools()
    const keep = registerOfficeTools(ctx, connectors, bound, [first!])
    expect(() => registerOfficeTools(ctx, connectors, bound, officeTools())).toThrow('already registered')
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['search_patents'])
    keep()
  })

  it('answers a call without a stored key with text naming the settings card, without touching the network', async () => {
    const { ctx, connectors, bound, fetchSpy } = await bench()
    registerOfficeTools(ctx, connectors, bound, officeTools())
    const result = await ctx.tools.execute({
      callId: callId(), name: 'get_bibliography', arguments: { patent_number: 'EP1234567A1' }, signal: new AbortController().signal,
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
    const grant = await ctx.tools.execute({
      callId: callId(), name: 'get_us_grant', arguments: { patent_number: '10000000' }, signal: new AbortController().signal,
    })
    expect(textOf(grant.content[0])).toContain('USPTO ODP key not configured. Add it in Settings > Patent data connectors > USPTO ODP')
  })

  it('rejects invalid arguments as a tool error before the handler runs', async () => {
    const { ctx, connectors, bound, fetchSpy } = await bench()
    registerOfficeTools(ctx, connectors, bound, officeTools())
    const result = await ctx.tools.execute({
      callId: callId(), name: 'search_patents', arguments: {}, signal: new AbortController().signal,
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
    registerOfficeTools(ctx, connectors, bound, officeTools())
    const signal = new AbortController().signal
    const result = await ctx.tools.execute({
      callId: callId(), name: 'search_academic', arguments: { query: 'solid electrolyte', sources: ['semantic-scholar'], max_results: 1 }, signal,
    })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ query: 'solid electrolyte', total: 1, papers: [{ title: 'Solid electrolytes', source: 'scholar' }] })
    expect(seenSignals).toEqual([signal])
  })

  it('mounts as a plugin over tools and credentials, registering the tools and the Remote controller, and withdraws them on disposal', async () => {
    const ctx = new Context()
    new MemoryCredentials(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(FlowleapConnectors, { cacheEntries: 5 })
    expect(ctx.tools.schemas()).toHaveLength(33)
    expect(ctx.get('flowleapConnectors')).toBeDefined()
    expect(Object.keys(await ctx.flowleapConnectors.describe())).toEqual(['epo-ops', 'uspto-odp', 'semantic-scholar', 'mistral'])
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.get('flowleapConnectors')).toBeUndefined()
  })
})
