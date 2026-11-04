/**
 * The one place this package spawns a child, OfficeCLI or the network probe: through `ctx.subprocess`, confined by
 * `ctx.sandbox`, with arguments from {@link argvOf}, a fixed environment, a deadline, and an output cap. The child gets
 * no ambient environment entry: each one is removed, and only the entries of {@link officeEnvironment} are set, so no
 * update check, no automatic install, no background resident process, and no state outside the provider's folders.
 * @module
 */

import { createServer, type AddressInfo } from 'node:net'
import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { z } from 'zod'
import { FlowleapOfficeError } from '../error.ts'
import { argvOf, type OfficeCommand } from './command.ts'

/** Milliseconds the child gets to exit after termination starts; a fixed lifecycle constant. */
const TERMINATE_GRACE_MS = 2_000
/** Retained stderr tail for failure messages. */
const STDERR_TAIL_BYTES = 16 * 1024
/** Exit code of {@link NETWORK_PROBE} when its connection fails. */
const PROBE_BLOCKED = 3
/**
 * Node program run by {@link OfficeCliRunner.probeNetwork}: exit 0 when a TCP connection to port `argv[1]` on loopback
 * opens, {@link PROBE_BLOCKED} when it fails.
 */
const NETWORK_PROBE = "const s = require('node:net').connect(Number(process.argv[1]), '127.0.0.1'); "
  + `s.on('connect', () => process.exit(0)); s.on('error', () => process.exit(${String(PROBE_BLOCKED)}))`

/** The resolved facts every call runs under. */
export interface OfficeRunnerOptions {
  /** Absolute path of the verified binary. */
  readonly binaryPath: string
  /** Absolute `HOME` of the child. */
  readonly home: string
  /** Absolute `OFFICECLI_STATE_DIR` of the child. */
  readonly stateDir: string
  /** Absolute folder that holds `home`, `stateDir`, and every call folder; the only folder the child may write. */
  readonly writableRoot: string
  /** Milliseconds before a call is terminated. */
  readonly timeoutMs: number
  /** Most stdout bytes a call may write. */
  readonly maxOutputBytes: number
}

/**
 * The complete environment of one call.
 * @param options - the folders of the provider.
 * @param callDir - the private folder of the call, also its `TMPDIR`.
 * @returns the fixed entries.
 */
export function officeEnvironment(options: Pick<OfficeRunnerOptions, 'home' | 'stateDir'>, callDir: string): Readonly<Record<string, string>> {
  return {
    HOME: options.home,
    OFFICECLI_STATE_DIR: options.stateDir,
    OFFICECLI_SKIP_UPDATE: '1',
    OFFICECLI_NO_AUTO_INSTALL: '1',
    OFFICECLI_NO_AUTO_RESIDENT: '1',
    TMPDIR: callDir,
  }
}

/**
 * The environment passed to the subprocess seam: every ambient name removed, then the fixed entries.
 * @param fixed - the fixed entries.
 * @param ambient - the names the subprocess provider would otherwise pass on.
 * @returns tombstones for the ambient names and the fixed values.
 */
export function spawnEnvironment(fixed: Readonly<Record<string, string>>, ambient: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of Object.keys(ambient)) env[name] = undefined
  return { ...env, ...fixed }
}

/** OfficeCLI's JSON reply. */
const Envelope = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  message: z.string().optional(),
  error: z.object({ error: z.string(), code: z.string().optional() }).optional(),
})

/** OfficeCLI's JSON reply of one call. */
export type OfficeReply = z.infer<typeof Envelope>

/** Runs OfficeCLI calls. */
export class OfficeCliRunner {
  /**
   * @param subprocess - the subprocess seam.
   * @param sandbox - the sandbox seam; its row decides the network access of the child.
   * @param options - binary, folders, and bounds.
   */
  constructor(
    private readonly subprocess: Pick<SubprocessRuntime, 'spawn'>,
    private readonly sandbox: Pick<SandboxProvider, 'confine'>,
    private readonly options: OfficeRunnerOptions,
  ) {}

