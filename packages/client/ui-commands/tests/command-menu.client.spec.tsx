// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate, TestSessions } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { createCommandMenu } from '../src/client/command-menu.ts'
import type { CommandMenuItem } from '../src/client/command-menu.ts'
import { CommandMenuView } from '../src/client/CommandMenuView.tsx'
import type { CommandMenuInjected } from '../src/client/CommandMenuView.tsx'
import { apply, inject } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'

const device = vi.hoisted(() => ({ mobile: false }))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async original => ({
  ...await original<typeof import('@deepseek-ai/dsh-client-ui-primitives')>(), isMobileDevice: () => device.mobile,
}))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); device.mobile = false })
// jsdom has no scrollIntoView; the view calls it on the highlighted row.
Element.prototype.scrollIntoView = () => {}

const labels = () => ({ group: 'Application', search: 'Search' })
const acceptId = 'records.part.accept' as ShortcutCommandId
function item(run: Record<string, () => void>, disabled = false): CommandMenuItem {
  return { label: 'EP 3 456 789 · Rule 71(3) communication', groups: [
    { id: 'decision', label: 'Decision', acts: [
      { id: 'accept', label: 'Accept', commandId: acceptId, run: run.accept ?? (() => {}) },
      { id: 'reject', label: 'Reject', disabled, run: run.reject ?? (() => {}) },
    ] },
    { id: 'go', label: 'Go to', acts: [{ id: 'letter', label: 'Open the letter', run: run.letter ?? (() => {}) }] },
  ] }
}

describe('command menu controller', () => {
  it('keeps the Search command when no contribution has an open item', () => {
    const menu = createCommandMenu(labels)
    const search = vi.fn()
    expect(menu.toggle(search)).toBe(false)
    const off = menu.contribute({ item: () => null })
    expect(menu.toggle(search)).toBe(false)
    expect(menu.state.getSnapshot().open).toBe(false)
    off(); off()
    expect(search).not.toHaveBeenCalled()
  })

  it('opens the latest contribution with an item, its acts first and the application Search last', () => {
    vi.useFakeTimers()
    const menu = createCommandMenu(labels)
    const search = vi.fn()
    const accept = vi.fn()
    menu.contribute({ item: () => ({ label: 'Older', groups: [] }) })
    menu.contribute({ item: () => item({ accept }) })
    menu.contribute({ item: () => null })
    expect(menu.toggle(search)).toBe(true)
    const state = menu.state.getSnapshot()
    expect(state).toMatchObject({ open: true, occurrence: 1, item: 'EP 3 456 789 · Rule 71(3) communication' })
    expect(state.rows.map(row => [row.id, row.group.label, row.commandId, row.disabled])).toEqual([
      ['decision/accept', 'Decision', acceptId, false], ['decision/reject', 'Decision', undefined, false],
      ['go/letter', 'Go to', undefined, false], ['application/search', 'Application', 'session.search', false],
    ])
    menu.select('decision/accept')
    expect(menu.state.getSnapshot().open).toBe(false)
    expect(accept).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(accept).toHaveBeenCalledOnce()
    menu.toggle(search)
    menu.select('application/search')
    vi.runAllTimers()
    expect(search).toHaveBeenCalledOnce()
  })

  it('ignores disabled and unknown rows, closes on a second toggle, and closes when its contribution leaves', () => {
    vi.useFakeTimers()
    const menu = createCommandMenu(labels)
    const reject = vi.fn()
    const off = menu.contribute({ item: () => item({ reject }, true) })
    menu.toggle(() => {})
    menu.select('decision/reject')
    menu.select('missing/row')
    vi.runAllTimers()
    expect(reject).not.toHaveBeenCalled()
    expect(menu.state.getSnapshot().open).toBe(true)
    expect(menu.toggle(() => {})).toBe(true)
    expect(menu.state.getSnapshot().open).toBe(false)
    menu.close()
    menu.toggle(() => {})
    const other = menu.contribute({ item: () => null })
    other()
    expect(menu.state.getSnapshot().open).toBe(true)
    off()
    expect(menu.state.getSnapshot()).toMatchObject({ open: false, rows: [] })
  })
})

function view(options: { mobile?: boolean } = {}) {
  device.mobile = options.mobile ?? false
  const menu = createCommandMenu(labels)
  const catalog = createSnapshotStore<readonly ShortcutCatalogEntry[]>([
    { id: acceptId, label: 'Accept', aliases: [], keys: ['1'], keycaps: [['1']], aria: '1', binding: null, modified: false, conflicts: [], issue: null },
    { id: 'session.search' as ShortcutCommandId, label: 'Search', aliases: [], keys: ['⌘', 'K'], aria: 'Meta+K', binding: null,
      modified: false, conflicts: [], issue: null },
  ])
  const props = { useMenu: bindSnapshotSelector(menu.state), useCatalog: bindSnapshotSelector(catalog),
    select: menu.select, close: menu.close, t: makeTranslate(en) } as Parameters<typeof CommandMenuView>[0]
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  render(<CommandMenuView {...props} />)
  return { menu, opener }
}

