import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeClientFolder } from '../src/add-client/client-folder.ts'
import { ClientFolder } from '../src/folder.ts'
import { sourceStore } from '../src/sources.ts'

// A folder whose writes fail with EACCES: `chmod` locks no folder on Windows, so the disk fault is made here.
const locked = vi.hoisted(() => ({ folder: undefined as string | undefined }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const paths = await import('node:path')
  const denied = (target: unknown) => locked.folder !== undefined && paths.dirname(String(target)) === locked.folder
    ? Promise.reject(Object.assign(new Error(`EACCES: permission denied, ${String(target)}`), { code: 'EACCES' }))
    : undefined
  return {
    ...actual,
    mkdir: (...args: Parameters<typeof actual.mkdir>) => denied(args[0]) ?? actual.mkdir(...args),
    writeFile: (...args: Parameters<typeof actual.writeFile>) => denied(args[0]) ?? actual.writeFile(...args),
  }
})

let base: string

beforeEach(async () => { base = await mkdtemp(path.join(tmpdir(), 'flowleap-folder-writes-')) })
afterEach(async () => { await rm(base, { recursive: true, force: true }) })

describe('ClientFolder writes of Add client', () => {
  it('makes or uses a folder, refuses a file in its place, and writes a new file only', async () => {
    const root = path.join(base, 'Client')
    await mkdir(root)
    const folder = await ClientFolder.at(root)
    expect(await folder.ensure('', 'Office')).toEqual({ path: 'Office', made: true })
    expect(await folder.ensure('', 'Office')).toEqual({ path: 'Office', made: false })
    await writeFile(path.join(root, 'note'), 'x')
    await expect(folder.ensure('', 'note')).rejects.toMatchObject({ code: 'not-directory' })
    await expect(folder.ensure('', 'Trash')).resolves.toMatchObject({ made: true })
    await expect(folder.ensure('Trash', 'x')).rejects.toMatchObject({ code: 'in-trash' })
    expect(await folder.writeNew('Office', 'a.md', 'one')).toBe('Office/a.md')
    await expect(folder.writeNew('Office', 'a.md', 'two')).rejects.toMatchObject({ code: 'exists' })
    await expect(folder.writeNew('Trash', 'a.md', 'two')).rejects.toMatchObject({ code: 'in-trash' })
    expect(await readFile(path.join(root, 'Office', 'a.md'), 'utf8')).toBe('one')
  })

  it('passes on a disk fault that is not a taken name', async () => {
    const root = path.join(base, 'Client')
    await mkdir(root)
    const folder = await ClientFolder.at(root)
    await rm(root, { recursive: true })
    await expect(folder.ensure('', 'Office')).rejects.toMatchObject({ code: 'not-found' })
    await mkdir(root)
    await mkdir(path.join(root, 'Office'))
    locked.folder = await realpath(path.join(root, 'Office'))
    try {
      await expect(folder.ensure('Office', 'Sub')).rejects.toMatchObject({ code: 'EACCES' })
      await expect(folder.writeNew('Office', 'a.md', 'x')).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      locked.folder = undefined
    }
  })
})

describe('the client folder of Add client', () => {
  const plan = (clientsRoot: string) => ({
    request: { clientId: 'c', name: 'Syntegon', names: [] }, clientsRoot, template: ['00 Client'], sources: sourceStore(path.join(base, 'state')),
    createWorkspace: async () => ({ id: 'ws-1' }), now: () => new Date(),
  })

  it('refuses a link in the place of the client folder, and writes nothing through it', async () => {
    const clientsRoot = path.join(base, 'Clients')
    const elsewhere = path.join(base, 'Elsewhere')
    await mkdir(clientsRoot)
    await mkdir(elsewhere)
    await symlink(elsewhere, path.join(clientsRoot, 'Syntegon'))
    await expect(makeClientFolder(plan(clientsRoot))).rejects.toMatchObject({ code: 'outside' })
    expect(await readdir(elsewhere)).toEqual([])
  })

  it('passes on a disk fault of the About file', async () => {
    const clientsRoot = path.join(base, 'Clients')
    await mkdir(path.join(clientsRoot, 'Syntegon'), { recursive: true })
    locked.folder = await realpath(path.join(clientsRoot, 'Syntegon'))
    try {
      await expect(makeClientFolder({ ...plan(clientsRoot), template: [] })).rejects.toMatchObject({ code: 'EACCES' })
    } finally {
      locked.folder = undefined
    }
  })
})
