#!/usr/bin/env node
/**
 * Test driver: boots the headless profile with the routines row, creates two watches through the model,
 * then runs one watch on a day without a new register event and one on a day with one.
 * The register is the recorded EP 3 456 789 response; the clock moves by shifting `Date.now`.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { entriesFromOps } from '@deepseek-ai/dsh-flowleap-connectors'
import type {} from '@deepseek-ai/dsh-flowleap-routines'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule'
import type { RegisterEventsResponse } from '@flowleap/connectors'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('register watch driver requires a config path')

const recorded = new URL('../../../../flowleap-connectors/tests/fixtures/register/ep3456789a1-events.json', import.meta.url)
const events = entriesFromOps((JSON.parse(await readFile(recorded, 'utf8')) as RegisterEventsResponse).events)
await writeFile('register.json', JSON.stringify({ EP3456789: events.slice(1) }))

const realNow = Date.now.bind(Date)
let offset = 0
Date.now = () => realNow() + offset
const HOURS_13 = 13 * 3_600_000

const ctx = await bootProductionProfile({
  binName: 'register-watch-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})
try {
  // The headless profile has no Session controller; its one root Agent receives the runs.
  ctx.on('schedule/resolve-agent', async (sessionId, next) => ctx.agents.get(sessionId) ?? next())
  let modelAnswers = 0
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/message') modelAnswers += 1
  })
  await runFixtureTurn(ctx, { task: 'Watch EP 3 456 789. When a new office action arrives, prepare the analysis.' })
  await runFixtureTurn(ctx, { task: 'Watch EP 3 456 789 for the second team as well.' })
  const created = await ctx.schedule.catalog()
  const [quiet, active] = created
  if (quiet === undefined || active === undefined) throw new Error(`expected two watch tasks, found ${created.length}`)
  const answersAfterCreation = modelAnswers

  const entry = async (id: ScheduleCatalogEntry['id']): Promise<ScheduleCatalogEntry> => {
    const found = (await ctx.schedule.catalog()).find(candidate => candidate.id === id)
    if (found === undefined) throw new Error(`task ${id} is gone`)
    return found
  }
  const runSoon = async (task: ScheduleCatalogEntry): Promise<void> => {
    const result = await ctx.schedule.edit({
      id: task.id, action: 'update', expectedUpdatedAt: task.updatedAt ?? null,
      patch: { timing: { kind: 'at', at: new Date(Date.now() + 1000).toISOString() } },
    })
    if (!('scheduledAt' in result)) throw new Error(`update refused: ${JSON.stringify(result)}`)
  }
  const until = async (label: string, done: () => Promise<boolean>): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await done()) return
      await sleep(100)
    }
    throw new Error(`timed out waiting for ${label}`)
  }

  offset += HOURS_13
  await runSoon(quiet)
  await until('the quiet run', async () => (await entry(quiet.id)).status === 'ended')

  await writeFile('register.json', JSON.stringify({ EP3456789: events }))
  offset += HOURS_13
  await runSoon(active)
  await until('the delivered run', async () => (await entry(active.id)).lastDelivery !== undefined)
  await until('the run answer', async () => modelAnswers > answersAfterCreation)
  const agent = active.target.kind === 'session' ? ctx.agents.get(active.target.sessionId) : undefined
  await agent?.whenIdle()
  if (agent !== undefined) await ctx.sessions.flush(agent.session)

  await writeFile('outcome.json', JSON.stringify({
    created: created.map(task => task.prompt),
    quiet: await entry(quiet.id),
    active: await entry(active.id),
    answersAfterCreation,
    answers: modelAnswers,
  }))
} finally {
  await ctx.fiber.dispose()
}