describe('command menu view', () => {
  it('shows the open item, its acts with their keys, and filters them', () => {
    const f = view()
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { f.menu.contribute({ item: () => item({}) }); f.menu.toggle(() => {}) })
    const dialog = screen.getByRole('dialog', { name: en['menu.aria'] })
    expect(dialog.dataset.shortcutModal).toBe('command-menu')
    expect(within(dialog).getByText('EP 3 456 789 · Rule 71(3) communication')).toBeTruthy()
    const options = within(dialog).getAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual(['Accept1', 'Reject', 'Open the letter', 'Search'])
    expect(within(dialog).getAllByRole('group').map(group => group.textContent?.split(/(?=[A-Z])/u)[0])).toEqual(['Decision', 'Go to', 'Application'])
    const input = within(dialog).getByRole('textbox', { name: en['menu.placeholder'] })
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'lett' } })
    expect(within(dialog).getAllByRole('option').map(option => option.textContent)).toEqual(['Open the letter'])
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(within(dialog).getByRole('status').textContent).toBe(en['menu.empty'])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(f.menu.state.getSnapshot().open).toBe(true)
  })

  it('moves with the arrows, runs the act with Enter, and gives focus back before the act runs', () => {
    vi.useFakeTimers()
    const f = view()
    const letter = vi.fn(() => { expect(document.activeElement).toBe(f.opener) })
    act(() => { f.menu.contribute({ item: () => item({ letter }) }); f.menu.toggle(() => {}) })
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option').find(option => option.getAttribute('aria-selected') === 'true')?.textContent).toBe('Search')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    fireEvent.keyDown(input, { key: 'x' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { vi.runAllTimers() })
    expect(letter).toHaveBeenCalledOnce()
  })

  it('selects by pointer, keeps a disabled act, and closes on Escape and on the scrim', () => {
    vi.useFakeTimers()
    const f = view({ mobile: true })
    const accept = vi.fn()
    const reject = vi.fn()
    f.menu.contribute({ item: () => item({ accept, reject }, true) })
    act(() => { f.menu.toggle(() => {}) })
    expect(document.activeElement?.textContent).toBe('EP 3 456 789 · Rule 71(3) communication')
    const [first, second] = screen.getAllByRole('option')
    fireEvent.mouseMove(second!)
    fireEvent.mouseMove(second!)
    expect(second?.getAttribute('aria-selected')).toBe('true')
    expect(second?.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(second!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { f.menu.toggle(() => {}) })
    fireEvent.click(document.querySelector('[aria-hidden="true"]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { f.menu.toggle(() => {}) })
    fireEvent.click(screen.getAllByRole('option')[0]!)
    act(() => { vi.runAllTimers() })
    expect(accept).toHaveBeenCalledOnce()
    expect(first).toBeTruthy()
    expect(reject).not.toHaveBeenCalled()
  })
})

describe('apply', () => {
  it('provides ctx.commandMenu, takes the Search command first, and registers the overlay', async () => {
    const ctx = new Context()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    const commandsRemote = { list: () => Promise.resolve({ ok: true as const, value: [] }) }
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    ctx.provide('sessions', new TestSessions(async (action) => { await action() }, ctx))
    ctx.provide('remote', { commands: commandsRemote, $on: () => () => {} })
    ctx.provide('remote.commands', commandsRemote)
    ctx.provide('locale', new LocaleRuntime(ctx))
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({ name: 'root', children: { 'conversation.input.overlay': { kind: 'list', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' } } } as never, (() => null) as never)
    const itemMenus: ((search: () => void) => boolean)[] = []
    ctx.provide('uiWorkspace', { provideItemMenu: (open: (search: () => void) => boolean) => {
      itemMenus.push(open)
      return () => { itemMenus.splice(itemMenus.indexOf(open), 1) }
    } })
    ctx.provide('shortcuts', { catalog: createSnapshotStore([]) })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = ctx.slots.entries('shell.overlay').find(candidate => candidate.options.id === 'command-menu')
    if (entry?.inject === undefined) throw new Error('command menu overlay is missing')
    const menuState = (entry.inject().hooks as CommandMenuInjected['hooks']).menu
    const search = vi.fn()
    expect(itemMenus).toHaveLength(1)
    expect(itemMenus[0]?.(search)).toBe(false)
    ctx.commandMenu.contribute({ item: () => item({}) })
    expect(itemMenus[0]?.(search)).toBe(true)
    expect(menuState.getSnapshot().rows.at(-1)).toMatchObject({ label: en['menu.search'], group: { label: en['menu.group.application'] } })
    ctx.commandMenu.close()
    expect(menuState.getSnapshot().open).toBe(false)
    itemMenus[0]?.(search)
    await fiber.dispose()
    expect(menuState.getSnapshot().open).toBe(false)
    expect(itemMenus).toHaveLength(0)
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
  })
})
