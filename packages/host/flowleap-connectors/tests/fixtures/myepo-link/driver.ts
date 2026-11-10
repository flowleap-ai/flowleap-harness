#!/usr/bin/env node
/**
 * Test driver: starts the MyEPO double on the recorded sandbox answers, boots the headless profile with the
 * connectors, and links MyEPO.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-flowleap-connectors'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'
import { CREDENTIALS } from '../../myepo-fake.ts'
import { sandboxData } from '../../myepo-double/sandbox-data.ts'
import { startMyEpoDoubleServer } from '../../myepo-double/server.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('MyEPO link driver requires a config path')

const server = await startMyEpoDoubleServer({ port: 0, data: sandboxData, client: CREDENTIALS })
process.env['MYEPO_DOUBLE_URL'] = server.origin

const ctx = await bootProductionProfile({
  binName: 'myepo-link-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})
try {
  const controller = ctx.get('flowleapConnectors')
  const myEpo = ctx.get('flowleapMyEpo')
  if (controller === undefined || myEpo === undefined) throw new Error('flowleap-connectors did not activate')
  const signal = new AbortController().signal
  const result = {
    before: await controller.myEpoDescribe(),
    refused: await controller.myEpoLink({ clientId: CREDENTIALS.clientId, clientSecret: 'wrong' }, signal),
    linked: await controller.myEpoLink({ ...CREDENTIALS }, signal),
    after: await controller.myEpoDescribe(),
    applications: (await myEpo.applications()).total,
    unhandled: (await myEpo.unhandledCommunications()).items.map(letter => letter.documentCode),
    tested: await controller.myEpoTest(signal),
  }
  await writeFile('outcome.json', JSON.stringify(result))
  await writeFile('stored.txt', await readFile('runtime/credentials.yaml', 'utf8'))
} finally {
  await ctx.fiber.dispose()
  await server.close()
}
