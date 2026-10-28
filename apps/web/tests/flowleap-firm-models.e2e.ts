/**
 * The flowleap-web composition runs models only on the deployment's routes and keys (flowleap-harness#61): the Host
 * refuses a route or key edit and offers no subscription sign-in, and every registered route sends its requests to
 * the deployment's gateway. The lock holds when the Harness home keeps user patches from before it, and the plugin
 * manager can neither switch a DeepSeek route or sign-in on nor install a package.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-authorization'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const KEYS = { ANTHROPIC_API_KEY: 'gateway-key-anthropic', OPENROUTER_API_KEY: 'gateway-key-openrouter' }

type RemoteResult = { result: { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } } }

/** One Remote call as the browser makes it. */
async function remote(scaffold: WebScaffold, method: string, args: object): Promise<RemoteResult['result']> {
  const response = await scaffold.hostFetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: method.replace('/', '-'), method, payload: { args } }),
  })
  return (await response.json() as RemoteResult).result
}

/** A Models page save from before the lock: the whole `llm-pi-ai` config with an own route and no `fixedRoutes`. */
const STALE_USER_ROWS = [
  '- id: llm-pi-ai',
  '  config:',
  '    providers:',
  '      anthropic:',
  '        apiKeyEnv: ANTHROPIC_API_KEY',
  '      openai-codex:',
  '        apiKeyEnv: OPENAI_CODEX_API_KEY',
  '- id: llm-deepseek',
  '  disabled: false',
  '- id: deepseek-account',
  '  disabled: false',
  '',
].join('\n')

