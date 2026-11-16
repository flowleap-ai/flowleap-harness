#!/usr/bin/env node
/**
 * Start the DPMA double with the recorded register record on a loopback port, until SIGINT or SIGTERM.
 * Usage: node --import tsx/esm packages/host/flowleap-connectors/tests/dpma-double/bin.ts [--port <port>]
 * @module
 */

import { DOUBLE_ACCOUNT, SAMPLE_MARKER, fixtureData } from './fixture-data.ts'
import { startDpmaDoubleServer } from './server.ts'

const at = process.argv.indexOf('--port')
const port = at < 0 ? 8291 : Number(process.argv[at + 1])
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port needs a port number, got ${process.argv[at + 1]}`)

const server = await startDpmaDoubleServer({ port, data: fixtureData(), account: DOUBLE_ACCOUNT })
console.log(`${SAMPLE_MARKER}.`)
console.log(`DPMA double: base ${server.baseUrl}, user name ${DOUBLE_ACCOUNT.username}, password ${DOUBLE_ACCOUNT.password}, hit limit ${DOUBLE_ACCOUNT.hitLimit}`)
console.log(`DPMA double: files ${server.double.leadingRegisteredNumbers.join(', ')}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void server.close().then(() => process.exit(0)))
