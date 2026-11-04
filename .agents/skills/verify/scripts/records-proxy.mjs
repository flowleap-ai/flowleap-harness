#!/usr/bin/env node
// Firm proxy double for the Records recipe (features/record-read.md): forwards each request and WebSocket upgrade to
// the instance, except paths under /records, which go to the local Firm Record with the identity headers of
// <run>/records-headers.json (the proxy headers a person carries on a firm), so the embedded Records pages and the
// Web app share one origin, as behind the sign-in proxy of flowleap-os. It never forwards the browser's own identity
// headers.
import { readFileSync } from 'node:fs'
import { createServer, request as forward } from 'node:http'
import { join } from 'node:path'

const [port, instance, record, run] = process.argv.slice(2)
if (port === undefined || instance === undefined || record === undefined || run === undefined) {
  console.error('usage: records-proxy.mjs <port> <instance origin> <record origin> <run dir>')
  process.exit(2)
}
const targets = { instance: new URL(instance), record: new URL(record) }
const IDENTITY = ['x-flowleap-starter', 'x-flowleap-user', 'x-flowleap-oid', 'x-flowleap-signin', 'x-flowleap-roles']

/** The identity headers of <run>/records-headers.json, read at each request so a change needs no restart. */
function identity() {
  let text
  try {
    text = readFileSync(join(run, 'records-headers.json'), 'utf8')
  } catch (error) {
    // ENOENT: the request reaches the Firm Record without an identity, which answers 403.
    if (error.code === 'ENOENT') return {}
    throw error
  }
  return JSON.parse(text)
}

function routeFor(url) {
  return url === '/records' || url.startsWith('/records/') || url.startsWith('/records?') ? 'record' : 'instance'
}

function headersFor(request, target, route) {
  const headers = { ...request.headers, host: target.host }
  for (const name of IDENTITY) delete headers[name]
  if (headers.origin !== undefined) headers.origin = target.origin
  if (route === 'record') Object.assign(headers, identity())
  return headers
}

function upstreamOptions(request) {
  const route = routeFor(request.url ?? '/')
  const target = targets[route]
  return { host: target.hostname, port: target.port, path: request.url, method: request.method, headers: headersFor(request, target, route) }
}

const server = createServer((request, response) => {
  const upstreamRequest = forward(upstreamOptions(request), (answer) => {
    response.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(response)
  })
  upstreamRequest.on('error', (error) => {
    console.error(`${request.method} ${request.url} failed: ${String(error)}`)
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' })
    response.end('records-proxy: the upstream did not answer')
  })
  request.pipe(upstreamRequest)
})

server.on('upgrade', (request, socket, head) => {
  socket.on('error', () => socket.destroy())
  const upstreamRequest = forward(upstreamOptions(request))
  upstreamRequest.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
    upstreamSocket.on('error', () => socket.destroy())
    const lines = [`HTTP/1.1 ${answer.statusCode} ${answer.statusMessage}`]
    for (let i = 0; i < answer.rawHeaders.length; i += 2) lines.push(`${answer.rawHeaders[i]}: ${answer.rawHeaders[i + 1]}`)
    socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (upstreamHead.length > 0) socket.write(upstreamHead)
    if (head.length > 0) upstreamSocket.write(head)
    socket.pipe(upstreamSocket).pipe(socket)
  })
  upstreamRequest.on('response', () => socket.destroy())
  upstreamRequest.on('error', () => socket.destroy())
  upstreamRequest.end()
})

server.listen(Number(port), '127.0.0.1', () => {
  console.log(`records-proxy: http://127.0.0.1:${port} -> ${targets.instance.origin}, /records -> ${targets.record.origin}`)
})
