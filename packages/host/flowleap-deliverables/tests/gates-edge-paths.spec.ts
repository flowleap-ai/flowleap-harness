/**
 * The gate paths a happy-path spec does not reach: a file that changes or goes away while a card
 * is open, a write the filesystem does not keep, a failed or missing answerer, a call without an
 * agent, the system clock when no test clock is given, and the record of a matter that has no
 * Working Record yet. The cards and the commands run against the REAL local filesystem of the gate
 * bench; a dropped write is a `DraftingFiles` or `ctx.fs` write that does nothing.
 */

import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftFinding } from '../src/drafting/finding.ts'
import { renderFindingsFile } from '../src/drafting/findings-file.ts'
import { DraftingWorkspace, workspaceFiles, type DraftingFiles } from '../src/drafting/workspace.ts'
import { askGate, askWaiver, confirmRemoval, recordWaivers, registerGateCommands, type GateSeams } from '../src/index.ts'
import { claims, featureList } from './drafting-matter-fixtures.ts'
import { benchWith, FakeCommands } from './gates-test-bench.ts'

type Bench = Awaited<ReturnType<typeof benchWith>>

const benches: Bench[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const bench of benches.splice(0)) await bench.dispose()
})

const errors: DraftFinding[] = [
  { severity: 'Error', rule: 'antecedent-basis', file: 'claims.md', line: 4, claim: 2, message: 'Claim 2: "the clamp body" has no antecedent basis.' },
  { severity: 'Error', rule: 'antecedent-basis', file: 'claims.md', line: 5, claim: 3, message: 'Claim 3: "the pin" has no antecedent basis.' },
]

/** A matter with both gates closed and two open Errors of one rule; no Working Record. */
const matter = (): Record<string, string> => ({
  'drafting/hinge/feature-list.md': featureList('false'),
  'drafting/hinge/claims.md': claims('false'),
  'drafting/hinge/findings.md': renderFindingsFile(errors),
})

async function open(files: Record<string, string> = matter()): Promise<Bench> {
  const bench = await benchWith(files)
  benches.push(bench)
  return bench
}

let probes = 0

/** Run `body` inside a real tool call of the bench, so it gets the `ToolRunContext` a drafting tool gets. */
async function inCall<T>(bench: Bench, body: (exec: ToolRunContext) => Promise<T>, withAgent = true): Promise<T> {
  const name = `probe_${String(++probes)}`
  let box: { readonly value: T } | undefined
  const dispose = bench.ctx.tools.register({
    name,
    description: 'probe',
    parameters: { type: 'object', properties: {} },
    output: { schema: {}, render: () => [{ type: 'text', text: 'probe' }] },
    execute: async (_args, exec) => { box = { value: await body(exec) }; return null },
  })
  try {
    const result = await executeModelToolFixture(bench.ctx, {
      callId: ToolCallId(`probe-${String(probes)}`), name, arguments: {}, signal: new AbortController().signal, ...withAgent ? { agent: bench.agent } : {},
    })
    if (result.isError) throw new Error(`probe failed: ${JSON.stringify(result.content)}`)
  } finally {
    dispose()
  }
  if (box === undefined) throw new Error('probe returned nothing')
  return box.value
}

/** The hinge matter over the bench's files, optionally with one file operation replaced. */
async function workspaceOf(bench: Bench, change: Partial<DraftingFiles> = {}): Promise<DraftingWorkspace> {
  const files = await workspaceFiles(bench.ctx, bench.dir, new AbortController().signal)
  const located = DraftingWorkspace.locate('hinge', { ...files, ...change })
  if (typeof located === 'string') throw new Error(located)
  return located
}

/** The bench's seams without a test clock, so the record line uses the system clock. */
function systemClock(seams: GateSeams): GateSeams {
  return { ask: seams.ask, approve: seams.approve, approvalPolicy: seams.approvalPolicy }
}

const ISO_TIME = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/

