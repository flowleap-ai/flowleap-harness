// @vitest-environment jsdom
/** The first-run key wizard over a scripted Remote and settings scope: when it shows, and what Save, Test, and Skip do. */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess, bindSnapshotSelector, RemoteError, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
// Type-only: the LocaleNamespaceMap merge that gives the wizard its copy keys.
import type {} from '../src/client/index.ts'
import { ConnectorsWizard, type ConnectorsWizardProps } from '../src/client/ConnectorsWizard.tsx'
import { ConnectorsStore } from '../src/client/connectors-store.ts'
import { en } from '../src/client/locales.ts'
import { WizardStore, type WizardSection } from '../src/client/wizard-store.ts'
import { WIZARD_DISMISSED_FIELD } from '../src/wizard-settings.ts'

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

const t: ConnectorsWizardProps['t'] = key => en[key]
const unusedHook = (() => { throw new Error('unused by the connectors wizard') }) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo: unusedHook, useSessionRetainInfo: () => undefined,
  useResource, useWorkspaces: unusedHook, ...allowAllAccess,
}

const ok = <T,>(value: T) => ({ ok: true as const, value })
const presence = (configured: boolean) => ({ configured, writable: true, fields: ['apiKey'] })

function renderWizard(options: { configured?: boolean; dismissed?: unknown; explicit?: boolean; set?: () => Promise<unknown> } = {}) {
  const api = {
    describe: vi.fn(() => Promise.resolve(ok({ mistral: presence(options.configured ?? false) }))),
    set: vi.fn(options.set ?? (() => Promise.resolve(ok(undefined)))),
    unset: vi.fn(),
    test: vi.fn(() => Promise.resolve(ok({ ok: true, message: 'Mistral: Mistral accepted the key.' }))),
  }
  const controller = new ConnectorsStore({ remote: { flowleapConnectors: api } } as never)
  const form = stubConfigForm<WizardSection>()
  form.set.mockImplementation((field: string, value: unknown) => {
    form.publish({ status: 'ready', value: { [field]: value } })
  })
  const wizardController = new WizardStore(form.scope)
  const complete = vi.fn()
  const props: ConnectorsWizardProps = {
    ...kit, stepId: 'flowleap-connectors', complete, openSection: vi.fn(), t, controller, wizardController,
    useConnectors: bindSnapshotSelector(controller.store), useWizard: bindSnapshotSelector(wizardController.store),
    ...options.explicit === undefined ? {} : { explicit: options.explicit },
  }
  render(<ConnectorsWizard {...props} />)
  const answer = () => {
    act(() => { form.publish({ status: 'ready', value: options.dismissed === undefined ? {} : { [WIZARD_DISMISSED_FIELD]: options.dismissed } }) })
  }
  return { api, form, complete, answer }
}

describe('ConnectorsWizard', () => {
  it('shows while nothing is configured or dismissed, keeps the app root inert, and stages typed keys', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    root.inert = false
    document.body.append(root)
    const { api, answer } = renderWizard()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => { expect(api.describe).toHaveBeenCalledTimes(1) })
    answer()
    expect(await screen.findByRole('heading', { name: en.wizardTitle })).toBeTruthy()
    expect(root.inert).toBe(true)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('heading', { name: en.wizardTitle })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.remove })).toBeNull()
    fireEvent.change(screen.getByLabelText(en.apiKey, { selector: '#flowleap-connector-mistral-apiKey' }), { target: { value: 'mk' } })
    expect(screen.getByLabelText(en.apiKey, { selector: '#flowleap-connector-mistral-apiKey' })).toHaveProperty('value', 'mk')
    cleanup()
    expect(root.inert).toBe(false)
  })

  it('completes without showing when a connector is configured or the wizard was dismissed', async () => {
    const configured = renderWizard({ configured: true })
    configured.answer()
    await waitFor(() => { expect(configured.complete).toHaveBeenCalledTimes(1) })
    expect(screen.queryByRole('heading', { name: en.wizardTitle })).toBeNull()
    cleanup()

    const dismissed = renderWizard({ dismissed: true })
    dismissed.answer()
    await waitFor(() => { expect(dismissed.complete).toHaveBeenCalledTimes(1) })
  })

  it('shows when reopened explicitly even after a dismissal, and Save writes the drafts, records the dismissal, and completes once', async () => {
    const { api, form, complete, answer } = renderWizard({ dismissed: true, explicit: true })
    answer()
    await screen.findByRole('heading', { name: en.wizardTitle })
    fireEvent.change(screen.getByLabelText(en.apiKey, { selector: '#flowleap-connector-mistral-apiKey' }), { target: { value: 'mk' } })
    fireEvent.click(screen.getByRole('button', { name: en.wizardSave }))
    await waitFor(() => { expect(complete).toHaveBeenCalledTimes(1) })
    expect(api.set).toHaveBeenCalledWith('mistral', { apiKey: 'mk' })
    expect(form.set).toHaveBeenCalledWith(WIZARD_DISMISSED_FIELD, true)
  })

  it('keeps the wizard open with an alert when a save is refused, and Test saves the drafts and tests each stored connector', async () => {
    // Reopened explicitly: on first run a successful save configures a connector, which ends the step before the outcome shows.
    const refused = { ok: false as const, error: new RemoteError('gateway/internal', 'refused', {}) }
    const set = vi.fn<() => Promise<unknown>>(() => Promise.resolve(refused))
    const { api, complete, answer } = renderWizard({ set, explicit: true })
    answer()
    await screen.findByRole('heading', { name: en.wizardTitle })
    const field = () => screen.getByLabelText(en.apiKey, { selector: '#flowleap-connector-mistral-apiKey' })
    fireEvent.change(field(), { target: { value: 'mk' } })
    fireEvent.click(screen.getByRole('button', { name: en.wizardSave }))
    expect(await screen.findByText(en.wizardSaveFailed)).toBeTruthy()
    expect(complete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: en.wizardTest }))
    await waitFor(() => { expect(set).toHaveBeenCalledTimes(2) })
    expect(api.test).not.toHaveBeenCalled()

    set.mockImplementation(() => Promise.resolve({ ok: true, value: undefined }))
    fireEvent.click(screen.getByRole('button', { name: en.wizardTest }))
    await waitFor(() => { expect(api.test).toHaveBeenCalledWith('mistral') })
    expect(await screen.findByText('Mistral: Mistral accepted the key.')).toBeTruthy()
    expect(screen.queryByText(en.wizardSaveFailed)).toBeNull()
    expect(complete).not.toHaveBeenCalled()
  })

  it('Skip records the dismissal and completes once', async () => {
    const { form, complete, answer } = renderWizard()
    answer()
    await screen.findByRole('heading', { name: en.wizardTitle })
    fireEvent.click(screen.getByRole('button', { name: en.wizardSkip }))
    await waitFor(() => { expect(complete).toHaveBeenCalledTimes(1) })
    expect(form.set).toHaveBeenCalledWith(WIZARD_DISMISSED_FIELD, true)
  })
})
