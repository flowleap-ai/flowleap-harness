import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { apply, Config, FOLDER_ROUTES, inject, type FolderListing } from '../src/index.ts'
import { SourceStore } from '../src/sources.ts'

const WORKSPACE = '6f1c2a40-0000-4000-8000-000000000001'

let base: string
let root: string
let stateDir: string
let routes: Map<string, ConnectionFetchRoute>
let ctx: Context
let warnings: string[]
let registry: { get: (id: string) => { id: string; path: string } | undefined }

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-folder-routes-'))
  root = path.join(base, 'Syntegon')
  stateDir = path.join(base, 'state')
  await mkdir(path.join(root, 'EP 23 171 862', 'Search'), { recursive: true })
  await writeFile(path.join(root, 'EP 23 171 862', 'Search', 'Search report.md'), '# Search report\n')
  routes = new Map()
  warnings = []
  ctx = new Context()
  ctx.provide('connection', { fetch: { register: (route: ConnectionFetchRoute) => { routes.set(route.path, route); return async () => { routes.delete(route.path) } } } } as never)
  ctx.logger.exporter({ export: (message) => { if (message.type === 'warn') warnings.push(message.args.map((arg: unknown) => String(arg)).join(' ')) } })
  registry = { get: (id: string) => id === WORKSPACE ? { id, path: root } : undefined }
  ctx.provide('workspaceRegistry', registry as never)
})

afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(base, { recursive: true, force: true })
})

async function load(config: Partial<Config> = {}) {
  const fiber = ctx.plugin({ inject, Config, apply }, Config({ stateDir, ...config } as Config))
  await fiber.await()
  return fiber
}

function call(route: string, init: RequestInit & { query?: Record<string, string> } = {}) {
  const query = init.query === undefined ? '' : `?${new URLSearchParams(init.query)}`
  return routes.get(route)!.fetch(new Request(`http://runtime.test${route}${query}`, init))
}

