import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Group from '@deepseek-ai/cordis-plugin-group'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import type { OcrRead, OcrSource } from '@deepseek-ai/dsh-flowleap-connectors'
import LlmRuntime, { type ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { onTestFinished, vi } from 'vitest'
import * as AgentRow from '../src/agent-row.ts'
import { resolveOptions, serve, type Config } from '../src/index.ts'

/** A tool definition with a fixed text answer, as a stand-in for a connector tool. */
export function stubTool(name: string) {
  return defineTool({
    name, description: `${name} stand-in.`, parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: () => Promise.resolve(`${name} ran`),
  })
}

/** Collect the warn and error log lines of a context. */
export function logLines(ctx: Context): string[] {
  const lines: string[] = []
  ctx.logger.exporter({ levels: { default: 3 }, export(message) {
    if (message.type === 'warn' || message.type === 'error') lines.push(message.args.map(arg => arg instanceof Error ? arg.message : String(arg)).join(' '))
  } })
  return lines
}

/** A temporary folder removed after the test. */
export async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** An OCR double that counts its calls. */
export function ocrDouble(read: (bytes: Uint8Array) => OcrRead) {
  const pages = vi.fn<OcrSource['pages']>((bytes: Uint8Array) => Promise.resolve(read(bytes)))
  return { pages }
}

/** Doubles and stand-in tools of the runtime. */
export interface RuntimeOptions {
  readonly tools?: readonly string[]
  readonly ocr?: OcrSource
  readonly routes?: string[]
  /** Receives the fetch handler of each registered route. */
  readonly handlers?: ((request: Request) => Promise<Response>)[]
}

/** The core runtime with the preset registry, a `patent` base preset and the connection and remote-access doubles. */
export async function runtime(options: RuntimeOptions = {}): Promise<Context> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = import.meta.url
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { default: 'patent' })
  for (const name of options.tools ?? []) ctx.tools.register(stubTool(name))
  ctx.provide('connection', { fetch: { register: (route: { path: string; fetch: (request: Request) => Promise<Response> }) => {
    options.routes?.push(route.path)
    options.handlers?.push(route.fetch)
    return () => Promise.resolve()
  } } } as never)
  ctx.provide('remoteAccess', { allows: () => true } as never)
  if (options.ocr !== undefined) ctx.provide('flowleapOcr', options.ocr)
  await ctx.plugin({ inject: ['agentPresets'], async* apply(child: Context) { yield await child.agentPresets.register({ id: 'patent', order: 0, plugins: [] }) } })
  return ctx
}

/** Mount the agent builder with test roots. */
export async function mountBuilder(ctx: Context, config: Partial<Config> & { root: string }) {
  // The Loader resolves a package name through Node to the built lib/; the source row is a Loader builtin here.
  ctx.loader.builtins['flowleap-agent'] = AgentRow
  const options = resolveOptions({
    contextLimitTokens: 50_000, maxFileBytes: 1024 * 1024, basePreset: 'patent', presetOrder: 100,
    maxSearchResults: 8, maxReadLocations: 10, maxReadChars: 40_000, ...config,
  })
  const fiber = ctx.plugin({ inject: ['agentPresets', 'connection'], apply: (child: Context) => { serve(child, { ...options, agentRow: 'cordis:flowleap-agent' }) } })
  await fiber.await()
  await ctx.flowleapAgentCatalog.settled()
  return fiber
}

/** A live Agent on one preset. */
export async function agentOn(ctx: Context, sessionId: string, presetId: string) {
  const handle = await ctx.agents.create({
    sessionId: SessionId(sessionId),
    setup: async (agentCtx: Context) => { await ctx.agentPresets.mount(agentCtx, presetId) },
  })
  return handle.agent
}

/** Run one tool call as the model would, through the executor. */
export function callTool(ctx: Context, agent: { ctx: Context }, name: string, args: unknown) {
  return executeModelToolFixture(ctx, {
    agent: agent as never, callId: `call-${name}` as ToolCallId, name, arguments: args, signal: new AbortController().signal,
  })
}

/** Async chunks of one text. */
export async function* chunks(...parts: (string | Uint8Array)[]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield typeof part === 'string' ? new TextEncoder().encode(part) : part
}

export { makePdf } from './pdf.ts'
