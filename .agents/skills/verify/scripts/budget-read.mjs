#!/usr/bin/env node
// Gateway double for the budget read of the dashboard recipe (features/dashboard.md): answers
// `GET /flowleap/budget` with the JSON text of <answer-file> while the file exists, and 503 while it does not. It logs
// whether a bearer token came, never the token.
//
//   node budget-read.mjs <port> <answer-file>
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [port, answerFile] = process.argv.slice(2)
if (port === undefined || answerFile === undefined) {
  console.error('usage: budget-read.mjs <port> <answer-file>')
  process.exit(2)
}

/** The answer text while the file exists, else undefined. */
function answer() {
  try {
    return readFileSync(answerFile, 'utf8')
  } catch {
    // ENOENT is the normal "gateway does not answer" state.
    return undefined
  }
}

const server = createServer((request, response) => {
  const bearer = /^Bearer \S+$/u.test(request.headers.authorization ?? '')
  const text = request.method === 'GET' && request.url === '/flowleap/budget' ? answer() : undefined
  console.log(`${request.method} ${request.url} bearer=${String(bearer)} -> ${text === undefined ? 503 : 200}`)
  if (text === undefined) {
    response.writeHead(503, { 'content-type': 'text/plain' })
    response.end('budget-read: no answer')
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(text)
})
server.listen(Number(port), '127.0.0.1', () => { console.log(`budget-read: http://127.0.0.1:${port}/flowleap/budget`) })
