/** The connectors page state over a scripted `flowleapConnectors` Remote: presence, drafts, and each write and test outcome. */

import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { ConnectorsStore } from '../src/client/connectors-store.ts'

const ok = <T>(value: T) => ({ ok: true as const, value })
const refused = (message: string) => ({ ok: false as const, error: new RemoteError('gateway/internal', message, {}) })

const presence = (configured: boolean, fields: string[] = ['apiKey']) => ({ configured, writable: true, fields })

function bench(overrides: Record<string, unknown> = {}) {
  const api = {
    describe: vi.fn(() => Promise.resolve(ok({}))),
    set: vi.fn((_id: string, _values: Record<string, string>) => Promise.resolve(ok(undefined))),
    unset: vi.fn((_id: string) => Promise.resolve(ok(undefined))),
    test: vi.fn((_id: string) => Promise.resolve(ok({ ok: true, message: 'answered' }))),
    ...overrides,
  }
  const store = new ConnectorsStore({ remote: { flowleapConnectors: api } } as never)
  return { api, store, snapshot: () => store.store.getSnapshot() }
}

describe('ConnectorsStore', () => {
  it('publishes presence once per concurrent load, keeps the default fields for an empty list, and skips an absent connector', async () => {
    const { api, store, snapshot } = bench({
      describe: vi.fn(() => Promise.resolve(ok({ 'epo-ops': presence(true, []), mistral: { configured: false, writable: false, fields: ['apiKey'] } }))),
    })
    store.refresh()
    expect(api.describe).not.toHaveBeenCalled()
    await Promise.all([store.load(), store.load()])
    expect(api.describe).toHaveBeenCalledTimes(1)
    expect(snapshot()).toMatchObject({ status: 'ready', anyConfigured: true })
    expect(snapshot().cards['epo-ops']).toMatchObject({ configured: true, fields: ['consumerKey', 'consumerSecret'] })
    expect(snapshot().cards.mistral).toMatchObject({ configured: false, writable: false })
    expect(snapshot().cards['uspto-odp']).toMatchObject({ configured: false, writable: true, fields: ['apiKey'] })

    store.refresh()
    await vi.waitFor(() => { expect(api.describe).toHaveBeenCalledTimes(2) })
  })

  it('reports a failed presence read', async () => {
    const { store, snapshot } = bench({ describe: vi.fn(() => Promise.resolve(refused('host gone'))) })
    await store.load()
    expect(snapshot()).toMatchObject({ status: 'error', error: 'host gone' })
  })

  it('stages, discards, and saves a complete trimmed draft, refusing an incomplete one', async () => {
    const { api, store, snapshot } = bench()
    expect(await store.save('uspto-odp')).toBe(false)
    store.edit('uspto-odp', 'apiKey', ' key ')
    expect(snapshot().cards['uspto-odp'].draft).toEqual({ apiKey: ' key ' })
    store.discard('uspto-odp')
    expect(snapshot().cards['uspto-odp'].draft).toEqual({})

    store.edit('uspto-odp', 'apiKey', ' key ')
    expect(await store.save('uspto-odp')).toBe(true)
    expect(api.set).toHaveBeenCalledWith('uspto-odp', { apiKey: 'key' })
    expect(snapshot().cards['uspto-odp']).toMatchObject({ configured: true, busy: 'idle', draft: {} })
    expect(snapshot().anyConfigured).toBe(true)
  })

  it('keeps the draft and shows the refusal when the Host refuses a save, and refuses a second write while one is in flight', async () => {
    let answer: (value: ReturnType<typeof refused>) => void = () => {}
    const { store, snapshot } = bench({ set: vi.fn(() => new Promise((resolve) => { answer = resolve })) })
    store.edit('mistral', 'apiKey', 'k')
    const saving = store.save('mistral')
    expect(snapshot().cards.mistral.busy).toBe('saving')
    expect(await store.save('mistral')).toBe(false)
    expect(await store.remove('mistral')).toBe(false)
    expect(await store.test('mistral')).toBeUndefined()
    answer(refused('Mistral: field "apiKey" is required'))
    expect(await saving).toBe(false)
    expect(snapshot().cards.mistral).toMatchObject({ busy: 'idle', configured: false, draft: { apiKey: 'k' }, error: 'Mistral: field "apiKey" is required' })
  })

  it('saves every complete draft in display order and reports whether all succeeded', async () => {
    const { api, store } = bench({
      set: vi.fn((id: string) => Promise.resolve(id === 'mistral' ? refused('no') : ok(undefined))),
    })
    expect(await store.saveFilled()).toBe(true)
    store.edit('mistral', 'apiKey', 'm')
    store.edit('epo-ops', 'consumerKey', 'only half')
    store.edit('semantic-scholar', 'apiKey', 's')
    expect(await store.saveFilled()).toBe(false)
    expect(api.set.mock.calls.map(call => call[0])).toEqual(['semantic-scholar', 'mistral'])
  })

  it('removes a stored record and shows a refused removal', async () => {
    const { store, snapshot } = bench({ describe: vi.fn(() => Promise.resolve(ok({ mistral: presence(true) }))) })
    await store.load()
    expect(await store.remove('mistral')).toBe(true)
    expect(snapshot().cards.mistral.configured).toBe(false)
    expect(snapshot().anyConfigured).toBe(false)

    const refusing = bench({
      describe: vi.fn(() => Promise.resolve(ok({ mistral: presence(true) }))),
      unset: vi.fn(() => Promise.resolve(refused('read-only'))),
    })
    await refusing.store.load()
    expect(await refusing.store.remove('mistral')).toBe(false)
    expect(refusing.snapshot().cards.mistral).toMatchObject({ configured: true, error: 'read-only' })
  })

  it('tests every configured connector, publishing each outcome, and shows a failed call as an error', async () => {
    const { api, store, snapshot } = bench({
      describe: vi.fn(() => Promise.resolve(ok({ 'epo-ops': presence(true), mistral: presence(true) }))),
      test: vi.fn((id: string) => Promise.resolve(id === 'mistral' ? refused('host gone') : ok({ ok: false, message: 'EPO OPS: denied' }))),
    })
    await store.load()
    await store.testConfigured()
    expect(api.test.mock.calls.map(call => call[0])).toEqual(['epo-ops', 'mistral'])
    expect(snapshot().cards['epo-ops'].test).toEqual({ ok: false, message: 'EPO OPS: denied' })
    expect(snapshot().cards.mistral).toMatchObject({ error: 'host gone' })
    expect(snapshot().cards.mistral.test).toBeUndefined()
  })
})
