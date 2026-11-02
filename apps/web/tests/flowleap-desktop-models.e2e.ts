/**
 * The desktop model step (flowleap-harness#170) in the REAL flowleap-desktop composition: the browser receives the
 * model step controls, and the Host tests the attorney's OpenAI key with one read at the provider and makes new chats
 * use that provider when the default provider has no key.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const WEB = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const DESKTOP = fileURLToPath(new URL('../../../packages/bundle/flowleap-desktop', import.meta.url))
const KEY = 'sk-openai-test-key'

async function remote(scaffold: WebScaffold, method: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `models-${method}`, method, payload: { args } }),
  })
  expect(response.status).toBe(200)
  const { result } = await response.json() as { result: { ok: boolean; value?: unknown } }
  expect(result.ok).toBe(true)
  return result.value
}

it('serves the model step and tests the OpenAI key at the provider only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-desktop-models-'))
  const requests: string[] = []
  const provider = createServer((request, response) => {
    requests.push(`${request.method ?? ''} ${request.url ?? ''} ${request.headers.authorization ?? ''}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [] }))
  })
  await new Promise<void>((resolve) => { provider.listen(0, '127.0.0.1', resolve) })
  const saved = { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY }
  process.env.OPENAI_API_KEY = KEY
  Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY')
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally {
      for (const [name, value] of [['OPENAI_API_KEY', saved.openai], ['ANTHROPIC_API_KEY', saved.anthropic]] as const) {
        if (value === undefined) Reflect.deleteProperty(process.env, name)
        else process.env[name] = value
      }
      await new Promise<void>((resolve) => { provider.close(() => { resolve() }) })
      await rm(root, { recursive: true, force: true })
    }
  })
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-desktop-models-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  // No hosted FlowLeap MCP server in a test; the OpenAI base URL points at the provider double.
  const base = `http://127.0.0.1:${String((provider.address() as AddressInfo).port)}`
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: mcp-flowleap', '  disabled: true',
    '- id: flowleap-models', '  config:', '    providers:',
    '      anthropic:', '        model: claude-sonnet-5-5',
    '      openai:', `        baseURL: ${base}/v1`, '        model: gpt-5.5',
    '      openrouter:', '        model: anthropic/claude-sonnet-5.5', '',
  ].join('\n'))
  // The shipped default of new chats, above the scaffold's own default model override.
  const overlay = join(root, 'default-model.yml')
  await writeFile(overlay, ['- id: agent-default-model', '  config:', '    provider: anthropic', '    model: claude-sonnet-5-5', ''].join('\n'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: WEB, enabled: true }, { dir: DESKTOP, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
    extraOverlayPath: overlay,
  })
  resources.scaffold = scaffold

  const clients = scaffold.ctx.clientModules.graph().entries.map(row => row.id)
  expect(clients).toContain('@deepseek-ai/dsh-client-ui-settings-flowleap-models')

  expect(await remote(scaffold, 'flowleapModels/test', { provider: 'openai' }))
    .toEqual({ ok: true, adopted: { provider: 'openai', model: 'gpt-5.5' } })
  expect(requests).toEqual([`GET /v1/models Bearer ${KEY}`])
  expect(scaffold.ctx.get('agentDefaultModel')?.currentSelection()).toMatchObject({ provider: 'openai', model: 'gpt-5.5' })
  expect(await remote(scaffold, 'flowleapModels/test', { provider: 'anthropic' })).toEqual({ ok: false, reason: 'no_key' })
}, 120_000)
