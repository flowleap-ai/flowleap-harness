/** Validated preference documents and deterministic conflict resolution, without browser dependencies. */
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { bindingKey, isWebBindingAllowed, normalizeBinding } from './binding.ts'
import type { NormalizedBinding, ShortcutBinding, ShortcutCommandId, ShortcutModifier, ShortcutPlatform, ShortcutProfile, ShortcutRuntime, ShortcutScopeId } from './binding.ts'

/** Overrides are platform-local; absent commands inherit defaults and null explicitly unbinds. Version 3 adds `thenCode`. */
export interface ShortcutDocument {
  readonly schemaVersion: 1 | 2 | 3
  readonly profiles: Readonly<Partial<Record<ShortcutProfile, Readonly<Record<string, ShortcutBinding | null>>>>>
}
/** Serializable command definitions accepted from the trusted product frame. */
export interface ShortcutDefinition {
  readonly id: ShortcutCommandId
  readonly defaults: Readonly<Partial<Record<ShortcutProfile, ShortcutBinding>>>
  /** Fixed actions reserve one or more combinations instead of exposing an editable default. */
  readonly fixed?: readonly [ShortcutBinding, ...ShortcutBinding[]]
  /** View layer that owns this command; absent for an application command. */
  readonly scope?: ShortcutScopeId
}
/** Validation failures select localized copy in the UI. */
export type BindingIssue = 'reserved' | 'unsupported-browser' | 'modifier-required' | 'unsupported-key'
/** A conflicting row keeps its requested binding visible but cannot execute it. */
export interface EffectiveShortcut {
  readonly id: ShortcutCommandId
  readonly binding: NormalizedBinding | null
  readonly modified: boolean
  readonly conflicts: readonly ShortcutCommandId[]
  readonly issue: BindingIssue | null
  /** View layer of a scoped command; absent for an application command. */
  readonly scope?: ShortcutScopeId
}
/** One revision-checked preference edit, limited to the current runtime and platform. */
export type ShortcutEdit = { type: 'set'; id: ShortcutCommandId; binding: ShortcutBinding | null }
  | { type: 'reset'; id: ShortcutCommandId } | { type: 'reset-all' }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const commandPattern = /^[a-z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/u
const bindingFields = new Set(['code', 'secondCode', 'thenCode', 'modifiers'])

/**
 * Whether an id is valid as a command or scope id: two or more dotted segments, such as `records.view`. Desktop
 * storage refuses a catalog that holds another id, so the registry refuses it at registration.
 * @param id - the command or scope id.
 * @returns true for a valid id.
 */
export function isShortcutId(id: string): boolean {
  return commandPattern.test(id)
}

/**
 * Validate JSON binding fields before normalization; unknown fields are rejected to prevent lossy rewrites.
 * @param value - file or IPC input.
 * @returns a binding with a supported physical code, or null for explicit removal.
 */
export function parseBinding(value: unknown): ShortcutBinding | null {
  if (value === null) return null
  if (!record(value) || Object.keys(value).some(key => !bindingFields.has(key))
    || typeof value.code !== 'string' || !Array.isArray(value.modifiers)
    || (Object.hasOwn(value, 'secondCode') && typeof value.secondCode !== 'string')
    || (Object.hasOwn(value, 'thenCode') && typeof value.thenCode !== 'string')
    || !value.modifiers.every((modifier: unknown): modifier is ShortcutModifier =>
      typeof modifier === 'string' && ['primary', 'control', 'alt', 'shift', 'meta'].includes(modifier))) {
    throw new Error('Invalid shortcut binding')
  }
  const binding: ShortcutBinding = {
    code: value.code, modifiers: value.modifiers,
    ...(typeof value.secondCode === 'string' ? { secondCode: value.secondCode } : {}),
    ...(typeof value.thenCode === 'string' ? { thenCode: value.thenCode } : {}),
  }
  normalizeBinding(binding, 'windows')
  return binding
}

/**
 * Decode the complete document while preserving dormant command overrides.
 * @param raw - stored JSON, or null for a missing document.
 * @returns the accepted document or a classified read failure.
 */
export function parseShortcutDocument(raw: string | null): ShortcutDocument | 'invalid' | 'future' {
  if (raw === null) return { schemaVersion: 1, profiles: {} }
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value)) return 'invalid'
    if (typeof value.schemaVersion === 'number' && value.schemaVersion > 3) return 'future'
    if ((value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3) || !record(value.profiles)
      || Object.keys(value).some(key => key !== 'schemaVersion' && key !== 'profiles')) return 'invalid'
    const profiles: Record<string, Record<string, ShortcutBinding | null>> = {}
    for (const [profile, overrides] of Object.entries(value.profiles)) {
      if (!/^(desktop|web):(macos|windows|linux)$/u.test(profile) || !record(overrides)) return 'invalid'
      const bindings: Record<string, ShortcutBinding | null> = {}
      for (const [id, binding] of Object.entries(overrides)) {
        if (!commandPattern.test(id)) return 'invalid'
        const parsed = parseBinding(binding)
        if (value.schemaVersion === 1 && parsed?.secondCode !== undefined) return 'invalid'
        if (value.schemaVersion !== 3 && parsed?.thenCode !== undefined) return 'invalid'
        bindings[id] = parsed
      }
      profiles[profile] = bindings
    }
    return { schemaVersion: value.schemaVersion, profiles }
  } catch (_error) {
    // Invalid JSON and invalid binding fields both preserve the original document.
    return 'invalid'
  }
}

