/**
 * The OfficeCLI provider row of `ctx.flowleapOffice`. At load it checks the configured binary: its SHA-256 and its
 * `--version` output must equal the configured values, or the row fails. Then it provides the service. The binary runs
 * only through this row, with the environment and the arguments of the runner; the attorney's PATH never holds it.
 *
 * See packages/host/flowleap-office/README.md.
 * @module @deepseek-ai/dsh-flowleap-office/officecli
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '../types.ts'
import type { ChartLook } from './batch.ts'
import { OfficeCliProvider } from './provider.ts'
import { OfficeCliRunner, type OfficeRunnerOptions } from './runner.ts'

export {
  cleanClaimsItems, cleanText, chartItems, columnName, FIRST_SHEET, letterItems, markedClaimsItems, rowPoints, serializeBatch,
  wordText, xmlAttribute,
} from './batch.ts'
export type { BatchItem, BatchJson, ChartLook, Revision } from './batch.ts'
export { argvOf, refuseUrls } from './command.ts'
export type { OfficeCommand, OfficeCommandKind } from './command.ts'
export { checkAmend, OfficeCliProvider, selectors, wordReadText } from './provider.ts'
export type { OfficeCliProviderOptions } from './provider.ts'
export { failureText, officeEnvironment, OfficeCliRunner, spawnEnvironment } from './runner.ts'
export type { OfficeReply, OfficeRunnerOptions } from './runner.ts'

/** Cordis plugin name. */
export const name = 'flowleap-office-officecli'

/** The subprocess seam spawns the binary. */
export const inject = ['subprocess']

/** Plugin config. */
export interface Config {
  /** Absolute path of the pinned OfficeCLI binary. */
  binaryPath: string
  /** The version the binary must print for `--version`, for example `1.0.160`. */
  version: string
  /** The SHA-256 of the binary as 64 lowercase hex digits. */
  sha256: string
  /** Absolute folder for the binary's `HOME`, its state, and the per-operation folders; several runtimes may share it. */
  stateDir: string
  /** Milliseconds one OfficeCLI call may take. */
  timeoutMs: number
  /** Most stdout bytes one OfficeCLI call may write. */
  maxOutputBytes: number
  /** Word table style of every letter table, as the firm template defines it; `''` for none. */
  tableStyle: string
  /** Claim chart widths and header colors. */
  chart: ChartLook
}

const HEX_COLOR = /^[0-9A-Fa-f]{6}$/u

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  binaryPath: z.string().required(),
  version: z.string().pattern(/^\d+\.\d+\.\d+$/u).required(),
  sha256: z.string().pattern(/^[0-9a-f]{64}$/u).required(),
  stateDir: z.string().required(),
  timeoutMs: z.number().step(1).min(1000).max(600_000).default(60_000),
  maxOutputBytes: z.number().step(1).min(1024).max(64 * 1024 * 1024).default(4 * 1024 * 1024),
  tableStyle: z.string().default(''),
  chart: z.object({
    featureColumnWidth: z.number().min(1).max(255).default(10),
    textColumnWidth: z.number().min(1).max(255).default(40),
    headerFill: z.string().pattern(HEX_COLOR).default('1F3A5F'),
    headerFontColor: z.string().pattern(HEX_COLOR).default('FFFFFF'),
  }),
})

/**
 * The SHA-256 of a file.
 * @param path - absolute file path.
 * @returns 64 lowercase hex digits.
 */
export async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/**
 * Whether the process with this id has ended. A probe that the operating system refuses for another user (`EPERM`)
 * shows a running process.
 * @param pid - a process id.
 * @returns true when no such process exists.
 */
function ended(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

/**
 * Remove the folders of runtimes that ended. Each runtime owns `<calls>/<pid>-<random>`; the folders of an ended
 * runtime hold client documents that a crash left behind. A folder without a process id in its name is not of a
 * running runtime of this version, so it goes too.
 * @param calls - the `calls` folder of the state folder.
 */
async function removeEndedRuntimes(calls: string): Promise<void> {
  for (const folder of await readdir(calls)) {
    const pid = /^(\d+)-/u.exec(folder)?.[1]
    if (pid === undefined || ended(Number(pid))) await rm(join(calls, folder), { recursive: true, force: true })
  }
}

/**
 * Check the binary and provide `ctx.flowleapOffice`.
 * @param ctx - the row context, carrying `subprocess`.
 * @param config - binary, folders, bounds, and formats.
 * @throws when a path is not absolute, the binary's SHA-256 or version differs from the config, or `--version` fails.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!isAbsolute(config.binaryPath)) throw new Error(`flowleap-office: binaryPath must be absolute, got "${config.binaryPath}"`)
  if (!isAbsolute(config.stateDir)) throw new Error(`flowleap-office: stateDir must be absolute, got "${config.stateDir}"`)
  const sha256 = await fileSha256(config.binaryPath)
  if (sha256 !== config.sha256) {
    throw new Error(`flowleap-office: ${config.binaryPath} has SHA-256 ${sha256}, not the configured ${config.sha256}`)
  }
  const home = join(config.stateDir, 'home')
  const state = join(config.stateDir, 'state')
  const allCalls = join(config.stateDir, 'calls')
  await Promise.all([home, state, allCalls].map(dir => mkdir(dir, { recursive: true })))
  await removeEndedRuntimes(allCalls)
  const callsDir = await mkdtemp(join(allCalls, `${String(process.pid)}-`))
  ctx.effect(() => () => rm(callsDir, { recursive: true, force: true }), 'flowleap-office: call folder')
  const options: OfficeRunnerOptions = {
    binaryPath: config.binaryPath, home, stateDir: state, timeoutMs: config.timeoutMs, maxOutputBytes: config.maxOutputBytes,
  }
  const runner = new OfficeCliRunner(ctx.subprocess, options)
  const probe = await mkdtemp(join(callsDir, 'version-'))
  try {
    const result = await runner.run({ kind: 'version' }, probe, AbortSignal.timeout(config.timeoutMs))
    const printed = result.stdout.trim()
    if (result.exitCode !== 0 || printed !== config.version) {
      throw new Error(`flowleap-office: ${config.binaryPath} --version printed "${printed}" (exit ${String(result.exitCode)}), not ${config.version}`)
    }
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
  ctx.plugin(OfficeCliProvider, { runner, callsDir, tableStyle: config.tableStyle, chart: config.chart })
}
