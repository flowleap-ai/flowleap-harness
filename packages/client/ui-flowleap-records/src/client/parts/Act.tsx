/**
 * A control of one act: the client `Button` with the act's label and its current keycap. A view has at most one
 * enabled primary act (R12); a negative act is tertiary and opens its reason step (R12, R16).
 */

import type { ReactNode } from 'react'
import { Button, Keycap, type KeycapBox } from '@deepseek-ai/dsh-client-ui-primitives'
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
  return (
    <Button
      variant={VARIANT[rank]}
      size={size}
      icon={act.icon}
      className={className}
      disabled={act.disabled === true}
      data-act={act.id}
      data-command={act.command}
      onClick={act.run}
    >
      {act.label}
      <Keycap keycaps={act.keycaps} tone={rank === 'primary' ? 'primary' : 'default'} />
    </Button>
  )
}
