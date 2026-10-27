#!/usr/bin/env node
/** Test driver: boots the headless profile over a read-only key document, tries browser writes, and runs one turn. */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'
import type {} from '@deepseek-ai/dsh-flowleap-connectors'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('read-only keys driver requires a config path')

await mkdir('firm', { mode: 0o700 })
await writeFile('firm/credentials.yaml', [
  'version: 1',
  'refs:',
  '  OPENROUTER_API_KEY: firm-model-key',
  'records:',
  '  flowleap-connectors/epo-ops:',
  '    kind: grant',
  '    payload: { consumerKey: firm-key, consumerSecret: firm-secret }',
  '',
].join('\n'), { mode: 0o400 })

const ctx = await bootProductionProfile({
  binName: 'read-only-keys-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})
const outcome = (write: Promise<void>): Promise<string> => write.then(
  () => 'stored',
  (error: unknown) => (error as { code?: string }).code ?? String(error),
)
try {
  const controller = ctx.get('flowleapConnectors')
  if (controller === undefined) throw new Error('flowleap-connectors did not activate')
  const firmModelKey = credentialRef('OPENROUTER_API_KEY')
  const result = {
    setFirmConnector: await outcome(controller.set('epo-ops', { consumerKey: 'browser-key', consumerSecret: 'browser-secret' })),
    setOwnConnector: await outcome(controller.set('uspto-odp', { apiKey: 'own-key' })),
    setFirmModelKey: await outcome(ctx.credentials.set(firmModelKey, 'browser-model-key')),
    modelKey: await ctx.credentials.resolve(firmModelKey),
    presence: await controller.describe(),
  }
  await runFixtureTurn(ctx, { task: 'which keys' })
  await writeFile('outcome.json', JSON.stringify(result))
} finally {
  await ctx.fiber.dispose()
}
