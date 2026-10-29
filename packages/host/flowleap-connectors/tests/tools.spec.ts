import { Context } from '@deepseek-ai/cordis'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import {
  DataKeysRequiredError, OcrNotConfiguredError, ProviderKeyInvalidError, ToolError, createConnectors, officeTools,
  type ToolContext, type ToolDefinition,
} from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
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
  await ctx.plugin(NativeToolExecutor)
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

type Agent = NonNullable<Parameters<typeof executeModelToolFixture>[1]['agent']>

let calls = 0
const callId = (): ToolCallId => `call-${String(++calls)}` as ToolCallId

describe('registerOfficeTools', () => {
  it('registers the library\'s 34 office tools under their backend names with the library\'s JSON schemas, and unregisters them together', async () => {
    const { ctx, connectors, bound } = await bench()
    const dispose = registerOfficeTools(ctx, connectors, bound, officeTools())
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toHaveLength(34)
    expect(names).toEqual(officeTools().map(definition => definition.name))
    expect(names.slice(0, 4)).toEqual(['search_patents', 'get_search_syntax', 'search_register', 'get_bibliography'])
    expect(names).toEqual(expect.arrayContaining(['get_claims', 'get_legal_status', 'get_us_grant', 'ocr', 'search_academic', 'search_npl', 'get_npl_work']))
    expect(officeTools().find(definition => definition.name === 'ocr')?.access).toBe('mistral')
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
    const result = await executeModelToolFixture(ctx, {
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

    const search = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'search_patents', arguments: { query: 'ti=battery' }, signal: new AbortController().signal,
    })
    expect(textOf(search.content[0])).toContain('EPO OPS key not configured')
    const grant = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'get_us_grant', arguments: { patent_number: '10000000' }, signal: new AbortController().signal,
    })
    expect(textOf(grant.content[0])).toContain('USPTO ODP key not configured. Add it in Settings > Patent data connectors > USPTO ODP')
    const ocr = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'ocr', arguments: { file: 'JVBERi0=', filename: 'scan.pdf' }, signal: new AbortController().signal,
    })
    expect(ocr.isError).toBe(false)
    expect(textOf(ocr.content[0])).toBe('Mistral key not configured. Add it in Settings > Patent data connectors > Mistral, then call this tool again.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects invalid arguments as a tool error before the handler runs', async () => {
    const { ctx, connectors, bound, fetchSpy } = await bench()
    registerOfficeTools(ctx, connectors, bound, officeTools())
    const result = await executeModelToolFixture(ctx, {
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
    const result = await executeModelToolFixture(ctx, {
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
    await ctx.plugin(NativeToolExecutor)
    const fiber = await ctx.plugin(FlowleapConnectors, { cacheEntries: 5, excludeTools: [] })
    // Without a filesystem and a session directory the office tools and compare_claims register: no read_pdf.
    expect(ctx.tools.schemas()).toHaveLength(35)
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('compare_claims')
    expect(ctx.tools.schemas().map(schema => schema.name)).not.toContain('read_pdf')
    expect(ctx.get('flowleapConnectors')).toBeDefined()
    expect(Object.keys(await ctx.flowleapConnectors.describe())).toEqual(['epo-ops', 'uspto-odp', 'semantic-scholar', 'mistral'])
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
    expect(ctx.get('flowleapConnectors')).toBeUndefined()
  })

  it('adds read_pdf beside the office tools once fs and workingDirectory are mounted, honouring excludeTools', async () => {
    const ctx = new Context()
    new MemoryCredentials(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(LocalFileSystem, { cwd: process.cwd() })
    provideWorkingDirectoryFixture(ctx, process.cwd())
    const fiber = await ctx.plugin(FlowleapConnectors, { cacheEntries: 5, excludeTools: ['get_fulltext'] })
    const names = ctx.tools.schemas().map(schema => schema.name)
    expect(names).toHaveLength(35)
    expect(names).toContain('read_pdf')
    expect(names).toContain('compare_claims')
    expect(names).toContain('ocr')
    expect(names).not.toContain('get_fulltext')
    await fiber.dispose()
    expect(ctx.tools.schemas()).toEqual([])
  })
})

/** A keyless tool whose handler fails with `error`, or records the context it was called with. */
function probeTool(fail?: Error): ToolDefinition & { contexts: ToolContext[] } {
  const contexts: ToolContext[] = []
  return {
    name: 'probe',
    description: 'A probe.',
    input: z.object({ text: z.string() }),
    access: 'none',
    contexts,
    handler: (_input, context) => {
      contexts.push(context)
      return fail === undefined ? Promise.resolve({ ok: true, dropped: undefined }) : Promise.reject(fail)
    },
  }
}

describe('office tool failures', () => {
  it.each([
    [new DataKeysRequiredError('epo'), 'EPO OPS key not configured. Add it in Settings > Patent data connectors > EPO OPS, then call this tool again.'],
    [new ProviderKeyInvalidError('uspto', 'refused'), 'USPTO ODP rejected the stored key. Replace it in Settings > Patent data connectors > USPTO ODP.'],
    [new OcrNotConfiguredError(), 'Mistral key not configured. Add it in Settings > Patent data connectors > Mistral, then call this tool again.'],
    [new ToolError(400, 'odp_api_key_missing', 'no key'), 'USPTO ODP key not configured. Add it in Settings > Patent data connectors > USPTO ODP, then call this tool again.'],
  ])('answers the library key failure %s with the settings-card text', async (error, text) => {
    const { ctx, connectors, bound } = await bench()
    registerOfficeTools(ctx, connectors, bound, [probeTool(error)])
    const result = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'probe', arguments: { text: 'x' }, signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text }])
  })

  it('reports another library failure with its code, and any other failure as it is', async () => {
    const { ctx, connectors, bound } = await bench()
    registerOfficeTools(ctx, connectors, bound, [probeTool(new ToolError(404, 'not_found', 'no such patent'))])
    const coded = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'probe', arguments: { text: 'x' }, signal: new AbortController().signal,
    })
    expect(coded.isError).toBe(true)
    expect(textOf(coded.content[0])).toContain('probe: not_found: no such patent')

    const other = await bench()
    registerOfficeTools(other.ctx, other.connectors, other.bound, [probeTool(new Error('socket closed'))])
    const plain = await executeModelToolFixture(other.ctx, {
      callId: callId(), name: 'probe', arguments: { text: 'x' }, signal: new AbortController().signal,
    })
    expect(plain.isError).toBe(true)
    expect(textOf(plain.content[0])).toContain('socket closed')
    expect(textOf(plain.content[0])).not.toContain('probe:')
  })

  it('names a root-level argument error as (root)', async () => {
    const { ctx, connectors, bound } = await bench()
    registerOfficeTools(ctx, connectors, bound, [probeTool()])
    const result = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'probe', arguments: 'not an object', signal: new AbortController().signal,
    })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toContain('probe: invalid arguments: (root)')
  })

  it('passes the calling agent to the handler as the caller and renders a string result as it is', async () => {
    const { ctx, connectors, bound } = await bench()
    const probe = probeTool()
    registerOfficeTools(ctx, connectors, bound, [probe, { ...probeTool(), name: 'echo', handler: () => Promise.resolve('plain text') }])
    const agent = { id: 'session-7', ctx: ctx.extend() } as Agent
    const result = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'probe', arguments: { text: 'x' }, signal: new AbortController().signal, agent,
    })
    expect(result.value).toEqual({ ok: true })
    expect(probe.contexts.map(context => context.caller)).toEqual([{ userId: 'session-7' }])
    const echo = await executeModelToolFixture(ctx, {
      callId: callId(), name: 'echo', arguments: { text: 'x' }, signal: new AbortController().signal,
    })
    expect(echo.content).toEqual([{ type: 'text', text: 'plain text' }])
  })

  it('withdraws the tools it already registered when a later name conflicts', async () => {
    const { ctx, connectors, bound } = await bench()
    const keep = registerOfficeTools(ctx, connectors, bound, [{ ...probeTool(), name: 'taken' }])
    expect(() => registerOfficeTools(ctx, connectors, bound, [probeTool(), { ...probeTool(), name: 'taken' }])).toThrow('already registered')
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['taken'])
    keep()
  })
})
