import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Document, Packer, Paragraph } from 'docx'
import { describe, expect, it } from 'vitest'
import { listFiles, type AgentId } from '../src/index.ts'
import { agentOn, callTool, chunks, logLines, mountBuilder, runtime, tempDir } from './harness.ts'

const INPUT = { name: 'Responder', description: 'Drafts.', connectors: [] }

async function writeAgent(root: string, id: string, files: Record<string, string> = {}) {
  await mkdir(join(root, id, 'files'), { recursive: true })
  await writeFile(join(root, id, 'agent.yaml'), `name: ${id}\n`)
  await writeFile(join(root, id, 'instructions.md'), 'Work.')
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, id, 'files', name), text)
}

const post = (query: string, body?: BodyInit) => new Request(`http://host/api/flowleap-agents/upload?${query}`, {
  method: 'POST', headers: { 'content-type': 'application/octet-stream' }, ...body === undefined ? {} : { body, duplex: 'half' },
})

describe('agent folders', () => {
  it('moves a damaged index and an index with a newer schema aside, reads the files again, and loads every agent', async () => {
    const root = await tempDir('dsh-agents-')
    await writeAgent(root, 'damaged', { 'a.txt': 'alpha' })
    await writeAgent(root, 'newer', { 'b.txt': 'beta' })
    await writeAgent(root, 'healthy')
    await writeFile(join(root, 'damaged', 'index.sqlite'), 'this is not a database file, but it is long enough to have a header')
    const db = new DatabaseSync(join(root, 'newer', 'index.sqlite'))
    db.exec('PRAGMA user_version = 99')
    db.close()
    const ctx = await runtime()
    const lines = logLines(ctx)
    await mountBuilder(ctx, { root })
    const catalog = ctx.flowleapAgentCatalog
    expect(catalog.list().map(row => row.id)).toEqual(['damaged', 'healthy', 'newer'])
    expect(catalog.read('damaged' as AgentId).files).toMatchObject([{ name: 'a.txt', state: { kind: 'indexed' } }])
    expect(catalog.read('newer' as AgentId).files).toMatchObject([{ name: 'b.txt', state: { kind: 'indexed' } }])
    expect(lines).toContainEqual(expect.stringMatching(
      /damaged\/index\.sqlite cannot be opened .*; it moved to .*index\.sqlite\.unreadable-\d+, and the files are read again/,
    ))
    expect(lines).toContainEqual(expect.stringContaining('schema 99 is newer than 1'))
    expect((await readdir(join(root, 'newer'))).filter(name => name.startsWith('index.sqlite.unreadable-'))).toHaveLength(1)
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent', 'damaged', 'healthy', 'newer'])
  })

  it('does not load an agent whose index cannot be opened or moved, and loads the others', async () => {
    const root = await tempDir('dsh-agents-')
    await writeAgent(root, 'blocked')
    await writeAgent(root, 'healthy')
    await mkdir(join(root, 'blocked', 'index.sqlite'))
    await chmod(join(root, 'blocked'), 0o500)
    const ctx = await runtime()
    const lines = logLines(ctx)
    try {
      await mountBuilder(ctx, { root })
    } finally {
      await chmod(join(root, 'blocked'), 0o700)
    }
    expect(ctx.flowleapAgentCatalog.list().map(row => row.id)).toEqual(['healthy'])
    expect(lines).toContainEqual(expect.stringMatching(/flowleap agent .*blocked not loaded: .*EACCES/))
  })

})

describe('agent presets', () => {
  it('registers every agent preset again when the base preset registers again with a new plugin list', async () => {
    const ctx = await runtime()
    ctx.loader.builtins['house-marker'] = { name: 'house-marker', apply: () => {} }
    const off = await ctx.agentPresets.register({ id: 'house', order: 1, plugins: [] })
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), basePreset: 'house' })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    expect(ctx.agentPresets.definition(id)?.plugins.map(row => row.id)).toEqual(['flowleap-agent'])
    await off()
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.agentPresets.definition(id)?.plugins.map(row => row.id)).toEqual(['flowleap-agent'])
    await ctx.agentPresets.register({ id: 'house', order: 1, plugins: [{ id: 'marker', name: 'cordis:house-marker', config: {} }] })
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.agentPresets.definition(id)?.plugins.map(row => row.id)).toEqual(['marker', 'flowleap-agent'])
  })

})

