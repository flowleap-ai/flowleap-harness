// @vitest-environment jsdom
/** The Firm identity section of Settings: the identity, the draft, Save, and the firm docket state with its read time. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess, bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
// Type-only: the LocaleNamespaceMap merge that gives the section its `t` seat.
import type {} from '../src/client/index.ts'
import type { DocketAnswer, DocketState, FirmIdentity, FirmIdentityAnswer } from '../src/add-client/wire.ts'
import type { FirmIdentityApi, HostResult } from '../src/client/add-client/api.ts'
import { FirmIdentitySection, FirmIdentityView, type FirmIdentitySectionProps } from '../src/client/add-client/FirmIdentity.tsx'
import { FirmIdentityModel, cleanIdentity, retryOf, type IdentityState } from '../src/client/add-client/identity-model.ts'
import { en } from '../src/client/add-client/locales/index.ts'
import { registerIdentityKeys } from '../src/client/keys.ts'
import { de } from '../src/client/add-client/locales/de.ts'
import { POLL_MS } from '../src/client/add-client/model.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }

const NONE: FirmIdentity = { names: [], addresses: [], representatives: [] }
const MUSTER: FirmIdentity = { names: ['Muster & Partner Patentanwälte mbB'], addresses: ['Musterstraße 1, 40211 Düsseldorf'], representatives: ['Becker, Anna', 'Weber, Jonas'] }
const AS_OF = '2026-11-09T09:12:00.000Z'
const docket = (state: DocketState): DocketAnswer => ({ status: 'docket', docket: state })
const READY = docket({ state: 'ready', rows: 38, asOf: AS_OF })
const READING = docket({ state: 'reading', progress: { slicesDone: 2, slices: 4, rows: 21 } })

/** The Host routes as a fake: each call takes the next answer of its list, else the last one. */
class FakeApi implements FirmIdentityApi {
  readonly calls: string[] = []
  readonly saved: FirmIdentity[] = []
  constructor(public answers: {
    identity?: HostResult<FirmIdentityAnswer>[]
    save?: HostResult<FirmIdentityAnswer>[]
    docket?: HostResult<DocketAnswer>[]
    read?: HostResult<DocketAnswer>[]
  }) {}

  private next<T>(list: HostResult<T>[] | undefined): Promise<HostResult<T>> {
    if (list === undefined || list.length === 0) throw new Error('no answer')
    return Promise.resolve(list.length > 1 ? list.shift()! : list[0]!)
  }

  identity() { this.calls.push('identity'); return this.next(this.answers.identity) }
  save(identity: FirmIdentity) { this.calls.push('save'); this.saved.push(identity); return this.next(this.answers.save) }
  docket() { this.calls.push('docket'); return this.next(this.answers.docket) }
  readDocket(slices: 'all' | 'failed') { this.calls.push(`read ${slices}`); return this.next(this.answers.read) }
}

const ok = <T,>(value: T): HostResult<T> => ({ ok: true, value })

// Global standard kit stubs: the section consumes none of these hooks.
const unusedHook = (() => { throw new Error('unused by the firm identity section') }) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo: unusedHook, useSessionRetainInfo: () => undefined,
  useResource, useWorkspaces: unusedHook, ...allowAllAccess, useContextMenu: contextMenuHook(),
}
/** The shortcut catalog with the section's Try again command, as the plugin registers it. */
function catalog(): ShortcutRegistry['catalog'] {
  const registry = new ShortcutRegistry('web', 'macos', undefined, 500)
  const ctx = { shortcuts: registry, effect: (setup: () => () => void) => { setup() } } as never
  registerIdentityKeys(ctx, () => undefined, makeTranslate(en))
  return registry.catalog
}

