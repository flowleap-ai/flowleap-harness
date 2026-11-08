// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installKeyboard } from '@deepseek-ai/dsh-client-shortcuts/src/client/dom.ts'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { commandOf, FOLDER_SCOPE, keycapsOf, registerKeys, type KeyHandlers } from '../src/client/keys.ts'
import { en } from '../src/client/locales.ts'

let disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.reverse()) dispose()
  disposers = []
  document.body.replaceChildren()
})

/** Register the page's keys on a real shortcut registry with the keyboard installed on the window. */
function keys(handlers: { current: KeyHandlers }) {
  const registry = new ShortcutRegistry('web', 'macos', undefined, 500)
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
  it('registers the five acts in the page scope with their default keys and labels', () => {
    const { registry } = keys({ current: {} })
    const rows = registry.catalog.getSnapshot().filter(row => row.id.startsWith('flowleap.folder.'))
    expect(rows.map(row => [row.id, row.label, row.keycaps, row.scope?.label])).toEqual([
      ['flowleap.folder.ask', en['keys.ask'], [['A']], en['keys.scope']],
      ['flowleap.folder.newFolder', en['keys.newFolder'], [['⇧', 'N']], en['keys.scope']],
      ['flowleap.folder.upload', en['keys.upload'], [['U']], en['keys.scope']],
      ['flowleap.folder.rename', en['keys.rename'], [['F2']], en['keys.scope']],
      ['flowleap.folder.move', en['keys.move'], [['⇧', 'M']], en['keys.scope']],
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
