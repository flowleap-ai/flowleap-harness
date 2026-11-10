#!/usr/bin/env node
// The setup of the first demo that the seed firm does not record yet (flowleap/docs/dev-loop.md, "The full first demo"),
// for `flowleap/dev-loop.sh up --demo`: the provider contract of the run model (OpenRouter, the record's ticket.runModel),
// the AI wishes of the client of SF-2023-0045 (founder decision B2: AI drafts and the client report are allowed; the
// seed has them from flowleap-ai/flowleap-seed-firm PR 2 on), and one sign-in of each seed person, so the record holds
// their mail addresses for the notices. Each command has a fixed Idempotency-Key, so a second run appends nothing.
//
//   node flowleap/dev-loop-demo-setup.mjs <record run dir> <service port> <flowleap-os checkout>
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [run, port, os] = process.argv.slice(2)
if (run === undefined || port === undefined || os === undefined) {
  console.error('usage: dev-loop-demo-setup.mjs <record run dir> <service port> <flowleap-os checkout>')
  process.exit(2)
}
const DEMO = 'SF-2023-0045'
const seedModule = createRequire(join(os, 'acceptance', 'package.json')).resolve('flowleap-seed-firm')
const { loadSeed } = await import(pathToFileURL(seedModule).href)
const seed = loadSeed()
const secret = readFileSync(join(run, 'starter-secret'), 'utf8').trim()
const base = `http://127.0.0.1:${port}/records/api/`

async function call(handle, method, path, key, body) {
  const user = seed.users.find(u => u.handle === handle)
  const headers = {
    'x-flowleap-starter': secret, 'x-flowleap-oid': user.objectId, 'x-flowleap-signin': user.signIn,
    'x-flowleap-name': Buffer.from(user.name, 'utf8').toString('latin1'),
  }
  if (key !== undefined) headers['idempotency-key'] = `dev-loop-demo.${key}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(new URL(path, base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const answer = await res.json()
  if (res.status !== 200) {
    console.error(`dev-loop-demo-setup: ${method} ${path} as ${handle}: ${res.status} ${JSON.stringify(answer)}`)
    process.exit(1)
  }
  return answer
}

const { matter } = await call('partner', 'GET', `matters/${DEMO}`)
await call('partner', 'POST', 'firm/model-providers', 'provider',
  { provider: 'openrouter', contractDate: '2026-01-15', note: 'development loop: the provider contract of the run model' })
await call('partner', 'POST', `clients/${encodeURIComponent(matter.client)}/rules`, 'rules', {
  aiUse: 'allowed', aiLetters: 'allowed', reportEvents: 'all-office-actions', language: 'en',
  text: 'AI drafts and the client report are allowed (founder decision B2).',
})
for (const user of seed.users) await call(user.handle, 'GET', 'me')
console.log(`the OpenRouter provider contract, the AI wishes of ${matter.client} and one sign-in of ${seed.users.length} seed persons`)
