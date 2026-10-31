/**
 * The Firm admin link (flowleap-harness#112) in the REAL flowleap-web composition: with the firm patch's public key,
 * a page whose requests carry an `X-Flowleap-Admin` header signed by the starter's private key shows the Firm admin
 * row, and a page without the header, with a header of another key, or with an expired header shows none.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { expect, it, onTestFailed, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))

/** A header as the flowleap-os starter makes it. */
function adminHeader(expiry: number, privateKey: KeyObject): string {
  const signature = sign(null, Buffer.from(`flowleap-admin-link.v1.${String(expiry)}`, 'ascii'), privateKey).toString('base64url')
  return `v1.${String(expiry)}.${signature}`
}

it('shows the Firm admin row only for a request that carries a valid starter-signed header', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-admin-link-'))
  const resources: { scaffold?: WebScaffold; browser?: Browser } = {}
  onTestFinished(async () => {
    try {
      await resources.browser?.close()
      await resources.scaffold?.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  const starter = generateKeyPairSync('ed25519')
  const forger = generateKeyPairSync('ed25519')
  const publicKeyFile = join(root, 'admin-link.pub')
  await writeFile(publicKeyFile, starter.publicKey.export({ type: 'spki', format: 'pem' }))
  // The firm patch of flowleap-os restates the row with the mounted key; no hosted FlowLeap MCP server in a test.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-admin-link-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: mcp-flowleap', '  disabled: true',
    '- id: flowleap-admin-link', '  config:', `    publicKeyFile: ${JSON.stringify(publicKeyFile)}`, '    consoleHref: admin/', '',
  ].join('\n'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
  })
  resources.scaffold = scaffold
  const browser = await chromium.launch()
  resources.browser = browser

  const now = Math.floor(Date.now() / 1000)
  const cases = [
    { name: 'signed by the starter', header: adminHeader(now + 60, starter.privateKey), shown: true },
    { name: 'no header', header: undefined, shown: false },
    { name: 'signed by another key', header: adminHeader(now + 60, forger.privateKey), shown: false },
    { name: 'expired', header: adminHeader(now - 1, starter.privateKey), shown: false },
  ] as const
  for (const entry of cases) {
    const page = await browser.newPage({
      viewport: { width: 1680, height: 1000 }, locale: 'en-US',
      ...(entry.header === undefined ? {} : { extraHTTPHeaders: { 'X-Flowleap-Admin': entry.header } }),
    })
    watchConsole(page)
    onTestFailed(() => saveFailureShot(page, `flowleap-admin-link-${entry.name.replaceAll(' ', '-')}`))
    const answered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/flowleap/admin-link')
    await page.goto(scaffold.authenticatedUrl)
    const answer = await answered
    expect(answer.headers()['cache-control'], entry.name).toBe('no-store')
    expect(await answer.json(), entry.name).toEqual({ href: entry.shown ? 'admin/' : null })
    await page.getByRole('button', { name: 'Search', exact: true }).waitFor()
    const link = page.getByRole('link', { name: 'Firm admin', exact: true })
    if (entry.shown) {
      await link.waitFor()
      expect(await link.getAttribute('href')).toBe('admin/')
      expect(await link.getAttribute('target')).toBeNull()
      expect(new URL(await link.evaluate(element => (element as HTMLAnchorElement).href)).pathname).toBe('/admin/')
    } else {
      expect(await link.count(), entry.name).toBe(0)
    }
    await page.close()
  }
}, 120_000)
