/** A FlowLeap register watch run opens its own chat, titled by the event, and marks it "Needs review" in the flowleap-web composition. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { prepareSessionSnapshotFixtureForComparison } from '@deepseek-ai/dsh-llm-replay'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  fixtureContext, normalizeSessionSnapshots, redactSessionSnapshotIds, refreshFixtureReplacements,
  scrubSessionSnapshot, stabilizeFixtureMessageIds, stabilizeRefreshLog, tokenizeSessionFixtureCwd,
} from '@deepseek-ai/dsh-session-snapshot'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-flowleap-routines'
import type {} from '@deepseek-ai/dsh-schedule'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  fixtureUserPrompts, launchWebScaffold, normalizeWebSessionVolatiles, rawSessionLog, readPersistedEvents,
  recordedSessionFixturePath, selectedSessionFixture, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/flowleap-routine-run', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const MODE = webSnapshotMode()
/** The run's fixed target, a week after any recording; the register read interval has passed. */
const RUN_AT = '2026-11-03T07:00:00.000Z'

/**
 * The scenario's register reader, which can list a new event.
 * @param value - the `flowleapRegister` service.
 * @returns whether it is the fixture reader.
 */
function isRegisterFixture(value: object | undefined): value is { publish(): void } {
  return value !== undefined && 'publish' in value && typeof value.publish === 'function'
}

it.skipIf(MODE === 'record')('opens a new chat for a register watch run and marks it Needs review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-routine-run-'))
  const skills = join(root, 'skills')
  await mkdir(skills)
  const previousSkills = process.env.FLOWLEAP_SKILLS_DIR
  // The bundle's skill row reads this directory; an empty one keeps a developer's skill pack out of the requests.
  process.env.FLOWLEAP_SKILLS_DIR = skills
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    vi.restoreAllMocks()
    try { await resources.scaffold?.close() } finally {
      if (previousSkills === undefined) Reflect.deleteProperty(process.env, 'FLOWLEAP_SKILLS_DIR')
      else process.env.FLOWLEAP_SKILLS_DIR = previousSkills
      await rm(root, { recursive: true, force: true })
    }
  })
  // The test bundle keeps the shipped flowleap-web rows and replaces only external inputs: the register, the
  // paid MCP server, and the model route, which the scaffold's replay serves.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-routine-run-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: flowleap-connectors',
    '  disabled: true',
    '- id: mcp-flowleap',
    '  disabled: true',
    '- id: llm-pi-ai',
    '  disabled: true',
    '- id: agent-default-model',
    '  config:',
    '    provider: deepseek-official',
    '    model: deepseek-v4-pro',
    '- insert:',
    '    - id: flowleap-register-fixture',
    `      name: ${JSON.stringify(join(DIR, 'flowleap-register-fixture.mjs'))}`,
    '',
  ].join('\n'))
  const [parentPath, runPath] = await Promise.all(['session.v4.jsonl', 'session.1.v4.jsonl']
    .map(file => selectedSessionFixture(join(DIR, file))))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    replayFixture: parentPath!, replayChildFixtures: [runPath!], agentPresets: { default: 'patent' },
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold
  const sessions: Session[] = []
  ctx.on('session/created', (session) => { sessions.push(session) })

  const workspace = await ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })
  const origin = ctx.agents.get(sessionId)
  if (origin === undefined) throw new Error('created chat has no Agent')
  const prompt = fixtureUserPrompts(await readFile(parentPath!, 'utf8'))[0]
  if (prompt === undefined) throw new Error('parent fixture has no user prompt')
  origin.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
  await origin.whenIdle()
  const [task] = await ctx.schedule.catalog()
  if (task === undefined) throw new Error('the watch created no task')

  // The office lists a new event; the next due run reads it after the 12-hour read interval.
  const register = ctx.get('flowleapRegister')
  if (!isRegisterFixture(register)) throw new Error('the register fixture row is not mounted')
  register.publish()
  // The clock moves to one second before the run's fixed target, so the delivered text is the same each time.
  const realNow = Date.now.bind(Date)
  const shift = Date.parse(RUN_AT) - 1000 - realNow()
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + shift)
  const updated = await ctx.schedule.edit({
    id: task.id, action: 'update', expectedUpdatedAt: task.updatedAt ?? null, patch: { timing: { kind: 'at', at: RUN_AT } },
  })
  expect(updated).toHaveProperty('scheduledAt', RUN_AT)
  await vi.waitFor(async () => {
    expect((await ctx.flowleapRoutines.reviews()).map(review => review.state)).toEqual(['needs_review'])
  }, { timeout: 30_000, interval: 100 })

  const run = sessions.find(session => session.id !== sessionId)
  if (run === undefined) throw new Error('the run opened no chat')
  expect(sessions).toHaveLength(2)
  const marks = await ctx.flowleapRoutines.reviews()
  expect(marks.map(({ since: _since, ...mark }) => mark)).toEqual([{ sessionId: run.id, taskId: task.id, state: 'needs_review' }])
  expect(ctx.workspaceRegistry.get(workspace.id)?.sessionIds).toEqual(expect.arrayContaining([sessionId, run.id]))
  expect(ctx.sessionTitle.get(run)?.title).toBe('EP3456789: No opposition filed within time limit (2020-12-18)')
  // The task's own chat receives nothing from the run.
  expect(origin.session.snapshotEvents().filter(event => event.type === 'user/message'
    && event.data.source.kind === 'schedule')).toEqual([])
  const [delivered] = await ctx.schedule.catalog()
  expect(delivered?.lastDelivery).toBeDefined()
  expect(delivered).toMatchObject({ target: { kind: 'session', sessionId }, involvedSessionIds: [sessionId] })

  await ctx.sessions.flush(run)
  const logs = await Promise.all([origin.session, run].map(async (session) => {
    expect(await readPersistedEvents(scaffold, session.id)).toEqual(session.snapshotEvents())
    return normalizeWebSessionVolatiles(rawSessionLog(session), scaffold.workspaceCwd)
  }))
  const runLog = logs[1]!
  let expectedRun = await readFile(runPath!, 'utf8')
  const context = { sessionIds: [String(run.id)], cwd: scaffold.workspaceCwd }
  if (MODE === 'refresh') {
    const replacements = refreshFixtureReplacements([{ id: run.id, createdAt: run.header.createdAt, content: runLog }], [expectedRun])
    expectedRun = redactSessionSnapshotIds(stabilizeFixtureMessageIds([tokenizeSessionFixtureCwd(scrubSessionSnapshot(
      stabilizeRefreshLog(prepareSessionSnapshotFixtureForComparison(runLog), expectedRun, replacements, context),
    )).split(scaffold.harnessHome).join('{{harnessHome}}')], [expectedRun]))[0]!
    await writeFile(recordedSessionFixturePath(runPath!, run.header.version), expectedRun)
  }
  expect(normalizeSessionSnapshots([runLog], context)).toEqual(normalizeSessionSnapshots([expectedRun], fixtureContext(expectedRun)))

  // An explicit "done" clears the mark.
  await ctx.flowleapRoutines.done(run.id)
  expect(await ctx.flowleapRoutines.reviews()).toEqual([])
}, 90_000)
