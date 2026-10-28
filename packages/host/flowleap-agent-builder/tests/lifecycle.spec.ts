import { createHash } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Document, Packer, Paragraph } from 'docx'
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { OcrRead } from '@deepseek-ai/dsh-flowleap-connectors'
import { FILE_TEXT_NOTICE, extractText, listFiles, resolveOptions, serve, type AgentId } from '../src/index.ts'
import { agentOn, callTool, chunks, inThread, logLines, makePdf, mountBuilder, ocrDouble, runtime, tempDir } from './harness.ts'

const INPUT = { name: 'Responder', description: 'Drafts.', connectors: [] }

async function writeAgent(root: string, id: string, files: Record<string, string> = {}) {
  await mkdir(join(root, id, 'files'), { recursive: true })
  await writeFile(join(root, id, 'agent.yaml'), `name: ${id}\n`)
  await writeFile(join(root, id, 'instructions.md'), 'Work.')
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, id, 'files', name), text)
}

/** An OCR read that settles when the test releases it. */
function heldOcr() {
  let release: (read: OcrRead) => void = () => {}
  const started = vi.fn()
  const ocr = {
    pages: () => {
      started()
      return new Promise<OcrRead>((resolve) => { release = resolve })
    },
  }
  return { ocr, started, release: (read: OcrRead) => { release(read) } }
}

async function mountRaw(ctx: Context, root: string) {
  const options = resolveOptions({
    root, contextLimitTokens: 50_000, charsPerToken: 4, maxFileBytes: 1024, basePreset: 'patent', presetOrder: 100, maxSearchResults: 8,
    maxReadLocations: 10, maxReadChars: 1000, extractTimeoutMs: 60_000, maxPages: 2000, extractMemoryMb: 512,
  })
  const fiber = ctx.plugin({ inject: ['agentPresets', 'connection'], apply: (child: Context) => { serve(child, { ...options, agentRow: 'cordis:flowleap-agent' }) } })
  await fiber.await()
  return fiber
}

const post = (query: string, body?: BodyInit) => new Request(`http://host/api/flowleap-agents/upload?${query}`, {
  method: 'POST', headers: { 'content-type': 'application/octet-stream' }, ...body === undefined ? {} : { body, duplex: 'half' },
})

