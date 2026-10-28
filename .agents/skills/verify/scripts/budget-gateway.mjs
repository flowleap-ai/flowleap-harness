#!/usr/bin/env node
// Gateway double for the budget warning recipe (features/budget-warning.md): forwards each request to OpenRouter and,
// while <flag-file> exists, adds `x-flowleap-budget-warning: <file text>` to the response, as the firm gateway does.
//
//   node budget-gateway.mjs <port> <flag-file> [upstream]
//
// upstream defaults to https://openrouter.ai/api. An Anthropic Messages path (/v1/messages) passes as it is; any other
// path (/chat/completions) gets the /v1 prefix. The request headers, the OpenRouter key included, pass through.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'

const [port, flag, upstream = 'https://openrouter.ai/api'] = process.argv.slice(2)
if (port === undefined || flag === undefined) {
  console.error('usage: budget-gateway.mjs <port> <flag-file> [upstream]')
  process.exit(2)
}

/** The warning text while the flag file exists, else undefined. */
function warning() {
  try {
    return readFileSync(flag, 'utf8').trim()
  } catch {
    // ENOENT is the normal "no warning" state.
    return undefined
  }
}

const server = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const headers = Object.fromEntries(Object.entries(request.headers)
    .filter(([name]) => !['host', 'connection', 'content-length', 'accept-encoding'].includes(name)))
  try {
    const path = request.url.startsWith('/v1/') ? request.url : `/v1${request.url}`
    const answer = await fetch(upstream + path, {
      method: request.method,
      headers,
      ...chunks.length === 0 ? {} : { body: Buffer.concat(chunks) },
    })
    const out = Object.fromEntries([...answer.headers].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)))
    const text = warning()
    if (text !== undefined && text.length > 0) out['x-flowleap-budget-warning'] = text
    console.log(`${request.method} ${request.url} -> ${answer.status}${text ? ' +warning' : ''}`)
    response.writeHead(answer.status, out)
    if (answer.body === null) response.end()
    else Readable.fromWeb(answer.body).pipe(response)
  } catch (error) {
    console.error(`${request.method} ${request.url} failed: ${String(error)}`)
    response.writeHead(502, { 'content-type': 'text/plain' })
    response.end('budget-gateway: upstream request failed')
  }
})
server.listen(Number(port), '127.0.0.1', () => { console.log(`budget-gateway: http://127.0.0.1:${port} -> ${upstream}`) })
