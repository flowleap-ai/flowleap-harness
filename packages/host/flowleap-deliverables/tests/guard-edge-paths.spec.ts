/**
 * The guard paths a full save does not reach: the turn tracker on events outside a turn and on
 * text before a step, the receipt reader on a missing file and on a read failure, the steer
 * forgotten with its Session, and the seal on calls that name no file, on a Session that delivered
 * nothing, and on a working directory or path that fails.
 */

import { ToolCallId, createAssistantMessage, createToolResultMessage, createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { FsError } from '@deepseek-ai/dsh-fs'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeliveredPaths, DIRECT_EDIT_STEER, editedPath, receiptFileReader, registerCompletionGuard, registerEditSeal, TurnTracker, TurnTrackers,
} from '../src/index.ts'
import { benchWith } from './gates-test-bench.ts'

type Bench = Awaited<ReturnType<typeof benchWith>>

const benches: Bench[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const bench of benches.splice(0)) await bench.dispose()
})

async function open(): Promise<Bench> {
  const bench = await benchWith({})
  benches.push(bench)
  return bench
}

let sessions = 0

/** A Session the test can dispose: prepared, entered and announced, with its detach disposer. */
function liveSession(bench: Bench, id = `guard-${String(++sessions)}`): { session: Session; detach: () => void } {
  const session = bench.ctx.sessions.prepare(SessionId(id), { meta: { cwd: bench.dir } })
  const detach = bench.ctx.sessions.enter(session)
  bench.ctx.sessions.announce(session)
  return { session, detach }
}

/** One assistant message of the given text. */
function reply(value: string) {
  return createAssistantMessage({ content: text(value), source: { provider: 'test', model: 'test' } })
}

function text(value: string) {
  return [{ type: 'text' as const, text: value }]
}

/** Collect the warn lines of a context. */
function warnings(bench: Bench): string[] {
  const lines: string[] = []
  bench.ctx.logger.exporter({ levels: { default: 3 }, export(message) {
    if (message.type === 'warn') lines.push(message.args.map(String).join(' '))
  } })
  return lines
}

describe('the turn tracker', () => {
  it('ignores events outside a turn and user messages from other sources, and opens a round for text before a step', async () => {
    const bench = await open()
    const { session } = liveSession(bench)
    const callId = ToolCallId('outside')
    session.append('user/message', createUserMessage({ content: text('outside'), source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 0, step: 1 })
    session.append('tool/call', { turn: 0, step: 1, callId, name: 'get_claims', arguments: '{}' })
    session.append('tool/result', { turn: 0, step: 1, message: createToolResultMessage({ callId, content: text('result'), isError: false }) }, { surfaceOp: 'append' })
    session.append('assistant/message', { turn: 0, step: 1, message: reply('Outside.'), stream: [] }, { surfaceOp: 'append' })
    session.append('turn/start', { turn: 1 })
    session.append('assistant/message', { turn: 1, step: 1, message: reply('Before any step.'), stream: [] }, { surfaceOp: 'append' })
    session.append('assistant/message', { turn: 1, step: 1, message: reply(' Same round.'), stream: [] }, { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({ content: text('system text'), source: { kind: 'system-prompt' } }), { surfaceOp: 'append' })
    session.append('user/message', createUserMessage({ content: text('Search for prior art'), source: { kind: 'user' } }), { surfaceOp: 'append' })
    const tracker = new TurnTracker()
    for (const event of session.snapshotEvents()) tracker.observe(event)
    expect({
      other: tracker.turns(2),
      open: tracker.openTurn(),
      current: tracker.turns(1),
    }).toEqual({
      other: undefined,
      open: 1,
      current: { history: [], current: { message: 'Search for prior art', rounds: [{ toolCalls: [], response: 'Before any step. Same round.' }], results: {} } },
    })
  })

  it('reports no open turn for an unknown Session or after the Session is forgotten', async () => {
    const bench = await open()
    const { session } = liveSession(bench)
    const trackers = new TurnTrackers()
    session.append('turn/start', { turn: 3 })
    for (const event of session.snapshotEvents()) trackers.of(session).observe(event)
    const before = [trackers.openTurn(session.id), trackers.openTurn('unknown')]
    trackers.forget(session)
    expect([...before, trackers.openTurn(session.id)]).toEqual([3, undefined, undefined])
  })
})

describe('the receipt reader', () => {
  it('reads a missing file as absent, a not-found failure as absent, and rethrows any other failure', async () => {
    const bench = await open()
    await bench.write('outputs/report.md', 'Report')
    const reader = receiptFileReader(bench.ctx, new AbortController().signal)
    const present = await reader.readText('outputs/report.md')
    const missing = await reader.readText('outputs/none.md')
    vi.spyOn(bench.ctx.fs, 'stat').mockRejectedValueOnce(new FsError('gone', 'FS_NOT_FOUND'))
    const notFound = await reader.readText('outputs/report.md')
    vi.spyOn(bench.ctx.fs, 'readText').mockRejectedValueOnce(new Error('disk failure'))
    await expect(reader.readText('outputs/report.md')).rejects.toThrow('disk failure')
    expect([present, missing, notFound]).toEqual(['Report', undefined, undefined])
  })
})

describe('the completion guard', () => {
  it('ignores a turn that is not open, and steers a recreated Session again after its predecessor was disposed, keeping other Sessions', async () => {
    const bench = await open()
    const trackers = new TurnTrackers()
    const steered: string[] = []
    registerCompletionGuard(bench.ctx, trackers, (_agent, reason) => { steered.push(reason) })
    const signal = new AbortController().signal
    const run = async (id: string) => {
      const { session, detach } = liveSession(bench, id)
      const agent = { ...bench.agent, id: session.id, session, steer: (_message: UserMessage) => {} }
      session.append('turn/start', { turn: 1 })
      session.append('user/message', createUserMessage({ content: text('Search for prior art and save outputs/review.md'), source: { kind: 'user' } }), { surfaceOp: 'append' })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId(`${id}-call`), name: 'get_claims', arguments: '{}' })
      await bench.ctx.serial('agent/turn-stopping', { agent, turn: 2, signal })
      await bench.ctx.serial('agent/turn-stopping', { agent, turn: 1, signal })
      await bench.ctx.serial('agent/turn-stopping', { agent, turn: 1, signal })
      return detach
    }
    const other = await run('guard-other')
    ;(await run('guard-recreated'))()
    ;(await run('guard-recreated'))()
    other()
    expect(steered.map(reason => reason.split('.')[0])).toEqual(Array<string>(3).fill('The requested prior-art report has no successful structured finalization in this turn'))
  })
})

