// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installKeyboard } from '@deepseek-ai/dsh-client-shortcuts/src/client/dom.ts'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import {
  commandOf, FOLDER_SCOPE, IDENTITY_SCOPE, identityRetryKeycaps, keycapsOf, pressed, recordKeyOf, registerIdentityKeys, registerKeys,
  RECORD_COMMAND, type KeyHandlers,
} from '../src/client/keys.ts'
import { en as addClientEn } from '../src/client/add-client/locales/index.ts'
import { en } from '../src/client/locales.ts'

let disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.reverse()) dispose()
  disposers = []
  document.body.replaceChildren()
})

/** Register the page's keys on a real shortcut registry with the keyboard installed on the window. */
function keys(handlers: { current: KeyHandlers }, os: 'macos' | 'windows' = 'macos') {
  const registry = new ShortcutRegistry('web', os, undefined, 500)
  const ctx = { shortcuts: registry, effect: (setup: () => () => void) => { disposers.push(setup()) } } as never
  registerKeys(ctx, { current: () => handlers.current }, key => en[key])
  disposers.push(installKeyboard(window, registry, undefined, false))
  const page = document.createElement('section')
  page.dataset.shortcutScope = FOLDER_SCOPE
  page.tabIndex = -1
  const field = document.createElement('input')
  page.append(field)
  document.body.append(page)
  return { registry, page, field }
}

const press = (target: Element, code: string, extra: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { code, key: code.replace(/^Key/u, '').toLowerCase(), bubbles: true, cancelable: true, ...extra })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('the keys of the client folder page', () => {
  it('registers the eight acts in the page scope with their default keys and labels', () => {
    const { registry } = keys({ current: {} })
    const rows = registry.catalog.getSnapshot().filter(row => row.id.startsWith('flowleap.folder.'))
    expect(rows.map(row => [row.id, row.label, row.keycaps, row.scope?.label])).toEqual([
      ['flowleap.folder.ask', en['keys.ask'], [['A']], en['keys.scope']],
      ['flowleap.folder.newFolder', en['keys.newFolder'], [['⇧', 'N']], en['keys.scope']],
      ['flowleap.folder.upload', en['keys.upload'], [['U']], en['keys.scope']],
      ['flowleap.folder.rename', en['keys.rename'], [['F2']], en['keys.scope']],
      ['flowleap.folder.move', en['keys.move'], [['⇧', 'M']], en['keys.scope']],
      ['flowleap.folder.trash', en['keys.trash'], [['Backspace']], en['keys.scope']],
      ['flowleap.folder.find', en['keys.find'], [['/']], en['keys.scope']],
      ['flowleap.folder.retry', en['keys.retry'], [['R']], en['keys.scope']],
    ])
    expect(commandOf('move')).toBe('flowleap.folder.move')
  })

  it('runs the page\'s current handler while the page has the focus, and passes a key with no handler on', () => {
    const ask = vi.fn()
    const move = vi.fn()
    const handlers: { current: KeyHandlers } = { current: { ask } }
    const { page } = keys(handlers)
    page.focus()
    expect(press(page, 'KeyA')).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(press(page, 'KeyM', { shiftKey: true })).toBe(false)
    handlers.current = { move }
    press(page, 'KeyM', { shiftKey: true })
    expect(move).toHaveBeenCalledTimes(1)
    press(page, 'KeyA')
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('moves the selection to Trash on Delete, not on Backspace, on Windows', () => {
    const trash = vi.fn()
    const { page } = keys({ current: { trash } }, 'windows')
    page.focus()
    expect(press(page, 'Backspace', { key: 'Backspace' })).toBe(false)
    expect(press(page, 'Delete', { key: 'Delete' })).toBe(true)
    expect(trash).toHaveBeenCalledTimes(1)
  })

  it('moves the selection to Trash on Backspace and starts Find on Slash', () => {
    const trash = vi.fn()
    const find = vi.fn()
    const { page } = keys({ current: { trash, find } })
    page.focus()
    expect(press(page, 'Backspace', { key: 'Backspace' })).toBe(true)
    expect(press(page, 'Slash', { key: '/' })).toBe(true)
    expect([trash.mock.calls.length, find.mock.calls.length]).toEqual([1, 1])
  })

  it('never runs while the focus is in a text field', () => {
    const ask = vi.fn()
    const { field } = keys({ current: { ask } })
    field.focus()
    press(field, 'KeyA')
    expect(ask).not.toHaveBeenCalled()
  })

  it('removes the scope and the commands when the plugin goes', () => {
    const { registry } = keys({ current: {} })
    for (const dispose of disposers.reverse()) dispose()
    disposers = []
    expect(registry.catalog.getSnapshot().filter(row => row.id.startsWith('flowleap.folder.'))).toEqual([])
  })
})

describe('keycapsOf', () => {
  it('gives each act its keycaps from the catalog, and none to an act that is unbound or not in it', () => {
    const row = (id: string, keycaps?: readonly (readonly string[])[]): ShortcutCatalogEntry => ({
      id: id as ShortcutCommandId, label: id, aliases: [], keys: [], ...(keycaps === undefined ? {} : { keycaps }),
      aria: undefined, binding: null, modified: false, conflicts: [], issue: null,
    })
    const of = keycapsOf([row('flowleap.folder.ask', [['A']]), row('flowleap.folder.upload')])
    expect(of('ask')).toEqual([['A']])
    expect(of('upload')).toEqual([])
    expect(of('move')).toEqual([])
  })
})

describe('the key of Record the decision', () => {
  const row = (extra: Partial<ShortcutCatalogEntry>): ShortcutCatalogEntry => ({
    id: RECORD_COMMAND, label: 'Record the decision', aliases: [], keys: [], keycaps: [['⇧', '⌘', 'Enter']], aria: undefined,
    binding: { code: 'Enter', modifiers: ['shift', 'meta'] }, modified: false, conflicts: [], issue: null, ...extra,
  })

  it('follows the app command\'s current binding, and has none while it is unbound, in conflict or not registered', () => {
    expect(recordKeyOf([row({})])).toEqual({ keycaps: [['⇧', '⌘', 'Enter']], binding: { code: 'Enter', modifiers: ['shift', 'meta'] } })
    const { keycaps: _keycaps, ...bare } = row({})
    expect(recordKeyOf([bare]).keycaps).toEqual([])
    for (const broken of [row({ binding: null }), row({ issue: 'reserved' }), row({ conflicts: [commandOf('ask')] })]) {
      expect(recordKeyOf([broken])).toEqual({ keycaps: [], binding: null })
    }
    expect(recordKeyOf([])).toEqual({ keycaps: [], binding: null })
  })

  it('matches a key press with exactly the binding\'s modifiers', () => {
    const key = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) =>
      ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods })
    const binding = { code: 'Enter', modifiers: ['shift', 'meta'] as const }
    expect(pressed(key('Enter', { shiftKey: true, metaKey: true }), binding)).toBe(true)
    expect(pressed(key('Enter', { metaKey: true }), binding)).toBe(false)
    expect(pressed(key('Enter', { shiftKey: true, metaKey: true, altKey: true }), binding)).toBe(false)
    expect(pressed(key('KeyA', { shiftKey: true, metaKey: true }), binding)).toBe(false)
    expect(pressed(key('KeyG'), { code: 'KeyG', thenCode: 'KeyM', modifiers: [] })).toBe(false)
    expect(pressed(key('KeyG'), { code: 'KeyG', secondCode: 'KeyM', modifiers: [] })).toBe(false)
    expect(pressed(key('Enter'), null)).toBe(false)
  })
})

