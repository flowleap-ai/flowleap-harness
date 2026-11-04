/** Command registration, normalized default bindings, and synchronous dispatch. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindingIssue, bindingKey, effectiveScopedShortcuts, effectiveShortcuts, initialShortcutConfig, isShortcutId, isWebBindingAllowed, layerBindingIssue, normalizeBinding, overlappingBindings, presentBinding, resolveShortcutDefault } from '../protocol.ts'
import type { NormalizedBinding, ShortcutCommandId, ShortcutConfigSnapshot, ShortcutDefinition, ShortcutPlatform, ShortcutRuntime, ShortcutScopeId } from '../protocol.ts'
import { Config } from '../config.ts'
import type { ShortcutCatalogEntry, ShortcutCommand, ShortcutContext, ShortcutGesture, ShortcutLayerContext,
  ShortcutFixedCommand, ShortcutFixedCatalogEntry, ShortcutResolution, ShortcutScope, ShortcutScopedCommand,
  ShortcutScopedFixedCommand } from './types.ts'

/** Dispatch consumption is independent of later business-operation success. */
type ShortcutDispatch = { status: 'handled'; commandId: ShortcutCommandId }
  | { status: 'blocked'; commandId: ShortcutCommandId; reason: string }
  | { status: 'pass' }
/** A layer key can also start a sequence and wait for its second key. */
type LayerDispatch = ShortcutDispatch | { status: 'pending' }
/** One enabled layer binding of a scope. */
interface LayerEntry {
  readonly id: ShortcutCommandId
  resolve(context: ShortcutLayerContext): ShortcutResolution
}

/** The first key of a sequence and the scope element that received it. */
interface PendingSequence {
  readonly scope: ShortcutScopeId
  readonly element: HTMLElement
  readonly code: string
  readonly timer: ReturnType<typeof setTimeout>
}

