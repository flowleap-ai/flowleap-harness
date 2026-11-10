#!/usr/bin/env node
/** Test driver: starts a loopback double of the EPO, boots the headless profile with the connectors, and links MyEPO. */

import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-flowleap-connectors'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'
import { CREDENTIALS, ENDPOINT, fakeEpo } from '../../myepo-fake.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('MyEPO link driver requires a config path')

const epo = fakeEpo()
const server = createServer((request, response) => {
  const path = request.url ?? '/'
  const target = path === '/token' ? ENDPOINT.tokenUrl : `${ENDPOINT.baseUrl}${path.replace(/^\/latest/, '')}`
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => {
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(request.headers)) if (typeof value === 'string') headers[name] = value
    void epo.fetch(target, { method: request.method ?? 'GET', headers, ...chunks.length === 0 ? {} : { body: Buffer.concat(chunks).toString() } })
      .then(async (answer) => {
        response.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/octet-stream' })
        response.end(Buffer.from(await answer.arrayBuffer()))
      })
  })
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
process.env['MYEPO_DOUBLE_URL'] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

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
  server.close()
}
