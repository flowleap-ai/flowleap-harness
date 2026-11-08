import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FolderSource } from '../src/route.ts'
import { SourceStore } from '../src/sources.ts'

const WORKSPACE = '6f1c2a40-0000-4000-8000-000000000001'
const UPLOAD = { kind: 'upload', at: '2026-11-08T10:00:00.000Z' } as const
const FOLDER = { kind: 'folder', at: '2026-11-08T09:00:00.000Z' } as const

let base: string
let file: string

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-folder-sources-'))
  file = path.join(base, 'sources', `${WORKSPACE}.json`)
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('SourceStore', () => {
  it('reads no source for a workspace that this plugin never wrote into', async () => {
    expect(await new SourceStore(base).read(WORKSPACE)).toEqual(new Map())
  })

  it('records how and when an entry came, in one JSON file for each workspace', async () => {
    const store = new SourceStore(base)
    await store.record(WORKSPACE, 'Inbox', FOLDER)
    await store.record(WORKSPACE, 'Inbox/D1.pdf', UPLOAD)
    expect(await new SourceStore(base).read(WORKSPACE)).toEqual(new Map<string, FolderSource>([['Inbox', FOLDER], ['Inbox/D1.pdf', UPLOAD]]))
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ 'Inbox': FOLDER, 'Inbox/D1.pdf': UPLOAD })
    expect(await store.read('another workspace')).toEqual(new Map())
  })

  it('carries the sources of a moved folder and of everything below it, and leaves a name that only starts the same', async () => {
    const store = new SourceStore(base)
    await store.record(WORKSPACE, 'Inbox', FOLDER)
    await store.record(WORKSPACE, 'Inbox/D1.pdf', UPLOAD)
    await store.record(WORKSPACE, 'Inbox 2/D2.pdf', UPLOAD)
    await store.moved(WORKSPACE, 'Inbox', 'EP 23 171 862/Incoming')
    expect([...(await store.read(WORKSPACE)).keys()].sort()).toEqual(['EP 23 171 862/Incoming', 'EP 23 171 862/Incoming/D1.pdf', 'Inbox 2/D2.pdf'])
  })

  it('reads a damaged record as empty, keeps only valid sources, and replaces it on the next write', async () => {
    const store = new SourceStore(base)
    await mkdir(path.dirname(file), { recursive: true })
    for (const text of ['{"Inbox": ', 'null', '42']) {
      await writeFile(file, text)
      expect(await store.read(WORKSPACE), text).toEqual(new Map())
    }
    await writeFile(file, JSON.stringify({ 'a.pdf': UPLOAD, 'b.pdf': null, 'c.pdf': 'upload', 'd.pdf': { kind: 'mail', at: '' }, 'e.pdf': { kind: 'upload', at: 5 } }))
    expect(await store.read(WORKSPACE)).toEqual(new Map([['a.pdf', UPLOAD]]))
    await writeFile(file, '{"Inbox": ')
    await store.record(WORKSPACE, 'Inbox', FOLDER)
    expect(await store.read(WORKSPACE)).toEqual(new Map([['Inbox', FOLDER]]))
  })

  it('writes the changes of one workspace in order, so no concurrent change is lost', async () => {
    const store = new SourceStore(base)
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.record(WORKSPACE, `D${index}.pdf`, UPLOAD)))
    expect((await store.read(WORKSPACE)).size).toBe(20)
  })

  it('writes the next change after a failed one', async () => {
    const store = new SourceStore(base)
    await writeFile(path.join(base, 'sources'), 'a file where the records folder must be')
    await expect(store.record(WORKSPACE, 'a.pdf', UPLOAD)).rejects.toThrow()
    await rm(path.join(base, 'sources'))
    await store.record(WORKSPACE, 'b.pdf', UPLOAD)
    expect(await store.read(WORKSPACE)).toEqual(new Map([['b.pdf', UPLOAD]]))
  })
})
