import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { parseRoutePath, readRouteAddress, routePath, syncRouteAddress, writeRouteAddress } from '../src/client/address.ts'
import type { DeadlineId, DocumentId, FileNumber, TicketId } from '../src/client/api.ts'
import type { Route } from '../src/client/model.ts'
import { FIXTURE_IDS, R71_DOCUMENT } from './fixtures.client.ts'

const PANEL = 'flowleap-records'

describe('the address of a Matters panel route', () => {
  it('writes each view as its route path and reads it back', () => {
    const routes: [Route, string][] = [
      [{ view: 'intake', list: 'waiting', open: null }, 'intake'],
      [{ view: 'intake', list: 'filed-today', open: null }, 'intake/filed-today'],
      [{ view: 'intake', list: 'not-relevant', open: R71_DOCUMENT as DocumentId }, `intake/not-relevant/${R71_DOCUMENT}`],
      [{ view: 'work', id: FIXTURE_IDS.ticket as TicketId }, `work/${FIXTURE_IDS.ticket}`],
      [{ view: 'board' }, 'board'],
      [{ view: 'board', layout: 'list' }, 'board/list'],
      [{ view: 'matters' }, 'matters'],
      [{ view: 'matter', fileNumber: 'FL 2026/0001'.replace('/', '-') as FileNumber }, 'matter/FL%202026-0001'],
      [{ view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId }, `deadline/${FIXTURE_IDS.deadline}`],
    ]
    for (const [route, text] of routes) {
      expect(routePath(route)).toBe(text)
      expect(parseRoutePath(text)).toEqual(route)
    }
    expect(routePath({ view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId, step: 'reason' })).toBe(`intake/waiting/${R71_DOCUMENT}`)
  })

  it('names no route for a text with a bad id, an unknown view or list, or extra parts', () => {
    for (const text of [
      '', 'nothing', 'matters/x', 'board/columns', 'board/list/x', 'work', 'work/not-a-uuid', 'work/a/b', 'deadline/1',
      'deadline', 'matter', 'matter/%E0%A4%A', 'matter/a/b', 'intake/later', 'intake/waiting/abc', 'intake/waiting/a/b/c',
    ]) expect(parseRoutePath(text)).toBeNull()
  })

  it('throws any failure that is not a bad id', () => {
    const decode = vi.spyOn(globalThis, 'decodeURIComponent').mockImplementation(() => { throw new TypeError('defect') })
    expect(() => parseRoutePath('matter/x')).toThrow('defect')
    decode.mockRestore()
  })

  it('reads the route only when the address names this panel', () => {
    expect(readRouteAddress(`?page=${PANEL}&records=board`, PANEL)).toEqual({ view: 'board' })
    expect(readRouteAddress('?page=dashboard&records=board', PANEL)).toBeNull()
    expect(readRouteAddress(`?page=${PANEL}`, PANEL)).toBeNull()
    expect(readRouteAddress('', PANEL)).toBeNull()
  })

  it('keeps the route in the address while the panel is open and takes it out after', () => {
    let href = 'https://firm.test/?keep=1#top'
    const replace = vi.fn((next: string) => { href = next })
    const route = createSnapshotStore<Route>({ view: 'board' })
    const active = createSnapshotStore(false)
    const stop = syncRouteAddress({ route, active, panel: PANEL, address: { href: () => href, replace } })
    expect(replace).not.toHaveBeenCalled()
    active.set(true)
    expect(href).toBe(`https://firm.test/?keep=1&page=${PANEL}&records=board#top`)
    route.set({ view: 'work', id: FIXTURE_IDS.ticket as TicketId })
    expect(href).toBe(`https://firm.test/?keep=1&page=${PANEL}&records=work%2F${FIXTURE_IDS.ticket}#top`)
    route.set({ view: 'work', id: FIXTURE_IDS.ticket as TicketId })
    expect(replace).toHaveBeenCalledTimes(2)
    active.set(false)
    expect(href).toBe(`https://firm.test/?keep=1&page=${PANEL}#top`)
    stop()
    active.set(true)
    expect(replace).toHaveBeenCalledTimes(3)
    expect(writeRouteAddress('https://firm.test/', PANEL, null)).toBe('https://firm.test/')
  })
})
