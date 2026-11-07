import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { findMatters, type FileNumber } from '../src/client/api.ts'
import { createMatterFinder, findItem } from '../src/client/find.ts'
import { CommandItemRegistry } from '../src/client/key-layer.ts'
import { en } from '../src/client/locales.ts'
import { createFixtureApi, fixtures } from './fixtures.client.ts'

const t = makeTranslate(en)

describe('Find a matter', () => {
  it('finds the matters whose file number, title or client holds the query, in the list order', () => {
    const rows = fixtures.matters.rows
    expect(findMatters(rows, '')).toEqual(rows)
    expect(findMatters(rows, '  ')).toEqual(rows)
    expect(findMatters(rows, 'fl-2026-0001').map(row => row.fileNumber)).toEqual(['FL-2026-0001'])
    expect(findMatters(rows, 'BRAKE').map(row => row.fileNumber)).toEqual(['FL-2025-0412'])
    expect(findMatters(rows, 'nordwind').map(row => row.fileNumber)).toEqual(['FL-2026-0019', 'FL-2026-0044', 'FL-2023-0610'])
    expect(findMatters(rows, 'no such matter')).toEqual([])
  })

  it('shows one row for each matter, under the wall note, and opens its dossier', () => {
    const open = vi.fn((_fileNumber: FileNumber) => {})
    const item = findItem(t, fixtures.matters.rows.slice(0, 2), open)
    expect(item.label).toBe(en['find.label'])
    expect(item.groups).toHaveLength(1)
    expect(item.groups[0]!.label).toBe(en['find.group'])
    expect(item.groups[0]!.acts.map(act => act.label)).toEqual([
      'FL-2026-0001 Pressure sensor housing · Kessler Sensorik GmbH',
      'FL-2025-0412 Brake caliper bracket · Halberg Automotive SE',
    ])
    item.groups[0]!.acts[1]!.run()
    expect(open).toHaveBeenCalledWith('FL-2025-0412')
  })

  it('says that the matters did not load as one disabled row', () => {
    const item = findItem(t, null, vi.fn())
    expect(item.groups[0]!.acts).toEqual([expect.objectContaining({ label: en['find.failed'], disabled: true })])
  })

  it('offers itself to ⌘K only while an IPMS panel is open, and always when the person asks for it', async () => {
    const { api } = createFixtureApi()
    let open = false
    const openInMatters = vi.fn()
    const finder = createMatterFinder(api, t, openInMatters, () => open)
    expect(finder.item(true)).toBeNull()
    await finder.refresh(new AbortController().signal)
    expect(finder.item()).toBeNull()
    expect(finder.item(true)?.groups[0]!.acts).toHaveLength(fixtures.matters.rows.length)
    open = true
    expect(finder.item()?.label).toBe(en['find.label'])
    finder.item()!.groups[0]!.acts[0]!.run()
    expect(openInMatters).toHaveBeenCalledWith({ view: 'matter', fileNumber: 'FL-2026-0001' })
  })

  it('keeps the last matters when a read is stopped, and says so when a read fails', async () => {
    const { api } = createFixtureApi()
    const search = vi.spyOn(api, 'searchMatters')
    const finder = createMatterFinder(api, t, vi.fn(), () => true)
    await finder.refresh(new AbortController().signal)
    search.mockResolvedValueOnce({ ok: false, error: { kind: 'aborted' } })
    await finder.refresh(new AbortController().signal)
    expect(finder.item()?.groups[0]!.acts).toHaveLength(fixtures.matters.rows.length)
    search.mockResolvedValueOnce({ ok: false, error: { kind: 'network' } })
    await finder.refresh(new AbortController().signal)
    expect(finder.item()?.groups[0]!.acts[0]!.label).toBe(en['find.failed'])
  })

  it('shows an offered item once, then the open item, then the fallback', () => {
    const fallback = { label: 'fallback', groups: [] }
    const offered = { label: 'offered', groups: [] }
    const open = { label: 'open', groups: [] }
    const items = new CommandItemRegistry(() => fallback)
    expect(items.item()).toBe(fallback)
    const dispose = items.provide({ current: open })
    items.offer(offered)
    expect(items.item()).toBe(offered)
    expect(items.item()).toBe(open)
    dispose()
    expect(items.item()).toBe(fallback)
    expect(new CommandItemRegistry().item()).toBeNull()
  })
})
