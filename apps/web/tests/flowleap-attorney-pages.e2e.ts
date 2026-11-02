/**
 * The attorney pages of the REAL FlowLeap compositions (flowleap-harness#84, #70): the desktop composition
 * (dsh-flowleap-web) and the firm composition (with dsh-flowleap-firm) send no Settings > Built-in plugins page to the
 * browser, serve the page with "Create your plugin" off and the New task draft on, and only the firm drops the
 * Plugins page.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const FIRM_BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-firm', import.meta.url))
const DEVELOPER_PAGES = ['@deepseek-ai/dsh-client-ui-settings-plugins', '@deepseek-ai/dsh-client-ui-settings-plugin-inventory']
const PLUGINS_PAGE = '@deepseek-ai/dsh-client-ui-plugin-manager'

it.each([
  ['desktop', false],
  ['firm', true],
] as const)('%s: no Built-in plugins page, no plugin creation, a New task draft, and the Plugins page only on the desktop', async (_name, firm) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-attorney-pages-'))
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally { await rm(root, { recursive: true, force: true }) }
  })
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-attorney-pages-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  // No hosted FlowLeap MCP server in a test.
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), ['- id: mcp-flowleap', '  disabled: true', ''].join('\n'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [
      { dir: BUNDLE, enabled: true },
      ...firm ? [{ dir: FIRM_BUNDLE, enabled: true }] : [],
      { dir: fixtureBundle, enabled: true },
    ] },
    harnessHome: join(root, 'home'),
  })
  resources.scaffold = scaffold

  const clients = scaffold.ctx.clientModules.graph().entries.map(row => row.id)
  for (const page of DEVELOPER_PAGES) expect(clients, page).not.toContain(page)
  expect(clients.includes(PLUGINS_PAGE)).toBe(!firm)
  expect(clients).toContain('@deepseek-ai/dsh-client-ui-entry-customization')

  const page = await (await scaffold.hostFetch('/')).text()
  expect(page).toContain('"__DSH_ENTRY_CUSTOMIZATION_CONFIG__"')
  expect(page).toMatch(/"createPlugin":false/u)
  expect(page).toContain('"__DSH_SCHEDULE_PAGE_CONFIG__"')
  expect(page).toMatch(/"newTaskDraft":true/u)
})