describe('write order', () => {
  it('does not bring back an agent that a save races with its delete, in either order', async () => {
    const root = await tempDir('dsh-agents-')
    const ctx = await runtime()
    await mountBuilder(ctx, { root })
    const catalog = ctx.flowleapAgentCatalog
    for (const saveFirst of [true, false]) {
      const { id } = await catalog.save(undefined, INPUT, 'Work.')
      const [first, second] = saveFirst
        ? [catalog.save(id, INPUT, 'Changed.'), catalog.delete(id)]
        : [catalog.delete(id), catalog.save(id, INPUT, 'Changed.')]
      const results = await Promise.allSettled([first, second])
      expect(results.map(result => result.status)).toEqual(saveFirst ? ['rejected', 'fulfilled'] : ['fulfilled', 'rejected'])
      await catalog.settled()
      expect(catalog.list()).toEqual([])
      expect((await readdir(root)).filter(name => !name.startsWith('.'))).toEqual([])
      await expect(catalog.delete(id)).rejects.toMatchObject({ code: 'flowleap-agents/not-found' })
    }
  })

  it('keeps a file removed after its upload removed on disk and in the index', async () => {
    const root = await tempDir('dsh-agents-')
    const ctx = await runtime()
    await mountBuilder(ctx, { root })
    const catalog = ctx.flowleapAgentCatalog
    const { id } = await catalog.save(undefined, INPUT, 'Work.')
    const [upload, removal] = await Promise.allSettled([catalog.upload(id, 'a.txt', chunks('alpha')), catalog.removeFile(id, 'a.txt')])
    expect([upload.status, removal.status]).toEqual(['fulfilled', 'fulfilled'])
    await catalog.settled()
    expect(await listFiles(join(root, id))).toEqual([])
    expect(catalog.read(id).files).toEqual([])
  })

  it('keeps the agent, its preset and its folder when the folder cannot be moved, and announces nothing', async () => {
    const root = await tempDir('dsh-agents-')
    const ctx = await runtime()
    await mountBuilder(ctx, { root })
    const catalog = ctx.flowleapAgentCatalog
    const { id } = await catalog.save(undefined, INPUT, 'Work.')
    let changes = 0
    ctx.on('flowleap-agents/changed', () => { changes++ })
    await chmod(root, 0o500)
    try {
      await expect(catalog.delete(id)).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      await chmod(root, 0o700)
    }
    expect(changes).toBe(0)
    expect(catalog.list().map(row => row.id)).toEqual([id])
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent', id])
    expect(await readFile(join(root, id, 'instructions.md'), 'utf8')).toBe('Work.')
    await catalog.save(id, INPUT, 'Still here.')
    await catalog.delete(id)
    expect(catalog.list()).toEqual([])
  })

  it('logs a deleted folder that cannot be removed after it moved aside', async () => {
    const root = await tempDir('dsh-agents-')
    const ctx = await runtime()
    const lines = logLines(ctx)
    await mountBuilder(ctx, { root })
    const catalog = ctx.flowleapAgentCatalog
    const { id } = await catalog.save(undefined, INPUT, 'Work.')
    await catalog.upload(id, 'a.txt', chunks('alpha'))
    await catalog.settled()
    await chmod(join(root, id, 'files'), 0o500)
    await catalog.delete(id)
    const [aside] = (await readdir(root)).filter(name => name.startsWith(`.deleted-${id}-`))
    await chmod(join(root, aside!, 'files'), 0o700)
    expect(catalog.list()).toEqual([])
    expect(lines).toContainEqual(expect.stringContaining(`flowleap agent ${id}: the deleted folder`))
  })
})

