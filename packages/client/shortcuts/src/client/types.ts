/** Command contributions and immutable catalog values. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { BindingIssue, NormalizedBinding, ShortcutConfigSnapshot, ShortcutEdit, ShortcutKeycap, ShortcutRevision, ShortcutSaveResult, ShortcutBinding, ShortcutCommandId, ShortcutPlatform, ShortcutProfile, ShortcutRuntime, ShortcutScopeId } from '../protocol.ts'

/** Local input owner resolved before an application command. */
export type ShortcutRegion = 'page' | 'editable' | 'terminal'
/** Synchronous DOM context; owners capture business targets in resolve(). */
export interface ShortcutContext {
  readonly source?: 'keyboard' | 'menu' | 'iframe' | 'webview'
  readonly region: ShortcutRegion
  readonly modal: string | null
  /** Original input element, or null when no document target is available. */
  readonly target: Element | null
}
/** A resolved action captures its target; failures remain the owner's responsibility. */
export type ShortcutResolution = { status: 'handled'; run(): void }
  | { status: 'blocked'; reason: string }
  | { status: 'pass' }
/** One command's labels, defaults, input ownership, and target resolver. */
export interface ShortcutCommand {
  readonly id: ShortcutCommandId
  readonly label: () => string
  readonly aliases: readonly string[]
  readonly defaults: Readonly<Partial<Record<ShortcutProfile, ShortcutBinding>>>
  readonly regions: readonly ShortcutRegion[]
  /**
   * Allowed modal identifiers for Web/Linux keyboard input and explicit menu actions;
   * Windows/macOS Desktop keyboard bindings take priority.
   */
  readonly modals: readonly string[]
  resolve(context: ShortcutContext): ShortcutResolution
}
/** A view that owns layer keys while focus is inside an element whose `data-shortcut-scope` attribute holds its id. */
export interface ShortcutScope {
  /** Follows the command id pattern, such as `records.intake`; `registerScope()` throws for another id. */
  readonly id: ShortcutScopeId
  /** Localized view name; the shortcut reference uses it as the group heading. */
  readonly label: () => string
  /**
   * Read on each layer key; false makes this marked element pass the key on.
   * @param element - the marked element that contains focus.
   * @returns whether the layer may act in this element now.
   */
  readonly active?: (element: HTMLElement) => boolean
}
/** Input facts of one layer key. */
export interface ShortcutLayerContext {
  readonly scope: ShortcutScopeId
  /** The marked element that contains focus. */
  readonly element: HTMLElement
  /** The focused element (the keydown target). */
  readonly target: Element
}
/** A rebindable command of one view scope: one key with no modifier or Shift only, or a two-key sequence. */
export interface ShortcutScopedCommand {
  readonly id: ShortcutCommandId
  readonly scope: ShortcutScopeId
  readonly label: () => string
  readonly aliases: readonly string[]
  /** Per-profile defaults; an omitted profile is unbound. */
  readonly defaults: Readonly<Partial<Record<ShortcutProfile, ShortcutBinding>>>
  /**
   * Resolve the target synchronously; `pass` lets the key go to an outer scope or its native action. The first key
   * of a sequence calls the resolver of each continuation and starts the sequence only when one does not pass, so a
   * resolver has no side effects.
   * @param context - scope, marked element, and focused element.
   * @returns the action to run, a blocked reason, or pass.
   */
  resolve(context: ShortcutLayerContext): ShortcutResolution
}
/** A read-only key of one view scope, such as Enter for Open the row. */
export interface ShortcutScopedFixedCommand {
  readonly id: ShortcutCommandId
  readonly scope: ShortcutScopeId
  readonly label: () => string
  /** Readable keys for the reference, such as `['↵']`. */
  readonly keys: readonly string[]
  readonly bindings: readonly [ShortcutBinding, ...ShortcutBinding[]]
  /**
   * Resolve the target synchronously, as {@link ShortcutScopedCommand.resolve} does.
   * @param context - scope, marked element, and focused element.
   * @returns the action to run, a blocked reason, or pass.
   */
  resolve(context: ShortcutLayerContext): ShortcutResolution
}
/** Scope of a catalog row, localized for the reference heading. */
export interface ShortcutCatalogScope {
  readonly id: ShortcutScopeId
  readonly label: string
}
/** JSON-compatible catalog row, shared by reference, tooltips, and controls. */
export interface ShortcutCatalogEntry {
  readonly id: ShortcutCommandId
  readonly label: string
  readonly aliases: readonly string[]
  readonly keys: readonly string[]
  /**
   * Current binding as keycap boxes: one for a key or a combination, one for each step of a sequence, none when unbound.
   * The registry always sets it; rows built outside the registry may omit it.
   */
  readonly keycaps?: readonly ShortcutKeycap[]
  readonly aria: string | undefined
  readonly binding: NormalizedBinding | null
  readonly modified: boolean
  readonly conflicts: readonly ShortcutCommandId[]
  readonly issue: BindingIssue | null
  /** View layer of a scoped command; absent for an application command. */
  readonly scope?: ShortcutCatalogScope
}
/** Keyboard adapter input, with composition and local consumption already resolved. */
export interface ShortcutGesture {
  readonly code: string
  /** Second physical key currently held with code; matching ignores pair order. */
  readonly secondCode?: string
  readonly control: boolean
  readonly alt: boolean
  readonly shift: boolean
  readonly meta: boolean
  readonly repeat: boolean
  readonly composing: boolean
  readonly defaultPrevented: boolean
}
/** Local fixed input delivered after controls, or a sequence-invalidating interaction. */
export type ShortcutFixedInput = {
  readonly type: 'keydown'
  readonly gesture: ShortcutGesture
  readonly context: ShortcutContext
  consume(): void
} | { readonly type: 'reset' }
/** Read-only input action contributed while its owning feature is mounted. */
export interface ShortcutFixedCommand {
  readonly id: ShortcutCommandId
  readonly label: () => string
  readonly keys: readonly string[]
  /** One or more physical combinations reserved by this action, including individual steps of a sequence. */
  readonly bindings: readonly [ShortcutBinding, ...ShortcutBinding[]]
  readonly group: 'application' | 'input' | 'menus' | 'approval'
}
/** Localized fixed-action row; its key sequence is not an editable binding. */
export interface ShortcutFixedCatalogEntry {
  readonly id: ShortcutCommandId
  readonly label: string
  readonly keys: readonly string[]
  /** One keycap box for each readable key; the registry always sets it. */
  readonly keycaps?: readonly ShortcutKeycap[]
  readonly bindings: readonly NormalizedBinding[]
  /** Scoped fixed keys use `application`; the reference groups them by scope. */
  readonly group: ShortcutFixedCommand['group']
  /** View layer of a scoped fixed key; absent for an application fixed action. */
  readonly scope?: ShortcutCatalogScope
}
/** Feature-facing keyboard registry. */
export interface Shortcuts {
  readonly runtime: ShortcutRuntime
  readonly platform: ShortcutPlatform
  readonly catalog: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
  readonly config: ObservableSnapshot<ShortcutConfigSnapshot>
  readonly fixedCatalog: ObservableSnapshot<readonly ShortcutFixedCatalogEntry[]>
  readonly stopSequenceMs: number
  /** Maximum interval between the two keys of a view-layer sequence, in milliseconds. */
  readonly sequenceMs: number
  /**
   * Declare a view scope; an id that is not dotted (such as `records`) and a duplicate id throw. Register it before
   * its commands.
   * @param scope - id, localized label, and optional predicate.
   * @returns idempotent disposer.
   */
  registerScope(scope: ShortcutScope): () => void
  /**
   * Register a rebindable view-layer command; an unknown scope, a duplicate id, an invalid layer default, or an
   * overlapping default in the same scope throw.
   * @param command - scope, labels, defaults, and target resolver.
   * @returns idempotent disposer removing the binding and catalog entry.
   */
  registerScoped(command: ShortcutScopedCommand): () => void
  /**
   * Register a read-only view-layer key with registerFixed() semantics: a read-only reference row and no saved override.
   * @param command - scope, label, readable keys, reserved bindings, and target resolver.
   * @returns idempotent disposer removing the fixed row.
   */
  registerScopedFixed(command: ShortcutScopedFixedCommand): () => void
  /**
   * Contribute one fixed action and reserve its keys against editable bindings.
   * @param command - owner-localized name, group, readable keys, and reserved physical combinations.
   * @returns idempotent disposer removing the fixed row.
   */
  registerFixed(command: ShortcutFixedCommand): () => void
  /**
   * Observe locally arbitrated input and interaction resets for fixed sequences.
   * @param listener - owner handler; composing or consumed input must not trigger actions.
   * @returns disposer releasing the handler.
   */
  observeFixedInput(listener: (input: ShortcutFixedInput) => void): () => void
  /**
   * Describe a candidate using the device's physical-key and reservation rules; invalid codes throw.
   * @param binding - candidate combination, or null for an unbound command.
   * @param scope - view layer of the edited command; absent for an application command.
   * @returns canonical binding, visible keys, rejection reason, and overlapping editable/fixed command IDs.
   */
  describeBinding(binding: ShortcutBinding | null, scope?: ShortcutScopeId): {
    binding: NormalizedBinding | null
    keys: readonly string[]
    issue: BindingIssue | null
    conflicts: readonly ShortcutCommandId[]
  }
  /**
   * Save a reviewed edit; failures preserve both accepted preferences and the caller's draft.
   * @param edit - set, clear, reset, or reset-all operation.
   * @param revision - accepted revision reviewed by the user.
   * @returns persistence outcome and current accepted configuration.
   * @throws when publishing the accepted command catalog fails.
   */
  edit(edit: ShortcutEdit, revision: ShortcutRevision): Promise<ShortcutSaveResult>
  /**
   * Suppress native menu accelerators while the recording layer owns keyboard input; reject if Desktop cannot acknowledge it.
   * @param active - whether the recording layer is mounted.
   * @returns completion of the native interception update.
   */
  recording(active: boolean): Promise<void>
  /**
   * Request closure of the Desktop window using the currently accepted shortcut revision.
   * @returns completion of the native request; rejects outside Desktop or when the bridge request fails.
   */
  closeWindow(): Promise<void>
  /**
   * Register a command; duplicate ids and overlapping default bindings throw.
   * @param command - feature-owned labels, defaults, and target resolver.
   * @returns disposer removing the binding and catalog entry.
   */
  register(command: ShortcutCommand): () => void
}