  /**
   * Run one call to completion.
   * @param command - the call.
   * @param callDir - the private folder of the call; its working directory and `TMPDIR`.
   * @param signal - caller cancellation.
   * @returns the exit code and stdout; a nonzero exit is a result.
   * @throws {FlowleapOfficeError} `timeout`, `aborted`, `output_too_large`, or `engine_failed` when the sandbox refuses
   *   the call or the child cannot spawn.
   */
  run(command: OfficeCommand, callDir: string, signal: AbortSignal): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return this.spawnConfined([this.options.binaryPath, ...argvOf(command)], command.kind, callDir, signal)
  }

  /**
   * Try one loopback TCP connection from a child confined like every OfficeCLI call. The listener runs in this process, so
   * only a sandbox that denies the network makes the connection fail.
   * @param callDir - the private folder of the probe.
   * @param signal - caller cancellation.
   * @returns `blocked` when the connection failed, `reached` when it succeeded, `inconclusive` when the probe did not run.
   * @throws {FlowleapOfficeError} as {@link run} does.
   */
  async probeNetwork(callDir: string, signal: AbortSignal): Promise<'blocked' | 'reached' | 'inconclusive'> {
    const listener = createServer()
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = listener.address() as AddressInfo
      const result = await this.spawnConfined([process.execPath, '-e', NETWORK_PROBE, String(port)], 'network probe', callDir, signal)
      return result.exitCode === 0 ? 'reached' : result.exitCode === PROBE_BLOCKED ? 'blocked' : 'inconclusive'
    } finally {
      listener.close()
    }
  }

  private async spawnConfined(
    argv: readonly string[], what: string, callDir: string, signal: AbortSignal,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs)
    const bounded = AbortSignal.any([signal, timeout])
    const stopped = (): FlowleapOfficeError | undefined => {
      if (timeout.aborted) return new FlowleapOfficeError('timeout', `The Office engine did not finish ${what} in ${String(this.options.timeoutMs)} ms.`)
      if (signal.aborted) return new FlowleapOfficeError('aborted', `The Office ${what} call was cancelled.`)
      return undefined
    }
    const confined = await this.sandbox.confine(
      argv, { mode: 'workspace-write', workspaceRoot: this.options.writableRoot }, bounded,
    ).catch((error: unknown) => {
      throw stopped() ?? new FlowleapOfficeError('engine_failed', `The Office engine cannot run confined: ${String(error)}`)
    })
    const early = stopped()
    if (early !== undefined) throw early
    const handle = this.subprocess.spawn({
      argv: confined.argv,
      cwd: callDir,
      stdio: { stdin: 'ignore', stdout: { maxBytes: this.options.maxOutputBytes }, stderr: { maxBytes: STDERR_TAIL_BYTES } },
      graceMs: TERMINATE_GRACE_MS,
      signal: bounded,
      env: spawnEnvironment(officeEnvironment(this.options, callDir), process.env),
    })
    const outcome = await handle.done.catch((error: unknown) => {
      throw new FlowleapOfficeError('engine_failed', `The Office engine did not start: ${String(error)}`)
    })
    const late = stopped()
    if (late !== undefined) throw late
    /* v8 ignore start -- collect-mode stdio always yields both readers. */
    const stdout = handle.collected.stdout?.readFrom(0) ?? { text: '', lossy: false }
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    /* v8 ignore stop */
    if (stdout.lossy) throw new FlowleapOfficeError('output_too_large', `The Office engine wrote more than ${String(this.options.maxOutputBytes)} bytes for ${what}.`)
    return { exitCode: outcome.exitCode, stdout: stdout.text, stderr }
  }

  /**
   * Run one `--json` call and parse its reply.
   * @param command - a call other than `version`.
   * @param callDir - the private folder of the call.
   * @param signal - caller cancellation.
   * @returns the reply; `success` is false for a failure OfficeCLI reports.
   * @throws {FlowleapOfficeError} `engine_failed` when stdout is not a reply, or a {@link run} failure.
   */
  async reply(command: Exclude<OfficeCommand, { kind: 'version' }>, callDir: string, signal: AbortSignal): Promise<OfficeReply> {
    const result = await this.run(command, callDir, signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      // A reply that is not JSON is the failure reported below, with the exit code and stderr.
      parsed = undefined
    }
    const reply = Envelope.safeParse(parsed)
    if (!reply.success) {
      throw new FlowleapOfficeError('engine_failed', `The Office engine gave no reply to ${command.kind} (exit ${String(result.exitCode)}): ${result.stderr.trim().slice(0, 500)}`)
    }
    return reply.data
  }
}

/**
 * The failure text of a reply.
 * @param reply - an unsuccessful reply.
 * @returns OfficeCLI's own message, or the first failed batch item's message.
 */
export function failureText(reply: OfficeReply): string {
  if (reply.error !== undefined) return reply.error.error
  const items = z.object({ results: z.array(z.object({ success: z.boolean(), error: z.string().optional() })) }).safeParse(reply.data)
  const failed = items.success ? items.data.results.find(item => !item.success)?.error : undefined
  return failed ?? reply.message ?? 'the engine reported a failure'
}
