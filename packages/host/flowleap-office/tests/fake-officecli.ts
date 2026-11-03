/**
 * A scripted stand-in for the OfficeCLI child behind the subprocess seam. Each spawn records its argv, env, and cwd,
 * the batch JSON it was given, and answers through a responder that may write files into the call folder.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SubprocessHandle, SubprocessRuntime, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'

/** One recorded spawn. */
export interface Spawned {
  readonly argv: readonly string[]
  readonly env: NodeJS.ProcessEnv
  readonly cwd: string
  /** The parsed `--input` file of a batch call. */
  readonly batch?: unknown
}

/** What a responder returns for one call. */
export interface Reply {
  readonly exitCode?: number | null
  readonly stdout?: string
  readonly stderr?: string
  /** Stdout exceeded its cap. */
  readonly lossy?: boolean
  /** Never settle until the signal aborts. */
  readonly hang?: boolean
  /** `done` rejects. */
  readonly spawnError?: Error
}

/** Answers one call; `args` excludes the binary path. */
export type Responder = (args: readonly string[], cwd: string) => Reply

/** A JSON success reply. */
export function ok(data: unknown = 'done'): Reply {
  return { exitCode: 0, stdout: JSON.stringify({ success: true, data }) }
}

/** A JSON failure reply. */
export function fail(error: string): Reply {
  return { exitCode: 1, stdout: JSON.stringify({ success: false, error: { error, code: 'internal_error' } }) }
}

/** Write a file into the call folder. */
export function put(cwd: string, file: string, text: string): void {
  writeFileSync(join(cwd, file), text)
}

/**
 * The default responder: every call succeeds; `create`, `merge`, and `batch` write a marker into their output file so
 * the provider reads bytes back.
 */
export const succeed: Responder = (args, cwd) => {
  const [verb] = args
  if (verb === 'create') put(cwd, args[1] ?? '', 'created')
  if (verb === 'merge') put(cwd, args[2] ?? '', 'merged')
  if (verb === 'batch') put(cwd, args[1] ?? '', `${readFileSync(join(cwd, args[1] ?? '')).toString()}+batch`)
  if (verb === 'merge') return ok({ unresolvedPlaceholders: [] })
  if (verb === 'validate') return ok({ count: 0, errors: [] })
  if (verb === 'query') return ok({ results: [] })
  if (verb === 'view') return ok(args[2] === 'outline' ? { headings: [], sheets: [] } : { elements: [], sheets: [] })
  return ok()
}

/** A fake subprocess seam over a responder. */
export class FakeSubprocess implements Pick<SubprocessRuntime, 'spawn'> {
  readonly spawned: Spawned[] = []

  constructor(public responder: Responder = succeed) {}

  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const args = spec.argv.slice(1)
    const inputAt = args.indexOf('--input')
    const batch = inputAt === -1 ? undefined : JSON.parse(readFileSync(join(spec.cwd, args[inputAt + 1] ?? '')).toString()) as unknown
    this.spawned.push({ argv: spec.argv, env: spec.env ?? {}, cwd: spec.cwd, ...(batch === undefined ? {} : { batch }) })
    const reply = this.responder(args, spec.cwd)
    const reader = (text: string, lossy: boolean) => ({ readFrom: () => ({ text, nextOffset: text.length, lossy }) })
    const done = reply.spawnError !== undefined
      ? Promise.reject(reply.spawnError)
      : reply.hang === true
        ? new Promise<{ exitCode: number | null; signal: null }>((resolve) => {
          spec.signal?.addEventListener('abort', () => { resolve({ exitCode: null, signal: null }) }, { once: true })
        })
        : Promise.resolve({ exitCode: reply.exitCode ?? 0, signal: null })
    return {
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      control: undefined,
      collected: { stdout: reader(reply.stdout ?? '', reply.lossy ?? false), stderr: reader(reply.stderr ?? '', false) },
      done,
      terminate: () => {},
      waitForExit: () => Promise.resolve(true),
    }
  }

  /** The argv of every call, without the binary path. */
  calls(): string[][] {
    return this.spawned.map(entry => entry.argv.slice(1))
  }
}