/**
 * Check system, editor, and browser reservations using expanded physical modifiers.
 * @param binding - normalized candidate.
 * @param runtime - receiving application shell.
 * @param platform - receiving device.
 * @returns the rejection reason, or null when this combination is allowed.
 */
export function bindingIssue(binding: NormalizedBinding, runtime: ShortcutRuntime, platform: ShortcutPlatform): BindingIssue | null {
  const { code, modifiers } = binding
  if (binding.thenCode !== undefined) return 'unsupported-key'
  if (runtime === 'desktop' && (platform === 'windows' || platform === 'macos')) return null
  if (binding.secondCode !== undefined) return 'unsupported-key'
  if (modifiers.length === 0 || modifiers.every(modifier => modifier === 'shift')) return 'modifier-required'
  if ((platform === 'windows' || platform === 'macos') && modifiers.length >= 3) return null
  if (runtime === 'web' && (platform === 'windows' || platform === 'macos') && isWebBindingAllowed(binding, platform)) return null
  const primary = modifiers.includes(platform === 'macos' ? 'meta' : 'control')
  if (['Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)
    || (code === 'Enter' && !modifiers.includes('alt'))
    || (primary && ['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyQ', 'KeyH'].includes(code))
    || (primary && code === 'KeyA' && !modifiers.includes('shift'))
    || (platform !== 'macos' && (modifiers.includes('meta') || (modifiers.includes('alt') && ['F4', 'F2'].includes(code))))
    || (platform === 'macos' && modifiers.includes('control') && modifiers.includes('meta'))
    || (platform === 'macos' && modifiers.includes('alt') && !primary)) return 'reserved'
  if (runtime === 'web' && !isWebBindingAllowed(binding, platform)) return 'unsupported-browser'
  return null
}

/**
 * Check a view-layer binding: one key with no modifier or with Shift only, or a two-key sequence with no modifiers.
 * Escape, Tab, and Enter stay fixed. The rules are the same on every runtime and platform.
 * @param binding - normalized candidate.
 * @returns the rejection reason, or null when the layer accepts this binding.
 */
export function layerBindingIssue(binding: NormalizedBinding): BindingIssue | null {
  if (binding.secondCode !== undefined || binding.modifiers.some(modifier => modifier !== 'shift')) return 'unsupported-key'
  if ([binding.code, binding.thenCode].some(code => code === 'Escape' || code === 'Tab' || code === 'Enter')) return 'reserved'
  return null
}

/**
 * Select the command owner's explicit default for one device profile.
 * @param definition - command identity and per-profile defaults.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns the declared physical binding, or undefined for an unbound action.
 */
export function resolveShortcutDefault(definition: ShortcutDefinition, runtime: ShortcutRuntime,
  platform: ShortcutPlatform): ShortcutBinding | undefined {
  return definition.defaults[`${runtime}:${platform}`]
}

/**
 * Resolve application overrides and conflicts independently of registration order. Explicit overrides displace
 * defaults. Scoped definitions are ignored: {@link effectiveScopedShortcuts} resolves them.
 * @param definitions - active commands.
 * @param document - accepted preferences.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns every active application command, including unavailable conflicting bindings.
 */
export function effectiveShortcuts(definitions: readonly ShortcutDefinition[], document: ShortcutDocument,
  runtime: ShortcutRuntime, platform: ShortcutPlatform): readonly EffectiveShortcut[] {
  return resolveRows(definitions.filter(row => row.scope === undefined), document, runtime, platform,
    binding => bindingIssue(binding, runtime, platform), [])
}

/**
 * Resolve view-layer commands. A scoped row conflicts with the rows of its own scope, editable or fixed, and with
 * every enabled application binding, which keeps priority. Global fixed actions do not occupy layer keys.
 * @param definitions - active commands, application and scoped.
 * @param document - accepted preferences.
 * @param runtime - receiving shell.
 * @param platform - receiving device.
 * @returns the scoped editable commands, each with its scope.
 */
export function effectiveScopedShortcuts(definitions: readonly ShortcutDefinition[], document: ShortcutDocument,
  runtime: ShortcutRuntime, platform: ShortcutPlatform): readonly EffectiveShortcut[] {
  const global = effectiveShortcuts(definitions, document, runtime, platform).flatMap(row =>
    row.binding !== null && row.issue === null && row.conflicts.length === 0 ? [{ id: row.id, binding: row.binding }] : [])
  const scopes = new Set(definitions.flatMap(row => row.scope === undefined ? [] : [row.scope]))
  return [...scopes].flatMap(scope => resolveRows(definitions.filter(row => row.scope === scope), document, runtime,
    platform, layerBindingIssue, global).map(row => ({ ...row, scope })))
}

function resolveRows(definitions: readonly ShortcutDefinition[], document: ShortcutDocument, runtime: ShortcutRuntime,
  platform: ShortcutPlatform, issueOf: (binding: NormalizedBinding) => BindingIssue | null,
  occupied: readonly { readonly id: ShortcutCommandId; readonly binding: NormalizedBinding }[]): readonly EffectiveShortcut[] {
  const overrides = document.profiles[`${runtime}:${platform}`] ?? {}
  const fixed = [...occupied,
    ...definitions.flatMap(row => row.fixed?.map(binding => ({ id: row.id, binding: normalizeBinding(binding, platform) })) ?? [])]
  const rows = definitions.filter(row => row.fixed === undefined).map(({ id, defaults }) => {
    const modified = Object.hasOwn(overrides, id)
    const candidate = modified ? overrides[id] : resolveShortcutDefault({ id, defaults }, runtime, platform)
    const binding = candidate == null ? null : normalizeBinding(candidate, platform)
    return { id, binding, modified, issue: binding === null ? null : issueOf(binding) }
  })
  return rows.map((row) => {
    const binding = row.binding
    return { ...row, conflicts: binding === null ? [] : [...new Set([...rows.filter(other => other.id !== row.id
      && other.binding !== null && other.issue === null && overlappingBindings(other.binding, binding)
      && (!row.modified || other.modified)).map(other => other.id),
    ...fixed.filter(other => overlappingBindings(other.binding, binding)).map(other => other.id)])] }
  })
}

/**
 * Detect identical combinations, a single key contained in a two-key chord, or a single key that starts a sequence.
 * @param left - normalized candidate.
 * @param right - normalized occupied binding.
 * @returns whether both bindings require the same modifiers and overlap.
 */
export function overlappingBindings(left: NormalizedBinding, right: NormalizedBinding): boolean {
  if (left.modifiers.join('+') !== right.modifiers.join('+')) return false
  if (left.thenCode !== undefined || right.thenCode !== undefined) {
    const [sequence, other] = left.thenCode === undefined ? [right, left] : [left, right]
    return other.secondCode === undefined && other.code === sequence.code
      && (other.thenCode === undefined || other.thenCode === sequence.thenCode)
  }
  if (left.secondCode !== undefined && right.secondCode !== undefined) return bindingKey(left) === bindingKey(right)
  return [left.code, left.secondCode].some(code => code !== undefined && (code === right.code || code === right.secondCode))
}

/**
 * Apply an edit without modifying other profiles or dormant overrides. Versions only rise: Windows and macOS Desktop
 * write version 2, and a document that holds a sequence writes version 3.
 * @param document - accepted document.
 * @param edit - validated operation.
 * @param runtime - current shell.
 * @param platform - current device.
 * @returns the candidate document, pending conflict checks and durable storage.
 */
export function editShortcutDocument(document: ShortcutDocument, edit: ShortcutEdit,
  runtime: ShortcutRuntime, platform: ShortcutPlatform): ShortcutDocument {
  const profile = `${runtime}:${platform}` as const
  let overrides = { ...document.profiles[profile] }
  switch (edit.type) {
    case 'set': overrides[edit.id] = edit.binding; break
    case 'reset': {
      const { [edit.id]: _removed, ...remaining } = overrides
      overrides = remaining
      break
    }
    case 'reset-all': overrides = {}; break
    /* v8 ignore next -- parseShortcutEdit validates this closed union before persistence. */
    default: return assertNever(edit, 'shortcut edit')
  }
  const profiles = { ...document.profiles, [profile]: overrides }
  const sequence = Object.values(profiles).some(bindings => Object.values(bindings).some(binding => binding?.thenCode !== undefined))
  const desktop = runtime === 'desktop' && (platform === 'macos' || platform === 'windows')
  const schemaVersion = sequence || document.schemaVersion === 3 ? 3 : desktop ? 2 : document.schemaVersion
  return { schemaVersion, profiles }
}

/**
 * Validate a preference edit at the Desktop IPC boundary.
 * @param value - untrusted renderer request.
 * @returns the constrained operation; malformed requests throw.
 */
export function parseShortcutEdit(value: unknown): ShortcutEdit {
  if (!record(value)) throw new Error('Invalid shortcut edit')
  if (value.type === 'reset-all' && Object.keys(value).length === 1) return { type: value.type }
  if (typeof value.id !== 'string' || !commandPattern.test(value.id)) throw new Error('Invalid shortcut command')
  if (value.type === 'reset' && Object.keys(value).length === 2) return { type: 'reset', id: value.id as ShortcutCommandId }
  if (value.type === 'set' && Object.keys(value).length === 3) return { type: 'set', id: value.id as ShortcutCommandId, binding: parseBinding(value.binding) }
  throw new Error('Invalid shortcut edit')
}

/**
 * Validate the trusted product's serializable command catalog at IPC ingress.
 * @param value - renderer-supplied active command definitions.
 * @returns validated definitions; duplicate IDs, overlapping defaults within the application or one scope, and
 *   unsupported combinations throw.
 */
export function parseShortcutDefinitions(value: unknown): readonly ShortcutDefinition[] {
  if (!Array.isArray(value)) throw new Error('Invalid shortcut catalog')
  const ids = new Set<string>()
  for (const entry of value) {
    if (!record(entry) || typeof entry.id !== 'string' || !commandPattern.test(entry.id) || ids.has(entry.id)
      || !record(entry.defaults) || Object.keys(entry).some(key => key !== 'id' && key !== 'defaults' && key !== 'fixed' && key !== 'scope')
      || (Object.hasOwn(entry, 'scope') && (typeof entry.scope !== 'string' || !commandPattern.test(entry.scope)))) {
      throw new Error('Invalid shortcut definition')
    }
    ids.add(entry.id)
    if (Object.hasOwn(entry, 'fixed')) {
      if (!Array.isArray(entry.fixed) || entry.fixed.length === 0 || Object.keys(entry.defaults).length > 0) throw new Error('Invalid fixed shortcut definition')
      for (const binding of entry.fixed) if (parseBinding(binding) === null) throw new Error('Invalid fixed shortcut binding')
    }
    for (const [profile, candidate] of Object.entries(entry.defaults)) {
      if (!/^(desktop|web):(macos|windows|linux)$/u.test(profile)) throw new Error('Invalid shortcut profile')
      const binding = parseBinding(candidate)
      if (binding === null) throw new Error('Invalid shortcut default')
    }
  }
  const definitions = value as ShortcutDefinition[]
  for (const runtime of ['desktop', 'web'] as const) {
    for (const platform of ['macos', 'windows', 'linux'] as const) {
      const bindings = new Map<ShortcutScopeId | undefined, NormalizedBinding[]>()
      for (const entry of definitions) {
        const binding = resolveShortcutDefault(entry, runtime, platform)
        if (binding === undefined) continue
        const normalized = normalizeBinding(binding, platform)
        const occupied = bindings.get(entry.scope) ?? []
        const issue = entry.scope === undefined ? bindingIssue(normalized, runtime, platform) : layerBindingIssue(normalized)
        if (occupied.some(other => overlappingBindings(other, normalized)) || issue !== null) {
          throw new Error('Conflicting or reserved shortcut default')
        }
        bindings.set(entry.scope, [...occupied, normalized])
      }
    }
  }
  return definitions
}
