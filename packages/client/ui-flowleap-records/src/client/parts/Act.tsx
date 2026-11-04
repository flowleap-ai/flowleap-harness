/**
 * A control of one act: the client `Button` with the act's label and its current keycap. A view has at most one
 * enabled primary act (R12); a negative act is tertiary and opens its reason step (R12, R16). The overflow menu (⋯)
 * holds the acts that a narrow bar has no room for, so every act stays reachable.
 */

import { useState, type ReactNode } from 'react'
import { Button, IconEllipsisOutlineRegular, Keycap, Menu, StateDot, type KeycapBox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'

/** One act of a person, with the command whose key runs it. */
export interface ActSpec {
  /** Unique among the acts of one view. */
  readonly id: string
  /** The localized label, named by the outcome ("Accept and file"); never a typed key. */
  readonly label: string
  /** The registry command of the act; the key layer runs it, and the control shows its keycap. */
  readonly command?: ShortcutCommandId | undefined
  /** The command's current keycaps from the shortcut catalog; none for an act without a key. */
  readonly keycaps: readonly KeycapBox[]
  /** A 16px UI icon before the label. */
  readonly icon?: ReactNode
  readonly disabled?: boolean | undefined
  /**
   * The act runs now: the control shows a spinner and is `aria-disabled`, and stays focusable, so the keys of the
   * view still reach it. The act's runner ignores a second run.
   */
  readonly busy?: boolean | undefined
  /** Run the act. */
  readonly run: () => void
}

/** The hierarchy of an act: the one primary act, a secondary (raised) act, or a tertiary (text) act. */
export type ActRank = 'primary' | 'secondary' | 'tertiary'

const VARIANT = { primary: 'primary', secondary: 'outline', tertiary: 'ghost' } as const

/**
 * Render the control of one act.
 * @param props.act - the act.
 * @param props.rank - primary, secondary or tertiary.
 * @param props.size - `md` 36px (the decision's primary) or `sm` 28px (default).
 * @param props.className - extra class for layout placement.
 * @returns the button with its keycap.
 */
export function ActButton({ act, rank, size = 'sm', className }: {
  act: ActSpec
  rank: ActRank
  size?: 'sm' | 'md'
  className?: string | undefined
}) {
  const busy = act.busy === true
  return (
    <Button
      variant={VARIANT[rank]}
      size={size}
      icon={busy ? <StateDot state="ongoing" size={16} /> : act.icon}
      className={className}
      disabled={act.disabled === true}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      data-act={act.id}
      data-command={act.command}
      onClick={act.run}
    >
      {act.label}
      <Keycap keycaps={act.keycaps} tone={rank === 'primary' ? 'primary' : 'default'} />
    </Button>
  )
}

/**
 * Render the overflow menu (⋯) of a bar: a ghost icon button that opens a `Menu` of acts above it.
 * @param props.label - the button's accessible name, "More acts".
 * @param props.acts - the acts of the menu.
 * @param props.className - extra class, such as one that shows the menu only at 390px.
 * @returns the menu and its button.
 */
export function OverflowActs({ label, acts, className }: { label: string; acts: readonly ActSpec[]; className?: string | undefined }) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      className={className}
      open={open}
      side="top"
      align="end"
      items={acts.map(act => ({ id: act.id, label: act.label, disabled: act.disabled === true }))}
      onSelect={(id) => {
        setOpen(false)
        acts.find(act => act.id === id)?.run()
      }}
      onClose={() => { setOpen(false) }}
      anchor={(
        <Button variant="ghost" size="sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(current => !current) }}>
          <IconEllipsisOutlineRegular size={16} />
        </Button>
      )}
    />
  )
}
