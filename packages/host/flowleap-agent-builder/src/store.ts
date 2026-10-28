/**
 * The agent folders on disk: `<root>/<AgentId>/agent.yaml`, `instructions.md` and `files/<name>`. A firm folder is
 * read only; this module writes only below a writable root.
 * @module
 */

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { finished, pipeline } from 'node:stream/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { brandString } from '@deepseek-ai/dsh-brand'
import { isAgentId, parseAgentYaml, renderAgentYaml, type AgentDefinition } from './definition.ts'
import type { AgentId } from './types.ts'

/** Name of the definition file. */
export const AGENT_YAML = 'agent.yaml'
/** Name of the instructions file. */
export const INSTRUCTIONS_MD = 'instructions.md'
/** Name of the files folder. */
export const FILES_DIR = 'files'
/** Name of the index file. */
export const INDEX_SQLITE = 'index.sqlite'

/** One agent folder as read from disk. */
export interface AgentFolder {
  /** The folder name. */
  readonly id: AgentId
  /** The folder path. */
  readonly dir: string
  /** True for a firm agent. */
  readonly readOnly: boolean
  /** The `agent.yaml` fields. */
  readonly definition: AgentDefinition
  /** The `instructions.md` text. */
  readonly instructions: string
}

/** A folder that could not be read, with the reason. */
export interface AgentFolderProblem {
  /** The folder path. */
  readonly dir: string
  /** What is wrong. */
  readonly message: string
}

/**
 * Read every agent folder below a root. A missing root has no agents.
 * @param root - the agents root.
 * @param readOnly - whether the root is the firm folder.
 * @returns the agents, and the folders that are not agents, each with the reason.
 */
export async function readAgentFolders(
  root: string, readOnly: boolean,
): Promise<{ agents: AgentFolder[]; problems: AgentFolderProblem[] }> {
  let entries: string[]
  try {
    entries = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { agents: [], problems: [] }
    throw error
  }
  const agents: AgentFolder[] = []
  const problems: AgentFolderProblem[] = []
  for (const name of entries) {
    // Dot folders hold the derived indexes of firm agents and deleted agents not yet removed.
    if (name.startsWith('.')) continue
    const dir = join(root, name)
    if (!isAgentId(name)) {
      problems.push({ dir, message: 'the folder name is not an agent id (lower-case letters, digits and hyphens)' })
      continue
    }
    try {
      const definition = parseAgentYaml(await readFile(join(dir, AGENT_YAML), 'utf8'))
      const instructions = await readFile(join(dir, INSTRUCTIONS_MD), 'utf8')
      agents.push({ id: brandString<AgentId>(name), dir, readOnly, definition, instructions })
    } catch (error) {
      problems.push({ dir, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { agents, problems }
}

/**
 * Write the definition and the instructions of one agent, each file atomically, and create its files folder.
 * @param dir - the agent folder.
 * @param definition - the `agent.yaml` fields.
 * @param instructions - the instructions text.
 */
export async function writeAgentFolder(dir: string, definition: AgentDefinition, instructions: string): Promise<void> {
  await mkdir(join(dir, FILES_DIR), { recursive: true, mode: 0o700 })
  await writeFileAtomic(join(dir, AGENT_YAML), renderAgentYaml(definition), { mode: 0o600, dirMode: 0o700 })
  await writeFileAtomic(join(dir, INSTRUCTIONS_MD), instructions, { mode: 0o600, dirMode: 0o700 })
}

/**
 * Move one agent folder aside to a dot name in the same root, in one rename. A dot folder is not an agent, so the
 * rename is the point where the agent is gone from disk; a failed rename leaves the folder as it was.
 * @param dir - the agent folder.
 * @returns the moved folder, which the caller removes.
 */
export async function moveAgentFolderAside(dir: string): Promise<string> {
  const aside = join(dirname(dir), `.deleted-${basename(dir)}-${randomBytes(4).toString('hex')}`)
  await rename(dir, aside)
  return aside
}

/**
 * The file names in an agent's files folder, sorted; dot names (partial uploads) are left out.
 * @param dir - the agent folder.
 * @returns the names; none when the folder is missing.
 */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(join(dir, FILES_DIR), { withFileTypes: true }))
      .filter(entry => entry.isFile() && !entry.name.startsWith('.')).map(entry => entry.name).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

/** Size and SHA-256 of one stored file. */
export interface StoredFile {
  /** Size in bytes. */
  readonly bytes: number
  /** SHA-256 hex of the content. */
  readonly sha256: string
}

/**
 * Hash one stored file.
 * @param path - the file.
 * @returns its size and hash.
 */
export async function hashFile(path: string): Promise<StoredFile> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  stream.on('data', (chunk) => { hash.update(chunk) })
  await finished(stream)
  return { bytes: (await stat(path)).size, sha256: hash.digest('hex') }
}

/** The upload is larger than the limit. */
export class FileTooLargeError extends Error {
  /** @param limit - the limit in bytes. */
  constructor(readonly limit: number) {
    super(`the file is larger than ${String(limit)} bytes`)
  }
}

/**
 * Store one uploaded file: write the stream to a temporary sibling, count the bytes against the limit over the whole
 * stream, and rename it into place only when the stream ends within the limit. The files folder is created when it is
 * missing. A write failure (for example a full disk) rejects; it never escapes as an unhandled stream error.
 * @param target - the final path in the files folder.
 * @param chunks - the request body.
 * @param maxBytes - the limit.
 * @returns the size and hash.
 * @throws FileTooLargeError when the stream passes the limit; the temporary file is removed on every failure.
 */
export async function storeUpload(target: string, chunks: AsyncIterable<Uint8Array>, maxBytes: number): Promise<StoredFile> {
  // A dot name keeps the partial file out of listFiles().
  const temporary = join(dirname(target), `.${basename(target)}.${randomBytes(4).toString('hex')}${PART_SUFFIX}`)
  const hash = createHash('sha256')
  let bytes = 0
  let out: WriteStream | undefined
  try {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    out = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
    await pipeline(chunks, async function* (source: AsyncIterable<Uint8Array>) {
      for await (const chunk of source) {
        bytes += chunk.byteLength
        if (bytes > maxBytes) throw new FileTooLargeError(maxBytes)
        hash.update(chunk)
        yield chunk
      }
    }, out)
    await rename(temporary, target)
    return { bytes, sha256: hash.digest('hex') }
  } catch (error) {
    // pipeline destroys the stream, but its file open can still be pending; remove the file only after the stream closed.
    const stream = out
    // events.once would reject on the stream's own 'error' event, which pipeline already reported.
    if (stream !== undefined && !stream.closed) await new Promise<void>((resolve) => { stream.once('close', () => { resolve() }) })
    await rm(temporary, { force: true })
    throw error
  }
}

/** Suffix of a partial upload; with the leading dot and 8 hex digits, a temporary name is 15 bytes longer than its file. */
export const PART_SUFFIX = '.part'
