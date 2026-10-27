#!/usr/bin/env node
/** Test driver that sends one turn through one Headless Loader composition. */

import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('sandbox network driver requires a config path')

const ctx = await bootProductionProfile({
  binName: 'sandbox-network-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})
try {
  await runFixtureTurn(ctx, { task: 'run the probe command' })
} finally {
  await ctx.fiber.dispose()
}
