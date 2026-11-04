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

/**
 * The text of one box: a one-character modifier symbol joins the next label directly (`⇧⌘Enter`), and a word joins
 * the next label with a plus sign (`Ctrl+Shift+K`).
 * @param box - the key labels of the box.
 * @returns the box text.
 */
export function keycapText(box: KeycapBox): string {
  return box.map((label, index) => index < box.length - 1 && Array.from(label).length > 1 ? `${label}+` : label).join('')
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
