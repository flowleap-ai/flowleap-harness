import { describe, expect, it, vi } from 'vitest'
import { rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { handleAgentUpload } from '../src/index.ts'
import { mountBuilder, runtime, stubTool, tempDir } from './harness.ts'

async function bench() {
  const ctx = await runtime()
  await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), maxFileBytes: 64 })
  return ctx
}

const INPUT = { name: 'Responder', description: 'Drafts.', instructions: 'Work.', connectors: ['epo-ops'] }

describe('flowleapAgents Remote', () => {
  it('creates, lists, reads, changes and deletes an agent, and announces each change', async () => {
    const ctx = await bench()
    let changes = 0
    ctx.on('flowleap-agents/changed', () => { changes++ })
    const created = await ctx.flowleapAgents.save(INPUT)
    expect(await ctx.flowleapAgents.list()).toEqual([{ id: created.id, name: 'Responder', description: 'Drafts.', readOnly: false }])
    const changed = await ctx.flowleapAgents.save({ ...INPUT, id: created.id, name: 'Renamed', connectors: [] })
    expect(changed).toMatchObject({ id: created.id, name: 'Renamed', connectors: [], instructions: 'Work.', mode: 'context' })
    expect(await ctx.flowleapAgents.read(created.id)).toEqual(changed)
    await ctx.flowleapAgents.delete(created.id)
    expect(await ctx.flowleapAgents.list()).toEqual([])
    expect(changes).toBe(3)
  })

  it('rejects an unknown connector, an extra field, an empty instruction and a bad id', async () => {
    const ctx = await bench()
    await expect(ctx.flowleapAgents.save({ ...INPUT, connectors: ['mistral'] })).rejects.toMatchObject({ code: 'flowleap-agents/invalid', details: { field: 'connectors.0' } })
    await expect(ctx.flowleapAgents.save({ ...INPUT, apiKey: 'x' } as never)).rejects.toMatchObject({ code: 'flowleap-agents/invalid' })
    await expect(ctx.flowleapAgents.save({ ...INPUT, instructions: ' ' })).rejects.toMatchObject({ code: 'flowleap-agents/invalid', details: { field: 'instructions' } })
    await expect(ctx.flowleapAgents.read('../x' as never)).rejects.toMatchObject({ code: 'flowleap-agents/invalid' })
    await expect(ctx.flowleapAgents.read('missing-agent' as never)).rejects.toMatchObject({ code: 'flowleap-agents/not-found' })
  })

  it('marks a connector configured by its key, and flowleap by its tools', async () => {
    const ctx = await bench()
    ctx.provide('flowleapConnectors', { describe: () => Promise.resolve({ 'epo-ops': { configured: true }, 'uspto-odp': { configured: false } }) } as never)
    expect(await ctx.flowleapAgents.connectors()).toEqual([
      { id: 'epo-ops', configured: true }, { id: 'uspto-odp', configured: false },
      { id: 'flowleap', configured: false }, { id: 'semantic-scholar', configured: false },
    ])
    ctx.tools.register(stubTool('mcp__flowleap__server_info'))
    expect((await ctx.flowleapAgents.connectors()).find(row => row.id === 'flowleap')).toEqual({ id: 'flowleap', configured: true })
  })
})

describe('upload route', () => {
  const post = (query: string, body: string, type = 'application/octet-stream') => new Request(`http://host/api/flowleap-agents/upload?${query}`, {
    method: 'POST', headers: { 'content-type': type }, body,
  })

  it('stores a file and answers with its row; refuses bad requests', async () => {
    const ctx = await bench()
    const { id } = await ctx.flowleapAgents.save(INPUT)
    const catalog = ctx.flowleapAgentCatalog
    const ok = await handleAgentUpload(catalog, post(`agent=${id}&name=a.txt`, 'alpha'))
    expect(await ok.json()).toEqual({ ok: true, value: { name: 'a.txt', bytes: 5, state: { kind: 'indexing' }, locations: 0, unit: 'page' } })
    const large = await handleAgentUpload(catalog, post(`agent=${id}&name=b.txt`, 'x'.repeat(65)))
    expect(await large.json()).toMatchObject({ ok: false, error: { code: 'flowleap-agents/invalid' } })
    expect((await handleAgentUpload(catalog, post(`agent=${id}&name=a.txt`, 'x', 'text/plain'))).status).toBe(415)
    expect((await handleAgentUpload(catalog, post('name=a.txt', 'x'))).status).toBe(400)
    expect((await handleAgentUpload(catalog, new Request('http://host/api/flowleap-agents/upload'))).status).toBe(405)
    await catalog.settled()
    expect(catalog.read(id).files.map(file => [file.name, file.state.kind])).toEqual([['a.txt', 'indexed']])
  })

  it('refuses an upload while the disk low flag exists, and stores it again once the flag is gone', async () => {
    const ctx = await runtime()
    const root = await tempDir('dsh-agents-')
    const flag = join(root, '..', `${basename(root)}.disk-low`)
    await mountBuilder(ctx, { root, storageLowFlagPath: flag })
    const { id } = await ctx.flowleapAgents.save(INPUT)
    const catalog = ctx.flowleapAgentCatalog
    await writeFile(flag, '')
    try {
      const refused = await handleAgentUpload(catalog, post(`agent=${id}&name=a.txt`, 'alpha'))
      expect(await refused.json()).toEqual({
        ok: false,
        error: {
          code: 'flowleap-agents/invalid',
          message: 'The firm server is low on disk space. Ask your administrator.',
          details: { field: 'file', reason: 'storage low' },
        },
      })
      expect(catalog.read(id).files).toEqual([])
      // Reads and agent edits go on while the flag exists.
      expect(await ctx.flowleapAgents.save({ ...INPUT, id, name: 'Renamed' })).toMatchObject({ name: 'Renamed' })
    } finally {
      await rm(flag, { force: true })
    }
    const stored = await handleAgentUpload(catalog, post(`agent=${id}&name=a.txt`, 'alpha'))
    expect(await stored.json()).toMatchObject({ ok: true, value: { name: 'a.txt', bytes: 5 } })
    await catalog.settled()
  })
})

describe('plugin', () => {
  it('resolves the root below DSH_HOME and registers the upload route', async () => {
    const { apply, resolveOptions, AGENT_ROW_MODULE } = await import('../src/index.ts')
    const config = {
      contextLimitTokens: 1, charsPerToken: 4, maxFileBytes: 1, basePreset: 'patent', presetOrder: 1, maxSearchResults: 1, maxReadLocations: 1, maxReadChars: 1,
      extractTimeoutMs: 1, maxPages: 1, extractMemoryMb: 16, storageLowFlagPath: '/run/flowleap/host/disk-low',
    }
    expect(resolveOptions(config, { DSH_HOME: '/home/a/.dsh' })).toMatchObject({ root: join(resolve('/home/a/.dsh'), 'agents'), agentRow: AGENT_ROW_MODULE })
    expect(resolveOptions({ ...config, root: '/r', firmRoot: '/f' })).toMatchObject({ root: '/r', firmRoot: '/f' })
    const routes: string[] = []
    const ctx = await runtime({ routes })
    const root = await tempDir('dsh-agents-')
    await ctx.plugin({ inject: ['agentPresets', 'connection'], apply: (child: never) => { apply(child, { ...config, root }) } }).await()
    await ctx.flowleapAgentCatalog.settled()
    await vi.waitFor(() => { expect(routes).toEqual(['/api/flowleap-agents/upload']) })
    expect(await ctx.flowleapAgents.list()).toEqual([])
  })
})