/** Text entry: form fields and an element with any `contenteditable` value except `false`, `plaintext-only` included. */
export const editableTargets = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
/** Focus targets where the layer never acts: text entry, terminals, and menus. */
const layerExcluded = `${editableTargets}, [role="textbox"], .xterm, [role="menu"], [role="menubar"]`
/** Controls that keep their native Space and Enter activation. */
const activationTargets = ['button', 'a[href]', 'summary', ...['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'treeitem', 'gridcell'].map(role => `[role="${role}"]`)].join(', ')

/**
 * The normalized default binding of a command on each runtime and platform that has one.
 * @param command - a command with per-profile defaults.
 * @returns each runtime and platform with its binding.
 */
function* platformDefaults(command: Parameters<typeof resolveShortcutDefault>[0]): Generator<{
  readonly runtime: ShortcutRuntime
  readonly platform: ShortcutPlatform
  readonly binding: NormalizedBinding
}> {
  for (const runtime of ['desktop', 'web'] as const) {
    for (const platform of ['macos', 'windows', 'linux'] as const) {
      const candidate = resolveShortcutDefault(command, runtime, platform)
      if (candidate !== undefined) yield { runtime, platform, binding: normalizeBinding(candidate, platform) }
    }
  }
}

/** Application command registry; adapters own event listeners, feature plugins own actions. */
export class ShortcutRegistry {
  private readonly commands = new Map<ShortcutCommandId, ShortcutCommand>()
  private readonly fixedCommands = new Map<ShortcutCommandId, ShortcutFixedCommand>()
  private readonly scopes = new Map<ShortcutScopeId, ShortcutScope>()
  private readonly scopedCommands = new Map<ShortcutCommandId, ShortcutScopedCommand>()
  private readonly scopedFixedCommands = new Map<ShortcutCommandId, ShortcutScopedFixedCommand>()
  private readonly conflicts = new Map<string, ShortcutCommand>()
  private readonly bindings = new Map<string, ShortcutCommand>()
  private layerBindings = new Map<ShortcutScopeId, Map<string, LayerEntry>>()
  private pending: PendingSequence | null = null
  private readonly state
  /** Effective localized rows derived from the accepted configuration. */
  readonly catalog
  /** Accepted preferences and visible read diagnostics. */
  readonly config
  /** Fixed local operations whose owning plugins are mounted. */
  readonly fixedCatalog = createSnapshotStore<readonly ShortcutFixedCatalogEntry[]>([])
  /** While true, the shortcut editor owns the keyboard and the layer passes every key. */
  recordingLayer = false

  constructor(readonly runtime: ShortcutRuntime, readonly platform: ShortcutPlatform,
    config: ShortcutConfigSnapshot = { ...initialShortcutConfig(), status: 'ready' },
    readonly sequenceMs: number = Config({}).sequenceMs) {
    this.state = createSnapshotStore<{ catalog: readonly ShortcutCatalogEntry[]; config: ShortcutConfigSnapshot }>({ catalog: [], config })
    this.catalog = { getSnapshot: () => this.state.getSnapshot().catalog,
      subscribe: (listener: () => void) => this.state.subscribe(listener) }
    this.config = { getSnapshot: () => this.state.getSnapshot().config,
      subscribe: (listener: () => void) => this.state.subscribe(listener) }
  }

  /**
   * Return the serializable active catalog for storage validation.
   * @returns definitions without callbacks or localized labels.
   */
  definitions(): readonly ShortcutDefinition[] {
    return [...[...this.commands.values()].map(({ id, defaults }) => ({ id, defaults })),
      ...[...this.fixedCommands.values()].map(({ id, bindings }) => ({ id, defaults: {}, fixed: bindings })),
      ...[...this.scopedCommands.values()].map(({ id, defaults, scope }) => ({ id, defaults, scope })),
      ...[...this.scopedFixedCommands.values()].map(({ id, bindings, scope }) => ({ id, defaults: {}, fixed: bindings, scope }))]
  }

  private assertUnique(id: ShortcutCommandId): void {
    if (this.commands.has(id) || this.fixedCommands.has(id) || this.scopedCommands.has(id) || this.scopedFixedCommands.has(id)) {
      throw new Error(`Duplicate shortcut command: ${id}`)
    }
  }

  private assertScope(id: ShortcutScopeId): void {
    if (!this.scopes.has(id)) throw new Error(`Unknown shortcut scope: ${id}`)
  }

  /**
   * Register a read-only input action whose keys cannot be assigned to editable commands.
   * @param command - owner-localized action and readable sequence.
   * @returns idempotent disposer removing its reference row.
   */
  registerFixed(command: ShortcutFixedCommand): () => void {
    this.assertUnique(command.id)
    for (const binding of command.bindings) normalizeBinding(binding, this.platform)
    return this.add(this.fixedCommands, command)
  }

  /**
   * Declare a view scope for layer commands; an id that is not dotted, such as `records`, or a duplicate id throws.
   * @param scope - id, localized label, and optional predicate.
   * @returns idempotent disposer.
   */
  registerScope(scope: ShortcutScope): () => void {
    if (!isShortcutId(scope.id)) throw new Error(`Invalid shortcut scope id: ${scope.id}`)
    if (this.scopes.has(scope.id)) throw new Error(`Duplicate shortcut scope: ${scope.id}`)
    return this.add(this.scopes, scope)
  }

  /**
   * Register a rebindable layer command after checking its defaults against the layer rules and its scope.
   * @param command - scope, labels, defaults, and target resolver.
   * @returns idempotent disposer removing both matching and catalog entries.
   */
  registerScoped(command: ShortcutScopedCommand): () => void {
    this.assertUnique(command.id)
    this.assertScope(command.scope)
    for (const { runtime, platform, binding } of platformDefaults(command)) {
      if (layerBindingIssue(binding) !== null) throw new Error(`Unsupported layer shortcut default: ${command.id}`)
      const occupied = [...[...this.scopedCommands.values()].filter(other => other.scope === command.scope).flatMap((other) => {
        const value = resolveShortcutDefault(other, runtime, platform)
        return value === undefined ? [] : [{ id: other.id, binding: normalizeBinding(value, platform) }]
      }), ...[...this.scopedFixedCommands.values()].filter(other => other.scope === command.scope)
        .flatMap(other => other.bindings.map(value => ({ id: other.id, binding: normalizeBinding(value, platform) })))]
      const other = occupied.find(row => overlappingBindings(binding, row.binding))
      if (other !== undefined) throw new Error(`Conflicting shortcut defaults: ${command.id} and ${other.id} (${runtime}:${platform})`)
    }
    return this.add(this.scopedCommands, command)
  }

  /**
   * Register a read-only layer key; it appears in the fixed catalog under its scope.
   * @param command - scope, label, readable keys, reserved bindings, and target resolver.
   * @returns idempotent disposer removing its reference row.
   */
  registerScopedFixed(command: ShortcutScopedFixedCommand): () => void {
    this.assertUnique(command.id)
    this.assertScope(command.scope)
    for (const binding of command.bindings) normalizeBinding(binding, this.platform)
    return this.add(this.scopedFixedCommands, command)
  }

  private add<K, V>(map: Map<K, V>, value: V & { readonly id: K }): () => void {
    map.set(value.id, value)
    this.refreshLabels()
    return () => {
      if (map.get(value.id) !== value) return
      map.delete(value.id)
      this.refreshLabels()
    }
  }

  private scopeOf(id: ShortcutScopeId): { id: ShortcutScopeId; label: string } {
    const scope = this.scopes.get(id)
    return { id, label: scope === undefined ? id : scope.label() }
  }

  private refreshFixedLabels(): void {
    const keycaps = (keys: readonly string[]) => keys.map(key => [key])
    this.fixedCatalog.set([...[...this.fixedCommands.values()].map(command => ({
      id: command.id, label: command.label(), keys: command.keys, keycaps: keycaps(command.keys), group: command.group,
      bindings: command.bindings.map(binding => normalizeBinding(binding, this.platform)),
    })), ...[...this.scopedFixedCommands.values()].map(command => ({
      id: command.id, label: command.label(), keys: command.keys, keycaps: keycaps(command.keys), group: 'application' as const,
      bindings: command.bindings.map(binding => normalizeBinding(binding, this.platform)), scope: this.scopeOf(command.scope),
    }))])
  }

  /**
   * Publish accepted preferences and all derived labels atomically.
   * @param config - storage owner's latest accepted snapshot.
   */
  configure(config: ShortcutConfigSnapshot): void {
    const current = this.config.getSnapshot()
    if (config.revision === current.revision && config.status === current.status && config.error === current.error) return
    this.refreshLabels(config)
  }

  /**
   * Register atomically after checking defaults for all supported platforms and shells.
   * @param command - feature-owned command definition.
   * @returns idempotent disposer removing both matching and catalog entries.
   */
  register(command: ShortcutCommand): () => void {
    this.assertUnique(command.id)
    for (const { runtime, platform, binding } of platformDefaults(command)) {
      if (runtime === 'web' && !isWebBindingAllowed(binding, platform)) {
        throw new Error(`Unsupported Web shortcut: ${command.id}`)
      }
      if (bindingIssue(binding, runtime, platform) !== null) throw new Error(`Reserved shortcut default: ${command.id}`)
      for (const existing of this.commands.values()) {
        const other = resolveShortcutDefault(existing, runtime, platform)
        if (other !== undefined && overlappingBindings(binding, normalizeBinding(other, platform))) {
          throw new Error(`Conflicting shortcut defaults: ${command.id} and ${existing.id} (${runtime}:${platform})`)
        }
      }
    }
    return this.add(this.commands, command)
  }

  /**
   * Recompute effective bindings when preferences, commands, or locale change.
   * @param config - accepted configuration, defaulting to the current snapshot.
   */
  refreshLabels(config: ShortcutConfigSnapshot = this.config.getSnapshot()): void {
    this.bindings.clear()
    this.conflicts.clear()
    this.resetLayer()
    const layer = new Map<ShortcutScopeId, Map<string, LayerEntry>>()
    const enter = (scope: ShortcutScopeId, binding: NormalizedBinding, entry: LayerEntry): void => {
      const keys = layer.get(scope) ?? new Map<string, LayerEntry>()
      keys.set(bindingKey(binding), entry)
      layer.set(scope, keys)
    }
    const definitions = this.definitions()
    // Application rows never carry a scope; the catalog row's scope field is the localized form.
    const application = effectiveShortcuts(definitions, config.document, this.runtime, this.platform).map(({ scope: _scope, ...row }) => {
      const command = this.commands.get(row.id) as ShortcutCommand
      const enabled = config.status !== 'loading' && row.issue === null && row.conflicts.length === 0
      if (enabled && row.binding !== null) this.bindings.set(bindingKey(row.binding), command)
      if (config.status !== 'loading' && row.issue === null && row.conflicts.length > 0 && row.binding !== null) {
        this.conflicts.set(bindingKey(row.binding), command)
      }
      const presented = presentBinding(row.binding, this.platform)
      return { ...row, label: command.label(), aliases: command.aliases, ...presented, aria: enabled ? presented.aria : undefined }
    })
    const scoped = effectiveScopedShortcuts(definitions, config.document, this.runtime, this.platform).map(({ scope: _scope, ...row }) => {
      const command = this.scopedCommands.get(row.id) as ShortcutScopedCommand
      const enabled = config.status !== 'loading' && row.issue === null && row.conflicts.length === 0
      if (enabled && row.binding !== null) enter(command.scope, row.binding, command)
      const presented = presentBinding(row.binding, this.platform)
      return { ...row, label: command.label(), aliases: command.aliases, ...presented,
        aria: enabled ? presented.aria : undefined, scope: this.scopeOf(command.scope) }
    })
    if (config.status !== 'loading') {
      for (const command of this.scopedFixedCommands.values()) {
        for (const binding of command.bindings) enter(command.scope, normalizeBinding(binding, this.platform), command)
      }
    }
    this.layerBindings = layer
    this.state.set({ config, catalog: [...application, ...scoped] })
    this.refreshFixedLabels()
  }

  /** Forget a started sequence; focus, pointer, blur, and composition changes call this through the adapter. */
  resetLayer(): void {
    if (this.pending !== null) clearTimeout(this.pending.timer)
    this.pending = null
  }

  /**
   * Invoke a native menu selection independently of its optional key binding.
   * @param id - registered product command.
   * @param context - live input owner and modal state.
   */
  invoke(id: ShortcutCommandId, context: ShortcutContext): void {
    const command = this.commands.get(id)
    if (command === undefined || (context.modal !== null && !command.modals.includes(context.modal))) return
    const result = command.resolve({ ...context, source: 'menu' })
    if (result.status === 'handled') result.run()
  }

  /**
   * Windows/macOS Desktop bindings override local regions and modal controls independently of their configuration source.
   * @param gesture - normalized DOM/native input facts.
   * @param context - synchronous input and modal owner.
   * @param consume - adapter's preventDefault, called before business execution.
   * @returns handled, blocked with a reason, or pass for local/system input.
   */
  dispatch(gesture: ShortcutGesture, context: ShortcutContext, consume: () => void): ShortcutDispatch {
    if (gesture.defaultPrevented || gesture.composing) return { status: 'pass' }
    const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(value => gesture[value])
    const pairKey = bindingKey({ code: gesture.code, modifiers,
      ...(gesture.secondCode === undefined ? {} : { secondCode: gesture.secondCode }) })
    const key = this.bindings.has(pairKey) || this.conflicts.has(pairKey) ? pairKey : bindingKey({ code: gesture.code, modifiers })
    const command = this.bindings.get(key) ?? this.conflicts.get(key)
    const priority = this.runtime === 'desktop' && (this.platform === 'windows' || this.platform === 'macos')
    if (command === undefined || (!priority && !command.regions.includes(context.region))) return { status: 'pass' }
    if (!priority && context.region === 'terminal' && gesture.control && !gesture.meta && !gesture.alt && !gesture.shift
      && (gesture.code === 'KeyW' || gesture.code === 'KeyR')) return { status: 'pass' }
    if (!this.bindings.has(key)) {
      consume()
      return { status: 'blocked', commandId: command.id, reason: 'conflict' }
    }
    if (!priority && context.modal !== null && !command.modals.includes(context.modal)) {
      consume()
      return { status: 'blocked', commandId: command.id, reason: 'modal' }
    }
    const resolution = command.resolve(context)
    if (resolution.status === 'pass') return resolution
    consume()
    if (resolution.status === 'blocked') return { ...resolution, commandId: command.id }
    if (!gesture.repeat) resolution.run()
    return { status: 'handled', commandId: command.id }
  }

  /**
   * Match a key against the view layers that contain focus, innermost first. Runs after application bindings passed.
   * @param gesture - normalized DOM input facts.
   * @param target - focused element, or null without a document target.
   * @param modal - topmost open modal or menu; a scope outside it passes every key.
   * @param consume - adapter's preventDefault, called before business execution.
   * @returns handled, blocked, pending for a started sequence, or pass.
   */
  dispatchLayer(gesture: ShortcutGesture, target: Element | null, modal: Element | null, consume: () => void): LayerDispatch {
    const pending = this.pending
    if (gesture.repeat && pending !== null && pending.code === gesture.code) { consume(); return { status: 'pending' } }
    this.resetLayer()
    if (this.recordingLayer || gesture.composing || gesture.defaultPrevented || target === null
      || target.closest(layerExcluded) !== null) return { status: 'pass' }
    const elements: HTMLElement[] = []
    for (let element = target.closest<HTMLElement>('[data-shortcut-scope]'); element !== null;
      element = element.parentElement?.closest<HTMLElement>('[data-shortcut-scope]') ?? null) {
      const scope = this.scopes.get(element.dataset.shortcutScope as ShortcutScopeId)
      if (scope !== undefined && (modal === null || modal.contains(element)) && scope.active?.(element) !== false) elements.push(element)
    }
    const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(value => gesture[value])
    const run = (entry: LayerEntry, scope: ShortcutScopeId, element: HTMLElement): LayerDispatch | null => {
      const resolution = entry.resolve({ scope, element, target })
      if (resolution.status === 'pass') return null
      consume()
      if (resolution.status === 'blocked') return { ...resolution, commandId: entry.id }
      if (!gesture.repeat) resolution.run()
      return { status: 'handled', commandId: entry.id }
    }
    if (pending !== null && modifiers.length === 0 && gesture.secondCode === undefined && pending.element.contains(target)) {
      const entry = this.layerBindings.get(pending.scope)?.get(bindingKey({ code: pending.code, thenCode: gesture.code, modifiers: [] }))
      const result = entry === undefined ? null : run(entry, pending.scope, pending.element)
      if (result !== null) return result
    }
    if (modifiers.length === 0 && (gesture.code === 'Space' || gesture.code === 'Enter')) {
      const control = target.closest(activationTargets)
      if (control !== null && elements.some(element => element.contains(control) && element !== control)) return { status: 'pass' }
    }
    for (const element of elements) {
      const scope = element.dataset.shortcutScope as ShortcutScopeId
      const keys = this.layerBindings.get(scope)
      const entry = keys?.get(bindingKey({ code: gesture.code, modifiers }))
      const result = entry === undefined ? null : run(entry, scope, element)
      if (result !== null) return result
      const prefix = `${gesture.code}>`
      // A sequence starts only when a continuation would act now, so a first key with no act goes on to the page.
      if (modifiers.length === 0 && !gesture.repeat
        && [...keys ?? []].some(([key, next]) => key.startsWith(prefix) && next.resolve({ scope, element, target }).status !== 'pass')) {
        consume()
        this.pending = { scope, element, code: gesture.code, timer: setTimeout(() => { this.pending = null }, this.sequenceMs) }
        return { status: 'pending' }
      }
    }
    return { status: 'pass' }
  }
}
