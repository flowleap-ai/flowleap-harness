// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installKeyboard } from '@deepseek-ai/dsh-client-shortcuts/src/client/dom.ts'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
import type { CommandMenuContribution, CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import {
  CommandItemRegistry, KEYS_ELSEWHERE, KeyActRegistry, registerKeyLayer, useCommandItem, useKeyActs, type KeyActs,
} from '../src/client/key-layer.ts'
import { en } from '../src/client/locales.ts'

let disposers: (() => void)[] = []
afterEach(() => {
  cleanup()
  for (const dispose of disposers.reverse()) dispose()
  disposers = []
  document.body.replaceChildren()
})

/**
 * Register the key layer on a real shortcut registry with the keyboard installed on the window.
 * @returns the registries, the ⌘K contributions and the registry.
 */
function layer() {
  const registry = new ShortcutRegistry('web', 'macos', undefined, 500)
  const contributions: CommandMenuContribution[] = []
  const ctx = {
    shortcuts: registry,
    commandMenu: {
      contribute: (contribution: CommandMenuContribution) => {
        contributions.push(contribution)
        return () => { contributions.splice(contributions.indexOf(contribution), 1) }
      },
      close: () => {},
    },
    effect: (setup: () => () => void) => { disposers.push(setup()) },
  } as never
  const keyActs = new KeyActRegistry()
  const commandItems = new CommandItemRegistry()
  registerKeyLayer(ctx, keyActs, commandItems, key => en[key])
  disposers.push(installKeyboard(window, registry, undefined, false))
  return { registry, keyActs, commandItems, contributions }
}

const press = (target: Element, code: string, extra: KeyboardEventInit = {}) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^(Key|Digit)/u, '').toLowerCase(), bubbles: true, cancelable: true, ...extra }))
}

/** A screen that provides its handlers and its ⌘K item. */
function Screen({ registries, acts, arrows, item }: {
  registries: { keyActs: KeyActRegistry; commandItems: CommandItemRegistry }
  acts: KeyActs
  arrows?: boolean
  item?: CommandMenuItem | null
}) {
  useKeyActs(registries, acts, arrows === undefined ? {} : { arrows })
  useCommandItem(registries, item ?? null)
  return <div data-shortcut-scope="records" tabIndex={-1} data-testid="scope"><textarea aria-label="reason" /></div>
}

