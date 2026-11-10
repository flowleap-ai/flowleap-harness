#!/usr/bin/env node
/**
 * Start the MyEPO double with the seed firm's public sample data on a loopback port, until SIGINT or SIGTERM.
 * Usage: node --import tsx/esm packages/host/flowleap-connectors/tests/myepo-double/bin.ts [--port <port>]
 * @module
 */

import { DOUBLE_CLIENT, SAMPLE_MARKER, seedData } from './seed-data.ts'
import { CONTROL_PREFIX, startMyEpoDoubleServer } from './server.ts'

const at = process.argv.indexOf('--port')
const port = at < 0 ? 8290 : Number(process.argv[at + 1])
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port needs a port number, got ${process.argv[at + 1]}`)

const server = await startMyEpoDoubleServer({ port, data: seedData, client: DOUBLE_CLIENT })
const state = server.double.state()
console.log(`MyEPO double: ${SAMPLE_MARKER}. The seed firm's real public EP files; due dates and fees are FlowLeap's own.`)
console.log(`MyEPO double: API ${server.baseUrl}, token ${server.tokenUrl}, client ID ${DOUBLE_CLIENT.clientId}, client secret ${DOUBLE_CLIENT.clientSecret}`)
console.log(`MyEPO double: ${state.letters.length} letters, ${state.waiting} waiting to arrive; control ${server.origin}${CONTROL_PREFIX}{state,reset,arrive}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void server.close().then(() => process.exit(0)))
