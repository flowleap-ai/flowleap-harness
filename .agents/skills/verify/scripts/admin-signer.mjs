#!/usr/bin/env node
// Starter double for the Firm admin link recipe (features/admin-link.md): forwards each request and WebSocket upgrade
// to the instance and, while <run>/admin exists, adds the header X-Flowleap-Admin that the flowleap-os starter signs for
// an administrator. It removes any such header of the browser, as the starter does.
//
//   node admin-signer.mjs <port> <instance origin> <run dir>
//
// At start it makes an Ed25519 key pair and writes only the public key to <run>/admin-link.pub; the private key stays
// in this process. The Host and Origin headers are rewritten to the instance origin, so its Host and Origin checks pass.
import { generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { createServer, request as forward } from 'node:http'
import { join } from 'node:path'

const [port, upstream, run] = process.argv.slice(2)
if (port === undefined || upstream === undefined || run === undefined) {
  console.error('usage: admin-signer.mjs <port> <instance origin> <run dir>')
  process.exit(2)
}
const target = new URL(upstream)
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
writeFileSync(join(run, 'admin-link.pub'), publicKey.export({ type: 'spki', format: 'pem' }))

function adminHeader() {
  const expiry = Math.floor(Date.now() / 1000) + 60
  return `v1.${expiry}.${sign(null, Buffer.from(`flowleap-admin-link.v1.${expiry}`), privateKey).toString('base64url')}`
}

function headersFor(request) {
  const headers = { ...request.headers, host: target.host }
  delete headers['x-flowleap-admin']
  if (headers.origin !== undefined) headers.origin = target.origin
  if (existsSync(join(run, 'admin'))) headers['x-flowleap-admin'] = adminHeader()
  return headers
}

const server = createServer((request, response) => {
  const upstreamRequest = forward({ host: target.hostname, port: target.port, path: request.url, method: request.method, headers: headersFor(request) }, (answer) => {
    response.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.pipe(response)
  })
  upstreamRequest.on('error', (error) => {
    console.error(`${request.method} ${request.url} failed: ${String(error)}`)
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' })
    response.end('admin-signer: the instance did not answer')
  })
  request.pipe(upstreamRequest)
})

server.on('upgrade', (request, socket, head) => {
  socket.on('error', () => socket.destroy())
  const upstreamRequest = forward({ host: target.hostname, port: target.port, path: request.url, method: request.method, headers: headersFor(request) })
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

server.listen(Number(port), '127.0.0.1', () => { console.log(`admin-signer: http://127.0.0.1:${port} -> ${target.origin}`) })