describe('the key layer of the Matters panel', () => {
  it('registers every act of keys.md once, with its scope and its default keys', () => {
    const { registry } = layer()
    const rows = registry.catalog.getSnapshot()
    const keycaps = (id: string) => rows.find(row => row.id === id)?.keycaps
    expect(keycaps('records.part.accept')).toEqual([['1']])
    expect(keycaps('records.go.matter')).toEqual([['G'], ['M']])
    expect(keycaps('records.decision.record')).toEqual([['⇧', '⌘', 'Enter']])
    expect(rows.find(row => row.id === 'records.part.accept')?.scope?.label).toBe('Matters')
    const fixed = registry.fixedCatalog.getSnapshot().filter(row => row.id.startsWith('records.'))
    expect(fixed.map(row => row.id)).toEqual(['records.row.open', 'records.list.nextArrow', 'records.list.previousArrow'])
  })

  it('runs the handler of the latest mounted screen, only while focus is in the panel and not in a text field', () => {
    const registries = layer()
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<Screen registries={registries} acts={{ accept: first }} />)
    const scope = view.getByTestId('scope')
    scope.focus()
    press(scope, 'Digit1')
    expect(first).toHaveBeenCalledTimes(1)
    view.rerender(<Screen registries={registries} acts={{ accept: second }} />)
    press(scope, 'Digit1')
    expect(second).toHaveBeenCalledTimes(1)
    const reason = view.getByLabelText('reason')
    reason.focus()
    press(reason, 'Digit1')
    expect(second).toHaveBeenCalledTimes(1)
    view.unmount()
    const outside = document.createElement('div')
    outside.dataset.shortcutScope = 'records'
    outside.tabIndex = -1
    document.body.append(outside)
    outside.focus()
    press(outside, 'Digit1')
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('records the decision with ⇧⌘↵ inside the panel and passes it on elsewhere', () => {
    const registries = layer()
    const record = vi.fn()
    const view = render(<Screen registries={registries} acts={{ record }} />)
    const other = document.createElement('div')
    other.tabIndex = -1
    document.body.append(other)
    other.focus()
    press(other, 'Enter', { key: 'Enter', metaKey: true, shiftKey: true })
    expect(record).not.toHaveBeenCalled()
    const scope = view.getByTestId('scope')
    scope.focus()
    press(scope, 'Enter', { key: 'Enter', metaKey: true, shiftKey: true })
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('passes every key on while focus is in a region whose keys belong to another view', () => {
    const registries = layer()
    const record = vi.fn()
    const accept = vi.fn()
    const view = render(<Screen registries={registries} acts={{ record, accept }} />)
    const region = document.createElement('div')
    region.setAttribute(KEYS_ELSEWHERE, '')
    region.tabIndex = -1
    view.getByTestId('scope').append(region)
    region.focus()
    press(region, 'Digit1')
    press(region, 'Enter', { key: 'Enter', metaKey: true, shiftKey: true })
    expect(accept).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it('moves with J, K and the arrows, but leaves the arrows to a page that scrolls', () => {
    const registries = layer()
    const next = vi.fn()
    const previous = vi.fn()
    const open = vi.fn()
    const view = render(<Screen registries={registries} acts={{ next, previous, open }} />)
    const scope = view.getByTestId('scope')
    scope.focus()
    press(scope, 'KeyJ')
    press(scope, 'ArrowDown', { key: 'ArrowDown' })
    press(scope, 'ArrowUp', { key: 'ArrowUp' })
    press(scope, 'Enter', { key: 'Enter' })
    expect(next).toHaveBeenCalledTimes(2)
    expect(previous).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledTimes(1)
    view.rerender(<Screen registries={registries} acts={{ next, previous }} arrows={false} />)
    press(scope, 'ArrowDown', { key: 'ArrowDown' })
    press(scope, 'KeyK')
    expect(next).toHaveBeenCalledTimes(2)
    expect(previous).toHaveBeenCalledTimes(2)
  })

  it('runs the G M sequence', () => {
    const registries = layer()
    const goMatter = vi.fn()
    const view = render(<Screen registries={registries} acts={{ goMatter }} />)
    const scope = view.getByTestId('scope')
    scope.focus()
    press(scope, 'KeyG')
    press(scope, 'KeyM')
    expect(goMatter).toHaveBeenCalledTimes(1)
  })

  it('gives ⌘K the open item of the latest screen that has one', () => {
    const registries = layer()
    const item: CommandMenuItem = { label: 'FL-2026-0001', groups: [] }
    expect(registries.contributions).toHaveLength(1)
    const contribution = registries.contributions[0]!
    expect(contribution.item()).toBeNull()
    const view = render(<Screen registries={registries} acts={{}} item={item} />)
    expect(contribution.item()).toBe(item)
    act(() => { view.rerender(<Screen registries={registries} acts={{}} item={null} />) })
    expect(contribution.item()).toBeNull()
    view.unmount()
    expect(contribution.item()).toBeNull()
  })

  it('disposes a provider once', () => {
    const keyActs = new KeyActRegistry()
    const run = vi.fn()
    const dispose = keyActs.provide({ acts: { current: { accept: run } }, arrows: true })
    const other = keyActs.provide({ acts: { current: { reject: run } }, arrows: true })
    expect(keyActs.handler('accept')).toBe(run)
    dispose()
    dispose()
    expect(keyActs.handler('accept')).toBeUndefined()
    expect(keyActs.handler('reject')).toBe(run)
    other()
    const items = new CommandItemRegistry()
    const remove = items.provide({ current: null })
    remove()
    remove()
    expect(items.item()).toBeNull()
  })
})