describe('the seal', () => {
  it('names the path a direct edit changes, and nothing for a view, a blank path or a non-object', () => {
    expect([
      editedPath('str_replace_editor', { command: 'str_replace', path: 'outputs/a.md' }),
      editedPath('str_replace_editor', { command: 'str_replace', path: ' ' }),
      editedPath('str_replace_editor', { command: 'str_replace' }),
      editedPath('str_replace_editor', { command: 'view', path: 'outputs/a.md' }),
      editedPath('write', { file_path: '' }),
      editedPath('write', { file_path: 3 }),
      editedPath('write', null),
      editedPath('read', { file_path: 'outputs/a.md' }),
    ]).toEqual(['outputs/a.md', undefined, undefined, undefined, undefined, undefined, undefined, undefined])
  })

  it('forgets the delivered paths and the claimed steers of a disposed Session only', () => {
    const paths = new DeliveredPaths()
    paths.mark('a', '/w/report.md')
    paths.mark('a', '/w/memo.md')
    paths.mark('b', '/w/report.md')
    const claimed = [paths.claimSteer('a', '/w/report.md', 'changed'), paths.claimSteer('a', '/w/report.md', 'changed'), paths.claimSteer('b', '/w/report.md', 'changed')]
    paths.forget('a')
    expect({
      claimed,
      has: [paths.has('a', '/w/report.md'), paths.has('b', '/w/report.md'), paths.has('c', '/w/report.md')],
      again: [paths.claimSteer('a', '/w/report.md', 'changed'), paths.claimSteer('b', '/w/report.md', 'changed')],
    }).toEqual({ claimed: [true, false, true], has: [false, true, false], again: [true, false] })
  })

  it('steers nothing without an agent, for a Session that delivered nothing, or when the path cannot be resolved, and logs any other failure', async () => {
    const bench = await open()
    const logged = warnings(bench)
    const delivered = new DeliveredPaths()
    const steered: string[] = []
    registerEditSeal(bench.ctx, delivered, (_agent, line) => { steered.push(line) })
    bench.ctx.tools.register({
      name: 'edit',
      description: 'fake edit',
      parameters: { type: 'object', properties: {} },
      output: { schema: {}, render: () => [{ type: 'text', text: 'edited' }] },
      execute: () => Promise.resolve('edited'),
    })
    let calls = 0
    const edit = (withAgent = true) => executeModelToolFixture(bench.ctx, {
      callId: ToolCallId(`seal-${String(++calls)}`), name: 'edit', arguments: { file_path: 'outputs/report.md' },
      signal: new AbortController().signal, ...withAgent ? { agent: bench.agent } : {},
    })
    await edit()
    delivered.mark(bench.session.id, bench.ctx.fs.processPath(await bench.ctx.fs.resolve('outputs/report.md', { cwd: bench.dir })))
    await edit(false)
    vi.spyOn(bench.ctx.fs, 'resolve').mockRejectedValueOnce(new FsError('bad path', 'FS_PERMISSION_DENIED'))
    await edit()
    vi.spyOn(bench.ctx.workingDirectory, 'ensure').mockRejectedValueOnce(new Error('no working directory'))
    await edit()
    vi.spyOn(bench.ctx.workingDirectory, 'ensure').mockRejectedValueOnce('no directory string')
    await edit()
    await edit()
    expect({ steered, logged }).toEqual({
      steered: [`\`outputs/report.md\`: ${DIRECT_EDIT_STEER}`],
      logged: [
        'flowleap-deliverables: edit seal failed for edit: no working directory',
        'flowleap-deliverables: edit seal failed for edit: no directory string',
      ],
    })
  })
})
