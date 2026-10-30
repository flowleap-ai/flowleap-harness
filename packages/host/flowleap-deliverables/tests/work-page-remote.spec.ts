/**
 * The `flowleapWorkPages` Remote over the work page of a structured save: the list and the read of the pages that the
 * caller may see, the review change that writes only the review fields, the event that carries the changed page, and
 * the refusals with their codes.
 */

import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { workPageId, workPagePath, type WorkPageFile, type WorkPageId, type WorkPageView } from '../src/index.ts'
import { FINDINGS, OFFICE_ACTION, structuredSave } from './work-page-fixtures.ts'
import { writerBench } from './writer-test-bench.ts'

describe('flowleapWorkPages Remote', () => {
  const cleanups: (() => Promise<unknown>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  async function bench(visible = true) {
    const bench = await writerBench()
    cleanups.push(bench.dispose)
    bench.ctx.provide('remoteAccess', { allows: vi.fn(() => visible) } as never)
    await vi.waitFor(() => { expect(bench.ctx.get('flowleapWorkPages')).toBeDefined() })
    const path = join(bench.dir, `${OFFICE_ACTION}.work.json`)
    const fileOf = async (): Promise<WorkPageFile> => JSON.parse(await readFile(path, 'utf8')) as WorkPageFile
    return { ...bench, pages: bench.ctx.flowleapWorkPages, path, fileOf }
  }

  const refusal = async (call: Promise<unknown>) => remoteErrorOf(await call.catch((error: unknown) => error))

  it('lists and reads the page of a save, and emits the page after each change', async () => {
    const { write, pages, fileOf, session, ctx } = await bench()
    const changed: WorkPageView[] = []
    ctx.on('flowleap-work-pages/changed', (view) => { changed.push(view) })
    await write(structuredSave())
    const [summary] = await pages.list()
    expect(summary).toMatchObject({
      sessionId: session.id, report: OFFICE_ACTION, path: `${OFFICE_ACTION}.work.json`, application: 'EP 4814394',
      communication: 'EPO, European search report', objections: 2, needsReview: 2,
    })
    expect((await pages.read(summary!.id)).file).toEqual(await fileOf())
    const view = await pages.review({ id: summary!.id, objection: '1', state: 'relevant', owner: '  M. Keller ', note: ' Argue. ' })
    expect(view.summary.needsReview).toBe(1)
    expect(changed.map(page => page.summary.needsReview)).toEqual([2, 1])
    expect(changed[1]).toEqual(view)
  })

  it('changes only the review fields, one change after another', async () => {
    const { write, pages, fileOf } = await bench()
    await write(structuredSave())
    const id = (await pages.list())[0]!.id
    await Promise.all([
      pages.review({ id, objection: '1', state: 'done', owner: 'M. Keller ' }),
      pages.review({ id, objection: '1.2', note: 'Amend.' }),
      pages.review({ id, objection: '1', note: 'Argue.' }),
    ])
    const file = await fileOf()
    expect(file.findings).toEqual(FINDINGS)
    expect(file.review).toEqual({
      '1': { state: 'done', owner: 'M. Keller', note: 'Argue.', ground: 'Art. 54 EPC', title: 'Claims 1-7 lack novelty over D1' },
      '1.2': { state: 'needs_review', owner: '', note: 'Amend.', ground: 'Art. 84 EPC', title: 'Clarity of claim 9' },
    })
  })

  it('refuses an invalid request, an unknown page or objection, and a damaged file', async () => {
    const { write, pages, path } = await bench()
    await write(structuredSave())
    const id = (await pages.list())[0]!.id
    expect(await refusal(pages.review({ id, objection: '9', state: 'done' }))).toMatchObject({ code: 'flowleap-work-pages/objection-not-found', details: { objection: '9' } })
    expect(await refusal(pages.review({ id, objection: '1', state: 'argue' } as never))).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'state' } })
    expect(await refusal(pages.review({ id, objection: '1', owner: 'x'.repeat(201) }))).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'owner' } })
    expect(await refusal(pages.review({ id, objection: '1', findings: {} } as never))).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'request' } })
    expect(await refusal(pages.review({ id: 'nothex' as WorkPageId, objection: '1' }))).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'id' } })
    expect(await refusal(pages.review({ id: 'aaaaaaaaaaaaaaaa' as WorkPageId, objection: '1' }))).toMatchObject({ code: 'flowleap-work-pages/not-found' })
    expect(await refusal(pages.read('nothex' as WorkPageId))).toMatchObject({ code: 'flowleap-work-pages/invalid' })
    const file = JSON.parse(await readFile(path, 'utf8')) as WorkPageFile
    await writeFile(path, JSON.stringify({ ...file, review: { '1': file.review['1'] } }))
    expect(await refusal(pages.review({ id, objection: '1', state: 'done' }))).toMatchObject({ code: 'flowleap-work-pages/unreadable', details: { id, reason: 'not a valid work page file' } })
    await writeFile(path, JSON.stringify({ ...file, review: { ...file.review, '1': { ...file.review['1'], title: 'Another title' } } }))
    expect(await refusal(pages.read(id))).toMatchObject({ code: 'flowleap-work-pages/unreadable' })
    expect(await pages.list()).toEqual([])
    await writeFile(path, 'not json')
    const syntax = await refusal(pages.read(id))
    expect(syntax?.code).toBe('flowleap-work-pages/unreadable')
    expect(JSON.stringify(syntax?.details)).toContain('SyntaxError')
    await rm(path)
    expect(await refusal(pages.read(id))).toMatchObject({ code: 'flowleap-work-pages/unreadable', details: { reason: 'FS_NOT_FOUND' } })
  })

  it('hides the pages of a chat that remote access denies the caller', async () => {
    const { write, pages, dir } = await bench(false)
    await write(structuredSave())
    expect(await pages.list()).toEqual([])
    const id = workPageId(workPagePath(join(dir, OFFICE_ACTION)))
    expect(await refusal(pages.read(id))).toMatchObject({ code: 'flowleap-work-pages/not-found' })
    expect(await refusal(pages.review({ id, objection: '1', state: 'done' }))).toMatchObject({ code: 'flowleap-work-pages/not-found' })
  })
})
