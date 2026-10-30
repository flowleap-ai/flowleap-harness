/**
 * The index of the work pages: the entries in memory, their copy into the storage table once storage opens, the list
 * order, and the save over a filesystem whose write fails.
 */

import { describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { FsError } from '@deepseek-ai/dsh-fs'
import { SessionId } from '@deepseek-ai/dsh-session'
import { memoryIndex, WorkPages, workPageId, workPagesDomainSpec, type WorkPageId } from '../src/index.ts'
import { FINDINGS } from './work-page-fixtures.ts'

/** A filesystem in memory with the part of the contract that the work pages use. */
function memoryFs() {
  const files = new Map<string, string>()
  return {
    files,
    resolve: async (path: string) => ({ path }) as never,
    readText: async (target: { path: string }) => {
      const text = files.get(target.path)
      if (text === undefined) throw new FsError(`no file ${target.path}`, 'FS_NOT_FOUND')
      return text
    },
    writeText: async (target: { path: string }, text: string) => { files.set(target.path, text); return {} as never },
  }
}

const chat = SessionId('chat')

describe('work page index', () => {
  it('validates a stored entry', () => {
    const savedAt = '2026-10-29T09:00:00.000Z'
    expect(workPagesDomainSpec.tables.pages.valueSchema.parse({ path: '/w/a.md.work.json', report: 'a.md', sessionId: 'chat', savedAt }))
      .toEqual({ path: '/w/a.md.work.json', report: 'a.md', sessionId: chat, savedAt })
  })

  it('copies the pages in memory into storage once storage opens, and goes back to memory without it', async () => {
    const fs = memoryFs()
    fs.files.set('/w/a.md.work.json', 'not json')
    const changed = vi.fn()
    let hour = 10
    const pages = new WorkPages(fs as never, changed, () => new Date(`2026-10-29T${String(hour++)}:00:00.000Z`))
    await pages.save({ reportPath: '/w/z.md', displayPath: 'z.md', findings: FINDINGS, sessionId: chat })
    const table = memoryIndex()
    const kept = brandString<WorkPageId>('bbbbbbbbbbbbbbbb')
    await table.put(kept, { path: '/w/b.md.work.json', report: 'b.md', sessionId: chat, savedAt: '2026-10-29T09:00:00.000Z' })
    await pages.attach(table)
    const older = workPageId('/w/a.md.work.json')
    const newer = workPageId('/w/z.md.work.json')
    expect([...table.entries()].map(([key]) => key).sort()).toEqual([kept, newer].sort())
    await pages.save({ reportPath: '/w/a.md', displayPath: 'a.md', findings: FINDINGS, sessionId: chat })
    await pages.attach(table)
    expect((await pages.list(() => true)).map(page => page.id)).toEqual([older, newer])
    await pages.attach(undefined)
    expect(await pages.list(() => true)).toEqual([])
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('names a single objection, and passes the failure of a read or a write to the caller', async () => {
    const fs = memoryFs()
    const pages = new WorkPages(fs as never, () => {})
    const one = { ...FINDINGS, objections: [FINDINGS.objections[0]!], comparison: [] }
    expect((await pages.save({ reportPath: '/w/one.md', displayPath: 'one.md', findings: one, sessionId: chat })).text)
      .toContain('Work page: one.md.work.json holds the 1 objection of this analysis')
    const failing = new WorkPages({ ...fs, writeText: async () => { throw new Error('disk full') } } as never, () => {})
    await expect(failing.save({ reportPath: '/w/c.md', displayPath: 'c.md', findings: FINDINGS, sessionId: chat })).rejects.toThrow('disk full')
    const locked = new WorkPages({ ...fs, readText: async () => { throw new Error('locked') } } as never, () => {})
    await expect(locked.save({ reportPath: '/w/c.md', displayPath: 'c.md', findings: FINDINGS, sessionId: chat }))
      .rejects.toThrow('the previous work page file cannot be read (locked), so it stays as it is with its review fields')
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a failure that is not an Error is the case under test
    const odd = new WorkPages({ ...fs, readText: () => Promise.reject('EBUSY') } as never, () => {})
    await expect(odd.save({ reportPath: '/w/c.md', displayPath: 'c.md', findings: FINDINGS, sessionId: chat })).rejects.toThrow('(EBUSY)')
  })
})