describe('the gate cards', () => {
  it('report a missing file, an absent agent and an answerer that fails without a known code', async () => {
    const bench = await open({ 'drafting/hinge/feature-list.md': featureList('false') })
    const workspace = await workspaceOf(bench)
    bench.seams.pick(['Approve Claims'])
    const noClaims = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'approved'))
    const noAgent = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'confirmed'), false)
    bench.seams.answerer = () => new Error('the card service crashed')
    const failed = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'confirmed'))
    bench.seams.ask = () => () => Promise.reject(new Error('plain rejection', { cause: 'no code' }))
    const plain = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'confirmed'))
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a rejection that is not an Error is the case under test
    bench.seams.ask = () => () => Promise.reject('a thrown string')
    const thrown = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'confirmed'))
    expect({ noClaims, noAgent, failed, plain, thrown, logged: bench.seams.logged.filter(line => line.includes('not answered')) }).toEqual({
      noClaims: { opened: false, reason: 'no-file' },
      noAgent: { opened: false, reason: 'no-agent' },
      failed: { opened: false, reason: 'failed' },
      plain: { opened: false, reason: 'failed' },
      thrown: { opened: false, reason: 'failed' },
      logged: [
        'flowleap-deliverables: gate card not answered (failed): the card service crashed',
        'flowleap-deliverables: gate card not answered (failed): plain rejection',
        'flowleap-deliverables: gate card not answered (failed): a thrown string',
      ],
    })
  })

  it('stays closed when the file goes away or its frontmatter breaks while the card is open', async () => {
    const bench = await open()
    const workspace = await workspaceOf(bench)
    const path = join(bench.dir, 'drafting/hinge/feature-list.md')
    bench.seams.answerer = (request) => {
      rmSync(path)
      return { answers: [{ id: request.questions[0]?.id ?? '', selected: ['Confirm Feature List'] }] }
    }
    const removed = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'confirmed'))
    writeFileSync(path, featureList('false'))
    bench.seams.answerer = (request) => {
      writeFileSync(path, '---\nconfirmed: [\n---\n| F1 | lever |\n')
      return { answers: [{ id: request.questions[0]?.id ?? '', selected: ['Confirm Feature List'] }] }
    }
    const broken = await inCall(bench, exec => askGate(workspace, exec, bench.seams, 'confirmed'))
    expect({ removed, broken, recorded: await bench.exists('drafting/hinge/draft-application.working-record.md') }).toEqual({
      removed: { opened: false, reason: 'no-file' },
      broken: { opened: false, reason: 'not-set' },
      recorded: false,
    })
  })

  it('records an opened gate with the system clock when the seams carry none', async () => {
    const bench = await open()
    const workspace = await workspaceOf(bench)
    bench.seams.pick(['Approve Claims'])
    const outcome = await inCall(bench, exec => askGate(workspace, exec, systemClock(bench.seams), 'approved'))
    const record = await bench.read('drafting/hinge/draft-application.working-record.md')
    expect({ outcome, line: ISO_TIME.test(record.split('\n').find(line => line.includes('approved')) ?? '') }).toEqual({
      outcome: { opened: true, detail: 'Claims approved by the attorney in chat (question card).' },
      line: true,
    })
  })
})

