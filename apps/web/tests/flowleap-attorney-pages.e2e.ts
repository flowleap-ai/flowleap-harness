/**
 * The attorney pages of the REAL FlowLeap compositions (flowleap-harness#84, #70, #189): the desktop composition
 * (dsh-flowleap-web) and the firm composition (with dsh-flowleap-firm) send no Settings > Built-in plugins page to the
 * browser, serve the page with "Create your plugin" off, the New task draft on, and product names on the Plugins page.
 * Both have the Plugins page; on the firm it is read-only and the plugin manager refuses every change.
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
] as const)('%s: no Built-in plugins page, no plugin creation, a New task draft, and a Plugins page with product names, read-only on the firm', async (_name, firm) => {
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
  expect(clients).toContain(PLUGINS_PAGE)
  expect(clients).toContain('@deepseek-ai/dsh-client-ui-entry-customization')

  const page = await (await scaffold.hostFetch('/')).text()
  expect(page).toContain('"__DSH_ENTRY_CUSTOMIZATION_CONFIG__"')
  expect(page).toMatch(/"createPlugin":false/u)
  expect(page).toContain('"__DSH_SCHEDULE_PAGE_CONFIG__"')
  expect(page).toMatch(/"newTaskDraft":true/u)
  // The scaffold's own ui-plugin-manager overlay replaces the row config, so flowleap-web-models.spec.ts pins its value.
  expect(page).toContain('"__DSH_PLUGIN_MANAGER_PAGE_CONFIG__"')

  expect(page).toContain(`"__DSH_PLUGIN_MANAGER_DEPLOYMENT__"] = {"readOnly":${String(firm)},"installBundles":false}`)
  const manager = scaffold.ctx.pluginManager
  const plugins = await manager.listPlugins()
  const connectors = plugins.find(plugin => plugin.moduleName === '@deepseek-ai/dsh-flowleap-connectors')
  expect(connectors?.tools).toContain('search_patents')
  expect(plugins.find(plugin => plugin.moduleName === '@deepseek-ai/dsh-client-ui-flowleap-dashboard')?.hasClient).toBe(true)
  if (!firm) return
  expect(connectors).toMatchObject({ readOnlyReason: 'deployment-locked' })
  const refused = { changed: false, application: 'failed', error: { code: 'deployment-locked' } }
  expect(await manager.setPluginEnabled(connectors!.entryId, false)).toMatchObject(refused)
  // The firm locks of #61 and #159 stay: the firm layer cannot be deselected.
  expect(await manager.setBundleEnabled('@deepseek-ai/dsh-flowleap-firm', false)).toMatchObject(refused)
  expect(await manager.installBundle('left-pad')).toMatchObject(refused)
  expect((await manager.listBundles()).every(bundle => bundle.readOnlyReason !== undefined && !bundle.removable)).toBe(true)
}, 120_000)
