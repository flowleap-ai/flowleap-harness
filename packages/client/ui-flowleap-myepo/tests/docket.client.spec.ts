import { describe, expect, it, vi } from 'vitest'
import type { MyEpoApplicationDetailView, MyEpoApplicationsView } from '@deepseek-ai/dsh-api-remotes/client'
import {
  applicantOf, applicationKey, createDocket, nextDueOf, PAGE_SIZE, shownApplications, titleOf,
  type Answer, type ApplicationData, type DocketDependencies, type DocketSnapshot,
} from '../src/client/applications/docket.ts'
import { APPLICATIONS, DETAIL, failed, KEYS, LIST, ok, TODAY } from './applications-fixture.client.ts'

const ready = (detail: MyEpoApplicationDetailView): ApplicationData => ({ status: 'ready', detail })

function bench(overrides: Partial<DocketDependencies> = {}) {
  const list = vi.fn(overrides.list ?? (() => Promise.resolve(ok<MyEpoApplicationsView>(LIST))))
  const read = vi.fn(overrides.read ?? ((_procedure: string, _number: string) => Promise.resolve(ok<MyEpoApplicationDetailView>(DETAIL))))
  const deps = { list, read, today: () => TODAY }
  const docket = createDocket(deps)
  const state = () => docket.hooks.docket.getSnapshot()
  /** Wait until the data of every wanted application is read. */
  const settled = () => vi.waitFor(() => { expect(Object.values(state().data).every(data => data.status !== 'loading')).toBe(true) })
  return { deps, docket, state, settled }
}

describe('the values of an application row', () => {
  it('keys a row by its procedure and its number', () => {
    expect(APPLICATIONS.map(applicationKey)).toEqual([...KEYS])
  })

  it('reads the title, the first applicant and the next due date from the data, once it is read', () => {
    for (const data of [undefined, { status: 'loading' }, { status: 'failed', message: 'x' }, ready({ kind: 'no-permission' })] as const) {
      expect([titleOf(data), applicantOf(data), nextDueOf(data, TODAY)]).toEqual([null, null, null])
    }
    expect([titleOf(ready(DETAIL)), applicantOf(ready(DETAIL)), nextDueOf(ready(DETAIL), TODAY)]).toEqual(['Scale', 'Renishaw plc', '2027-01-29'])
    expect(titleOf(ready({ ...DETAIL, titles: { DE: 'Maßstab', FR: 'Règle' } }))).toBe('Maßstab')
    expect(titleOf(ready({ ...DETAIL, titles: { FR: 'Règle', IT: 'Scala' } }))).toBe('Règle')
    expect(titleOf(ready({ ...DETAIL, titles: { IT: 'Scala' } }))).toBe('Scala')
    expect(titleOf(ready({ ...DETAIL, titles: {} }))).toBeNull()
    expect(applicantOf(ready({ ...DETAIL, applicants: [] }))).toBeNull()
    // Every due date is in the past.
    expect(nextDueOf(ready(DETAIL), '2028-01-01')).toBeNull()
  })

  it('filters by procedure, portfolio and text, and sorts by each column with an empty value last', () => {
    const base: Pick<DocketSnapshot, 'applications' | 'data' | 'view' | 'portfolio' | 'query' | 'sort'> = {
      applications: APPLICATIONS, data: {}, view: 'all', portfolio: null, query: '', sort: { column: 'filed', direction: 'descending' },
    }
    const keys = (change: Partial<typeof base>) => shownApplications({ ...base, ...change }, TODAY).map(applicationKey)
    expect(keys({})).toEqual([...KEYS])
    expect(keys({ view: 'UPP' })).toEqual([KEYS[1]])
    expect(keys({ view: 'EPC', portfolio: 'p2' })).toEqual([KEYS[2], KEYS[3]])
    expect(keys({ query: ' c-REF ' })).toEqual([KEYS[3]])
    expect(keys({ query: 'portfolio two' })).toEqual([KEYS[2], KEYS[3]])
    expect(keys({ query: 'ep00000002.6' })).toEqual([KEYS[2]])
    // The title and the applicant match once the data is read.
    expect(keys({ query: 'scale' })).toEqual([])
    expect(keys({ query: 'scale', data: { [KEYS[3]]: ready(DETAIL) } })).toEqual([KEYS[3]])
    expect(keys({ query: 'renishaw', data: { [KEYS[0]]: ready(DETAIL) } })).toEqual([KEYS[0]])
    // The application with no reference is last in both directions.
    expect(keys({ sort: { column: 'reference', direction: 'ascending' } })).toEqual([KEYS[1], KEYS[0], KEYS[3], KEYS[2]])
    expect(keys({ sort: { column: 'reference', direction: 'descending' } })).toEqual([KEYS[3], KEYS[0], KEYS[1], KEYS[2]])
    // Two rows have the same number: they keep the order of the list.
    expect(keys({ sort: { column: 'number', direction: 'ascending' } })).toEqual([...KEYS])
    expect(keys({ sort: { column: 'portfolio', direction: 'descending' } })).toEqual([KEYS[2], KEYS[3], KEYS[0], KEYS[1]])
    expect(keys({ sort: { column: 'filed', direction: 'ascending' } })).toEqual([KEYS[3], KEYS[2], KEYS[1], KEYS[0]])
    const later = ready({ ...DETAIL, dueDates: [{ ...DETAIL.dueDates[0]!, dueDate: '2027-06-01' }] })
    expect(keys({ sort: { column: 'due', direction: 'ascending' }, data: { [KEYS[3]]: ready(DETAIL), [KEYS[1]]: later } })).toEqual([KEYS[3], KEYS[1], KEYS[0], KEYS[2]])
  })
})