describe('the waive card', () => {
  it('writes nothing without findings.md, without an open Error, without chosen items, or for lines that changed while the card was open', async () => {
    const bench = await open()
    const noRead = await workspaceOf(bench, { read: () => Promise.resolve(undefined) })
    const missing = await inCall(bench, exec => askWaiver(noRead, exec, bench.seams, errors))
    await bench.write('drafting/hinge/findings.md', renderFindingsFile([]))
    const none = await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, bench.seams, []))
    await bench.write('drafting/hinge/findings.md', renderFindingsFile(errors))
    bench.seams.answerer = () => ({ answers: [{ id: 'waive-reason', selected: [], custom: 'A reason.' }] })
    const unanswered = await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, bench.seams, errors))
    // The attorney edits findings.md while the card is open: the chosen lines no longer hold an Error.
    bench.seams.answerer = (request) => {
      writeFileSync(join(bench.dir, 'drafting/hinge/findings.md'), `\n\n${renderFindingsFile(errors)}`)
      return {
        answers: [
          { id: 'waive-items', selected: request.questions[0]?.options?.map(option => option.label) ?? [] },
          { id: 'waive-reason', selected: ['A reason.'] },
        ],
      }
    }
    const moved = await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, bench.seams, errors))
    await bench.write('drafting/hinge/findings.md', renderFindingsFile(errors))
    bench.seams.fail('ASK_ABORTED')
    const aborted = await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, bench.seams, errors))
    expect({ missing, none, unanswered, moved, aborted, findings: await bench.read('drafting/hinge/findings.md') }).toEqual({
      missing: { opened: false, reason: 'no-file' },
      none: { opened: false, reason: 'declined' },
      unanswered: { opened: false, reason: 'declined' },
      moved: { opened: false, reason: 'declined' },
      aborted: { opened: false, reason: 'aborted' },
      findings: renderFindingsFile(errors),
    })
  })

  it('offers an Error without a message as a bare option', async () => {
    const bench = await open({ ...matter(), 'drafting/hinge/findings.md': renderFindingsFile([{ ...errors[0]!, message: '' }]) })
    bench.seams.skip()
    await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, bench.seams, errors))
    expect(bench.seams.asked[0]?.questions[0]?.options).toEqual([{ label: 'Line 7: antecedent-basis' }])
  })

  it('stays closed when findings.md goes away while the card is open, or the write is not kept', async () => {
    const bench = await open()
    const path = join(bench.dir, 'drafting/hinge/findings.md')
    const chooseAll = (reason: string) => (request: Parameters<NonNullable<typeof bench.seams.answerer>>[0]) => ({
      answers: [
        { id: 'waive-items', selected: request.questions[0]?.options?.map(option => option.label) ?? [] },
        { id: 'waive-reason', selected: [], custom: reason },
      ],
    })
    bench.seams.answerer = (request) => {
      rmSync(path)
      return chooseAll('Gone.')(request)
    }
    const removed = await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, bench.seams, errors))
    writeFileSync(path, renderFindingsFile(errors))
    bench.seams.answerer = chooseAll('Not kept.')
    const noWrite = await workspaceOf(bench, { write: () => Promise.resolve() })
    const dropped = await inCall(bench, exec => askWaiver(noWrite, exec, bench.seams, errors))
    const files = await workspaceFiles(bench.ctx, bench.dir, new AbortController().signal)
    let wrote = false
    const vanished = await inCall(bench, async exec => askWaiver(await workspaceOf(bench, {
      write: async (target, text) => { await files.write(target, text); wrote = true },
      read: target => wrote ? Promise.resolve(undefined) : files.read(target),
    }), exec, bench.seams, errors))
    expect({ removed, dropped, vanished }).toEqual({
      removed: { opened: false, reason: 'no-file' },
      dropped: { opened: false, reason: 'not-set' },
      vanished: { opened: false, reason: 'not-set' },
    })
  })

  it('records the waivers with the system clock when the seams carry none, creating the Working Record', async () => {
    const bench = await open()
    bench.seams.answerer = request => ({
      answers: [
        { id: 'waive-items', selected: request.questions[0]?.options?.map(option => option.label) ?? [] },
        { id: 'waive-reason', selected: ['False positive.'] },
      ],
    })
    const outcome = await inCall(bench, async exec => askWaiver(await workspaceOf(bench), exec, systemClock(bench.seams), errors))
    const record = await bench.read('drafting/hinge/draft-application.working-record.md')
    const line = record.split('\n').find(entry => entry.includes('Error waived')) ?? ''
    expect({ outcome, line: line.replace(ISO_TIME, '<time>') }).toEqual({
      outcome: { opened: true, detail: '2 Error(s) waived by the attorney in chat (question card); the reason is under each item in drafting/hinge/findings.md.' },
      line: expect.stringMatching(
        /antecedent-basis \(2 item\(s\), findings\.md lines 7, 8\) by the attorney in chat \(question card, call probe-\d+\) at <time>/,
      ) as string,
    })
  })

  it('writes no record line when no item was waived', async () => {
    const bench = await open()
    await recordWaivers(await workspaceOf(bench), [], { kind: 'command', command: 'waive' }, new Date())
    expect(await bench.exists('drafting/hinge/draft-application.working-record.md')).toBe(false)
  })
})

