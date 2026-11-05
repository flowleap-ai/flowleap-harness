// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MenuOverlayInjected } from '../src/client/View.tsx'
import { apply, inject } from '../src/client/index.ts'
import type { createMenuStore } from '../src/client/store.ts'

declare module '@deepseek-ai/dsh-client-ui-context-menu/client' {
  interface ContextMenuTargetMap { keyRow: { readonly id: string } }
}

const accept = 'records.part.accept' as ShortcutCommandId
const reject = 'records.part.reject' as ShortcutCommandId
const record = 'records.decision.record' as ShortcutCommandId
const conflicted = 'records.part.other' as ShortcutCommandId
const row = (id: ShortcutCommandId, binding: ShortcutCatalogEntry['binding'], conflicts: ShortcutCommandId[] = []): ShortcutCatalogEntry =>
  ({ id, label: id, aliases: [], keys: [], aria: undefined, binding, modified: false, conflicts, issue: null })

it('runs the item whose command key matches while the menu is open, on the captured row', async () => {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  ctx.provide('shortcuts', { catalog: createSnapshotStore([
    row(accept, { code: 'Digit1', modifiers: [] }), row(reject, { code: 'Digit2', modifiers: [] }),
    row(record, { code: 'Enter', modifiers: ['shift', 'meta'] }), row(conflicted, { code: 'Digit3', modifiers: [] }, [accept]),
    row('records.go.matter' as ShortcutCommandId, { code: 'KeyG', thenCode: 'KeyM', modifiers: [] }),
  ]) } as never)
  let store!: ReturnType<ReturnType<typeof createMenuStore>['create']>
  ctx.provide('slots', { provideRoot: () => () => {}, registerFactory: () => () => {},
    inject: (_name: string, register: Parameters<SlotRegistry['inject']>[1]) => ctx.effect(register),
    register: (entry: { inject: () => MenuOverlayInjected; store: ReturnType<typeof createMenuStore> }) => {
      store = entry.store.create(); return () => {}
    },
  } as never)
  ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => key } as never)
  await ctx.plugin({ inject, apply }).await()
  const run = vi.fn()
  ctx.contextMenus.register({ target: 'keyRow', id: 'records', order: 0, resolve: ({ id }) => [
    { id: 'accept', label: 'Accept', commandId: accept, run: () => { run('accept', id) } },
    { id: 'reject', label: 'Reject', commandId: reject, disabled: true, run: () => { run('reject', id) } },
    { id: 'other', label: 'Other', commandId: conflicted, run: () => { run('other', id) } },
    { id: 'matter', label: 'Matter', commandId: 'records.go.matter' as ShortcutCommandId, run: () => { run('matter', id) } },
    { id: 'record', label: 'Record', commandId: record, run: () => { run('record', id) } },
  ] })
  const press = (code: string, extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra })
    window.dispatchEvent(event)
    return event
  }
  expect(press('Digit1').defaultPrevented).toBe(false)
  ctx.contextMenus.open({ kind: 'keyRow', value: { id: 'row-7' } }, { x: 1, y: 2 })
  await vi.waitFor(() => { expect(store.getSnapshot().items).toHaveLength(5) })
  for (const [code, extra] of [['Digit2', {}], ['Digit3', {}], ['KeyG', {}], ['Digit1', { isComposing: true }],
    ['Digit1', { repeat: true }], ['Digit1', { shiftKey: true }]] as const) expect(press(code, extra).defaultPrevented).toBe(false)
  expect(run).not.toHaveBeenCalled()
  expect(press('Enter', { shiftKey: true, metaKey: true }).defaultPrevented).toBe(true)
  expect(run).toHaveBeenCalledExactlyOnceWith('record', 'row-7')
  ctx.contextMenus.open({ kind: 'keyRow', value: { id: 'row-8' } }, { x: 9, y: 9 })
  await vi.waitFor(() => { expect(store.getSnapshot().target).toEqual({ kind: 'keyRow', value: { id: 'row-8' } }) })
  await vi.waitFor(() => { expect(store.getSnapshot().items).toHaveLength(5) })
  press('Digit1')
  expect(run).toHaveBeenLastCalledWith('accept', 'row-8')
  expect(press('Digit1').defaultPrevented).toBe(false)
})
