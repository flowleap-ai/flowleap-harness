/**
 * The dashboard data step (flowleap-harness#60) in the REAL flowleap-web composition: the browser receives the
 * dashboard and the three app packages that fill its slots, and the Host serves the budget from the firm's model
 * gateway with the runtime's virtual key, and the register watches.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const KEY = 'gateway-virtual-key'

/**
 * Call one Remote method through the authenticated Host route, the way the browser does.
 * @param scaffold - the running Web Host.
 * @param method - `<namespace>/<method>`.
 * @returns the `value` of the reply's successful `result`.
 */
async function remote(scaffold: WebScaffold, method: string): Promise<unknown> {
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `dashboard-${method}`, method, payload: { args: {} } }),
  })
  expect(response.status).toBe(200)
  const { result } = await response.json() as { result: { ok: boolean; value?: unknown } }
  expect(result.ok).toBe(true)
  return result.value
}

it('serves the dashboard, its app surfaces, the gateway budget for the runtime key, and the register watches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-dashboard-'))
  const tokens: string[] = []
  // The gateway double answers the budget read of the firm gateway (flowleap-os side of #60).
  const gateway = createServer((request, response) => {
    tokens.push(`${request.method ?? ''} ${request.url ?? ''} ${request.headers.authorization ?? ''}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ month: '2026-10', spent_usd: 12.5, budget_usd: 50 }))
  })
  await new Promise<void>((resolve) => { gateway.listen(0, '127.0.0.1', resolve) })
  const previous = { key: process.env.ANTHROPIC_API_KEY, url: process.env.FLOWLEAP_BUDGET_URL }
  process.env.ANTHROPIC_API_KEY = KEY
  process.env.FLOWLEAP_BUDGET_URL = `http://127.0.0.1:${String((gateway.address() as AddressInfo).port)}/flowleap/budget`
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally {
      for (const [name, value] of [['ANTHROPIC_API_KEY', previous.key], ['FLOWLEAP_BUDGET_URL', previous.url]] as const) {
        if (value === undefined) Reflect.deleteProperty(process.env, name)
        else process.env[name] = value
      }
      await new Promise<void>((resolve) => { gateway.close(() => { resolve() }) })
      await rm(root, { recursive: true, force: true })
    }
  })
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-dashboard-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  // No hosted FlowLeap MCP server in a test.
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), '- id: mcp-flowleap\n  disabled: true\n')
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
  })
  resources.scaffold = scaffold

  const clients = scaffold.ctx.clientModules.graph().entries.map(row => row.id)
  const dashboard = clients.indexOf('@deepseek-ai/dsh-client-ui-flowleap-dashboard')
  expect(dashboard).toBeGreaterThanOrEqual(0)
  for (const app of [
    '@deepseek-ai/dsh-client-ui-flowleap-routines', '@deepseek-ai/dsh-client-ui-flowleap-agent-builder', '@deepseek-ai/dsh-client-ui-flowleap-budget',
  ]) expect(clients.indexOf(app), app).toBeGreaterThan(dashboard)

  expect(await remote(scaffold, 'flowleapBudget/month')).toEqual({ state: 'known', month: '2026-10', spentUsd: 12.5, budgetUsd: 50 })
  expect(tokens).toEqual([`GET /flowleap/budget Bearer ${KEY}`])
  expect(await remote(scaffold, 'flowleapRoutines/watches')).toEqual([])
}, 120_000)