describe('the claim-removal confirmation', () => {
  const cost = 'Removes claim 2.'

  it('falls back to the card when the approval request fails, and names the unknown policy', async () => {
    const bench = await open()
    const workspace = await workspaceOf(bench)
    bench.seams.approve = () => () => Promise.reject(new Error('approval service down'))
    bench.seams.pick(['Remove claim 2'])
    const failed = await inCall(bench, exec => confirmRemoval(workspace, exec, bench.seams, 2, cost))
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a rejection that is not an Error is the case under test
    bench.seams.approve = () => () => Promise.reject('approval string')
    bench.seams.fail('ASK_ABORTED')
    const aborted = await inCall(bench, exec => confirmRemoval(workspace, exec, bench.seams, 2, cost))
    expect({ failed, aborted, logged: bench.seams.logged.filter(line => line.includes('approval')) }).toEqual({
      failed: { confirmed: true, via: 'question-card' },
      aborted: { confirmed: false, reason: 'aborted' },
      logged: [
        'flowleap-deliverables: remove_claim approval request failed: approval service down',
        'flowleap-deliverables: remove_claim approval outcome unavailable (policy unknown)',
        'flowleap-deliverables: remove_claim approval request failed: approval string',
        'flowleap-deliverables: remove_claim approval outcome unavailable (policy unknown)',
      ],
    })
  })

  it('asks the card without an agent, and reports no channel when neither answerer is composed', async () => {
    const bench = await open()
    const workspace = await workspaceOf(bench)
    bench.seams.decider = () => 'allowed-once'
    bench.seams.pick(['Remove claim 2'])
    const noAgent = await inCall(bench, exec => confirmRemoval(workspace, exec, bench.seams, 2, cost), false)
    bench.seams.decider = undefined
    bench.seams.answerer = undefined
    const none = await inCall(bench, exec => confirmRemoval(workspace, exec, bench.seams, 2, cost))
    expect({ noAgent, none, approvals: bench.seams.approvals.length }).toEqual({
      noAgent: { confirmed: false, reason: 'no-agent' },
      none: { confirmed: false, reason: 'no-channel' },
      approvals: 0,
    })
  })
})

describe('the gate commands', () => {
  it('record with the system clock when no clock is given', async () => {
    const bench = await open()
    const registry = new FakeCommands()
    const dispose = registerGateCommands(bench.ctx, { registry, info: () => {} })
    const result = await registry.run(bench.agent, '/confirm-features hinge')
    dispose()
    const record = await bench.read('drafting/hinge/draft-application.working-record.md')
    expect({ kind: result?.kind, timed: ISO_TIME.test(record.split('\n').find(line => line.includes('confirmed')) ?? '') }).toEqual({ kind: 'success', timed: true })
  })

  it('refuse a bad matter name and a findings.md with nothing open for /waive', async () => {
    const bench = await open()
    const { commands, agent } = bench
    const badName = await commands.run(agent, '/waive ../x 7 A reason.')
    await bench.write('drafting/hinge/findings.md', renderFindingsFile([]))
    const nothingOpen = await commands.run(agent, '/waive hinge antecedent-basis A reason.')
    expect([badName, nothingOpen]).toEqual([
      { kind: 'error', text: '"../x" is not a matter name. Give the folder name under drafting/, e.g. "hinge" for drafting/hinge/.' },
      { kind: 'error', text: 'drafting/hinge/findings.md has no open Error of rule antecedent-basis. Open: none. Nothing was written.' },
    ])
  })

  it('report a write the filesystem did not keep, and create the Working Record for a waiver', async () => {
    const bench = await open()
    const { commands, agent, ctx } = bench
    const real = ctx.fs.writeText.bind(ctx.fs)
    // The first write leaves the old text in place; the second removes the file after writing it.
    const spy = vi.spyOn(ctx.fs, 'writeText').mockImplementation(async (target, _content, ...rest) => real(target, await ctx.fs.readText(target), ...rest))
    const gate = await commands.run(agent, '/confirm-features hinge')
    spy.mockImplementation(async (target, content, ...rest) => {
      const outcome = await real(target, content, ...rest)
      rmSync(ctx.fs.processPath(target))
      return outcome
    })
    const waive = await commands.run(agent, '/waive hinge 7 A reason.')
    spy.mockRestore()
    await bench.write('drafting/hinge/findings.md', renderFindingsFile(errors))
    const kept = await commands.run(agent, '/waive hinge 7 A reason.')
    const record = await bench.read('drafting/hinge/draft-application.working-record.md')
    expect({
      gate,
      waive,
      kept: kept?.kind,
      record: record.split('\n').filter(line => line.includes('Error waived')).map(line => line.replace(ISO_TIME, '<time>')),
    }).toEqual({
      gate: { kind: 'error', text: 'drafting/hinge/feature-list.md does not carry `confirmed: true` after the write; check the file.' },
      waive: { kind: 'error', text: 'drafting/hinge/findings.md does not carry the waiver after the write; check the file.' },
      kept: 'success',
      record: [expect.stringContaining('antecedent-basis (1 item(s), findings.md line 7) by the attorney in chat (command /waive) at') as string],
    })
  })
})
