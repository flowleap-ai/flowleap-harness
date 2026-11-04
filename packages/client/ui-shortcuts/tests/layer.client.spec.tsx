// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ShortcutBinding, ShortcutCommandId, ShortcutScopeId } from '@deepseek-ai/dsh-client-shortcuts/client'
import ShortcutsService from '../../shortcuts/src/client/index.ts'
import { ShortcutEditor } from '../src/client/Editor.tsx'
import { ShortcutReference } from '../src/client/Reference.tsx'
import { createShortcutsStore } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

const INTAKE = 'records.intake' as ShortcutScopeId
const accept = 'records.part.accept' as ShortcutCommandId
const goIntake = 'records.go.intake' as ShortcutCommandId
const everywhere = (binding: ShortcutBinding) => ({ 'web:linux': binding, 'web:macos': binding, 'web:windows': binding })

let dispose: (() => Promise<void>) | undefined
afterEach(async () => { cleanup(); await dispose?.(); dispose = undefined; localStorage.clear() })

async function service() {
  const ctx = new Context()
  ctx.provide('locale', new LocaleRuntime(ctx))
  dispose = async () => { await ctx.fiber.dispose() }
  const shortcuts = new ShortcutsService(ctx)
  shortcuts.registerScope({ id: INTAKE, label: () => 'Intake' })
  for (const [id, binding] of [[accept, { code: 'Digit1', modifiers: [] }], [goIntake, { code: 'KeyG', thenCode: 'KeyI', modifiers: [] }]] as const) {
    shortcuts.registerScoped({ id, scope: INTAKE, label: () => id, aliases: [], defaults: everywhere(binding),
      resolve: () => ({ status: 'pass' }) })
  }
  const board = 'records.board' as ShortcutScopeId
  shortcuts.registerScope({ id: board, label: () => 'Board' })
  shortcuts.registerScoped({ id: 'records.board.move' as ShortcutCommandId, scope: board, label: () => 'Move', aliases: [],
    defaults: everywhere({ code: 'Digit1', modifiers: [] }), resolve: () => ({ status: 'pass' }) })
  shortcuts.registerScopedFixed({ id: 'records.row.open' as ShortcutCommandId, scope: INTAKE, label: () => 'Open the row',
    keys: ['↵'], bindings: [{ code: 'Enter', modifiers: [] }], resolve: () => ({ status: 'pass' }) })
  await waitFor(() => { expect(shortcuts.config.getSnapshot().status).toBe('ready') })
  return shortcuts
}
function editor(shortcuts: ShortcutsService, id: ShortcutCommandId) {
  const onSaved = vi.fn(), onError = vi.fn()
  render(<ShortcutEditor target={shortcuts.catalog.getSnapshot().find(row => row.id === id)!}
    useCatalog={bindSnapshotSelector(shortcuts.catalog)} useConfig={bindSnapshotSelector(shortcuts.config)}
    useFixedCatalog={bindSnapshotSelector(shortcuts.fixedCatalog)} runtime={shortcuts.runtime} platform={shortcuts.platform}
    edit={(...args) => shortcuts.edit(...args)} describeBinding={(binding, scope) => shortcuts.describeBinding(binding, scope)}
    recording={active => shortcuts.recording(active)} sequenceMs={20} t={makeTranslate(en)}
    onClose={() => {}} onSaved={onSaved} onError={onError} />)
  const recorder = screen.getByRole('button', { name: en.record })
  recorder.focus()
  const tap = (code: string, extra: KeyboardEventInit = {}) => {
    fireEvent.keyDown(recorder, { code, key: code, ...extra })
    fireEvent.keyUp(recorder, { code, ...extra })
  }
  return { tap, onSaved, onError }
}
const keycaps = (shortcuts: ShortcutsService, id: ShortcutCommandId) => shortcuts.catalog.getSnapshot().find(row => row.id === id)?.keycaps

it('records one plain key after the sequence interval and shows its keycap in the catalog', async () => {
  const shortcuts = await service()
  const f = editor(shortcuts, accept)
  expect(document.body.textContent).toContain(en['layer-help'])
  f.tap('KeyA')
  expect(f.onSaved).not.toHaveBeenCalled()
  await waitFor(() => { expect(f.onSaved).toHaveBeenCalledOnce() })
  expect(keycaps(shortcuts, accept)).toEqual([['A']])
})

it('records Shift with a key at once and two plain keys as a sequence', async () => {
  const shortcuts = await service()
  const f = editor(shortcuts, accept)
  f.tap('KeyA', { shiftKey: true })
  await waitFor(() => { expect(f.onSaved).toHaveBeenCalledOnce() })
  expect(keycaps(shortcuts, accept)).toEqual([['Shift', 'A']])
  cleanup()
  const g = editor(shortcuts, goIntake)
  g.tap('KeyG'); g.tap('KeyN')
  await waitFor(() => { expect(g.onSaved).toHaveBeenCalledOnce() })
  expect(keycaps(shortcuts, goIntake)).toEqual([['G'], ['N']])
  expect(JSON.parse(localStorage.getItem('dsh.keybindings.v1') ?? '')).toMatchObject({ schemaVersion: 3 })
})

it('refuses a layer key that its scope already uses and a reserved key', async () => {
  const shortcuts = await service()
  const f = editor(shortcuts, goIntake)
  f.tap('Digit1')
  await waitFor(() => { expect(f.onError).toHaveBeenCalledWith(en.conflict.replace('{commands}', accept)) })
  f.tap('Enter')
  await waitFor(() => { expect(f.onError).toHaveBeenCalledWith(en.reserved) })
  expect(f.onSaved).not.toHaveBeenCalled()
})

it('groups scoped rows under their view and keeps the fixed key read-only', async () => {
  const shortcuts = await service()
  const store = createShortcutsStore().create()
  store.actions.open()
  const props = { actions: store.actions, useStore: bindSnapshotSelector(store),
    useCatalog: bindSnapshotSelector(shortcuts.catalog), useConfig: bindSnapshotSelector(shortcuts.config),
    useFixedCatalog: bindSnapshotSelector(shortcuts.fixedCatalog), runtime: shortcuts.runtime, platform: shortcuts.platform,
    edit: (...args) => shortcuts.edit(...args), recording: active => shortcuts.recording(active), sequenceMs: 20,
    describeBinding: (binding, scope) => shortcuts.describeBinding(binding, scope), t: makeTranslate(en),
  } as Parameters<typeof ShortcutReference>[0]
  render(<ShortcutReference {...props} />)
  expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent).slice(0, 2)).toEqual(['Board', 'Intake'])
  const section = screen.getByRole('region', { name: 'Intake' })
  expect(within(section).getByRole('heading', { name: 'Intake' })).toBeTruthy()
  expect(within(section).getByRole('button', { name: en['edit-label'].replace('{command}', accept) })).toBeTruthy()
  expect(within(section).getByText('Open the row')).toBeTruthy()
  expect(within(section).queryByRole('button', { name: en['edit-label'].replace('{command}', 'Open the row') })).toBeNull()
})