it('refuses route, key, and sign-in changes, also over user patches from before the lock, and sends every route to the gateway', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-firm-models-'))
  const gatewayRequests: { path: string; authorization: string | undefined; key: string | undefined }[] = []
  // The gateway double records each request and refuses it, so no route retries or streams.
  const gateway = createServer((request, response) => {
    gatewayRequests.push({
      path: request.url ?? '',
      authorization: request.headers.authorization,
      key: request.headers['x-api-key'] as string | undefined,
    })
    request.resume()
    response.writeHead(400, { 'content-type': 'application/json' })
    response.end('{"error":{"message":"gateway double"}}')
  })
  await new Promise<void>((resolve) => { gateway.listen(0, '127.0.0.1', resolve) })
  const gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`
  const previous = Object.fromEntries(Object.keys(KEYS).map(name => [name, process.env[name]]))
  Object.assign(process.env, KEYS)
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) Reflect.deleteProperty(process.env, name)
        else process.env[name] = value
      }
      await new Promise<void>((resolve) => { gateway.close(() => { resolve() }) })
      await rm(root, { recursive: true, force: true })
    }
  })
  // The firm overlay's routes (flowleap-os runtime/firm.patch.yml) with the gateway double as the gateway.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-firm-models-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: mcp-flowleap',
    '  disabled: true',
    '- id: llm-pi-ai',
    '  config:',
    '    fixedRoutes: true',
    '    providers:',
    '      anthropic:',
    '        apiKeyEnv: ANTHROPIC_API_KEY',
    `        baseURL: ${gatewayUrl}`,
    '      openrouter:',
    '        apiKeyEnv: OPENROUTER_API_KEY',
    `        baseURL: ${gatewayUrl}`,
    '',
  ].join('\n'))
  // The Harness home keeps user patches from before the lock, in the profile layer and in the home layer.
  await mkdir(join(root, 'home', 'profiles', 'scaffold'), { recursive: true })
  await writeFile(join(root, 'home', 'profiles', 'scaffold', 'cordis.patch.yml'), STALE_USER_ROWS)
  await writeFile(join(root, 'home', 'cordis.patch.yml'), STALE_USER_ROWS)
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
    lockedCredentialRefs: ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY'],
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold

  // No subscription sign-in: the pi-ai routes register no authorization flow.
  expect(ctx.authorization.list().filter(flow => flow.key.startsWith('llm-pi-ai/'))).toEqual([])
  // No route to add: the directory lists only the deployment's routes.
  const directory = await remote(scaffold, 'llm/listConfigurableProviders', {})
  expect(directory.ok && (directory.value as { provider: string; settingsNs: string }[])
    .filter(entry => entry.settingsNs === 'llm-pi-ai').map(entry => entry.provider)).toEqual(['anthropic', 'openrouter'])

  // No route, endpoint, or key-reference change from settings.
  for (const ops of [
    [{ op: 'set', path: ['providers', 'openai-codex'], value: { apiKeyEnv: 'OPENAI_CODEX_API_KEY' } }],
    [{ op: 'set', path: ['providers', 'anthropic', 'baseURL'], value: 'https://api.anthropic.com' }],
    [{ op: 'set', path: ['providers', 'openrouter', 'apiKeyEnv'], value: 'MY_OWN_KEY' }],
  ]) {
    const refused = await remote(scaffold, 'settings/mutate', { ns: 'llm-pi-ai', ops })
    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.error.message).toContain('fixed by a profile bundle')
  }
  // The DeepSeek route and sign-in rows stay off, and the plugin manager refuses to switch them on or install a package.
  expect([...ctx.loader.entries()].some(entry => entry.options.id === 'llm-deepseek' && entry.fiber !== undefined)).toBe(false)
  const plugins = await remote(scaffold, 'pluginManager/listPlugins', {})
  const locked = plugins.ok ? (plugins.value as { entryId: string; readOnlyReason?: string }[])
    .filter(row => row.readOnlyReason === 'deployment-locked').map(row => row.entryId) : []
  expect(locked).toEqual(expect.arrayContaining(['llm-pi-ai', 'credentials', 'llm-deepseek', 'deepseek-account'].map(id => `include:${id}`)))
  const enable = await remote(scaffold, 'pluginManager/setPluginEnabled', { id: 'include:llm-deepseek', enabled: true })
  expect(enable.ok && (enable.value as { error?: { code: string } }).error?.code).toBe('deployment-locked')
  const install = await remote(scaffold, 'pluginManager/installBundle', { spec: '@deepseek-ai/dsh-experimental-liveshare' })
  expect(install.ok && (install.value as { error?: { code: string } }).error?.code).toBe('deployment-locked')
  // Deselecting flowleap-web would remove every lock; selecting a bundle the Plugins page hides is refused too.
  for (const [name, enabled] of [['@deepseek-ai/dsh-flowleap-web', false], ['@deepseek-ai/dsh-sdk-app', true]] as const) {
    const change = await remote(scaffold, 'pluginManager/setBundleEnabled', { name, enabled })
    expect(change.ok && (change.value as { error?: { code: string } }).error?.code, name).toBe('deployment-locked')
  }
  // No user key for a model route.
  for (const ref of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY']) {
    const refused = await remote(scaffold, 'credentials/set', { ref, value: 'sk-own-key' })
    expect(!refused.ok && refused.error.message).toContain(`"${ref}" is supplied by this deployment`)
  }
  const described = await remote(scaffold, 'credentials/describe', { refs: ['ANTHROPIC_API_KEY'] })
  expect(described.ok && described.value).toEqual({ ANTHROPIC_API_KEY: { configured: true, source: 'env', writable: false } })

  // Every reachable route goes to the gateway, with the deployment's key. The scaffold's own replay route
  // (deepseek-official, which flowleap-web does not mount) is the only other one.
  const routes = ctx.llm.listProviders().filter(route => route.id !== 'deepseek-official')
  expect(routes.map(route => route.id).sort()).toEqual(['anthropic', 'openrouter'])
  for (const route of routes) {
    const models = await ctx.llm.listModels(route.id)
    for (const model of [models[0], models.find(entry => !entry.id.startsWith('anthropic/'))]) {
      if (model === undefined) continue
      const before = gatewayRequests.length
      const stream = ctx.llm.stream({
        provider: route.id, model: model.id,
        messages: [createUserMessage({ content: [{ type: 'text', text: 'ping' }], source: { kind: 'user' } })],
      })
      // The gateway double's refusal ends the stream; only the request it recorded matters here.
      await (async () => { for await (const _chunk of stream) { /* drain */ } })().catch((refusal: unknown) => refusal)
      const request = gatewayRequests.at(-1)
      expect(gatewayRequests.length, `${route.id}/${model.id} reached the gateway`).toBe(before + 1)
      const key = KEYS[route.id === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENROUTER_API_KEY']
      expect([request?.key, request?.authorization]).toContain(request?.key === undefined ? `Bearer ${key}` : key)
    }
  }
}, 120_000)
