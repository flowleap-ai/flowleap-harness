/**
 * The drafting saves of `write_patent_results` when the user stops the turn during the save (#128):
 * a Stop before the first write leaves no file of the save, and a Stop after any write of the save
 * still leaves every file of it, with the delivery card.
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claims, draft, featureList, figures, openQuestion, outline, outlineTable } from './drafting-matter-fixtures.ts'
import { writerBench } from './writer-test-bench.ts'

type Bench = Awaited<ReturnType<typeof writerBench>>
const benches: Bench[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const bench of benches.splice(0)) await bench.dispose()
})

const MATTER = 'drafting/hinge'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (_missing) {
    // A missing file is the answer, not a failure.
    return false
  }
}

/** Run one drafting save of the hinge matter with Stop pressed right after `step` of the file `name`. */
async function saveWithStop(step: 'resolve' | 'write', name: string, args: { filePath: string, content: string, template: string }, names: readonly string[]) {
  const bench = await writerBench()
  benches.push(bench)
  const folder = join(bench.dir, MATTER)
  await mkdir(folder, { recursive: true })
  for (const [file, text] of [['feature-list.md', featureList()], ['claims.md', claims()], ['figures.md', figures], ['draft-outline.md', outline()]]) {
    await writeFile(join(folder, file!), text!)
  }
  bench.session.append('turn/start', { turn: 1 })
  const stop = new AbortController()
  const fs = bench.ctx.fs
  const matches = (target: FsTarget) => fs.processPath(target).endsWith(`${sep}${join(MATTER, name)}`)
  if (step === 'resolve') {
    const real = fs.resolve.bind(fs)
    vi.spyOn(fs, 'resolve').mockImplementation(async (path, options) => {
      const target = await real(path, options)
      if (matches(target)) stop.abort()
      return target
    })
  } else {
    const real = fs.writeText.bind(fs)
    vi.spyOn(fs, 'writeText').mockImplementation(async (target, ...rest) => {
      const written = await real(target, ...rest)
      if (matches(target)) stop.abort()
      return written
    })
  }
  const result = await bench.run('write_patent_results', args, true, stop.signal)
  const cards = bench.session.snapshotEvents().flatMap(event => event.type === 'deliverables/presented' ? [event.data.files.map(file => file.description)] : [])
  const files = Object.fromEntries(await Promise.all(names.map(async file => [file, await exists(join(folder, file))] as const)))
  return { outcome: { aborted: result.isError, files, cards }, folder }
}

describe('a Stop during a draft-application save', () => {
  const save = { filePath: `${MATTER}/draft-application.md`, content: draft(openQuestion), template: 'draft-application' }
  const names = ['draft-application.md', 'draft-application.generated.md', 'draft-application.working-record.md', 'inventor-answers.md']
  const all = Object.fromEntries(names.map(file => [file, true]))

  it('writes no file of the save when the Stop comes before the first write', async () => {
    const { outcome } = await saveWithStop('resolve', 'feature-list.md', save, names)
    expect(outcome).toEqual({ aborted: true, files: Object.fromEntries(names.map(file => [file, false])), cards: [] })
  })

  it('writes the snapshot, the Working Record and the answer slots when the Stop comes after the draft write', async () => {
    const { outcome, folder } = await saveWithStop('write', 'draft-application.md', save, names)
    expect(outcome).toEqual({ aborted: true, files: all, cards: [['Draft']] })
    expect(await readFile(join(folder, 'inventor-answers.md'), 'utf8')).toContain('IQ-1')
  })

  it('writes the answer slots when the Stop comes after the Working Record write', async () => {
    const { outcome } = await saveWithStop('write', 'draft-application.working-record.md', save, names)
    expect(outcome).toEqual({ aborted: true, files: all, cards: [['Draft']] })
  })
})

describe('a Stop during a draft-outline save', () => {
  const resave = { filePath: `${MATTER}/draft-outline.md`, content: outlineTable.replace('a hinge, a housing, a lever', 'a hinge, a lever, a housing'), template: 'draft-outline' }
  const names = ['draft-application.working-record.md']

  it('keeps the previous outline when the Stop comes before the first write', async () => {
    const { outcome, folder } = await saveWithStop('resolve', 'feature-list.md', resave, names)
    expect(outcome).toEqual({ aborted: true, files: { 'draft-application.working-record.md': false }, cards: [] })
    expect(await readFile(join(folder, 'draft-outline.md'), 'utf8')).toBe(outline())
  })

  it('records the re-save in the Working Record when the Stop comes after the outline write', async () => {
    const { outcome, folder } = await saveWithStop('write', 'draft-outline.md', resave, names)
    expect(outcome).toEqual({ aborted: true, files: { 'draft-application.working-record.md': true }, cards: [['Draft Outline']] })
    expect(await readFile(join(folder, 'draft-application.working-record.md'), 'utf8')).toContain('Outline re-saved')
  })
})
