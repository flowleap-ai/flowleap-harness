// @vitest-environment jsdom
/** Registration of the model step in the `llm-pi-ai` card, and its Host calls over the `flowleapModels` Remote. */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RemoteError, StaticRemoteAccess, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply as applyNode } from '../src/index.ts'
import { apply, inject, type ModelStepOperations } from '../src/client/index.ts'
import { ModelStep } from '../src/client/ModelStep.tsx'
import { NS, zh } from '../src/client/locales.ts'

class RemoteStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }
}

/** A `flowleapModels` Remote double: each call answers with a RemoteResult, as the generated client does. */
function flowleapModels() {
  return {
    test: vi.fn(async () => ({ ok: true as const, value: { ok: true as const } })),
    startOpenRouter: vi.fn(async () => ({ ok: true as const, value: { url: 'https://openrouter.example/auth' } })),
    awaitOpenRouter: vi.fn(async () => ({ ok: false as const, error: new RemoteError('gateway/internal', 'Host closed', {}) })),
    cancelOpenRouter: vi.fn(async () => ({ ok: true as const, value: undefined })),
  }
}

async function boot(allowed: boolean, remote = flowleapModels()) {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  const allows = vi.fn(() => allowed)
  new StaticRemoteAccess(ctx, allows)
  new RemoteStub(ctx)
  await ctx.plugin({ apply(provider: Context) { provider.provide('remote.flowleapModels', remote as never) } }).await()
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({ name: 'root', children: { 'settings.models.provider-card': { kind: 'keyed', scope: 'root' } } } as never, () => null)
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, allows, remote }
}

describe('ui-settings-flowleap-models browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.flowleapModels', 'remoteAccess'])
  })

  it('adds nothing to the cards while the Peer may not test a key', async () => {
    const { ctx, allows } = await boot(false)
    expect(allows).toHaveBeenCalledWith('flowleapModels/test')
    expect(ctx.slots.entries('settings.models.provider-card')).toEqual([])
  })

  it('adds the step to the llm-pi-ai cards with its copy, and removes it on dispose', async () => {
    const { ctx, fiber } = await boot(true)
    const entries = ctx.slots.entries('settings.models.provider-card')
    expect(entries.map(entry => [entry.options.key, entry.component])).toEqual([['llm-pi-ai', ModelStep]])
    expect(ctx.locale.bind(NS)('test')).toBe(zh.test)
    await fiber.dispose()
    expect(ctx.slots.entries('settings.models.provider-card')).toEqual([])
  })

  it('gives the step the value of each Host call, throws a failed call, and opens a page in a new browser tab', async () => {
    const { ctx, remote } = await boot(true)
    const operations = ctx.slots.entries('settings.models.provider-card')[0]!.inject!().operations as ModelStepOperations
    expect(await operations.test('openai')).toEqual({ ok: true })
    expect(remote.test).toHaveBeenCalledWith('openai')
    expect(await operations.startOpenRouter()).toEqual({ url: 'https://openrouter.example/auth' })
    await expect(operations.awaitOpenRouter()).rejects.toThrow('Host closed')
    await operations.cancelOpenRouter()
    expect(remote.cancelOpenRouter).toHaveBeenCalledOnce()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    onTestFinished(() => { open.mockRestore() })
    operations.open('https://openrouter.example/auth')
    expect(open).toHaveBeenCalledWith('https://openrouter.example/auth', '_blank', 'noopener,noreferrer')
  })
})

describe('ui-settings-flowleap-models node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
