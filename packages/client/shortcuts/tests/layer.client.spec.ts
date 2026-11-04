// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import ShortcutsService from '../src/client/index.ts'
import { installKeyboard } from '../src/client/dom.ts'
import { ShortcutRegistry } from '../src/client/registry.ts'
import type { ShortcutScopedCommand } from '../src/client/types.ts'
import { editShortcutDocument, effectiveScopedShortcuts, overlappingBindings, parseShortcutDefinitions, parseShortcutDocument, ShortcutPersistence } from '../src/protocol.ts'
import type { ShortcutBinding, ShortcutCommandId, ShortcutDocument, ShortcutProfile, ShortcutScopeId } from '../src/protocol.ts'

const INTAKE = 'records.intake' as ShortcutScopeId
const BOARD = 'records.board' as ShortcutScopeId
const ids = {
  accept: 'records.part.accept' as ShortcutCommandId,
  goIntake: 'records.go.intake' as ShortcutCommandId,
  open: 'records.row.open' as ShortcutCommandId,
}
const everywhere = (binding: ShortcutBinding): Partial<Record<ShortcutProfile, ShortcutBinding>> => ({
  'desktop:macos': binding, 'desktop:windows': binding, 'desktop:linux': binding,
  'web:macos': binding, 'web:windows': binding, 'web:linux': binding,
})
const scoped = (id: ShortcutCommandId, binding: ShortcutBinding, run: () => void, scope = INTAKE): ShortcutScopedCommand => ({
  id, scope, label: () => id, aliases: [], defaults: everywhere(binding), resolve: () => ({ status: 'handled', run }),
})

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); vi.useRealTimers() })

function mount(runtime: 'desktop' | 'web' = 'web', native = false) {
  const registry = new ShortcutRegistry(runtime, 'macos', undefined, 500)
  registry.registerScope({ id: INTAKE, label: () => 'Intake' })
  const accept = vi.fn()
  const goIntake = vi.fn()
  const open = vi.fn()
  registry.registerScoped(scoped(ids.accept, { code: 'Digit1', modifiers: [] }, accept))
  registry.registerScoped(scoped(ids.goIntake, { code: 'KeyG', thenCode: 'KeyI', modifiers: [] }, goIntake))
  registry.registerScopedFixed({ id: ids.open, scope: INTAKE, label: () => 'Open', keys: ['↵'],
    bindings: [{ code: 'Enter', modifiers: [] }], resolve: () => ({ status: 'handled', run: open }) })
  dispose = installKeyboard(window, registry, undefined, native)
  const view = document.createElement('div')
  view.dataset.shortcutScope = INTAKE
  view.tabIndex = -1
  const reason = document.createElement('textarea')
  const button = document.createElement('button')
  view.append(reason, button)
  const outside = document.createElement('div')
  outside.tabIndex = -1
  document.body.append(view, outside)
  view.focus()
  return { registry, view, reason, button, outside, accept, goIntake, open }
}
const press = (target: Element, code: string, extra: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { code, key: code.replace(/^(Key|Digit)/u, '').toLowerCase(), bubbles: true, cancelable: true, ...extra })
  target.dispatchEvent(event)
  return event
}

