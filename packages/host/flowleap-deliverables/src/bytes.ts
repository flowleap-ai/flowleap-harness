/**
 * The one binary write of this plugin. `ctx.fs` writes UTF-8 text only
 * (`writeText`), so a Word file goes through the host filesystem: the target
 * is resolved and fenced through `ctx.fs`, its process path is taken as the
 * host path only when `processPathFromHostPath()` maps it back to the same
 * file (the rule `ui-deliverables` uses before a native open), and the bytes
 * are then published atomically with `dsh-atomic-write`. A filesystem without
 * that mapping (remote, SSH, a sandbox) gets a plain refusal instead of a
 * write into the wrong world. Port plan S5, section 5 "Binary writes".
 * @module
 */

import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'

/** The refusal when the workspace is not the host filesystem. */
export const LOCAL_WORKSPACE_NEEDED = 'Word export needs a local workspace: this session\'s filesystem is not the host filesystem, so no .docx file can be written.'

/** The permission bits of a written document: owner read-write, group and others read, under the umask. */
export const DOCUMENT_MODE = 0o644

/** The part of the filesystem contract the byte write reads: fence, mapping and resolution. */
export type BytesFileSystem = Pick<FileSystem, 'contains' | 'processPath' | 'processPathFromHostPath' | 'resolve'>

/**
 * The host path of a workspace target when the host and the execution world share it.
 * @param fs - the session filesystem.
 * @param target - the resolved target.
 * @param signal - aborts the round-trip resolution.
 * @returns the host path, or `undefined` when the mapping does not round-trip.
 */
export async function hostPathOf(fs: BytesFileSystem, target: FsTarget, signal?: AbortSignal): Promise<string | undefined> {
  const processPath = fs.processPath(target)
  const mapped = fs.processPathFromHostPath(processPath)
  if (mapped === undefined) return undefined
  const back = fs.processPath(await fs.resolve(mapped, signal === undefined ? {} : { signal }))
  return back === processPath ? processPath : undefined
}

/**
 * Write bytes to a target inside the working directory through the host filesystem.
 * @param fs - the session filesystem.
 * @param root - the working directory target.
 * @param target - the file to write, resolved through `fs`.
 * @param bytes - the complete file content.
 * @param signal - aborts the host-path check; the atomic write itself is not interruptible.
 * @throws an `Error` naming the fence or {@link LOCAL_WORKSPACE_NEEDED}.
 */
export async function writeWorkspaceBytes(
  fs: BytesFileSystem, root: FsTarget, target: FsTarget, bytes: Uint8Array, signal?: AbortSignal,
): Promise<void> {
  if (!fs.contains(root, target)) {
    throw new Error(`Binary writes must stay within the working directory ${root.displayPath}.`)
  }
  const hostPath = await hostPathOf(fs, target, signal)
  if (hostPath === undefined) {
    throw new Error(LOCAL_WORKSPACE_NEEDED)
  }
  await writeFileAtomic(hostPath, bytes, { mode: DOCUMENT_MODE })
}
