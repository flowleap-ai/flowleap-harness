#!/usr/bin/env node
// Sets the record token that the loop's main dsh presents to the Firm Record (flowleap/docs/dev-loop.md, "Use it"):
// the ref FLOWLEAP_RECORD_TOKEN in the dsh's own credential store, <DSH_HOME>/.credentials.yaml. The store reloads the file
// when it changes and record_read resolves the ref at each call, so `dev-loop.sh as` changes the token with no restart.
// The write keeps every other entry of the store, and holds the store's own writer lock, so it does not race a key that
// the app saves at the same time.
//
//   node flowleap/dev-loop-record-token.mjs <DSH_HOME>/.credentials.yaml <token file>
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// The store's own modules, from the package that owns the store.
const require = createRequire(new URL('../packages/credentials/credentials-local/package.json', import.meta.url))
const { parseDocument } = await import(pathToFileURL(require.resolve('yaml')).href)
const { withFileLock, writeFileAtomic } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-atomic-write')).href)

const [store, tokenFile] = process.argv.slice(2)
if (store === undefined || tokenFile === undefined) {
  console.error('usage: dev-loop-record-token.mjs <credentials.yaml> <token file>')
  process.exit(2)
}
const token = readFileSync(tokenFile, 'utf8').trim()
if (token === '') throw new Error(`${tokenFile} holds no token`)

await withFileLock(store, async () => {
  let text = ''
  try {
    text = await readFile(store, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (text.trim() === '') text = 'version: 1\n'
  const document = parseDocument(text)
  // The message of a YAML error quotes the line, which can hold a key: give only its code and place.
  if (document.errors.length > 0) throw new Error(`${store} is not valid YAML: ${document.errors[0].code} at ${JSON.stringify(document.errors[0].linePos?.[0])}`)
  document.setIn(['refs', 'FLOWLEAP_RECORD_TOKEN'], token)
  await writeFileAtomic(store, document.toString(), { mode: 0o600 })
})