describe('the Applications page model', () => {
  it('reads the list when the first observer arrives, then the data of each shown application, one at a time', async () => {
    const { deps, docket, state, settled } = bench()
    expect(state()).toMatchObject({ phase: 'loading', applications: [], limit: PAGE_SIZE })
    const seen = vi.fn()
    const stop = docket.hooks.docket.subscribe(seen)
    const stopSecond = docket.hooks.docket.subscribe(() => {})
    expect(state().reading).toBe(true)
    // A list read is already crossing the wire.
    await docket.refresh()
    await vi.waitFor(() => { expect(Object.keys(state().data)).toHaveLength(4) })
    await settled()
    expect(deps.list).toHaveBeenCalledTimes(1)
    expect(deps.read.mock.calls).toEqual([['EPC', 'EP00000001'], ['UPP', 'EP00000001'], ['EPC', 'EP00000002'], ['EPC', 'EP00000003']])
    expect(state()).toMatchObject({ phase: 'ready', reading: false, failure: null, total: 4, readAt: LIST.readAt })
    expect(state().data[KEYS[0]]).toEqual({ status: 'ready', detail: DETAIL })
    expect(seen).toHaveBeenCalled()
    stop()
    stopSecond()
    // A later observer of a read list starts no read.
    docket.hooks.docket.subscribe(() => {})()
    expect(deps.list).toHaveBeenCalledTimes(1)
  })

  it('keeps the last list when a later read gives none, and says why', async () => {
    const answers: Answer<MyEpoApplicationsView>[] = [ok(LIST), ok({ kind: 'unreachable' }), failed('connection lost')]
    const { docket, state, settled } = bench({ list: () => Promise.resolve(answers.shift() as Answer<MyEpoApplicationsView>) })
    await docket.refresh()
    await settled()
    await docket.refresh()
    expect(state()).toMatchObject({ failure: { kind: 'unreachable' }, applications: APPLICATIONS, readAt: LIST.readAt })
    await docket.refresh()
    expect(state()).toMatchObject({ failure: { kind: 'error', message: 'connection lost' }, applications: APPLICATIONS })
  })

  it('records a failed read of the data, reads it again on request, and reads the open application first', async () => {
    const answers = new Map<string, (answer: Answer<MyEpoApplicationDetailView>) => void>()
    const read = vi.fn((procedure: string, number: string) => new Promise<Answer<MyEpoApplicationDetailView>>((resolve) => {
      answers.set(`${procedure}:${number}`, resolve)
    }))
    const { docket, state } = bench({ read })
    await docket.refresh()
    expect(state().data[KEYS[0]]).toEqual({ status: 'loading' })
    // The person opens the last row while the first read runs: it is the next read.
    docket.select(KEYS[3])
    answers.get(KEYS[0])?.(failed('the EPO did not answer'))
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
    expect(state().data[KEYS[0]]).toEqual({ status: 'failed', message: 'the EPO did not answer' })
    expect(read.mock.calls[1]).toEqual(['EPC', 'EP00000003'])
    answers.get(KEYS[3])?.(ok(DETAIL))
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(3) })
    answers.get(KEYS[1])?.(ok(DETAIL))
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(4) })
    answers.get(KEYS[2])?.(ok({ kind: 'no-permission' }))
    await vi.waitFor(() => { expect(state().data[KEYS[2]]).toEqual({ status: 'ready', detail: { kind: 'no-permission' } }) })
    // The failed read is not repeated until the person asks.
    expect(read).toHaveBeenCalledTimes(4)
    docket.retry(KEYS[0])
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(5) })
    answers.get(KEYS[0])?.(ok(DETAIL))
    await vi.waitFor(() => { expect(state().data[KEYS[0]]).toEqual({ status: 'ready', detail: DETAIL }) })
  })

  it('drops the data of an older list when a new list read answers', async () => {
    let answer: (value: Answer<MyEpoApplicationDetailView>) => void = () => {}
    const read = vi.fn(() => new Promise<Answer<MyEpoApplicationDetailView>>((resolve) => { answer = resolve }))
    const { docket, state } = bench({ read })
    await docket.refresh()
    const old = answer
    await docket.refresh()
    expect(state().data).toEqual({})
    old(ok({ kind: 'no-permission' }))
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
    // The answer for the old list is not stored; the row is read again for the new list.
    expect(state().data[KEYS[0]]).toEqual({ status: 'loading' })
    answer(ok(DETAIL))
    await vi.waitFor(() => { expect(state().data[KEYS[0]]).toEqual({ status: 'ready', detail: DETAIL }) })
  })

  it('steps through the shown list, stops at its ends, and closes the open application', async () => {
    const { docket, state, settled } = bench()
    // Nothing is listed before the first read.
    docket.step(1)
    expect(state().selected).toBeNull()
    await docket.refresh()
    await settled()
    docket.step(1)
    expect(state().selected).toBe(KEYS[0])
    docket.step(-1)
    expect(state().selected).toBe(KEYS[0])
    docket.step(1)
    expect(state().selected).toBe(KEYS[1])
    docket.setView('EPC')
    // The open application is not in this view: the step opens the first one.
    docket.step(1)
    expect(state().selected).toBe(KEYS[0])
    docket.step(1)
    docket.step(1)
    docket.step(1)
    expect(state().selected).toBe(KEYS[3])
    docket.select(null)
    expect(state().selected).toBeNull()
  })

  it('changes the filters, the sort and the row limit', async () => {
    const { docket, state, settled } = bench()
    await docket.refresh()
    await settled()
    docket.more()
    expect(state().limit).toBe(2 * PAGE_SIZE)
    docket.setView('UPP')
    expect(state()).toMatchObject({ view: 'UPP', limit: PAGE_SIZE })
    docket.more()
    docket.setPortfolio('p2')
    expect(state()).toMatchObject({ portfolio: 'p2', limit: PAGE_SIZE })
    docket.more()
    docket.setQuery('ref')
    expect(state()).toMatchObject({ query: 'ref', limit: PAGE_SIZE })
    docket.sortBy('reference')
    expect(state().sort).toEqual({ column: 'reference', direction: 'ascending' })
    docket.sortBy('reference')
    expect(state().sort).toEqual({ column: 'reference', direction: 'descending' })
    docket.sortBy('due')
    expect(state().sort).toEqual({ column: 'due', direction: 'ascending' })
  })
})
