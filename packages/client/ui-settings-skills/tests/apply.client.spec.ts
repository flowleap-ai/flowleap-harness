/** The browser plugin registers the Skills section, the store reads the Remote, and disposal withdraws the section. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import * as plugin from '../src/client/index.ts'
import type { SkillsSectionInjected } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'
import { skillKey, type SkillsStore } from '../src/client/skills-store.ts'
import type { SkillInventoryValue } from '../src/types.ts'

const inventory: SkillInventoryValue = {
  skills: [{
    name: 'claims', provider: 'flowleap', source: 'custom', description: 'Read claims.',
    origin: { kind: 'plugin', name: 'FlowLeap methods' }, userInvocable: true, modelInvocable: true,
  }],
  faults: [],
  complete: true,
}
const ref = { name: 'claims', provider: 'flowleap', source: 'custom' }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  const api = {
    list: vi.fn(() => Promise.resolve({ ok: true as const, value: inventory })),
    read: vi.fn(() => Promise.resolve({ ok: true as const, value: { content: '# Claims' } })),
  }
  const remote = new TestRemote(ctx, { skillInventory: api })
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
  const fiber = ctx.plugin({ inject: [...plugin.inject], apply: plugin.apply })
  await fiber.await()
  const [section] = slots.entries('settings.section')
  const raw = section!.inject!()
  const face = { controller: raw['controller'] as SkillsStore, hooks: raw['hooks'] as SkillsSectionInjected['hooks'] }
  return { ctx, slots, api, remote, fiber, section: section!, face }
}

describe('ui-settings-skills apply', () => {
  it('registers the Skills section and withdraws it on disposal', async () => {
    const { ctx, slots, fiber, section, face } = await bench()
    try {
      expect(section.options).toMatchObject({ id: 'skills', order: 17 })
      expect(resolveSlotLabel(section.options.label)).toBe(en.nav)
      expect(face.hooks.skills).toBe(face.controller.store)
      await fiber.dispose()
      expect(slots.entries('settings.section')).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('loads the inventory, shares a concurrent load, and drops read texts on a reload', async () => {
    const { ctx, api, face } = await bench()
    try {
      const store = face.hooks.skills
      expect(store.getSnapshot().inventory).toEqual({ status: 'idle' })
      const first = face.controller.load()
      expect(store.getSnapshot().inventory).toEqual({ status: 'loading' })
      await Promise.all([first, face.controller.load()])
      expect(api.list).toHaveBeenCalledTimes(1)
      expect(store.getSnapshot().inventory).toEqual({ status: 'ready', inventory })

      await face.controller.readText(ref)
      await face.controller.readText(ref)
      expect(api.read).toHaveBeenCalledTimes(1)
      expect(api.read).toHaveBeenCalledWith(ref)
      expect(store.getSnapshot().texts[skillKey(ref)]).toEqual({ status: 'ready', content: '# Claims' })

      api.list.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) } as never)
      await face.controller.load()
      expect(store.getSnapshot()).toEqual({ inventory: { status: 'error' }, texts: {} })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('marks a missing skill gone and reads a failed text again', async () => {
    const { ctx, api, face } = await bench()
    try {
      const store = face.hooks.skills
      api.read.mockResolvedValueOnce({ ok: false, error: new RemoteError('skill/not-found', 'gone', ref) } as never)
      await face.controller.readText(ref)
      expect(store.getSnapshot().texts[skillKey(ref)]).toEqual({ status: 'gone' })

      const other = { ...ref, provider: 'filesystem', source: 'user-dsh' }
      api.read.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) } as never)
      await face.controller.readText(other)
      expect(store.getSnapshot().texts[skillKey(other)]).toEqual({ status: 'error' })
      await face.controller.readText(other)
      expect(store.getSnapshot().texts[skillKey(other)]).toEqual({ status: 'ready', content: '# Claims' })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
