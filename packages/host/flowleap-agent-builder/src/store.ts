/**
 * The agent folders on disk: `<root>/<AgentId>/agent.yaml`, `instructions.md` and `files/<name>`. A firm folder is
 * read only; this module writes only below a writable root.
 * @module
 */

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { finished } from 'node:stream/promises'
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
    // Dot folders hold the derived indexes of firm agents.
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
 * Remove one agent folder and everything in it.
 * @param dir - the agent folder.
 */
export async function removeAgentFolder(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

/** The file names in an agent's files folder, sorted; none when the folder is missing. */
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
 * stream, and rename it into place only when the stream ends within the limit.
 * @param target - the final path in the files folder.
 * @param chunks - the request body.
 * @param maxBytes - the limit.
 * @returns the size and hash.
 * @throws FileTooLargeError when the stream passes the limit; the temporary file is removed.
 */
export async function storeUpload(target: string, chunks: AsyncIterable<Uint8Array>, maxBytes: number): Promise<StoredFile> {
  // A dot name keeps the partial file out of listFiles().
  const temporary = join(dirname(target), `.${basename(target)}.${randomBytes(4).toString('hex')}.part`)
  const hash = createHash('sha256')
  const out = createWriteStream(temporary, { flags: 'wx', mode: 0o600 })
  let bytes = 0
  try {
    for await (const chunk of chunks) {
      bytes += chunk.byteLength
      if (bytes > maxBytes) throw new FileTooLargeError(maxBytes)
      hash.update(chunk)
      if (!out.write(chunk)) await new Promise<void>((resolve) => { out.once('drain', () => { resolve() }) })
    }
    out.end()
    await finished(out)
    await rename(temporary, target)
    return { bytes, sha256: hash.digest('hex') }
  } catch (error) {
    out.destroy()
    await rm(temporary, { force: true })
    throw error
  }
}
