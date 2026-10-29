/**
 * The bench of the writer edge-path specs: the plugin row over the REAL local filesystem in a temp
 * directory, with fake `get_claims` tools for two publications and, when a script is given, a fake
 * `llm` whose replies the second read reads in order.
 */

import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId, type GenerateOptions, type StreamChunk, type UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import * as Deliverables from '../src/index.ts'
import { textOf } from './gates-test-bench.ts'

export const EXAMINER = 'EP1000000A1'
export const FOUND = 'EP3000000A1'
export const EXAMINER_CLAIM = 'A sensor system comprising a housing and a feedback loop sampled at an average interval of 10 ms.'
export const EXAMINER_DEPENDENT = 'A sensor system according to claim 1, wherein the housing is sealed against moisture.'
export const FOUND_CLAIM = 'A sealed sensor housing with a moisture barrier.'

/** The connector library's `get_claims` value for one publication. */
function claimsOf(publication: string, texts: readonly string[]) {
  return {
    docId: publication,
    documentReference: { publicationNumber: publication, section: 'claims' },
    language: 'en',
    totalClaims: texts.length,
    claims: texts.map((text, index) => ({
      number: String(index + 1), text, documentReference: { publicationNumber: publication, section: 'claims', claimNumber: String(index + 1) },
    })),
  }
}

function fakeTool(name: string, value: (args: { patent_number?: string }) => unknown): ToolDefinition {
  return {
    name,
    description: 'fake',
    parameters: { type: 'object', properties: { patent_number: { type: 'string' } } },
    output: { schema: {}, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
    execute: (args: unknown) => Promise.resolve(value(args as { patent_number?: string }) as never),
  }
}

let benches = 0

/**
 * A plugin row with the given config and second-read replies.
 * @param config - the plugin config.
 * @param replies - the judge replies, in call order; `undefined` mounts no model service.
 * @returns the bench.
 */
export async function writerBench(config: Partial<Deliverables.Config> = {}, replies?: string[]) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-writer-')))
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  const logged: string[] = []
  ctx.logger.exporter({ levels: { default: 3 }, export(message) {
    if (message.type === 'warn') logged.push(message.args.map(String).join(' '))
  } })
  if (replies !== undefined) {
    ctx.provide('llm', {
      prepareCall: (callConfig: object) => {
        const reply = replies.shift() ?? ''
        // A reply `throw:<message>` fails the call before it streams, as a network failure does.
        if (reply.startsWith('throw:')) return Promise.reject(new Error(reply.slice('throw:'.length)))
        return Promise.resolve({
          config: callConfig,
          async *stream(_generate: GenerateOptions): AsyncIterable<StreamChunk> {
            yield { type: 'text-delta', index: 0, text: reply }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        })
      },
    })
  }
  await ctx.plugin(Deliverables, { secondRead: 'off', secondReadModel: 'judge/model', ...config })
  ctx.tools.register(fakeTool('get_claims', args => args.patent_number === FOUND
    ? claimsOf(FOUND, [FOUND_CLAIM])
    : claimsOf(args.patent_number ?? EXAMINER, [EXAMINER_CLAIM, EXAMINER_DEPENDENT])))
  const session = ctx.sessions.create(SessionId(`writer-edge-${String(++benches)}`), { meta: { cwd: dir } })
  const agent: Agent = {
    id: session.id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(), status: 'idle', ctx,
    send: () => {}, followup: () => {}, steer: (_message: UserMessage) => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
  let calls = 0
  const run = (name: string, args: unknown, withAgent = true) => executeModelToolFixture(ctx, {
    callId: ToolCallId(`writer-call-${String(++calls)}`), name, arguments: args, signal: new AbortController().signal, ...withAgent ? { agent } : {},
  })
  const call = async (name: string, args: unknown, withAgent = true) => textOf((await run(name, args, withAgent)).content[0])
  const write = (args: unknown, withAgent = true) => call(Deliverables.WRITE_PATENT_RESULTS_NAME, args, withAgent)
  const read = async (publication: string, withAgent = true) => call('get_claims', { patent_number: publication }, withAgent)
  const dispose = () => rm(dir, { recursive: true, force: true })
  return { dir, ctx, session, agent, run, call, write, read, logged, dispose }
}
