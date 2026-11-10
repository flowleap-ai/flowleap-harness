#!/usr/bin/env node
/**
 * Run the firm's MyEPO letter reader (`src/myepo-reader.ts`) on a schedule, until SIGINT or SIGTERM. A development-only
 * launcher for the development loop and the flowleap-os acceptance test; on a firm, the firm worker profile of migration step 6
 * runs the same pass.
 *
 * Usage: node --import tsx/esm packages/host/flowleap-connectors/tests/myepo-reader/bin.ts <dir>
 *
 * `<dir>` is a host-only folder: `config.json` (below), the MyEPO client secret in the file that `myepo.clientSecretFile` names
 * and the Firm Record's intake token in `intake-token`. Both secret files must be readable by their owner only (mode 600), so
 * that no other account of the host reads them. config.json:
 * `{ "recordUrl", "myepo": { "baseUrl", "tokenUrl", "clientId", "clientSecretFile", "requestsPerSecond", "timeoutSeconds" },
 *    "download": "on-arrival", "everySeconds" }`.
 * @module
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { createMyEpoClient, createRequestGate, describeFailure, MyEpoError } from '../../src/myepo-client.ts'
import { createMyEpoLetterIntake, readMyEpoLetters } from '../../src/myepo-reader.ts'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const address = z.string().refine((value) => {
  const url = URL.parse(value)
  return url !== null && (url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname)))
}, 'an https address, or http on the loopback interface')
const fileName = z.string().regex(/^[A-Za-z0-9._-]+$/)
const configSchema = z.strictObject({
  recordUrl: address,
  myepo: z.strictObject({
    baseUrl: address, tokenUrl: address, clientId: z.string().min(1), clientSecretFile: fileName,
    requestsPerSecond: z.number().positive().max(10), timeoutSeconds: z.number().int().min(1).max(300),
  }),
  // Only the download at arrival is built; the default of the atlas, the download when a person opens the letter, is not.
  download: z.literal('on-arrival'),
  everySeconds: z.number().int().min(1).max(86_400),
})

/** A secret file of the folder: present, not empty, and readable by its owner only. */
function secret(dir: string, name: string): string {
  const file = join(dir, name)
  const mode = statSync(file).mode
  if ((mode & 0o077) !== 0) throw new Error(`myepo-reader: ${file} is readable by other accounts (mode ${(mode & 0o777).toString(8)}); chmod 600 it`)
  const value = readFileSync(file, 'utf8').trim()
  if (value === '') throw new Error(`myepo-reader: ${file} is empty`)
  return value
}

const dir = process.argv[2]
if (dir === undefined) throw new Error('myepo-reader: give the folder of config.json, the MyEPO secret and the intake token')
const config = configSchema.parse(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')))
const clientSecret = secret(dir, config.myepo.clientSecretFile)
const intake = createMyEpoLetterIntake({ url: config.recordUrl, token: secret(dir, 'intake-token'), fetch })
const reads = createMyEpoClient({
  endpoint: {
    baseUrl: config.myepo.baseUrl, tokenUrl: config.myepo.tokenUrl,
    requestsPerSecond: config.myepo.requestsPerSecond, timeoutSeconds: config.myepo.timeoutSeconds,
  },
  credentials: () => Promise.resolve({ clientId: config.myepo.clientId, clientSecret }),
  gate: createRequestGate(config.myepo.requestsPerSecond),
  fetch,
  now: Date.now,
})

const log = (line: string): void => {
  console.log(`myepo-reader: ${line}`)
}
let timer: NodeJS.Timeout | undefined
let stopped = false
const pass = async (): Promise<void> => {
  try {
    const result = await readMyEpoLetters({ reads, intake, mode: config.download, now: Date.now })
    for (const { id, answer } of result.delivered) log(`letter ${id}: ${answer.state}${answer.matter === null ? '' : ` on ${answer.matter}`}${answer.reason === null ? '' : ` (${answer.reason})`}`)
    for (const { id, reason } of result.failed) log(`letter ${id} not taken, the next read tries again: ${reason}`)
    if (result.delivered.length > 0 || result.failed.length > 0) log(`read ${result.listed} unhandled letters, ${result.known} already in the Firm Record`)
  } catch (error) {
    if (error instanceof MyEpoError && (error.failure.kind === 'refused' || error.failure.kind === 'not-linked')) {
      // myepo.stops-when-not-readable: no new login after a refusal; the administrator fixes the link and starts the reader again.
      log(`stopped: ${describeFailure(error.failure)}`)
      process.exit(1)
    }
    log(`the read failed, the next read tries again: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!stopped) timer = setTimeout(() => void pass(), config.everySeconds * 1000)
}
log(`reads ${config.myepo.baseUrl} every ${config.everySeconds} s, downloads ${config.download}, sends to ${config.recordUrl}`)
void pass()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopped = true
    clearTimeout(timer)
    process.exit(0)
  })
}
