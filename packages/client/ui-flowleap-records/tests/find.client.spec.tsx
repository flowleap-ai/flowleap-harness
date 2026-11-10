// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createRecordsApi, parsers, type RecordsApi } from '../src/client/api.ts'
import { extraMatches, SEARCH_PAUSE_MS } from '../src/client/find.ts'
import { FindDialog, type FindDialogProps } from '../src/client/FindDialog.tsx'
import { de, en } from '../src/client/locales.ts'
import { createFixtureApi, searchWire } from './fixtures.client.ts'

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom lays nothing out, so it has no scrollIntoView for the selected option.
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Let the pause pass and the fixture answer settle. */
async function settle(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS + 10) })
}

/**
 * Render the dialog open over a search read.
 * @param search - the search read.
 * @param language - the UI language.
 * @returns the close and open-matter spies.
 */
function mountDialog(search: RecordsApi['search'], language: 'en' | 'de' = 'en') {
  const close = vi.fn()
  const openMatter = vi.fn()
  const props = {
    t: makeTranslate(language === 'de' ? de : en), useOpening: bindSnapshotSelector(createSnapshotStore<number | null>(1)), search, close, openMatter,
  } as FindDialogProps
  render(<FindDialog {...props} />)
  return { close, openMatter }
}

const type = (text: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }) }

describe('the search read', () => {
  it('asks GET search with the query and the limit, and reads the answer', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(searchWire('kessler')), { status: 200 }))
    const api = createRecordsApi('records/', fetchImpl)
    const answer = await api.search('Kessler Sensorik', new AbortController().signal)
    expect(fetchImpl.mock.calls[0]![0]).toBe('records/api/search?q=Kessler%20Sensorik&limit=20')
    expect(answer.ok && answer.value.matters.map(matter => matter.fileNumber)).toEqual(['FL-2026-0001', 'FL-2025-0203', 'FL-2026-0007'])
  })

  it('shows the matched application number or person beside the client, never the matched title or file number', () => {
    const matter = parsers.searchAnswer(searchWire('kessler'), 'search').matters[0]!
    expect(extraMatches(matter)).toEqual([])
    expect(extraMatches({ ...matter, matched: [{ field: 'applicationNumber', value: 'EP24123456' }, { field: 'person', value: 'Lena Hoffmann' }, { field: 'title', value: 'x' }] }))
      .toEqual(['EP24123456', 'Lena Hoffmann'])
  })
})

describe('Find a matter', () => {
  it('says what to type, then shows the matters that the record finds, and opens one with ↵', async () => {
    const { api } = createFixtureApi()
    const search = vi.spyOn(api, 'search')
    const { close, openMatter } = mountDialog(search)
    expect(screen.getByRole('status').textContent).toBe(en['find.hint'])
    expect(screen.getByText(en['find.group'])).toBeTruthy()
    type('nord')
    expect(search).not.toHaveBeenCalled()
    await settle()
    expect(search).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Matters · client')).toBeTruthy()
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'FL-2026-0019Heat pump expansion valveNordwind Energie AG',
      'FL-2026-0044Offshore cable clampNordwind Energie AG',
      'FL-2023-0610Rotor blade clampNordwind Energie AG',
    ])
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    expect(close).toHaveBeenCalled()
    expect(openMatter).toHaveBeenCalledWith('FL-2026-0044')
  })

  it('groups the matters under the field that each matched, and moves through the groups in order', async () => {
    const answer = parsers.searchAnswer(searchWire('kessler'), 'search')
    type Found = typeof answer.matters[number]
    const [first, second, third] = answer.matters as [Found, Found, Found]
    const byNumber = { ...second, matched: [{ field: 'applicationNumber' as const, value: 'EP24123456' }] }
    const mixed = vi.fn<RecordsApi['search']>(async () => ({ ok: true, value: { ...answer, matters: [first, byNumber, third] } }))
    const { openMatter } = mountDialog(mixed, 'de')
    type('kessler')
    await settle()
    expect(screen.getByText('Akten · Mandant')).toBeTruthy()
    expect(screen.getByText('Akten · Anmeldenummer')).toBeTruthy()
    expect(screen.getAllByRole('option').map(option => option.textContent?.slice(0, 12))).toEqual([first.fileNumber, third.fileNumber, second.fileNumber])
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    expect(openMatter).toHaveBeenCalledWith(second.fileNumber)
  })

  it('reads once after the person stops typing, and says when nothing matches', async () => {
    const { api } = createFixtureApi()
    const search = vi.spyOn(api, 'search')
    mountDialog(search)
    type('n')
    type('no')
    type('no such')
    await settle()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]![0]).toBe('no such')
    expect(screen.getByRole('status').textContent).toBe(en['find.none'])
  })

  it('says that the search failed, and that more matters match', async () => {
    const failing = vi.fn<RecordsApi['search']>(async () => ({ ok: false, error: { kind: 'network' } }))
    mountDialog(failing)
    type('x')
    await settle()
    expect(screen.getByRole('status').textContent).toBe(en['find.failed'])
    cleanup()
    const more = vi.fn<RecordsApi['search']>(async () => ({ ok: true, value: { ...parsers.searchAnswer(searchWire('kessler'), 'search'), more: true } }))
    mountDialog(more, 'de')
    type('kessler')
    await settle()
    expect(screen.getByText(de['find.more'])).toBeTruthy()
  })
})
