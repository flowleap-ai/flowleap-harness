#!/usr/bin/env node
/**
 * Test driver: starts the MyEPO double on the seed firm, boots the headless profile with the connectors and the shipped
 * overlay `flowleap/myepo-double.patch.yml`, links MyEPO, and runs each read of `flowleapMyEpo`.
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { brandString } from '@deepseek-ai/dsh-brand'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type { MyEpoApplicationNumber } from '@deepseek-ai/dsh-flowleap-connectors'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'
import { DOUBLE_CLIENT, seedData } from '../../myepo-double/seed-data.ts'
import { startMyEpoDoubleServer } from '../../myepo-double/server.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('MyEPO double driver requires a config path')

const server = await startMyEpoDoubleServer({ port: 0, data: seedData, client: DOUBLE_CLIENT })
// The test overlay inserts the connectors row on a dead port; the shipped overlay, applied last, must point it at the double.
process.env['MYEPO_DOUBLE_URL'] = 'http://127.0.0.1:9'
process.env['FLOWLEAP_MYEPO_DOUBLE_URL'] = server.origin
const shippedOverlay = fileURLToPath(new URL('../../../../../../flowleap/myepo-double.patch.yml', import.meta.url))

const ctx = await bootProductionProfile({
  binName: 'myepo-double-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined), shippedOverlay],
})
try {
  const controller = ctx.get('flowleapConnectors')
  const myEpo = ctx.get('flowleapMyEpo')
  if (controller === undefined || myEpo === undefined) throw new Error('flowleap-connectors did not activate')
  const signal = new AbortController().signal
  const demo = { procedure: 'EPC' as const, number: brandString<MyEpoApplicationNumber>('EP23771920') }
  const linked = await controller.myEpoLink({ ...DOUBLE_CLIENT }, signal)
  server.double.arrive()
  const unhandled = (await myEpo.unhandledCommunications()).items
  const arrival = unhandled.find(letter => letter.documentCode === '2004C')
  if (arrival === undefined) throw new Error('the arrival is not in the unhandled letters')
  const document = await myEpo.downloadCommunication(arrival)
  const result = {
    linked,
    portfolios: (await myEpo.portfolios()).map(portfolio => portfolio.name),
    applications: (await myEpo.applications({ size: 50 })).items.map(row => `${row.number} ${row.fileReference ?? ''}`),
    biblio: await myEpo.bibliographicData(demo),
    communications: (await myEpo.communications({ size: 50 })).total,
    unhandled: unhandled.map(letter => `${letter.applicationNumber ?? ''} ${letter.documentCode}`),
    folders: (await myEpo.folders()).map(folder => folder.name),
    download: { filename: document.filename, bytes: document.pdf.length, head: Buffer.from(document.pdf.subarray(0, 5)).toString('latin1') },
    readAfter: (await myEpo.unhandledCommunications()).items.find(letter => letter.id === arrival.id)?.read,
    dueDates: await myEpo.dueDates(demo),
    terms: (await myEpo.terms()).length,
    fees: await myEpo.pendingFees(demo),
    tested: await controller.myEpoTest(signal),
  }
  await writeFile('outcome.json', JSON.stringify(result))
} finally {
  await ctx.fiber.dispose()
  await server.close()
}
