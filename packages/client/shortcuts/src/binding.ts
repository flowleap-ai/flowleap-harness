/** Physical-key protocol shared by browser commands and desktop adapters; no DOM or runtime state. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable command identity owned by the registering feature. */
export type ShortcutCommandId = Branded<'ShortcutCommandId'>
/** Stable identity of one view-scoped key layer; also the value of the `data-shortcut-scope` attribute. */
export type ShortcutScopeId = Branded<'ShortcutScopeId'>
/** Operating system of the device receiving input. */
export type ShortcutPlatform = 'macos' | 'windows' | 'linux'
/** Application shell selecting the default bindings. */
export type ShortcutRuntime = 'desktop' | 'web'
/** Runtime and operating system selecting one explicit default and preference profile. */
export type ShortcutProfile = `${ShortcutRuntime}:${ShortcutPlatform}`
/** Logical primary expands to Meta on macOS and Control elsewhere. */
export type ShortcutModifier = 'primary' | 'control' | 'alt' | 'shift' | 'meta'
/** One or two distinct physical keys held together, plus an exact set of modifiers. */
export interface ShortcutBinding {
  readonly code: string
  readonly secondCode?: string
  /** View layers only: the key pressed after `code` is released, which makes a sequence. */
  readonly thenCode?: string
  readonly modifiers: readonly ShortcutModifier[]
}
/** Normalized modifier order is also the keycap order. */
export interface NormalizedBinding {
  readonly code: string
  readonly secondCode?: string
  readonly thenCode?: string
  readonly modifiers: readonly ('control' | 'alt' | 'shift' | 'meta')[]
}
/** The text of one keycap box, such as `['⇧', '⌘', 'Enter']` or `['G']`. */
export type ShortcutKeycap = readonly string[]

const keyNames: Readonly<Record<string, string>> = {
  Slash: '/', Comma: ',', Period: '.', Backslash: '\\', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Enter: 'Enter',
  Escape: 'Esc', Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
}
const modifierOrder = ['control', 'alt', 'shift', 'meta'] as const

/**
 * Expand logical modifiers, deduplicate, and validate the physical code.
 * @param binding - declared binding.
 * @param platform - receiving device platform.
 * @returns canonical binding; unsupported codes throw during registration.
 */
export function normalizeBinding(binding: ShortcutBinding, platform: ShortcutPlatform): NormalizedBinding {
  const codes: [string, ...string[]] = [binding.code, ...binding.secondCode === undefined ? [] : [binding.secondCode]]
  codes.sort()
  for (const code of binding.thenCode === undefined ? codes : [...codes, binding.thenCode]) {
    if (!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/u.test(code)
      && !Object.hasOwn(keyNames, code)) throw new Error(`Unsupported shortcut code: ${code}`)
  }
  if (codes.length === 2 && codes[0] === codes[1]) throw new Error('Shortcut keys must be distinct')
  if (binding.thenCode !== undefined && (codes.length === 2 || binding.modifiers.length > 0)) {
    throw new Error('Shortcut sequences have two single keys and no modifiers')
  }
  const modifiers = new Set(binding.modifiers.map(value => value === 'primary'
    ? platform === 'macos' ? 'meta' : 'control' : value))
  return { code: codes[0], ...(codes[1] === undefined ? {} : { secondCode: codes[1] }),
    ...(binding.thenCode === undefined ? {} : { thenCode: binding.thenCode }),
    modifiers: modifierOrder.filter(value => modifiers.has(value)) }
}

/**
 * Produce an exact-match index from a normalized binding.
 * @param binding - normalized physical key and modifiers.
 * @returns stable index used for both matching and conflict checks.
 */
export function bindingKey(binding: NormalizedBinding): string {
  const codes = binding.secondCode === undefined ? [binding.code] : [binding.code, binding.secondCode].sort()
  const key = [...binding.modifiers, ...codes].join('+')
  return binding.thenCode === undefined ? key : `${key}>${binding.thenCode}`
}

const keyName = (code: string): string => keyNames[code] ?? code.replace(/^(Key|Digit)/u, '')

/**
 * Format keycaps and ARIA; Windows separates modifiers with plus signs, while chord keys remain adjacent.
 * @param binding - normalized binding, or null for an unbound command.
 * @param platform - receiving device platform.
 * @returns flat visible keys, keycap boxes (one for a key or a combination, one for each step of a sequence), and ARIA;
 *   two-key chords and sequences omit ARIA shortcuts, which only support one non-modifier key.
 */
export function presentBinding(binding: NormalizedBinding | null, platform: ShortcutPlatform): {
  keys: readonly string[]
  keycaps: readonly ShortcutKeycap[]
  aria: string | undefined
} {
  if (binding === null) return { keys: [], keycaps: [], aria: undefined }
  if (binding.thenCode !== undefined) {
    const steps = [keyName(binding.code), keyName(binding.thenCode)]
    return { keys: steps, keycaps: steps.map(step => [step]), aria: undefined }
  }
  const key = keyName(binding.code)
  const symbols = platform === 'macos'
    ? { control: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { control: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
  const ariaNames = { control: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
  const ariaKey = binding.code === 'Space' ? 'Space' : binding.code === 'Escape' ? 'Escape'
    : binding.code.startsWith('Arrow') ? binding.code : key
  const second = binding.secondCode === undefined ? [] : [keyName(binding.secondCode)]
  const keys = [...binding.modifiers.map(value => symbols[value]), key]
  const visible = [...platform === 'windows' ? keys.flatMap((label, index) => index === 0 ? [label] : ['+', label]) : keys, ...second]
  return { keys: visible, keycaps: [visible],
    aria: binding.secondCode === undefined ? [...binding.modifiers.map(value => ariaNames[value]), ariaKey].join('+') : undefined }
}

/**
 * Check Web combinations: Windows and macOS also admit any three or four modifiers; Linux retains the limited set.
 * @param binding - normalized candidate.
 * @param platform - receiving device platform.
 * @returns whether this combination is admitted; admission does not guarantee browser or system delivery.
 */
export function isWebBindingAllowed(binding: NormalizedBinding, platform: ShortcutPlatform): boolean {
  if (binding.secondCode !== undefined || binding.thenCode !== undefined) return false
  if (platform === 'windows' || platform === 'macos') {
    if (binding.modifiers.length >= 3) return true
    const primary = platform === 'macos' ? 'meta' : 'control'
    if (binding.modifiers.length === 1
      && ((['Comma', 'Backslash'].includes(binding.code) && binding.modifiers[0] === primary)
        || (binding.code === 'Backquote' && binding.modifiers[0] === 'control'))) return true
    if (binding.modifiers.length === 2 && binding.modifiers.includes(primary)
      && (binding.modifiers.includes('alt') || binding.modifiers.includes('shift'))) return true
  }
  return [
    { code: 'Slash', modifiers: ['primary'] as const },
    { code: 'Comma', modifiers: ['primary', 'shift'] as const },
    { code: 'Period', modifiers: ['primary', 'shift'] as const },
  ].some(candidate => bindingKey(binding) === bindingKey(normalizeBinding(candidate, platform)))
}