describe('agent folders', () => {
  it('skips a firm agent whose id a user agent has, and keeps a firm agent whose preset id is taken off the roster', async () => {
    const root = await tempDir('dsh-agents-')
    const firmRoot = await tempDir('dsh-firm-')
    await writeAgent(root, 'shared-id')
    await writeAgent(firmRoot, 'shared-id')
    await writeAgent(firmRoot, 'patent')
    const ctx = await runtime()
    const lines = logLines(ctx)
    await mountBuilder(ctx, { root, firmRoot })
    expect(ctx.flowleapAgentCatalog.list().map(row => [row.id, row.readOnly])).toEqual([['patent', true], ['shared-id', false]])
    expect(lines).toContainEqual(expect.stringContaining('the id shared-id is already taken'))
    expect(lines).toContainEqual('flowleap agent patent: preset not registered: Duplicate agent preset: patent')
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent', 'shared-id'])
  })

  it('drops the index row of a file removed while the Host was down', async () => {
    const root = await tempDir('dsh-agents-')
    const first = await runtime()
    const fiber = await mountBuilder(first, { root })
    const { id } = await first.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    await first.flowleapAgentCatalog.upload(id, 'a.txt', chunks('alpha'))
    await first.flowleapAgentCatalog.settled()
    await fiber.dispose()
    await rm(join(root, id, 'files', 'a.txt'))
    const second = await runtime()
    await mountBuilder(second, { root })
    expect(second.flowleapAgentCatalog.read(id).files).toEqual([])
  })

  it('has no agents when the root does not exist yet', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: join(await tempDir('dsh-agents-'), 'missing') })
    expect(ctx.flowleapAgentCatalog.list()).toEqual([])
  })

  it('fails to start on a root that is not a folder', async () => {
    const parent = await tempDir('dsh-agents-')
    const fileRoot = join(parent, 'not-a-folder')
    await writeFile(fileRoot, '')
    const ctx = await runtime()
    const lines = logLines(ctx)
    await mountRaw(ctx, fileRoot)
    await vi.waitFor(() => { expect(lines).toContainEqual(expect.stringContaining('ENOTDIR')) })
  })

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

  it('reports an index whose rows it cannot read, and still loads the other agents', async () => {
    const root = await tempDir('dsh-agents-')
    await writeAgent(root, 'unknown-reason', { 'a.txt': 'alpha' })
    await writeAgent(root, 'bad-columns', { 'b.txt': 'beta' })
    await writeAgent(root, 'bad-pages', { 'c.txt': 'gamma' })
    await writeAgent(root, 'bad-state', { 'd.txt': 'delta' })
    await writeAgent(root, 'files-is-a-file')
    await rm(join(root, 'files-is-a-file', 'files'), { recursive: true })
    await writeFile(join(root, 'files-is-a-file', 'files'), '')
    const sha = createHash('sha256').update('alpha').digest('hex')
    const craft = (id: string, sql: string) => {
      const db = new DatabaseSync(join(root, id, 'index.sqlite'))
      db.exec(sql)
      db.close()
    }
    craft('unknown-reason', `
      CREATE TABLE files (name TEXT PRIMARY KEY, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, state TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'page', pages INTEGER NOT NULL DEFAULT 0, chars INTEGER NOT NULL DEFAULT 0, reason TEXT, error TEXT);
      INSERT INTO files (name, bytes, sha256, state, reason) VALUES ('a.txt', 5, '${sha}', 'failed', 'gone');`)
    craft('bad-columns', `
      CREATE TABLE files (name TEXT PRIMARY KEY, bytes BLOB, sha256 BLOB, state TEXT, unit TEXT, pages BLOB, chars INTEGER, reason TEXT, error TEXT);
      INSERT INTO files VALUES ('b.txt', 4, 7, 'indexed', 'page', 'many', 0, NULL, NULL);`)
    craft('bad-pages', 'CREATE TABLE pages (text TEXT);')
    craft('bad-state', `
      CREATE TABLE files (name TEXT PRIMARY KEY, bytes INTEGER, sha256 TEXT, state INTEGER, unit TEXT, pages INTEGER, chars INTEGER, reason TEXT, error TEXT);
      INSERT INTO files VALUES ('d.txt', 5, 'x', 5, 'page', 0, 0, NULL, NULL);`)
    const ctx = await runtime()
    const lines = logLines(ctx)
    await mountBuilder(ctx, { root })
    const catalog = ctx.flowleapAgentCatalog
    expect(catalog.read('unknown-reason' as AgentId).files).toEqual([
      { name: 'a.txt', bytes: 5, state: { kind: 'failed', reason: 'unreadable', message: '' }, locations: 0, unit: 'page' },
    ])
    expect(lines).toContainEqual('flowleap agents: agent index: column pages is not a number')
    expect(lines).toContainEqual('flowleap agents: agent index: column state is not text')
    expect(() => catalog.read('bad-columns' as AgentId)).toThrow('agent index: column pages is not a number')
    expect(lines).toContainEqual(expect.stringContaining('no such column: file'))
    expect(lines).toContainEqual(expect.stringContaining('ENOTDIR'))
    expect(catalog.list().map(row => row.id)).toEqual(['bad-columns', 'bad-pages', 'bad-state', 'files-is-a-file', 'unknown-reason'])
  })
})

