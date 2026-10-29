// @vitest-environment jsdom
/** The Patent data connectors section as the settings shell renders it: four cards, write-only fields, and their controls. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: the LocaleNamespaceMap merge that gives the section its `t` seat.
import type {} from '../src/client/index.ts'
import { ConnectorsSection, type ConnectorsSectionController, type ConnectorsSectionProps } from '../src/client/ConnectorsSection.tsx'
import {
  CONNECTOR_FIELDS, CONNECTOR_IDS, type ConnectorCardState, type ConnectorId, type ConnectorsState,
} from '../src/client/connectors-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: keyof typeof en) => en[key]) as ConnectorsSectionProps['t']

// Global standard kit stubs: the section consumes none of these hooks.
const unusedHook = (() => { throw new Error('unused by the connectors section') }) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo: unusedHook, useSessionRetainInfo: () => undefined,
  useResource, useWorkspaces: unusedHook, ...allowAllAccess,
}

function state(overrides: Partial<Record<ConnectorId, Partial<ConnectorCardState>>> = {}, status: ConnectorsState['status'] = 'ready'): ConnectorsState {
  const cards = Object.fromEntries(CONNECTOR_IDS.map(id => [id, {
    id, configured: false, writable: true, fields: CONNECTOR_FIELDS[id], draft: {}, busy: 'idle' as const, ...overrides[id],
  }])) as ConnectorsState['cards']
  return { status, cards, anyConfigured: CONNECTOR_IDS.some(id => cards[id].configured) }
}

function renderSection(initial: ConnectorsState) {
  const store = createSnapshotStore(initial)
  const controller = {
    load: vi.fn(() => Promise.resolve()), edit: vi.fn(), save: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(true)), test: vi.fn(() => Promise.resolve(undefined)),
  } satisfies ConnectorsSectionController
  const props: ConnectorsSectionProps = { ...kit, close: vi.fn(), t, controller, useConnectors: bindSnapshotSelector(store) }
  render(<ConnectorsSection {...props} />)
  return { controller, store }
}

describe('ConnectorsSection', () => {
  it('renders one write-only card per connector and loads presence on mount', () => {
    const { controller } = renderSection(state())
    expect(controller.load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    for (const name of [en.epoOpsName, en.usptoOdpName, en.semanticScholarName, en.mistralName]) {
      expect(screen.getByText(name)).toBeTruthy()
    }
    const inputs = screen.getAllByLabelText(/key|secret/i)
    expect(inputs).toHaveLength(5)
    for (const input of inputs) {
      expect(input).toHaveProperty('type', 'password')
      expect(input.getAttribute('autocomplete')).toBe('new-password')
      expect(input).toHaveProperty('value', '')
    }
    expect(screen.getAllByText(en.notConfigured)).toHaveLength(4)
    expect(screen.queryByRole('button', { name: en.test })).toBeNull()
    expect(screen.queryByRole('button', { name: en.remove })).toBeNull()
  })

  it('stages typed fields through the controller and enables Save only for a complete draft', () => {
    const { controller } = renderSection(state({ 'epo-ops': { draft: { consumerKey: 'ck' } }, 'uspto-odp': { draft: { apiKey: 'k' } } }))
    const saves = screen.getAllByRole('button', { name: en.save })
    expect(saves.map(button => (button as HTMLButtonElement).disabled)).toEqual([true, false, true, true])
    fireEvent.change(screen.getByLabelText(en.consumerSecret), { target: { value: 'cs' } })
    expect(controller.edit).toHaveBeenCalledWith('epo-ops', 'consumerSecret', 'cs')
    fireEvent.click(saves[1]!)
    expect(controller.save).toHaveBeenCalledWith('uspto-odp')
  })

  it('offers Test connection and Remove on a configured card and shows the test outcome inline', () => {
    const { controller } = renderSection(state({
      'epo-ops': { configured: true, test: { ok: false, message: 'EPO OPS key not configured' } },
      'semantic-scholar': { configured: true, test: { ok: true, message: 'Semantic Scholar: search answered' } },
    }))
    expect(screen.getAllByText(en.configured)).toHaveLength(2)
    const tests = screen.getAllByRole('button', { name: en.test })
    expect(tests).toHaveLength(2)
    fireEvent.click(tests[0]!)
    expect(controller.test).toHaveBeenCalledWith('epo-ops')
    fireEvent.click(screen.getAllByRole('button', { name: en.remove })[1]!)
    expect(controller.remove).toHaveBeenCalledWith('semantic-scholar')
    const outcomes = screen.getAllByRole('status')
    expect(outcomes.map(node => node.textContent)).toEqual([
      `${en.testFailed} EPO OPS key not configured`,
      `${en.testPassed} Semantic Scholar: search answered`,
    ])
  })

  it('disables the fields of a read-only store, reports a refused write, and names a failed presence read', () => {
    renderSection(state({
      mistral: { writable: false },
      'uspto-odp': { error: 'USPTO ODP: field "apiKey" is required', busy: 'saving' },
    }, 'error'))
    expect(screen.getByLabelText(en.apiKey, { selector: '#flowleap-connector-mistral-apiKey' })).toHaveProperty('disabled', true)
    expect(screen.getByText(en.readOnly)).toBeTruthy()
    expect(screen.getAllByRole('alert').map(node => node.textContent)).toEqual([en.loadFailed, 'USPTO ODP: field "apiKey" is required'])
    expect(screen.getByRole('button', { name: en.saving })).toHaveProperty('disabled', true)
  })

  it('labels a field the copy does not know by its own name and names the operation in flight', () => {
    renderSection(state({
      mistral: { configured: true, fields: ['apiKey', 'baseUrl'], busy: 'testing' },
      'semantic-scholar': { configured: true, busy: 'removing' },
    }))
    expect(screen.getByLabelText('baseUrl')).toBeTruthy()
    expect(screen.getByRole('button', { name: en.testing })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: en.removing })).toHaveProperty('disabled', true)
  })
})
