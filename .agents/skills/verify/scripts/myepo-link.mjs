#!/usr/bin/env node
// Link MyEPO for one verification run without typing the credentials into the page: read the sandbox client ID and
// secret from DSH_VERIFY_MYEPO_ENV (default ~/.config/flowleap/myepo-sandbox.env, keys MYEPO_SANDBOX_CLIENT_ID and
// MYEPO_SANDBOX_CLIENT_SECRET), run the card's test against the EPO sandbox (a token, GET /portfolios, GET
// /communications/folders), and only when it passed write the `flowleap-connectors/myepo` record with the facts of the
// test into <run>/home/.credentials.yaml. Run it before `web.sh start`. It prints no credential and no token.
// Usage: node myepo-link.mjs <run-dir>
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://api-sandbox.apps-staging.epo.org/latest'
const TOKEN = 'https://login-t.epo.org/oauth2/aus1v8we8qXXwPJd60x7/v1/token'
const run = process.argv[2]
if (run === undefined) throw new Error('usage: node myepo-link.mjs <run-dir>')
const store = join(run, 'home', '.credentials.yaml')
if (existsSync(store)) throw new Error(`${store} exists: link before web.sh start, in a new run directory`)

const file = process.env.DSH_VERIFY_MYEPO_ENV ?? `${process.env.HOME}/.config/flowleap/myepo-sandbox.env`
const env = Object.fromEntries(readFileSync(file, 'utf8').split('\n').filter(line => line.includes('=')).map((line) => {
  const at = line.indexOf('=')
  return [line.slice(0, at).replace(/^export\s+/, '').trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')]
}))
const clientId = env.MYEPO_SANDBOX_CLIENT_ID
const clientSecret = env.MYEPO_SANDBOX_CLIENT_SECRET
if (!clientId || !clientSecret) throw new Error(`${file} has no MYEPO_SANDBOX_CLIENT_ID or MYEPO_SANDBOX_CLIENT_SECRET`)

const token = await fetch(TOKEN, {
  method: 'POST',
  headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'mailboxapi' }),
})
if (!token.ok) throw new Error(`the sandbox refused the token request: ${token.status}`)
const { access_token: bearer } = await token.json()
const read = path => fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' } })
const portfolios = await read('/portfolios')
if (!portfolios.ok) throw new Error(`GET /portfolios answered ${portfolios.status}`)
const count = (await portfolios.json()).content.length
const mailbox = (await read('/communications/folders')).ok

const testedAt = new Date().toISOString()
const yaml = [
  'version: 1',
  'records:',
  '  flowleap-connectors/myepo:',
  '    kind: grant',
  '    payload:',
  `      clientId: ${JSON.stringify(clientId)}`,
  `      clientSecret: ${JSON.stringify(clientSecret)}`,
  `      testedAt: ${JSON.stringify(testedAt)}`,
  `      portfolios: "${count}"`,
  `      mailbox: ${mailbox ? 'yes' : 'no'}`,
  'refs: {}',
  '',
].join('\n')
mkdirSync(join(run, 'home'), { recursive: true, mode: 0o700 })
writeFileSync(store, yaml, { mode: 0o600 })
chmodSync(store, 0o600)
console.log(`MyEPO linked for the run: ${count} portfolios, Mailbox ${mailbox ? 'answers' : 'does not answer'}, tested ${testedAt}`)
