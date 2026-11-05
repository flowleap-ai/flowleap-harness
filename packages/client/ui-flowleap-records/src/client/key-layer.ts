/**
 * The keys and the ⌘K item of the Matters panel. One registration of the scope `records.panel` and of every command of
 * `.agents/skills/flowleap-design-language/keys.md` serves all screens: each command runs the handler of the latest
 * mounted screen that provides one, and passes the key on when no screen does. A screen provides its handlers with
 * `useKeyActs` and its open item for ⌘K with `useCommandItem`; it registers no command itself, so two screens never
 * register the same command id.
 */

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  ShortcutBinding, ShortcutCommandId, ShortcutResolution, ShortcutScopeId,
} from '@deepseek-ai/dsh-client-shortcuts/client'
import type { CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import { commandId, type CommandName } from './keys.ts'
import type { FlowleapRecordsKey } from './locales.ts'

/** The scope of the panel root (`data-shortcut-scope="records.panel"`); a scope id is dotted, as a command id is. */
export const RECORDS_SCOPE = 'records.panel' as ShortcutScopeId

/** The handler of each act that a screen runs now. */
export type KeyActs = Partial<Record<CommandName, () => void>>

/** How a screen provides its handlers. */
export interface KeyActsOptions {
  /** ↓ and ↑ run the `next` and `previous` handlers; false on a page whose content the arrows scroll. Default true. */
  readonly arrows?: boolean
  /**
   * The screen holds a decision whose last act failed, so its handlers outrank those of the view's own notices: R
   * retries the act, not the load of the view. Default false.
   */
  readonly failed?: boolean
}

/** A value that a screen updates on each render. */
export interface Current<T> {
  readonly current: T
}

/** One screen's handlers and whether its arrows move. */
export interface KeyActsSource {
  readonly acts: Current<KeyActs>
  readonly arrows: boolean
  /** The screen holds a decision whose last act failed; absent means false. */
  readonly failed?: Current<boolean>
}

/** The sources of the mounted screens, in mount order; the latest source with a value wins. */
class Sources<S> {
  readonly #sources: S[] = []

  /**
   * Add a screen's source.
   * @param source - read on each key or each opening of ⌘K.
   * @returns idempotent disposer.
   */
  provide(source: S): () => void {
    this.#sources.push(source)
    return () => {
      const index = this.#sources.indexOf(source)
      if (index !== -1) this.#sources.splice(index, 1)
    }
  }

  /**
   * The value of the latest source that has one.
   * @param pick - the source's value, or undefined when it has none.
   * @returns the value, or undefined.
   */
  protected latest<T>(pick: (source: S) => T | undefined): T | undefined {
    for (const source of [...this.#sources].reverse()) {
      const value = pick(source)
      if (value !== undefined) return value
    }
    return undefined
  }
}

/**
 * The handlers of the mounted screens. The latest provider of an act wins, except that a screen whose decision has a
 * failed act (`failed`) outranks the others, because the failed act is the person's pending decision.
 */
export class KeyActRegistry extends Sources<KeyActsSource> {
  readonly #listeners = new Set<() => void>()
  #held = false

  /**
   * Add a screen's handlers.
   * @param source - read on each key.
   * @returns idempotent disposer.
   */
  override provide(source: KeyActsSource): () => void {
    const dispose = super.provide(source)
    this.notify()
    return () => {
      dispose()
      this.notify()
    }
  }

  /**
   * The handler of an act.
   * @param name - the act.
   * @param arrow - the key is ↓ or ↑: the act runs only when its provider lets the arrows move.
   * @returns the handler of the latest screen with a failed decision that runs the act, else the latest handler, or
   * undefined when no mounted screen runs the act.
   */
  handler(name: CommandName, arrow = false): (() => void) | undefined {
    const runs = (source: KeyActsSource) => source.acts.current[name] === undefined ? undefined : source
    const found = this.latest(source => source.failed?.current === true ? runs(source) : undefined) ?? this.latest(runs)
    return found === undefined || (arrow && !found.arrows) ? undefined : found.acts.current[name]
  }

  /**
   * Whether a failed decision holds R, so the notice of a failed load shows its Try again without a keycap.
   * @returns true while a mounted screen with a failed decision runs `retry`.
   */
  retryHeld(): boolean {
    const holds = (source: KeyActsSource) => source.failed?.current === true && source.acts.current.retry !== undefined ? source : undefined
    return this.latest(holds) !== undefined
  }

  /**
   * Listen for a change of `retryHeld`.
   * @param listener - called after `retryHeld` changed.
   * @returns the disposer.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Tell the listeners when `retryHeld` changed. A screen calls this after it renders with new handlers. */
  notify(): void {
    const held = this.retryHeld()
    if (held === this.#held) return
    this.#held = held
    for (const listener of this.#listeners) listener()
  }
}

/** The open items of the mounted screens for ⌘K; the latest open item wins. */
export class CommandItemRegistry extends Sources<Current<CommandMenuItem | null>> {
  /**
   * The open item that ⌘K shows: the latest one of the mounted screens.
   * @returns the item, or null when no mounted screen has one.
   */
  item(): CommandMenuItem | null {
    return this.latest(source => source.current ?? undefined) ?? null
  }
}

/** What the hooks need of a screen context. */
export interface KeyLayerContext {
  readonly keyActs: KeyActRegistry
  readonly commandItems: CommandItemRegistry
}

/**
 * Provide a screen's key handlers while it is mounted. The handlers of the last render run.
 * @param ctx - the screen context.
 * @param acts - the handler of each act the screen runs now.
 * @param options - whether ↓ and ↑ move.
 */
export function useKeyActs(ctx: KeyLayerContext, acts: KeyActs, options: KeyActsOptions = {}): void {
  const current = useRef(acts)
  const failed = useRef(options.failed ?? false)
  useLayoutEffect(() => {
    current.current = acts
    failed.current = options.failed ?? false
    ctx.keyActs.notify()
  })
  const arrows = options.arrows ?? true
  useEffect(() => ctx.keyActs.provide({ acts: current, arrows, failed }), [ctx.keyActs, arrows])
}

/**
 * Whether a failed decision holds R, which the notice of a failed load uses to show its Try again without a keycap.
 * @param ctx - the screen context.
 * @returns true while a mounted screen with a failed decision runs `retry`.
 */
export function useRetryHeld(ctx: KeyLayerContext): boolean {
  return useSyncExternalStore(ctx.keyActs.subscribe, () => ctx.keyActs.retryHeld())
}

/**
 * Provide a screen's open item and its acts to ⌘K while the screen is mounted.
 * @param ctx - the screen context.
 * @param item - the open item, or null when the screen has none now.
 */
export function useCommandItem(ctx: KeyLayerContext, item: CommandMenuItem | null): void {
  const current = useRef(item)
  useLayoutEffect(() => { current.current = item })
  useEffect(() => ctx.commandItems.provide(current), [ctx.commandItems])
}

type Translate = (key: FlowleapRecordsKey) => string

/** The acts of the view-scoped layer with their default key (keys.md), the same on desktop and Web. */
const LAYER: Readonly<Record<Exclude<CommandName, 'search' | 'record' | 'open'>, ShortcutBinding>> = {
  accept: { code: 'Digit1', modifiers: [] },
  reject: { code: 'Digit2', modifiers: [] },
  otherMatter: { code: 'KeyM', modifiers: [] },
  preview: { code: 'Space', modifiers: [] },
  calculation: { code: 'KeyC', modifiers: [] },
  openLetter: { code: 'KeyO', modifiers: [] },
  retry: { code: 'KeyR', modifiers: [] },
  recordEvent: { code: 'KeyE', modifiers: [] },
  showFiled: { code: 'KeyF', modifiers: [] },
  goMatter: { code: 'KeyG', thenCode: 'KeyM', modifiers: [] },
  goIntake: { code: 'KeyG', thenCode: 'KeyI', modifiers: [] },
  next: { code: 'KeyJ', modifiers: [] },
  previous: { code: 'KeyK', modifiers: [] },
  select: { code: 'KeyX', modifiers: [] },
}

/**
 * Record the decision: ⇧⌘↵ (Ctrl+Shift+↵), because the composer's fixed ⌘↵ holds the shorter key. The registry
 * reserves Enter with modifiers on Linux, so Linux has no default there.
 */
const RECORD: ShortcutBinding = { code: 'Enter', modifiers: ['primary', 'shift'] }
const RECORD_DEFAULTS = {
  'desktop:macos': RECORD, 'desktop:windows': RECORD, 'web:macos': RECORD, 'web:windows': RECORD,
} as const

/** The fixed arrow keys, which run the `next` and `previous` handlers. */
const ARROWS = [
  { id: 'records.list.nextArrow', act: 'next', code: 'ArrowDown', key: '↓' },
  { id: 'records.list.previousArrow', act: 'previous', code: 'ArrowUp', key: '↑' },
] as const

/**
 * The binding on each desktop and Web profile.
 * @param binding - the binding.
 * @returns the defaults.
 */
function everywhere(binding: ShortcutBinding): Readonly<Record<`${'desktop' | 'web'}:${'macos' | 'windows' | 'linux'}`, ShortcutBinding>> {
  return {
    'desktop:macos': binding, 'desktop:windows': binding, 'desktop:linux': binding,
    'web:macos': binding, 'web:windows': binding, 'web:linux': binding,
  }
}

/** Marks a region of the panel whose keys belong to another view, such as the agent panel's conversation. */
export const KEYS_ELSEWHERE = 'data-records-keys-elsewhere'

/**
 * Run a handler, or pass the key on: with no handler, or with focus in a region that `KEYS_ELSEWHERE` marks.
 * @param target - the focused element.
 * @param run - the handler.
 * @returns the resolution.
 */
function resolution(target: Element | null, run: (() => void) | undefined): ShortcutResolution {
  return run === undefined || target?.closest(`[${KEYS_ELSEWHERE}]`) != null ? { status: 'pass' } : { status: 'handled', run }
}

/**
 * Register the scope `records.panel`, every act of keys.md and the ⌘K contribution, each as an effect of `ctx`.
 * @param ctx - the client context with `shortcuts` and `commandMenu`.
 * @param acts - the handlers of the mounted screens.
 * @param items - the open items of the mounted screens.
 * @param t - the translate function of the namespace.
 */
export function registerKeyLayer(ctx: ClientContext, acts: KeyActRegistry, items: CommandItemRegistry, t: Translate): void {
  ctx.effect(() => ctx.shortcuts.registerScope({ id: RECORDS_SCOPE, label: () => t('panel') }), 'ui-flowleap-records: key scope')
  for (const [name, binding] of Object.entries(LAYER) as [keyof typeof LAYER, ShortcutBinding][]) {
    ctx.effect(() => ctx.shortcuts.registerScoped({
      id: commandId(name), scope: RECORDS_SCOPE, label: () => t(`keys.${name}`), aliases: [], defaults: everywhere(binding),
      resolve: ({ target }) => resolution(target, acts.handler(name)),
    }), `ui-flowleap-records: key ${name}`)
  }
  ctx.effect(() => ctx.shortcuts.registerScopedFixed({
    id: commandId('open'), scope: RECORDS_SCOPE, label: () => t('keys.open'), keys: ['↵'],
    bindings: [{ code: 'Enter', modifiers: [] }], resolve: ({ target }) => resolution(target, acts.handler('open')),
  }), 'ui-flowleap-records: key open')
  for (const arrow of ARROWS) {
    ctx.effect(() => ctx.shortcuts.registerScopedFixed({
      id: arrow.id as ShortcutCommandId, scope: RECORDS_SCOPE, label: () => t(`keys.${arrow.act}`), keys: [arrow.key],
      bindings: [{ code: arrow.code, modifiers: [] }], resolve: ({ target }) => resolution(target, acts.handler(arrow.act, true)),
    }), `ui-flowleap-records: key ${arrow.act} arrow`)
  }
  ctx.effect(() => ctx.shortcuts.register({
    id: commandId('record'), label: () => t('keys.record'), aliases: [], defaults: RECORD_DEFAULTS, regions: ['page'], modals: [],
    // Desktop on macOS and Windows dispatches this key in every region, so the resolver passes a key typed in a field.
    resolve: ({ target, region }) => region !== 'page' || (target?.closest(`[data-shortcut-scope="${RECORDS_SCOPE}"]`) ?? null) === null
      ? { status: 'pass' }
      : resolution(target, acts.handler('record')),
  }), 'ui-flowleap-records: key record')
  ctx.effect(() => ctx.commandMenu.contribute({ item: () => items.item() }), 'ui-flowleap-records: command menu')
}