describe('agent presets', () => {
  it('waits for the base preset, warns once, and registers the agent presets when it arrives', async () => {
    const ctx = await runtime()
    const lines = logLines(ctx)
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), basePreset: 'house' })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    await ctx.agentPresets.register({ id: 'other', order: 1, plugins: [] })
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent', 'other'])
    expect(lines.filter(line => line.includes('waiting for the base preset "house"'))).toHaveLength(1)
    await ctx.agentPresets.register({ id: 'house', order: 2, plugins: [] })
    await ctx.flowleapAgentCatalog.settled()
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent', 'other', 'house', id])
  })

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

  it('lists agents by name, then by id', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const first = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    const second = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    const zed = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT, name: 'Zed' }, 'Work.')
    expect(ctx.flowleapAgentCatalog.list().map(row => row.id)).toEqual([...[first.id, second.id].sort(), zed.id])
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
      value: `guide.docx: 2 paragraphs with text.\n\n${FILE_TEXT_NOTICE}\n<<<agent-files>>>\n=== guide.docx | paragraph 2 ===\nUse ac\n<<</agent-files>>>\n\n`
        + '[This answer stops at the limit of 6 characters. Read on with read_agent_file {"file":"guide.docx","page":2,"start":6}.]',
    })
  })

  it('stores a large body across write backpressure', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    const body = 'x'.repeat(256 * 1024)
    const row = await ctx.flowleapAgentCatalog.upload(id, 'big.txt', chunks(body, body))
    expect(row.bytes).toBe(512 * 1024)
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files[0]!.state).toEqual({ kind: 'indexed' })
  })

  it('refuses to remove a name that is not a file name', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, INPUT, 'Work.')
    await expect(ctx.flowleapAgentCatalog.removeFile(id, '../agent.yaml')).rejects.toMatchObject({ code: 'flowleap-agents/invalid', details: { field: 'name' } })
  })

  it('drops an OCR read that ends after its file was removed or its agent deleted', async () => {
    const held = heldOcr()
    const ctx = await runtime({ ocr: held.ocr })
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const catalog = ctx.flowleapAgentCatalog
    const { id } = await catalog.save(undefined, INPUT, 'Work.')
    await catalog.upload(id, 'scan.pdf', chunks(makePdf([null])))
    await vi.waitFor(() => { expect(held.started).toHaveBeenCalledTimes(1) }, { timeout: 10_000 })
    await catalog.removeFile(id, 'scan.pdf')
    held.release({ kind: 'read', pages: [{ page: 1, text: 'late text' }] })
    await catalog.settled()
    expect(catalog.read(id).files).toEqual([])

    await catalog.upload(id, 'scan.pdf', chunks(makePdf([null])))
    await vi.waitFor(() => { expect(held.started).toHaveBeenCalledTimes(2) }, { timeout: 10_000 })
    await catalog.delete(id)
    held.release({ kind: 'read', pages: [{ page: 1, text: 'late text' }] })
    await catalog.settled()
    expect(catalog.list()).toEqual([])
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

describe('flowleapAgents Remote', () => {
  it('removes a file, and refuses a name that is not a string', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const created = await ctx.flowleapAgents.save({ ...INPUT, instructions: 'Work.' })
    await ctx.flowleapAgentCatalog.upload(created.id, 'a.txt', chunks('alpha'))
    await ctx.flowleapAgentCatalog.settled()
    await ctx.flowleapAgents.removeFile(created.id, 'a.txt')
    expect((await ctx.flowleapAgents.read(created.id)).files).toEqual([])
    await expect(ctx.flowleapAgents.removeFile(created.id, 7 as never)).rejects.toMatchObject({ code: 'flowleap-agents/invalid', details: { field: 'name' } })
  })
})

describe('extractText', () => {
  it('fails a DOCX without text and an all-scanned PDF whose OCR reads blank pages', async () => {
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('')] }] }))
    expect(await extractText('empty.docx', new Uint8Array(docx), inThread, undefined)).toMatchObject({ kind: 'failed', reason: 'no-text' })
    const blank = ocrDouble(() => ({ kind: 'read', pages: [{ page: 1, text: '  ' }] }))
    expect(await extractText('scan.pdf', makePdf([null]), inThread, blank)).toEqual({ kind: 'failed', reason: 'no-text', message: 'the PDF holds no text' })
  })
})
