/** The MyEPO card state over a scripted `flowleapConnectors` Remote: the link, the draft, and each link, test and unlink outcome. */

import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { MyEpoStore, myEpoDraftComplete, myEpoMode, type MyEpoState } from '../src/client/myepo-store.ts'

const ok = <T>(value: T) => ({ ok: true as const, value })
const refused = (message: string) => ({ ok: false as const, error: new RemoteError('gateway/internal', message, {}) })
const LINKED = { state: 'linked' as const, writable: true, testedAt: '2026-11-09T12:00:00.000Z', portfolios: 6, mailbox: true }
const PASSED = { kind: 'passed' as const, testedAt: '2026-11-09T13:00:00.000Z', portfolios: [{ name: 'P', type: 'applicant' as const, fullAccess: true }], mailbox: true }

function bench(overrides: Record<string, unknown> = {}) {
  const api = {
    myEpoDescribe: vi.fn(() => Promise.resolve(ok({ state: 'not-linked', writable: true }))),
    myEpoLink: vi.fn((_values: Record<string, string>) => Promise.resolve(ok(PASSED))),
    myEpoTest: vi.fn(() => Promise.resolve(ok(PASSED))),
    myEpoUnlink: vi.fn(() => Promise.resolve(ok(undefined))),
    ...overrides,
  }
  const store = new MyEpoStore({ remote: { flowleapConnectors: api } } as never)
  return { api, store, snapshot: () => store.store.getSnapshot() }
}

function state(overrides: Partial<MyEpoState> = {}): MyEpoState {
  return { status: 'ready', link: { state: 'not-linked', writable: true }, draft: { clientId: '', clientSecret: '' }, busy: 'idle', replacing: false, ...overrides }
}

describe('myEpoMode', () => {
  it('shows one view for each state of the card', () => {
    expect(myEpoMode(state())).toBe('form')
    expect(myEpoMode(state({ busy: 'linking' }))).toBe('testing')
    expect(myEpoMode(state({ busy: 'testing' }))).toBe('testing')
    expect(myEpoMode(state({ outcome: PASSED }))).toBe('passed')
    expect(myEpoMode(state({ outcome: { ...PASSED, portfolios: [] } }))).toBe('empty')
    expect(myEpoMode(state({ outcome: { kind: 'refused' } }))).toBe('refused')
    expect(myEpoMode(state({ outcome: { kind: 'unreachable' } }))).toBe('unreachable')
    expect(myEpoMode(state({ outcome: { kind: 'failed', message: 'x' } }))).toBe('failed')
    expect(myEpoMode(state({ outcome: { kind: 'not-linked' } }))).toBe('form')
    expect(myEpoMode(state({ link: LINKED }))).toBe('linked')
    expect(myEpoMode(state({ link: LINKED, replacing: true }))).toBe('form')
    expect(myEpoDraftComplete(state({ draft: { clientId: 'a', clientSecret: ' ' } }))).toBe(false)
  })
})

describe('MyEpoStore', () => {
  it('loads the link once per concurrent load, refreshes only after the first load, and reports a failed read', async () => {
    const { api, store, snapshot } = bench({ myEpoDescribe: vi.fn(() => Promise.resolve(ok(LINKED))) })
    store.refresh()
    expect(api.myEpoDescribe).not.toHaveBeenCalled()
    await Promise.all([store.load(), store.load()])
    expect(api.myEpoDescribe).toHaveBeenCalledTimes(1)
    expect(snapshot()).toMatchObject({ status: 'ready', link: LINKED })
    store.refresh()
    await vi.waitFor(() => { expect(api.myEpoDescribe).toHaveBeenCalledTimes(2) })
    const failing = bench({ myEpoDescribe: vi.fn(() => Promise.resolve(refused('host gone'))) })
    await failing.store.load()
    expect(failing.snapshot()).toMatchObject({ status: 'error', error: 'host gone' })
  })

  it('sends the trimmed draft once both fields are set, records a passed link, and drops the draft', async () => {
    const { api, store, snapshot } = bench()
    expect(await store.link()).toBeUndefined()
    store.edit('clientId', ' id ')
    store.edit('clientSecret', 'secret')
    expect(await store.link()).toEqual(PASSED)
    expect(api.myEpoLink).toHaveBeenCalledWith({ clientId: 'id', clientSecret: 'secret' })
    expect(snapshot()).toMatchObject({
      busy: 'idle', draft: { clientId: '', clientSecret: '' }, outcome: PASSED,
      link: { state: 'linked', testedAt: PASSED.testedAt, portfolios: 1, mailbox: true },
    })
  })

  it('drops the draft after a refusal and keeps it when the EPO did not answer', async () => {
    const { store, snapshot } = bench({ myEpoLink: vi.fn(() => Promise.resolve(ok({ kind: 'refused' }))) })
    store.edit('clientId', 'id')
    store.edit('clientSecret', 'wrong')
    await store.link()
    expect(snapshot()).toMatchObject({ outcome: { kind: 'refused' }, draft: { clientId: '', clientSecret: '' }, link: { state: 'not-linked' } })
    const offline = bench({ myEpoLink: vi.fn(() => Promise.resolve(ok({ kind: 'unreachable' }))) })
    offline.store.edit('clientId', 'id')
    offline.store.edit('clientSecret', 'secret')
    await offline.store.link()
    expect(offline.snapshot()).toMatchObject({ outcome: { kind: 'unreachable' }, draft: { clientId: 'id', clientSecret: 'secret' } })
  })

  it('reports a refused call and refuses a second act while one runs', async () => {
    let finish = (): void => {}
    const { store, snapshot } = bench({
      myEpoTest: vi.fn(() => new Promise((resolve) => { finish = () => { resolve(refused('flowleap-connectors/rejected')) } })),
    })
    const running = store.test()
    expect(snapshot().busy).toBe('testing')
    expect(await store.test()).toBeUndefined()
    expect(await store.unlink()).toBe(false)
    store.edit('clientId', 'a')
    store.edit('clientSecret', 'b')
    expect(await store.link()).toBeUndefined()
    finish()
    expect(await running).toBeUndefined()
    expect(snapshot()).toMatchObject({ busy: 'idle', error: 'flowleap-connectors/rejected', draft: { clientId: 'a', clientSecret: 'b' } })
  })

  it('tests the stored link, and reads a not-linked answer as an unlinked card', async () => {
    const { store, snapshot } = bench({ myEpoTest: vi.fn(() => Promise.resolve(ok({ kind: 'not-linked' }))) })
    store.store.update((draft) => { draft.link = LINKED })
    await store.test()
    expect(snapshot().link).toEqual({ state: 'not-linked', writable: true })
  })

  it('replaces and unlinks', async () => {
    const { store, snapshot } = bench({ myEpoUnlink: vi.fn().mockResolvedValueOnce(refused('read-only')).mockResolvedValue(ok(undefined)) })
    store.store.update((draft) => { draft.link = LINKED })
    store.replace(true)
    expect(snapshot()).toMatchObject({ replacing: true, draft: { clientId: '', clientSecret: '' } })
    store.replace(false)
    expect(await store.unlink()).toBe(false)
    expect(snapshot()).toMatchObject({ error: 'read-only', link: LINKED })
    expect(await store.unlink()).toBe(true)
    expect(snapshot()).toMatchObject({ link: { state: 'not-linked', writable: true }, replacing: false })
  })
})
