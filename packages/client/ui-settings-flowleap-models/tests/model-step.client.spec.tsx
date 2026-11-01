// @vitest-environment jsdom
/** The model step inside the Models page cards: Connect OpenRouter, Test, and their result lines. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import type { OpenRouterConnectResult } from '@deepseek-ai/dsh-flowleap-models/types'
// Type-only: the LocaleNamespaceMap merge that gives the step its `t` seat.
import type {} from '../src/client/index.ts'
import { ModelStep, type ModelStepOperations, type ModelStepProps } from '../src/client/ModelStep.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: keyof typeof en, params?: Record<string, string>) =>
  en[key].replace(/\{(\w+)\}/gu, (_match, name: string) => params?.[name] ?? '')) as ModelStepProps['t']

// Global standard kit stubs: the step consumes none of these hooks.
const unusedHook = (() => { throw new Error('unused by the model step') }) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo: unusedHook, useSessionRetainInfo: () => undefined,
  useResource, useWorkspaces: unusedHook, ...allowAllAccess, useContextMenu: contextMenuHook(),
}

function operations(overrides: Partial<ModelStepOperations> = {}): ModelStepOperations {
  return {
    test: vi.fn(() => Promise.resolve({ ok: true as const })),
    startOpenRouter: vi.fn(() => Promise.resolve({ url: 'https://openrouter.example/auth?state=s' })),
    awaitOpenRouter: vi.fn(() => Promise.resolve<OpenRouterConnectResult>({ state: 'connected' })),
    cancelOpenRouter: vi.fn(() => Promise.resolve()),
    open: vi.fn(),
    ...overrides,
  }
}

function renderStep(provider: string, options: { keyConfigured?: boolean; configured?: boolean; operations?: ModelStepOperations } = {}) {
  const ops = options.operations ?? operations()
  const props = {
    ...kit, t, operations: ops,
    provider: { provider, displayName: provider, settingsNs: 'llm-pi-ai', settingsPath: ['providers', provider], active: true },
    configured: options.configured ?? true,
    keyConfigured: options.keyConfigured ?? false,
  } as ModelStepProps
  render(<ModelStep {...props} />)
  return ops
}

describe('ModelStep', () => {
  it('renders nothing for a card outside the step or a route that is not configured', () => {
    renderStep('mistral', { keyConfigured: true })
    renderStep('openai', { keyConfigured: true, configured: false })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers Test only once a key is saved', () => {
    renderStep('anthropic')
    expect(screen.queryByRole('button', { name: en.test })).toBeNull()
    cleanup()
    renderStep('anthropic', { keyConfigured: true })
    expect(screen.getByRole('button', { name: en.test })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.connect })).toBeNull()
  })

  it('shows a working key and the model that new chats now use', async () => {
    const ops = renderStep('openai', {
      keyConfigured: true,
      operations: operations({ test: vi.fn(() => Promise.resolve({ ok: true as const, adopted: { provider: 'openai' as const, model: 'gpt-5.5' } })) }),
    })
    fireEvent.click(screen.getByRole('button', { name: en.test }))
    expect(await screen.findByText('The key works. New chats use gpt-5.5.')).toBeTruthy()
    expect(ops.test).toHaveBeenCalledWith('openai')
  })

  it('shows a refused key with its HTTP status', async () => {
    renderStep('anthropic', {
      keyConfigured: true,
      operations: operations({ test: vi.fn(() => Promise.resolve({ ok: false as const, reason: 'refused' as const, status: 401 })) }),
    })
    fireEvent.click(screen.getByRole('button', { name: en.test }))
    expect(await screen.findByText('The provider refused the key (HTTP 401). Check the key and save it again.')).toBeTruthy()
  })

  it('connects OpenRouter: opens the authorization page, waits, and shows the result', async () => {
    let finish!: (result: OpenRouterConnectResult) => void
    const ops = renderStep('openrouter', {
      operations: operations({ awaitOpenRouter: vi.fn(() => new Promise<OpenRouterConnectResult>((resolve) => { finish = resolve })) }),
    })
    expect(screen.getByText(en['connect.hint'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.connect }))
    expect(await screen.findByText(en['connect.open'])).toBeTruthy()
    expect(ops.open).toHaveBeenCalledWith('https://openrouter.example/auth?state=s')
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    expect(ops.cancelOpenRouter).toHaveBeenCalledTimes(1)
    finish({ state: 'connected', adopted: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' } })
    expect(await screen.findByText('OpenRouter is connected. New chats use anthropic/claude-sonnet-5.5.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.cancel })).toBeNull()
  })

  it('shows why a connect failed, and a Host call that threw', async () => {
    renderStep('openrouter', { operations: operations({ awaitOpenRouter: vi.fn(() => Promise.resolve<OpenRouterConnectResult>({ state: 'failed', reason: 'denied' })) }) })
    fireEvent.click(screen.getByRole('button', { name: en.connect }))
    expect(await screen.findByText(en['failure.denied'])).toBeTruthy()
    cleanup()
    renderStep('openrouter', { operations: operations({ startOpenRouter: vi.fn(() => Promise.reject(new Error('no loopback port'))) }) })
    fireEvent.click(screen.getByRole('button', { name: en.connect }))
    expect(await screen.findByText('The app could not do this: no loopback port')).toBeTruthy()
  })
})