describe('view-scoped key layer', () => {
  it.each([['web', false], ['desktop', true]] as const)('runs a single key only while focus is inside the scope (%s)', (runtime, native) => {
    const f = mount(runtime, native)
    expect(press(f.view, 'Digit1').defaultPrevented).toBe(true)
    expect(f.accept).toHaveBeenCalledOnce()
    f.outside.focus()
    expect(press(f.outside, 'Digit1').defaultPrevented).toBe(false)
    expect(f.accept).toHaveBeenCalledOnce()
  })

  it('runs no act for a key typed into a text box, an editable element, a menu, or under a modal', () => {
    const f = mount()
    f.reason.focus()
    expect(press(f.reason, 'Digit1').defaultPrevented).toBe(false)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = document.createElement('div')
    menu.append(item)
    f.view.append(editable, menu)
    press(editable, 'Digit1')
    press(item, 'Digit1')
    press(f.reason, 'KeyG'); press(f.reason, 'KeyI')
    expect(f.accept).not.toHaveBeenCalled()
    expect(f.goIntake).not.toHaveBeenCalled()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    press(f.view, 'Digit1')
    expect(f.accept).not.toHaveBeenCalled()
    dialog.remove()
    press(f.view, 'Digit1')
    expect(f.accept).not.toHaveBeenCalled()
    menu.remove()
    press(f.view, 'Digit1')
    expect(f.accept).toHaveBeenCalledOnce()
  })

  it('passes keys while composing, after a local handler consumed them, on repeats, and while the editor records', () => {
    const f = mount()
    press(f.view, 'Digit1', { isComposing: true })
    f.view.addEventListener('keydown', (event) => { event.preventDefault() }, { once: true })
    press(f.view, 'Digit1')
    expect(press(f.view, 'Digit1', { repeat: true }).defaultPrevented).toBe(true)
    f.registry.recordingLayer = true
    press(f.view, 'Digit1')
    expect(f.accept).not.toHaveBeenCalled()
    f.registry.recordingLayer = false
    press(f.view, 'Digit1')
    expect(f.accept).toHaveBeenCalledOnce()
  })

  it('keeps native Space and Enter activation on a focused control and runs the fixed Enter elsewhere', () => {
    const f = mount()
    f.button.focus()
    expect(press(f.button, 'Enter').defaultPrevented).toBe(false)
    expect(f.open).not.toHaveBeenCalled()
    f.view.focus()
    expect(press(f.view, 'Enter').defaultPrevented).toBe(true)
    expect(f.open).toHaveBeenCalledOnce()
    expect(f.registry.fixedCatalog.getSnapshot()).toEqual([expect.objectContaining({
      id: ids.open, keys: ['↵'], keycaps: [['↵']], scope: { id: INTAKE, label: 'Intake' } })])
  })

  it('runs a sequence within the interval and drops it after a timeout or a focus change', () => {
    vi.useFakeTimers()
    const f = mount()
    expect(press(f.view, 'KeyG').defaultPrevented).toBe(true)
    expect(press(f.view, 'KeyG', { repeat: true }).defaultPrevented).toBe(true)
    press(f.view, 'KeyI')
    expect(f.goIntake).toHaveBeenCalledOnce()
    press(f.view, 'KeyG')
    vi.advanceTimersByTime(500)
    expect(press(f.view, 'KeyI').defaultPrevented).toBe(false)
    press(f.view, 'KeyG')
    f.button.focus()
    f.view.focus()
    press(f.view, 'KeyI')
    press(f.view, 'KeyG')
    press(f.view, 'Digit1')
    expect(f.accept).toHaveBeenCalledOnce()
    expect(f.goIntake).toHaveBeenCalledOnce()
  })

  it('tries the innermost scope first and falls back to an outer scope when the inner one passes', () => {
    const f = mount()
    f.registry.registerScope({ id: BOARD, label: () => 'Board', active: element => element.dataset.ready === 'true' })
    const inner = vi.fn()
    f.registry.registerScoped(scoped('records.board.accept' as ShortcutCommandId, { code: 'Digit1', modifiers: [] }, inner, BOARD))
    const nested = document.createElement('div')
    nested.dataset.shortcutScope = BOARD
    nested.tabIndex = -1
    f.view.append(nested)
    nested.focus()
    press(nested, 'Digit1')
    expect(f.accept).toHaveBeenCalledOnce()
    nested.dataset.ready = 'true'
    press(nested, 'Digit1')
    expect(inner).toHaveBeenCalledOnce()
    expect(f.accept).toHaveBeenCalledOnce()
  })

  it('shows rebound keycaps for a scoped key and a sequence, and disables conflicting rows', () => {
    const f = mount()
    const row = (id: ShortcutCommandId) => f.registry.catalog.getSnapshot().find(entry => entry.id === id)
    expect(row(ids.accept)).toMatchObject({ keys: ['1'], keycaps: [['1']], aria: '1', scope: { id: INTAKE, label: 'Intake' } })
    expect(row(ids.goIntake)).toMatchObject({ keys: ['G', 'I'], keycaps: [['G'], ['I']], aria: undefined })
    f.registry.configure({ ...f.registry.config.getSnapshot(), revision: 'rebound' as never, document: { schemaVersion: 3, profiles: {
      'web:macos': { [ids.accept]: { code: 'KeyA', modifiers: ['shift'] }, [ids.goIntake]: { code: 'KeyG', thenCode: 'KeyN', modifiers: [] } },
    } } })
    expect(row(ids.accept)).toMatchObject({ keys: ['⇧', 'A'], keycaps: [['⇧', 'A']], modified: true })
    expect(row(ids.goIntake)).toMatchObject({ keycaps: [['G'], ['N']], modified: true })
    press(f.view, 'KeyA', { shiftKey: true })
    press(f.view, 'KeyG'); press(f.view, 'KeyN')
    expect(f.accept).toHaveBeenCalledOnce()
    expect(f.goIntake).toHaveBeenCalledOnce()
    f.registry.configure({ ...f.registry.config.getSnapshot(), revision: 'conflict' as never, document: { schemaVersion: 1, profiles: {
      'web:macos': { [ids.accept]: { code: 'KeyG', modifiers: [] } },
    } } })
    expect(row(ids.accept)?.conflicts).toEqual([])
    expect(row(ids.goIntake)?.conflicts).toEqual([ids.accept])
    press(f.view, 'KeyG'); press(f.view, 'KeyI')
    expect(f.accept).toHaveBeenCalledTimes(2)
    expect(f.goIntake).toHaveBeenCalledOnce()
  })

  it('rejects invalid scoped registrations and removes every row and binding on disposal', () => {
    const registry = new ShortcutRegistry('web', 'windows')
    const run = vi.fn()
    expect(() => registry.registerScoped(scoped(ids.accept, { code: 'Digit1', modifiers: [] }, run))).toThrow('Unknown shortcut scope')
    const offScope = registry.registerScope({ id: INTAKE, label: () => 'Intake' })
    expect(() => registry.registerScope({ id: INTAKE, label: () => 'Again' })).toThrow('Duplicate shortcut scope')
    expect(() => registry.registerScoped(scoped(ids.accept, { code: 'Digit1', modifiers: ['primary'] }, run))).toThrow('Unsupported layer')
    expect(() => registry.registerScoped(scoped(ids.accept, { code: 'Escape', modifiers: [] }, run))).toThrow('Unsupported layer')
    const off = registry.registerScoped(scoped(ids.accept, { code: 'KeyG', modifiers: [] }, run))
    expect(() => registry.registerScoped(scoped(ids.goIntake, { code: 'KeyG', thenCode: 'KeyI', modifiers: [] }, run))).toThrow('Conflicting')
    const offFixed = registry.registerScopedFixed({ id: ids.open, scope: INTAKE, label: () => 'Open', keys: ['↵'],
      bindings: [{ code: 'Enter', modifiers: [] }], resolve: () => ({ status: 'pass' }) })
    expect(() => registry.registerScoped(scoped(ids.goIntake, { code: 'Enter', modifiers: [] }, run))).toThrow('Unsupported layer')
    registry.registerScoped(scoped(ids.goIntake, { code: 'KeyX', modifiers: [] }, run))()
    expect(() => registry.registerScopedFixed({ id: ids.open, scope: INTAKE, label: () => 'Open', keys: ['↵'],
      bindings: [{ code: 'Enter', modifiers: [] }], resolve: () => ({ status: 'pass' }) })).toThrow('Duplicate shortcut command')
    expect(registry.definitions()).toEqual([
      { id: ids.accept, defaults: everywhere({ code: 'KeyG', modifiers: [] }), scope: INTAKE },
      { id: ids.open, defaults: {}, fixed: [{ code: 'Enter', modifiers: [] }], scope: INTAKE },
    ])
    dispose = installKeyboard(window, registry)
    const view = document.createElement('div')
    view.dataset.shortcutScope = INTAKE
    view.tabIndex = -1
    document.body.append(view)
    view.focus()
    off(); off(); offFixed()
    offScope()
    expect(registry.catalog.getSnapshot()).toEqual([])
    expect(registry.fixedCatalog.getSnapshot()).toEqual([])
    expect(press(view, 'KeyG').defaultPrevented).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('lets a scoped resolver pass or block the key and labels a scope that is gone by its id', () => {
    const registry = new ShortcutRegistry('web', 'windows')
    const offScope = registry.registerScope({ id: INTAKE, label: () => 'Intake' })
    registry.registerScoped({ ...scoped(ids.accept, { code: 'Digit1', modifiers: [] }, () => {}), resolve: () => ({ status: 'blocked', reason: 'no part' }) })
    registry.registerScoped({ ...scoped(ids.goIntake, { code: 'Digit2', modifiers: [] }, () => {}), resolve: () => ({ status: 'pass' }) })
    const view = document.createElement('div')
    view.dataset.shortcutScope = INTAKE
    const target = document.createElement('span')
    view.append(target)
    const gesture = (code: string) => ({ code, control: false, alt: false, shift: false, meta: false, repeat: false,
      composing: false, defaultPrevented: false })
    const consume = vi.fn()
    expect(registry.dispatchLayer(gesture('Digit1'), target, null, consume)).toEqual({ status: 'blocked', reason: 'no part', commandId: ids.accept })
    expect(registry.dispatchLayer(gesture('Digit2'), target, null, consume)).toEqual({ status: 'pass' })
    expect(registry.dispatchLayer(gesture('Digit1'), null, null, consume)).toEqual({ status: 'pass' })
    expect(consume).toHaveBeenCalledOnce()
    registry.registerScoped({ ...scoped('records.part.windows' as ShortcutCommandId, { code: 'KeyW', modifiers: [] }, () => {}),
      defaults: { 'web:windows': { code: 'KeyW', modifiers: [] } } })
    registry.registerScoped({ ...scoped('records.part.linux' as ShortcutCommandId, { code: 'KeyL', modifiers: [] }, () => {}),
      defaults: { 'web:linux': { code: 'KeyL', modifiers: [] } } })
    expect(registry.dispatchLayer({ ...gesture('KeyQ'), repeat: true }, target, null, consume)).toEqual({ status: 'pass' })
    registry.registerScope({ id: BOARD, label: () => 'Board' })
    const board = document.createElement('div')
    board.dataset.shortcutScope = BOARD
    expect(registry.dispatchLayer(gesture('KeyQ'), board, null, consume)).toEqual({ status: 'pass' })
    offScope()
    expect(registry.catalog.getSnapshot()[0]?.scope).toEqual({ id: INTAKE, label: INTAKE })
  })
})

describe('scoped bindings in the protocol', () => {
  const definitions = parseShortcutDefinitions([
    { id: 'session.new', defaults: { 'desktop:macos': { code: 'KeyN', modifiers: ['primary'] } } },
    { id: ids.accept, scope: INTAKE, defaults: { 'desktop:macos': { code: 'Digit1', modifiers: [] } } },
    { id: 'records.board.accept', scope: BOARD, defaults: { 'desktop:macos': { code: 'Digit1', modifiers: [] } } },
    { id: ids.goIntake, scope: INTAKE, defaults: { 'desktop:macos': { code: 'KeyG', thenCode: 'KeyI', modifiers: [] } } },
    { id: ids.open, scope: INTAKE, defaults: {}, fixed: [{ code: 'Enter', modifiers: [] }] },
  ])
  const empty: ShortcutDocument = { schemaVersion: 1, profiles: {} }

  it('accepts the same key in two scopes and rejects overlapping or invalid scoped defaults', () => {
    expect(definitions).toHaveLength(5)
    expect(() => parseShortcutDefinitions([...definitions, { id: 'records.part.other', scope: INTAKE,
      defaults: { 'desktop:macos': { code: 'KeyG', modifiers: [] } } }])).toThrow('Conflicting')
    expect(() => parseShortcutDefinitions([{ id: 'records.part.other', scope: INTAKE,
      defaults: { 'web:linux': { code: 'KeyG', modifiers: ['alt'] } } }])).toThrow('Conflicting or reserved')
    expect(() => parseShortcutDefinitions([{ id: 'records.part.other', scope: 'Not a scope', defaults: {} }])).toThrow('Invalid shortcut definition')
    expect(() => parseShortcutDefinitions([{ id: 'session.new', defaults: { 'desktop:macos': { code: 'KeyG', thenCode: 'KeyI', modifiers: [] } } }]))
      .toThrow('Conflicting or reserved')
  })

  it('resolves scoped conflicts within a scope and against enabled application bindings only', () => {
    const rows = (document: ShortcutDocument) => effectiveScopedShortcuts(definitions, document, 'desktop', 'macos')
    expect(rows(empty).map(row => [row.id, row.scope, row.conflicts])).toEqual([
      [ids.accept, INTAKE, []], [ids.goIntake, INTAKE, []], ['records.board.accept', BOARD, []],
    ])
    const document: ShortcutDocument = { schemaVersion: 3, profiles: { 'desktop:macos': {
      'session.new': { code: 'Digit1', modifiers: [] }, [ids.goIntake]: { code: 'Enter', modifiers: [] },
    } } }
    expect(rows(document).map(row => [row.id, row.conflicts, row.issue])).toEqual([
      [ids.accept, ['session.new'], null], [ids.goIntake, [ids.open], 'reserved'], ['records.board.accept', ['session.new'], null],
    ])
    expect(overlappingBindings({ code: 'KeyG', thenCode: 'KeyI', modifiers: [] }, { code: 'KeyI', modifiers: [] })).toBe(false)
    expect(overlappingBindings({ code: 'KeyG', thenCode: 'KeyI', modifiers: [] }, { code: 'KeyG', thenCode: 'KeyM', modifiers: [] })).toBe(false)
    expect(overlappingBindings({ code: 'KeyG', modifiers: [] }, { code: 'KeyG', thenCode: 'KeyM', modifiers: [] })).toBe(true)
    expect(overlappingBindings({ code: 'KeyG', secondCode: 'KeyH', modifiers: [] }, { code: 'KeyG', thenCode: 'KeyM', modifiers: [] })).toBe(false)
  })

  it('writes version 3 for a sequence, keeps it, and refuses a sequence in an older version', () => {
    const set = (document: ShortcutDocument, binding: ShortcutBinding | null) =>
      editShortcutDocument(document, { type: 'set', id: ids.goIntake, binding }, 'web', 'linux')
    const sequence = set(empty, { code: 'KeyG', thenCode: 'KeyN', modifiers: [] })
    expect(sequence.schemaVersion).toBe(3)
    expect(set(sequence, null).schemaVersion).toBe(3)
    expect(set(empty, { code: 'KeyN', modifiers: [] }).schemaVersion).toBe(1)
    expect(editShortcutDocument(empty, { type: 'reset-all' }, 'desktop', 'windows').schemaVersion).toBe(2)
    const raw = (schemaVersion: number) => JSON.stringify({ schemaVersion, profiles: { 'web:linux': { [ids.goIntake]: { code: 'KeyG', thenCode: 'KeyN', modifiers: [] } } } })
    expect(parseShortcutDocument(raw(3))).toEqual(sequence)
    expect(parseShortcutDocument(raw(2))).toBe('invalid')
    expect(parseShortcutDocument(JSON.stringify({ schemaVersion: 3, profiles: { 'web:linux': { [ids.goIntake]: { code: 'KeyG', thenCode: 7, modifiers: [] } } } }))).toBe('invalid')
    expect(parseShortcutDocument(JSON.stringify({ schemaVersion: 3, profiles: { 'web:linux': { [ids.goIntake]: { code: 'KeyG', thenCode: 'KeyN', modifiers: ['shift'] } } } }))).toBe('invalid')
  })

  it('saves a scoped rebind and refuses one that conflicts in its scope', async () => {
    let raw: string | null = null
    const persistence = new ShortcutPersistence({ read: () => raw, write: (value) => { raw = value } }, 'desktop', 'macos', false, () => {})
    persistence.setDefinitions(definitions)
    let current = await persistence.readCurrent()
    const saved = await persistence.edit({ type: 'set', id: ids.goIntake, binding: { code: 'KeyG', thenCode: 'KeyN', modifiers: [] } }, current.revision)
    expect(saved.status).toBe('saved')
    expect(JSON.parse(raw ?? '')).toMatchObject({ schemaVersion: 3 })
    current = saved.snapshot
    const conflict = await persistence.edit({ type: 'set', id: ids.accept, binding: { code: 'KeyG', modifiers: [] } }, current.revision)
    expect(conflict).toMatchObject({ status: 'conflict', conflicts: [ids.goIntake] })
  })
})

describe('scoped commands in the service', () => {
  it('registers scoped rows, syncs definitions, and describes candidates by scope', async () => {
    const ctx = new Context()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const service = new ShortcutsService(ctx)
    try {
      expect(service.sequenceMs).toBe(1000)
      const offScope = service.registerScope({ id: INTAKE, label: () => 'Intake' })
      const off = service.registerScoped(scoped(ids.accept, { code: 'Digit1', modifiers: [] }, () => {}))
      const offFixed = service.registerScopedFixed({ id: ids.open, scope: INTAKE, label: () => 'Open', keys: ['↵'],
        bindings: [{ code: 'Enter', modifiers: [] }], resolve: () => ({ status: 'pass' }) })
      const offApp = service.register({ id: 'session.new' as ShortcutCommandId, label: () => 'New', aliases: [],
        defaults: { 'web:linux': { code: 'Slash', modifiers: ['primary'] } }, regions: ['page'], modals: [], resolve: () => ({ status: 'pass' }) })
      await vi.waitFor(() => { expect(service.config.getSnapshot().status).toBe('ready') })
      expect(service.describeBinding({ code: 'Digit1', modifiers: [] }, INTAKE)).toMatchObject({ issue: null, conflicts: [ids.accept] })
      expect(service.describeBinding({ code: 'Enter', modifiers: [] }, INTAKE)).toMatchObject({ issue: 'reserved', conflicts: [ids.open] })
      expect(service.describeBinding({ code: 'Digit1', modifiers: [] }, BOARD)).toMatchObject({ conflicts: [] })
      expect(service.describeBinding({ code: 'Slash', modifiers: ['primary'] }, BOARD)).toMatchObject({ issue: 'unsupported-key', conflicts: ['session.new'] })
      expect(service.describeBinding({ code: 'Digit1', modifiers: [] })).toMatchObject({ issue: 'modifier-required', conflicts: [ids.accept] })
      await expect(service.recording(true)).resolves.toBeUndefined()
      off(); offFixed(); offApp(); offScope()
      expect(service.catalog.getSnapshot()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