function post(route: string, body: unknown) {
  return call(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

describe('ui-flowleap-folder Host half', () => {
  it('registers the five folder routes and removes them on dispose', async () => {
    const fiber = await load()
    expect([...routes.values()].map(route => [route.path, route.methods, route.requestBody])).toEqual([
      [FOLDER_ROUTES.list, ['GET'], 'buffered'],
      [FOLDER_ROUTES.mkdir, ['POST'], 'buffered'],
      [FOLDER_ROUTES.rename, ['POST'], 'buffered'],
      [FOLDER_ROUTES.move, ['POST'], 'buffered'],
      [FOLDER_ROUTES.upload, ['POST'], 'streaming'],
    ])
    await fiber.dispose()
    expect(routes.size).toBe(0)
  })

  it('needs a state folder and caps uploads at 200 MiB by default', () => {
    expect(() => Config({} as Config)).toThrow()
    expect(Config({ stateDir } as Config)).toMatchObject({ maxEntries: 2000, maxUploadBytes: 200 * 1024 * 1024, storageLowFlagPath: '' })
  })

  it('lists a folder as JSON that is never cached', async () => {
    await load()
    const response = await call(FOLDER_ROUTES.list, { query: { workspace: WORKSPACE, path: 'EP 23 171 862/Search' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const listing = await response.json() as FolderListing
    expect(listing.entries.map(entry => [entry.name, entry.kind, entry.size, entry.source])).toEqual([['Search report.md', 'file', 16, undefined]])
  })

  it('makes a folder and shows it as made here', async () => {
    await load()
    const made = await post(FOLDER_ROUTES.mkdir, { workspace: WORKSPACE, parent: 'EP 23 171 862', name: 'Examination' })
    expect(await made.json()).toEqual({ path: 'EP 23 171 862/Examination' })
    const listing = await (await call(FOLDER_ROUTES.list, { query: { workspace: WORKSPACE, path: 'EP 23 171 862' } })).json() as FolderListing
    expect(listing.entries.find(entry => entry.name === 'Examination')?.source?.kind).toBe('folder')
  })

  it('writes an upload from the request body and shows it as uploaded', async () => {
    await load()
    const uploaded = await call(FOLDER_ROUTES.upload, {
      method: 'POST', body: '%PDF-1.7', query: { workspace: WORKSPACE, dir: 'EP 23 171 862/Search', name: 'D1 DE 20 2022 100 041 U1.pdf' },
    })
    expect(await uploaded.json()).toEqual({ path: 'EP 23 171 862/Search/D1 DE 20 2022 100 041 U1.pdf' })
    expect(await readFile(path.join(root, 'EP 23 171 862', 'Search', 'D1 DE 20 2022 100 041 U1.pdf'), 'utf8')).toBe('%PDF-1.7')
    const sources = await new SourceStore(stateDir).read(WORKSPACE)
    expect(sources.get('EP 23 171 862/Search/D1 DE 20 2022 100 041 U1.pdf')?.kind).toBe('upload')
  })

  it('carries the recorded source along a rename and a move', async () => {
    await load()
    await post(FOLDER_ROUTES.mkdir, { workspace: WORKSPACE, parent: '', name: 'Inbox' })
    await call(FOLDER_ROUTES.upload, { method: 'POST', body: 'x', query: { workspace: WORKSPACE, dir: 'Inbox', name: 'note.md' } })
    expect(await (await post(FOLDER_ROUTES.rename, { workspace: WORKSPACE, path: 'Inbox', name: 'Incoming' })).json()).toEqual({ path: 'Incoming' })
    expect(await (await post(FOLDER_ROUTES.move, { workspace: WORKSPACE, path: 'Incoming/note.md', to: 'EP 23 171 862' })).json()).toEqual({ path: 'EP 23 171 862/note.md' })
    const sources = await new SourceStore(stateDir).read(WORKSPACE)
    expect([...sources.keys()].sort()).toEqual(['EP 23 171 862/note.md', 'Incoming'])
  })

  it('answers each refusal with its code and status, and names nothing of the disk', async () => {
    await load()
    const cases: [Promise<Response>, number, string][] = [
      [call(FOLDER_ROUTES.list, { query: { workspace: 'missing', path: '' } }), 404, 'no-workspace'],
      [call(FOLDER_ROUTES.list, { query: { path: '' } }), 400, 'bad-request'],
      [call(FOLDER_ROUTES.list, { query: { workspace: WORKSPACE, path: '../..' } }), 403, 'outside'],
      [post(FOLDER_ROUTES.mkdir, { workspace: WORKSPACE, parent: 'EP 23 171 862', name: 'Search' }), 409, 'exists'],
      [post(FOLDER_ROUTES.mkdir, { workspace: WORKSPACE, parent: '', name: 'a/b' }), 422, 'invalid-name'],
      [post(FOLDER_ROUTES.move, { workspace: WORKSPACE, path: 'EP 23 171 862', to: 'EP 23 171 862/Search' }), 409, 'into-itself'],
      [call(FOLDER_ROUTES.mkdir, { method: 'POST', body: 'not json' }), 400, 'bad-request'],
      [call(FOLDER_ROUTES.mkdir, { method: 'POST', body: '"text"' }), 400, 'bad-request'],
    ]
    for (const [answer, status, error] of cases) {
      const response = await answer
      expect(response.status, error).toBe(status)
      expect(await response.json()).toEqual({ error })
    }
  })

  it('refuses an upload above the cap and while the disk-low flag exists', async () => {
    const flag = path.join(base, 'disk-low')
    await load({ maxUploadBytes: 3, storageLowFlagPath: flag })
    const big = await call(FOLDER_ROUTES.upload, { method: 'POST', body: 'four', query: { workspace: WORKSPACE, dir: '', name: 'big.pdf' } })
    expect([big.status, await big.json()]).toEqual([413, { error: 'too-large' }])
    await writeFile(flag, '')
    const low = await call(FOLDER_ROUTES.upload, { method: 'POST', body: 'x', query: { workspace: WORKSPACE, dir: '', name: 'x.pdf' } })
    expect([low.status, await low.json()]).toEqual([507, { error: 'storage-low' }])
  })

  it('answers an upload with no body as an empty file', async () => {
    await load()
    const empty = await call(FOLDER_ROUTES.upload, { method: 'POST', query: { workspace: WORKSPACE, dir: '', name: 'empty.txt' } })
    expect(await empty.json()).toEqual({ path: 'empty.txt' })
    expect(await readFile(path.join(root, 'empty.txt'), 'utf8')).toBe('')
  })

  it('answers an unexpected fault with 500, logs it, and names nothing of it', async () => {
    await load()
    await writeFile(path.join(stateDir), 'a file where the state folder must be')
    const response = await post(FOLDER_ROUTES.mkdir, { workspace: WORKSPACE, parent: '', name: 'New' })
    expect([response.status, await response.json()]).toEqual([500, { error: 'internal' }])
    expect(warnings).toHaveLength(1)
  })

  it('lists the client folder itself when the request names no folder', async () => {
    await load()
    const listing = await (await call(FOLDER_ROUTES.list, { query: { workspace: WORKSPACE } })).json() as FolderListing
    expect(listing).toMatchObject({ path: '', entries: [{ name: 'EP 23 171 862', kind: 'directory' }] })
  })

  it('logs a fault that is not an error object, and answers 500', async () => {
    registry.get = () => { throw 'registry closed' }
    await load()
    const response = await call(FOLDER_ROUTES.list, { query: { workspace: WORKSPACE, path: '' } })
    expect([response.status, await response.json()]).toEqual([500, { error: 'internal' }])
    expect(warnings).toEqual(['ui-flowleap-folder: registry closed'])
  })
})
