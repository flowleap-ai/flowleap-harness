/** The wizard dismissal follows this row's settings scope and persists through it. */

import { describe, expect, it } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { decodeWizardSection, WizardStore, type WizardSection } from '../src/client/wizard-store.ts'
import { WIZARD_DISMISSED_FIELD } from '../src/wizard-settings.ts'

describe('WizardStore', () => {
  it('reads the dismissal from the scope and records it through one field write', async () => {
    const form = stubConfigForm<WizardSection>()
    const store = new WizardStore(form.scope)
    await store.load()
    expect(store.store.getSnapshot()).toEqual({ status: 'loading', dismissed: false, error: null })

    form.publish({ status: 'ready', value: {} })
    expect(store.store.getSnapshot()).toEqual({ status: 'ready', dismissed: false, error: null })

    form.set.mockImplementation(() => {
      form.publish({ status: 'ready', value: { [WIZARD_DISMISSED_FIELD]: true } })
    })
    expect(await store.dismiss()).toBe(true)
    expect(form.set).toHaveBeenCalledWith(WIZARD_DISMISSED_FIELD, true)
    expect(store.store.getSnapshot()).toEqual({ status: 'ready', dismissed: true, error: null })

    store.dispose()
    expect(form.listenerCount()).toBe(0)
  })

  it('reports an unavailable scope and a dismissal that did not persist', async () => {
    const form = stubConfigForm<WizardSection>()
    const store = new WizardStore(form.scope)
    await store.load()
    form.publish({ status: 'unavailable' })
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', dismissed: false })

    form.publish({ status: 'ready', value: { [WIZARD_DISMISSED_FIELD]: 'yes' } })
    expect(await store.dismiss()).toBe(false)
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', dismissed: false, error: 'the wizard dismissal did not persist' })
    expect(decodeWizardSection(null)).toEqual({})
    expect(decodeWizardSection([1])).toEqual({})
    store.dispose()
  })
})
