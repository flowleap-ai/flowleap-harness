#!/usr/bin/env node
// Firm proxy double for the Records recipe (features/record-read.md): forwards each request and WebSocket upgrade to
// the instance, except paths under /records, which go to the local Firm Record with the identity headers of
// <run>/records-headers.json (the proxy headers a person carries on a firm), so the embedded Records pages and the
// Web app share one origin, as behind the sign-in proxy of flowleap-os. It never forwards a browser-sent
// `x-flowleap-*` header, as the local proxy of flowleap-os does not, so a browser cannot name an identity.
// With a fifth argument, the development loop's script (flowleap/dev-loop.sh), the proxy also serves the person picker
// at /_dev/people, the Sign out target of the loop: it lists <run>/people.json, and a choice runs `dev-loop.sh as <handle>`
// and goes back to the app as that person.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, request as forward } from 'node:http'
import { join } from 'node:path'

const [port, instance, record, run, devLoop] = process.argv.slice(2)
if (port === undefined || instance === undefined || record === undefined || run === undefined) {
  console.error('usage: records-proxy.mjs <port> <instance origin> <record origin> <run dir> [<dev-loop.sh>]')
  process.exit(2)
}
const PICKER = '/_dev/people'
const targets = { instance: new URL(instance), record: new URL(record) }

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
  for (const name of Object.keys(headers)) if (name.startsWith('x-flowleap-')) delete headers[name]
  if (headers.origin !== undefined) headers.origin = target.origin
  if (route === 'record') Object.assign(headers, identity())
  return headers
}

function upstreamOptions(request) {
  const route = routeFor(request.url ?? '/')
  const target = targets[route]
  return { host: target.hostname, port: target.port, path: request.url, method: request.method, headers: headersFor(request, target, route) }
}

const escape = text => String(text).replace(/[&<>"']/gu, c => `&#${c.charCodeAt(0)};`)

/** The person picker: GET shows the seed persons of <run>/people.json, POST handle=<handle> acts as that person. */
function picker(request, response) {
  const people = JSON.parse(readFileSync(join(run, 'people.json'), 'utf8'))
  if (request.method === 'GET') {
    const rows = people.map(p => `<li><button name="handle" value="${escape(p.handle)}">${escape(p.name)}</button> ${escape(p.role ?? '')}</li>`)
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><meta charset="utf-8"><title>Sign in as</title><body style="font-family:system-ui;margin:2rem">`
      + `<h1>Sign in as</h1><p>Development loop: you are signed out. Choose a person of the seed firm.</p>`
      + `<form method="post"><ul style="list-style:none;padding:0;line-height:2.4">${rows.join('')}</ul></form></body>`)
    return
  }
  let body = ''
  request.on('data', chunk => { body += chunk })
  request.on('end', () => {
    const handle = new URLSearchParams(body).get('handle')
    if (!people.some(p => p.handle === handle)) {
      response.writeHead(400, { 'content-type': 'text/plain' })
      response.end('records-proxy: no such person')
      return
    }
    execFile(devLoop, ['as', handle], { env: { ...process.env, FLOWLEAP_DEV_RUN: run } }, (error, stdout, stderr) => {
      if (error !== null) {
        console.error(`as ${handle} failed: ${stderr}`)
        response.writeHead(500, { 'content-type': 'text/plain' })
        response.end(`records-proxy: dev-loop.sh as ${handle} failed`)
        return
      }
      console.log(stdout.trim())
      response.writeHead(303, { location: '/' })
      response.end()
    })
  })
}

const server = createServer((request, response) => {
  if (devLoop !== undefined && (request.url === PICKER || request.url?.startsWith(`${PICKER}?`))) {
    picker(request, response)
    return
  }
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
