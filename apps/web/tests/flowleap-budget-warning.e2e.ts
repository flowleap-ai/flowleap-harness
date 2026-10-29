/**
 * The firm's model gateway sends x-flowleap-budget-warning from 80 % of a budget (flowleap-harness#32): in the
 * flowleap-web composition the gateway routes report it as an `llm/response-notice` for the Session's user, and the
 * assembled model output carries nothing of it.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { BlockAssembler, createUserMessage, type LlmResponseNotice } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { API_REMOTE_FORWARDED_EVENTS } from '@deepseek-ai/dsh-api-remotes'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const WARNING = 'You used 85 % of your monthly model budget: 42.50 USD of 50.00 USD in 2026-10 (UTC).'
const COMPLETION = [
  '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"content":"hello"},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
  '[DONE]',
]

it('reports the gateway budget warning to the Session user and keeps it out of the model output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-budget-'))
  // The gateway double answers each request with a completion and the budget warning header.
  const gateway = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'x-flowleap-budget-warning': WARNING })
      response.end(COMPLETION.map(frame => `data: ${frame}\n\n`).join(''))
    })
  })
  await new Promise<void>((resolve) => { gateway.listen(0, '127.0.0.1', resolve) })
  const previousKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'gateway-virtual-key'
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally {
      if (previousKey === undefined) Reflect.deleteProperty(process.env, 'OPENROUTER_API_KEY')
      else process.env.OPENROUTER_API_KEY = previousKey
      await new Promise<void>((resolve) => { gateway.close(() => { resolve() }) })
      await rm(root, { recursive: true, force: true })
    }
  })
  // The firm overlay's gateway route (flowleap-os runtime/firm.patch.yml) with the gateway double as the gateway.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-budget-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: mcp-flowleap',
    '  disabled: true',
    '- id: llm-pi-ai',
    '  config:',
    '    fixedRoutes: true',
    '    providers:',
    '      openrouter:',
    '        apiKeyEnv: OPENROUTER_API_KEY',
    `        baseURL: http://127.0.0.1:${(gateway.address() as AddressInfo).port}`,
    '        noticeHeaders: [x-flowleap-budget-warning]',
    '',
  ].join('\n'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold
  const notices: LlmResponseNotice[] = []
  ctx.on('llm/response-notice', (notice) => { notices.push(notice) })

  const models = await ctx.llm.listModels('openrouter')
  const model = models.find(entry => !entry.id.startsWith('anthropic/'))
  if (model === undefined) throw new Error('the openrouter route lists no OpenAI-protocol model')
  const sessionId = SessionId('budget-warning-session')
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({
    provider: 'openrouter', model: model.id, sessionId,
    messages: [createUserMessage({ content: [{ type: 'text', text: 'ping' }], source: { kind: 'user' } })],
  })) assembler.push(chunk)

  expect(notices).toEqual([{ sessionId, provider: 'openrouter', model: model.id, text: WARNING }])
  const message = assembler.message({ provider: 'openrouter', model: model.id })
  expect(message.content).toEqual([{ type: 'text', text: 'hello' }])
  expect(JSON.stringify(message)).not.toContain('budget')
  // The Host forwards the notice only to the peers that may read its Session.
  expect(API_REMOTE_FORWARDED_EVENTS.find(entry => entry.event === 'llm/response-notice')).toMatchObject({ mode: 'emit' })
}, 120_000)
