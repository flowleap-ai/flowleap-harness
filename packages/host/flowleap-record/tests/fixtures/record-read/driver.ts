#!/usr/bin/env node
/**
 * Test driver: boots the headless profile with the record_read row over a Firm Record fixture, runs one turn in which
 * the scripted model reads FL-2026-0001, and writes the model's answer to outcome.json. The Session log is the proof.
 */

import { writeFile } from 'node:fs/promises'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-flowleap-record'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('record read driver requires a config path')

const ctx = await bootProductionProfile({
  binName: 'record-read-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})
try {
  const turn = await runFixtureTurn(ctx, { task: 'Read the record of matter FL-2026-0001 and tell me the record position and the due date.' })
  const agent = ctx.agents.roots()[0]
  if (agent !== undefined) await ctx.sessions.flush(agent.session)
  await writeFile('outcome.json', JSON.stringify({ answer: turn.output }))
} finally {
  await ctx.fiber.dispose()
}
