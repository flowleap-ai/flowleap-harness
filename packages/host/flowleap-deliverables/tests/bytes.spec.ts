/**
 * The guarded byte write: a target outside the working directory is refused by
 * the fence; a filesystem whose host-path mapping does not round-trip (remote,
 * SSH, a sandbox) is refused with the local-workspace sentence before any
 * write; the local filesystem writes the bytes atomically with the document
 * mode.
 */

import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DOCUMENT_MODE, hostPathOf, LOCAL_WORKSPACE_NEEDED, writeWorkspaceBytes, type BytesFileSystem } from '../src/bytes.ts'

let dir: string
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-bytes-')))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function localFs() {
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  return ctx.fs
}

describe('writeWorkspaceBytes', () => {
  it('writes the bytes of a target inside the working directory through the host path, creating the folder, with the document mode', async () => {
    const fs = await localFs()
    const root = await fs.resolve(dir)
    const target = await fs.resolve('drafting/hinge/draft-application.claims.docx', { cwd: dir })
    await writeWorkspaceBytes(fs, root, target, new Uint8Array([0x50, 0x4b, 3, 4]))
    const path = join(dir, 'drafting/hinge/draft-application.claims.docx')
    // The umask narrows the stated mode; the owner's read-write bits stay and no bit outside the mode appears.
    const mode = process.platform === 'win32' ? DOCUMENT_MODE : (await stat(path)).mode & 0o777
    expect({
      hostPath: await hostPathOf(fs, target),
      bytes: [...await readFile(path)],
      ownerReadWrite: (mode & 0o600) === 0o600,
      widerThanDocument: mode & ~DOCUMENT_MODE,
    }).toEqual({ hostPath: path, bytes: [0x50, 0x4b, 3, 4], ownerReadWrite: true, widerThanDocument: 0 })
  })

  it('refuses a target outside the working directory before any write', async () => {
    const fs = await localFs()
    const root = await fs.resolve(join(dir, 'inner'))
    const target = await fs.resolve(join(dir, 'outside.docx'))
    await expect(writeWorkspaceBytes(fs, root, target, new Uint8Array([1]))).rejects.toThrow('Binary writes must stay within the working directory')
    await expect(stat(join(dir, 'outside.docx'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a filesystem whose host-path mapping does not round-trip', async () => {
    const local = await localFs()
    const target = await local.resolve(join(dir, 'remote.docx'))
    const unmapped: BytesFileSystem = {
      contains: () => true,
      processPath: (t: FsTarget) => local.processPath(t),
      processPathFromHostPath: () => undefined,
      resolve: (path, opts) => local.resolve(path, opts),
    }
    const elsewhere: BytesFileSystem = {
      ...unmapped,
      // The host path maps, but to another file: the same path in a different world.
      processPathFromHostPath: () => join(dir, 'other.docx'),
    }
    await expect(writeWorkspaceBytes(unmapped, target, target, new Uint8Array([1]))).rejects.toThrow(LOCAL_WORKSPACE_NEEDED)
    await expect(writeWorkspaceBytes(elsewhere, target, target, new Uint8Array([1]))).rejects.toThrow(LOCAL_WORKSPACE_NEEDED)
    await expect(stat(join(dir, 'remote.docx'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
