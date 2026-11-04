/**
 * Boxed keycaps for the key of an act, as the IPMS design language draws them beside a button, a menu item or a
 * command menu item. The caller passes the current binding as the shortcut catalog publishes it (`entry.keycaps`):
 * one box for a key or a combination, two boxes for a sequence such as `G` then `M`. A rebound key shows its new
 * keycap. Keycaps hide on a coarse pointer.
 */

import clsx from 'clsx'
import css from './Keycap.module.css'

/**
 * Where the keycap sits: `default` in a secondary or tertiary control, `primary` inside the primary button (the
 * button's foreground, no box line), `selected` in a selected menu item (the primary label colour).
 */
export type KeycapTone = 'default' | 'primary' | 'selected'

/** The key labels of one box, such as `['⇧', '⌘', 'Enter']`, `['Ctrl', 'Shift', 'K']` or `['G']`. */
export type KeycapBox = readonly string[]

/** Key words that a keycap draws as their symbol on every platform. */
const SYMBOLS: Readonly<Record<string, string>> = { Enter: '↵', Return: '↵', Command: '⌘', Cmd: '⌘' }

/** Labels that mark a macOS combination, where Shift also draws as its symbol. */
const MAC_MODIFIERS = new Set(['⌘', '⌥', '⌃', 'Command', 'Cmd', 'Option'])

/**
 * The text of one box, as the IPMS mockups draw keys: Enter draws as `↵` and Command as `⌘`; in a macOS combination
 * Shift draws as `⇧`. A one-character label joins the next label directly (`⇧⌘↵`), and a word joins it with a plus
 * sign (`Ctrl+Shift+↵`). The shortcut catalog's own text stays as it is.
 * @param box - the key labels of the box.
 * @returns the box text.
 */
export function keycapText(box: KeycapBox): string {
  const mac = box.some(label => MAC_MODIFIERS.has(label))
  const labels = box.map(label => (label === 'Shift' && mac ? '⇧' : SYMBOLS[label] ?? label))
  return labels.map((label, index) => index < labels.length - 1 && Array.from(label).length > 1 ? `${label}+` : label).join('')
}

/**
 * Render the keycaps of one key, combination or sequence.
 * @param props.keycaps - the boxes of the current binding; none renders nothing (an unbound command).
 * @param props.tone - where the keycap sits (default `default`).
 * @param props.className - extra class for layout placement.
 * @returns the keycap group, hidden from assistive technology because the control names its act; null for no box.
 */
export function Keycap({ keycaps, tone = 'default', className }: {
  keycaps: readonly KeycapBox[]
  tone?: KeycapTone
  className?: string | undefined
}) {
  if (keycaps.length === 0) return null
  return (
    <span className={clsx(css.keys, className)} data-tone={tone} aria-hidden="true">
      {keycaps.map((box, index) => <kbd key={index} className={css.keycap}>{keycapText(box)}</kbd>)}
    </span>
  )
}
