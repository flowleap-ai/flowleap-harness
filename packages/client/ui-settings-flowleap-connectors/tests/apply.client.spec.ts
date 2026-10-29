/** The browser plugin registers the section and the wizard step, follows record changes, and withdraws everything on disposal. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubConfigForm, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import * as plugin from '../src/client/index.ts'
import type { ConnectorsSectionInjected, ConnectorsWizardInjected } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'
import type { WizardSection } from '../src/client/wizard-store.ts'
import { WIZARD_SETTINGS_NAMESPACE } from '../src/wizard-settings.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  const api = {
    describe: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
    set: vi.fn(), unset: vi.fn(), test: vi.fn(),
  }
  const remote = new TestRemote(ctx, { flowleapConnectors: api })
  const form = stubConfigForm<WizardSection>()
  const forms = { get: vi.fn(() => form.scope) }
  ctx.provide('configForms', forms)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' }, 'settings.onboarding': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  return { ctx, slots, api, remote, form, forms }
}

describe('ui-settings-flowleap-connectors apply', () => {
  it('registers the section and the wizard over one controller, refreshes a loaded page on record changes, and withdraws on disposal', async () => {
    const { ctx, slots, api, remote, form, forms } = await bench()
    try {
      const fiber = ctx.plugin({ inject: [...plugin.inject], apply: plugin.apply })
      await fiber.await()
      expect(forms.get).toHaveBeenCalledWith(WIZARD_SETTINGS_NAMESPACE)
      const [section] = slots.entries('settings.section')
      const [wizard] = slots.entries('settings.onboarding')
      expect(section?.options).toMatchObject({ id: 'flowleap-connectors', order: 15 })
      expect(resolveSlotLabel(section!.options.label)).toBe(en.nav)
      expect(wizard?.options).toMatchObject({ id: 'flowleap-connectors', order: 10 })

      const sectionFace = section!.inject!()
      const wizardFace = wizard!.inject!()
      const controller = sectionFace['controller'] as ConnectorsSectionInjected['controller']
      expect(wizardFace['controller']).toBe(controller)
      expect((wizardFace['hooks'] as ConnectorsWizardInjected['hooks']).connectors)
        .toBe((sectionFace['hooks'] as ConnectorsSectionInjected['hooks']).connectors)
      expect((wizardFace['t'] as ConnectorsWizardInjected['t'])('wizardTitle')).toBe(en.wizardTitle)
      const wizardController = wizardFace['wizardController'] as ConnectorsWizardInjected['wizardController']

      remote.emit('credentials/record-updated', ['flowleap-connectors/mistral'])
      expect(api.describe).not.toHaveBeenCalled()
      await controller.load()
      remote.emit('credentials/record-updated', ['flowleap-connectors/mistral'])
      await vi.waitFor(() => { expect(api.describe).toHaveBeenCalledTimes(2) })

      await wizardController.load()
      expect(form.listenerCount()).toBe(1)
      await fiber.dispose()
      expect(slots.entries('settings.section')).toEqual([])
      expect(slots.entries('settings.onboarding')).toEqual([])
      expect(form.listenerCount()).toBe(0)
      remote.emit('credentials/record-updated', ['flowleap-connectors/mistral'])
      expect(api.describe).toHaveBeenCalledTimes(2)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