describe('files', () => {
  it('reads a DOCX by paragraph, and answers no hit for a query without words and nothing for an unknown file', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), contextLimitTokens: 0, maxReadChars: 6 })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Claim style.'), new Paragraph('Use active voice.')] }] }))
    await ctx.flowleapAgentCatalog.upload(id, 'guide.docx', chunks(new Uint8Array(docx)))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.search(id, 'voice', 8)).toEqual([{ file: 'guide.docx', at: 2, unit: 'paragraph', passage: 'Use active voice.' }])
    expect(ctx.flowleapAgentCatalog.search(id, '—', 8)).toEqual([])
    expect(ctx.flowleapAgentCatalog.readFile(id, 'missing.pdf', 1, 1)).toBeUndefined()
    const agent = await agentOn(ctx, 's1', id)
    expect(await callTool(ctx, agent, 'read_agent_file', { file: 'guide.docx', page: 2 })).toMatchObject({
      isError: false,
      value: 'guide.docx: 2 paragraphs with text.\n\n=== guide.docx | paragraph 2 ===\nUse ac\n\n'
        + '[This answer stops at the limit of 6 characters. Read on with read_agent_file {"file":"guide.docx","page":2,"start":6}.]',
    })
  })

})

describe('upload route', () => {
  it('stores into a hand-made agent folder without a files folder', async () => {
    const handlers: ((request: Request) => Promise<Response>)[] = []
    const root = await tempDir('dsh-agents-')
    await writeAgent(root, 'hand-made')
    await rm(join(root, 'hand-made', 'files'), { recursive: true })
    const ctx = await runtime({ handlers })
    await mountBuilder(ctx, { root })
    expect(await (await handlers[0]!(post('agent=hand-made&name=a.txt', 'alpha'))).json()).toMatchObject({ ok: true, value: { name: 'a.txt', bytes: 5 } })
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read('hand-made' as AgentId).files).toMatchObject([{ name: 'a.txt', state: { kind: 'indexed' } }])
  })

  it('answers a write failure and a cut body as errors, keeps the Host up, and leaves no partial file', async () => {
    const handlers: ((request: Request) => Promise<Response>)[] = []
    const ctx = await runtime({ handlers })
    const root = await tempDir('dsh-agents-')
    await mountBuilder(ctx, { root })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    const route = handlers[0]!
    expect(await (await route(post(`agent=${id}&name=empty.txt`))).json()).toMatchObject({ ok: true, value: { name: 'empty.txt', bytes: 0 } })
    expect((await route(post(`agent=${id}`, 'x'))).status).toBe(400)
    const failing = new ReadableStream<Uint8Array>({ pull(controller) { controller.error('client went away') } })
    expect(await (await route(post(`agent=${id}&name=cut.txt`, failing))).json()).toEqual({
      ok: false, error: { code: 'gateway/internal', message: 'client went away', details: {} },
    })
    await chmod(join(root, id, 'files'), 0o500)
    try {
      expect(await (await route(post(`agent=${id}&name=a.txt`, 'alpha'))).json()).toMatchObject({
        ok: false, error: { code: 'gateway/internal', message: expect.stringContaining('EACCES') as string },
      })
    } finally {
      await chmod(join(root, id, 'files'), 0o700)
    }
    expect(await readdir(join(root, id, 'files'))).toEqual(['empty.txt'])
    expect(await (await route(post(`agent=${id}&name=b.txt`, 'beta'))).json()).toMatchObject({ ok: true })
  })

  it('refuses a name longer than the file-system limit in UTF-8 bytes', async () => {
    const handlers: ((request: Request) => Promise<Response>)[] = []
    const ctx = await runtime({ handlers })
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    const long = `${'審'.repeat(85)}.txt`
    expect(long.length).toBeLessThan(200)
    expect(await (await handlers[0]!(post(`agent=${id}&name=${encodeURIComponent(long)}`, 'x'))).json()).toMatchObject({
      ok: false, error: { code: 'flowleap-agents/invalid', details: { field: 'name', reason: 'long' } },
    })
    const fits = `${'審'.repeat(78)}.txt`
    expect(await (await handlers[0]!(post(`agent=${id}&name=${encodeURIComponent(fits)}`, 'x'))).json()).toMatchObject({ ok: true })
  })
})