describe('the key of the Firm identity section', () => {
  it('runs Try again on R only while the section has the focus and an act is there, beside the R of the folder page', () => {
    const registry = new ShortcutRegistry('web', 'macos', undefined, 500)
    const ctx = { shortcuts: registry, effect: (setup: () => () => void) => { disposers.push(setup()) } } as never
    const retry: { act?: () => void } = {}
    const runs: string[] = []
    registerKeys(ctx, { current: () => ({ retry: () => { runs.push('folder') } }) }, key => en[key])
    registerIdentityKeys(ctx, () => retry.act, key => addClientEn[key])
    disposers.push(installKeyboard(window, registry, undefined, false))
    const section = document.createElement('section')
    section.dataset.shortcutScope = IDENTITY_SCOPE
    section.tabIndex = -1
    document.body.append(section)
    const rows = registry.catalog.getSnapshot()
    const row = rows.find(item => item.id === 'flowleap.identity.retry')
    expect([row?.label, row?.keycaps, row?.scope?.label, row?.conflicts])
      .toEqual([addClientEn['keys.identity.retry'], [['R']], addClientEn['keys.identity.scope'], []])
    expect(identityRetryKeycaps(rows)).toEqual([['R']])
    expect(identityRetryKeycaps([])).toEqual([])
    section.focus()
    expect(press(section, 'KeyR')).toBe(false)
    retry.act = () => { runs.push('identity') }
    expect(press(section, 'KeyR')).toBe(true)
    expect(runs).toEqual(['identity'])
  })
})
