/** The extraction Worker bounds a hostile file in time, memory and pages, and close does not wait for a parse. */
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { parseFile, parseInWorker } from '../src/index.ts'
import { chunks, makePdf, mountBuilder, runtime, tempDir } from './harness.ts'
import { docxBomb } from './zip-bomb.ts'

const INPUT = { name: 'Limits', description: 'Bounds.', connectors: [] }

describe('extraction Worker limits', () => {
  it('fails a DOCX zip bomb with too-large and keeps the Host up', async () => {
    const bomb = docxBomb(400)
    expect(bomb.byteLength).toBeLessThan(1024 * 1024)
    const before = process.memoryUsage().heapUsed
    const result = await parseInWorker({ name: 'bomb.docx', bytes: bomb }, { timeoutMs: 60_000, memoryMb: 64, maxPages: 10 }, new AbortController().signal)
    expect(result).toEqual({ kind: 'failed', reason: 'too-large', message: 'reading the file needs more than 64 MB of memory' })
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(100 * 1024 * 1024)
  }, 60_000)

  it('fails a file that passes the time limit with timeout', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), extractTimeoutMs: 1 })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'a.txt', chunks('alpha'))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files[0]?.state).toEqual({ kind: 'failed', reason: 'timeout', message: 'reading the file took longer than 1 ms' })
  })

  it('fails a PDF over the page limit before its pages are read', async () => {
    expect(await parseFile({ name: 'a.pdf', bytes: makePdf([['One'], ['Two'], ['Three']]), maxPages: 2 }))
      .toEqual({ kind: 'failed', reason: 'too-large', message: 'the PDF has 3 pages; the limit is 2' })
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), maxPages: 1 })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'a.pdf', chunks(makePdf([['One'], ['Two']])))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files[0]?.state).toMatchObject({ kind: 'failed', reason: 'too-large' })
  })

  it('ends a running parse at close and leaves the file to be read at the next start', async () => {
    const root = await tempDir('dsh-agents-')
    const ctx = await runtime()
    const fiber = await mountBuilder(ctx, { root })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    const started = Date.now()
    await ctx.flowleapAgentCatalog.upload(id, 'bomb.docx', chunks(docxBomb(400)))
    await fiber.dispose()
    expect(Date.now() - started).toBeLessThan(5_000)
    const index = new DatabaseSync(join(root, id, 'index.sqlite'))
    expect(index.prepare('SELECT name, state FROM files').all()).toEqual([{ name: 'bomb.docx', state: 'indexing' }])
    index.close()
    const next = await runtime()
    await mountBuilder(next, { root, extractMemoryMb: 64 })
    expect(next.flowleapAgentCatalog.read(id).files).toMatchObject([{ name: 'bomb.docx', state: { kind: 'failed', reason: 'too-large' } }])
  }, 60_000)
})