/** Mount the section as the settings shell does. */
function mount(api: FakeApi, language: 'en' | 'de' = 'en') {
  const model = new FirmIdentityModel(api)
  const props: FirmIdentitySectionProps = {
    ...kit, close: vi.fn(), t: makeTranslate(language === 'en' ? en : de), model,
    useIdentity: bindSnapshotSelector(model.store), useCatalog: bindSnapshotSelector(catalog()),
    useLanguage: bindSnapshotSelector(createSnapshotStore(language)),
  }
  const view = render(<FirmIdentitySection {...props} />)
  return { model, view }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const field = (name: string) => screen.getByRole<HTMLInputElement>('textbox', { name })
const type = async (target: HTMLInputElement, text: string) => {
  fireEvent.change(target, { target: { value: text } })
  await flush()
}
const click = async (target: Element) => {
  fireEvent.click(target)
  await flush()
}

describe('the Firm identity section', () => {
  it('shows the confidentiality line verbatim, the docket with its read time, and the three lists, with Save waiting for a change', async () => {
    const api = new FakeApi({ identity: [ok({ identity: MUSTER, docket: READY })] })
    mount(api)
    await flush()
    expect(screen.getByText('FlowLeap sends your firm’s names to the EP Register, through your firm’s EPO account, to read your EP docket. It sends no client name.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Firm identity' })).toBeTruthy()
    expect(screen.getByText('Your firm’s EP docket: 38 EP applications.')).toBeTruthy()
    expect(screen.getByText(/^Read from the EP Register, as of Nov 9, 2026, /u)).toBeTruthy()
    expect(field('Firm name 1').value).toBe('Muster & Partner Patentanwälte mbB')
    expect(field('Street and number, postcode and town 1').value).toBe('Musterstraße 1, 40211 Düsseldorf')
    expect([field('Surname, first name 1').value, field('Surname, first name 2').value]).toEqual(['Becker, Anna', 'Weber, Jonas'])
    expect(button('Save')).toHaveProperty('disabled', true)
    expect(button('Read again')).toHaveProperty('disabled', false)
  })

  it('shows the German confidentiality line of the approved mockup', async () => {
    mount(new FakeApi({ identity: [ok({ identity: MUSTER, docket: READY })] }), 'de')
    await flush()
    expect(screen.getByText('FlowLeap sendet die Namen Ihrer Kanzlei über das EPA-Konto Ihrer Kanzlei an das EP-Register, um Ihren EP-Bestand zu lesen. Es sendet keinen Mandantennamen.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Kanzleidaten' })).toBeTruthy()
  })

  it('with no identity, Save waits for a value and then starts the first read, which the section follows', async () => {
    vi.useFakeTimers()
    const api = new FakeApi({
      identity: [ok({ identity: NONE, docket: docket({ state: 'no_identity' }) })],
      save: [ok({ identity: { ...NONE, names: ['Muster & Partner'] }, docket: READING })],
      docket: [READING, READY].map(ok),
    })
    const { model } = mount(api)
    await flush()
    expect(screen.getByText(en['docket.none'])).toBeTruthy()
    expect(button('Save')).toHaveProperty('disabled', true)
    await type(field('Firm name 1'), '   ')
    expect(button('Save')).toHaveProperty('disabled', true)
    await type(field('Firm name 1'), ' Muster & Partner ')
    expect(button('Save')).toHaveProperty('disabled', false)
    await click(button('Save'))
    expect(api.saved).toEqual([{ ...NONE, names: ['Muster & Partner'] }])
    expect(field('Firm name 1').value).toBe('Muster & Partner')
    expect(button('Save')).toHaveProperty('disabled', true)
    expect(screen.getByText('Reading your firm’s EP docket: 2 of 4 parts, 21 EP applications so far.')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS) })
    expect(api.calls).toEqual(['identity', 'save', 'docket'])
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS) })
    expect(screen.getByText('Your firm’s EP docket: 38 EP applications.')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3) })
    expect(api.calls).toEqual(['identity', 'save', 'docket', 'docket'])
    model.dispose()
  })

  it('adds, edits and removes entries; a failed save keeps the draft and Try again saves it again', async () => {
    const api = new FakeApi({
      identity: [ok({ identity: { ...NONE, names: ['Muster & Partner'] }, docket: READY })],
      save: [{ ok: false, error: 'internal' }, ok({ identity: { ...NONE, names: ['Muster & Partner'], representatives: ['Becker, Anna'] }, docket: READY })],
    })
    const { model } = mount(api)
    await flush()
    await click(button('Add a representative'))
    await click(button('Add a representative'))
    expect(screen.getAllByRole('textbox', { name: /^Surname, first name/u })).toHaveLength(3)
    expect(document.activeElement).toBe(field('Surname, first name 3'))
    await type(field('Surname, first name 1'), 'Becker, Anna')
    await click(button('Remove Surname, first name 3'))
    await click(button('Add a name'))
    await type(field('Firm name 2'), 'Muster & Partner')
    await click(button('Remove Firm name 2'))
    expect(cleanIdentity((model.state as Extract<IdentityState, { status: 'ready' }>).draft)).toEqual({ ...NONE, names: ['Muster & Partner'], representatives: ['Becker, Anna'] })
    await click(button('Save'))
    expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not save your firm identity. Nothing changed. FlowLeap could not do this.')
    expect(field('Surname, first name 1').value).toBe('Becker, Anna')
    retryOf(model)!()
    await flush()
    expect(api.saved).toHaveLength(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(retryOf(model)).toBeUndefined()
    await click(button('Remove Firm name 1'))
    expect(screen.getAllByRole('textbox', { name: /^Firm name/u })).toHaveLength(1)
    await click(button('Remove Firm name 1'))
    expect(field('Firm name 1').value).toBe('')
  })

  it('reads again in full, and tries again only the failed slices of a partial or failed docket, also with R', async () => {
    const partial = docket({ state: 'partial', rows: 37, asOf: AS_OF, failed: [{ query: 're="Weber, Jonas"', reason: 'unreachable' }], mismatches: [] })
    const api = new FakeApi({
      identity: [ok({ identity: MUSTER, docket: READY })],
      read: [READING, docket({ state: 'failed', reason: 'no-key', failed: [] })].map(ok),
      docket: [ok(partial)],
    })
    vi.useFakeTimers()
    const { model } = mount(api)
    await flush()
    await click(button('Read again'))
    expect(api.calls).toEqual(['identity', 'read all'])
    expect(screen.queryByRole('button', { name: 'Read again' })).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS) })
    expect(screen.getByText('Your firm’s EP docket is incomplete.')).toBeTruthy()
    expect(screen.getByText(/^37 EP applications, as of Nov 9, 2026, .* so the counts At your firm can be too low\.$/u)).toBeTruthy()
    expect(button(/^Try again/u).textContent).toBe('Try againR')
    await click(button(/^Try again/u))
    expect(api.calls.at(-1)).toBe('read failed')
    expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not read your firm’s EP docket. FlowLeap has no EPO key. Add it in Patent data connectors.')
    retryOf(model)!()
    await flush()
    expect(api.calls.at(-1)).toBe('read failed')
    model.dispose()
  })

  it('reports a failed new read, and Try again repeats it', async () => {
    const api = new FakeApi({
      identity: [ok({ identity: MUSTER, docket: READY })],
      read: [{ ok: false, error: 'network' }, ok(READY)],
    })
    const { model } = mount(api)
    await flush()
    await click(button('Read again'))
    expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not start a new read of your EP docket.')
    retryOf(model)!()
    await flush()
    expect(api.calls).toEqual(['identity', 'read all', 'read all'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a failed load with Try again, and loads again', async () => {
    const api = new FakeApi({ identity: [{ ok: false, error: 'network' }, { ok: false, error: 'internal' }, ok({ identity: MUSTER, docket: { status: 'no-plugin' } })] })
    const { model } = mount(api)
    expect(screen.getByRole('status', { name: 'Loading your firm identity' })).toBeTruthy()
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not load your firm identity. FlowLeap could not reach the server.')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await click(button(/^Try again/u))
    expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not do this.')
    retryOf(model)!()
    await flush()
    expect(screen.getByText(en['docket.noPlugin'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read again' })).toBeNull()
  })

  it('keeps an unsaved draft when the section opens again, and stops following the read when it closes', async () => {
    vi.useFakeTimers()
    const api = new FakeApi({
      identity: [ok({ identity: MUSTER, docket: READING }), ok({ identity: MUSTER, docket: READING }), { ok: false, error: 'network' }],
      docket: [{ ok: false, error: 'network' }, ok(READING)],
    })
    const { model, view } = mount(api)
    await flush()
    await type(field('Firm name 1'), 'Muster & Partner')
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2) })
    expect(api.calls).toEqual(['identity', 'docket', 'docket'])
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3) })
    expect(api.calls).toEqual(['identity', 'docket', 'docket'])
    await model.load()
    expect((model.state as Extract<IdentityState, { status: 'ready' }>).draft.names).toEqual(['Muster & Partner'])
    await model.load()
    expect(model.state.status).toBe('ready')
    model.close()
    model.dispose()
  })

  it('drops an answer that comes after the section closed or the plugin stopped', async () => {
    vi.useFakeTimers()
    let answer: (value: HostResult<DocketAnswer>) => void = () => {}
    const api = new FakeApi({ identity: [ok({ identity: MUSTER, docket: READING })], read: [ok(READY)] })
    api.docket = () => new Promise((resolve) => { answer = resolve })
    const model = new FirmIdentityModel(api)
    await model.load()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    model.close()
    answer(ok(READY))
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect((model.state as Extract<IdentityState, { status: 'ready' }>).docket).toEqual(READING)
    api.readDocket = () => new Promise((resolve) => { answer = resolve })
    const reading = model.readAgain('all')
    model.dispose()
    answer(ok(READY))
    await reading
    expect((model.state as Extract<IdentityState, { status: 'ready' }>).busy).toBe('read')
  })

  it('renders each docket state with its status words', () => {
    const model = new FirmIdentityModel(new FakeApi({}))
    const state = (answer: DocketAnswer): IdentityState => ({ status: 'ready', saved: MUSTER, draft: MUSTER, docket: answer, busy: null, failure: null })
    const show = (answer: DocketAnswer) => render(<FirmIdentityView t={makeTranslate(en)} state={state(answer)} model={model} locale="en" retryKeycaps={[]} />)
    show(docket({ state: 'interrupted', progress: { slicesDone: 1, slices: 4, rows: 9 } }))
    expect(screen.getByText('The read of your firm’s EP docket stopped at 1 of 4 parts.')).toBeTruthy()
    expect(button('Read again')).toBeTruthy()
    cleanup()
    show(docket({ state: 'stale', rows: 1, asOf: AS_OF }))
    expect(screen.getByText(/^Your firm’s EP docket is out of date: 1 EP application, as of Nov 9, 2026, /u)).toBeTruthy()
    cleanup()
    for (const reason of ['unreachable', 'malformed', 'day-over-limit', 'internal'] as const) {
      show(docket({ state: 'failed', reason, failed: [] }))
      expect(screen.getByRole('alert').textContent).toContain(en[`docket.reason.${reason}`])
      cleanup()
    }
  })

  it('cannot save or read again while an act runs or before the identity is there', async () => {
    const model = new FirmIdentityModel(new FakeApi({}))
    await model.save()
    await model.readAgain('all')
    model.edit('names', 0, 'Muster')
    expect(model.state).toEqual({ status: 'loading' })
    expect(retryOf(model)).toBeUndefined()
    let release: (value: HostResult<FirmIdentityAnswer>) => void = () => {}
    const api = new FakeApi({ identity: [ok({ identity: MUSTER, docket: READY })] })
    api.save = () => new Promise((resolve) => { release = resolve })
    const busy = new FirmIdentityModel(api)
    await busy.load()
    busy.edit('names', 0, 'Muster')
    const saving = busy.save()
    await busy.save()
    await busy.readAgain('all')
    expect(retryOf(busy)).toBeUndefined()
    busy.dispose()
    release(ok({ identity: MUSTER, docket: READY }))
    await saving
    expect((busy.state as Extract<IdentityState, { status: 'ready' }>).busy).toBe('save')
    const late = new FirmIdentityModel(new FakeApi({ identity: [ok({ identity: MUSTER, docket: READY })], read: [ok(READY)] }))
    const loading = late.load()
    late.dispose()
    await loading
    expect(late.state).toEqual({ status: 'loading' })
  })
})
