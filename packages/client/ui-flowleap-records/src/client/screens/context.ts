/**
 * What each screen of the Matters panel receives: its screen (the route with its loads) and the screen context, the
 * copy, the time, the signed-in person, the keycaps of the acts, navigation, the acts and the row context menu.
 */

import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { Act, DocumentId, Me } from '../api.ts'
import { commandId, type CommandName, type KeycapsOf } from '../keys.ts'
import type { ActsResult, Route, ScreenOf, View } from '../model.ts'
import type { ActSpec } from '../parts/Act.tsx'
import type { WordContext } from '../words.ts'
import type { IntakeRowTarget } from '../row-menu.ts'

/** The shared context of every screen. */
export interface ScreenContext extends WordContext {
  /** The signed-in person; null until the first answer. */
  readonly me: Me | null
  readonly keycaps: KeycapsOf
  readonly navigate: (route: Route) => void
  readonly retry: () => void
  readonly refresh: () => void
  readonly perform: (acts: readonly Act[]) => Promise<ActsResult>
  /** The same-origin address of a document's bytes. */
  readonly contentHref: (document: DocumentId) => string
  /** The context menu trigger props of an intake row. */
  readonly rowMenu: (target: IntakeRowTarget) => ContextMenuTriggerProps
}

/** The props of the screen of one view. */
export interface ScreenProps<V extends View> {
  readonly screen: ScreenOf<V>
  readonly ctx: ScreenContext
}

/**
 * The id, the command and the current keycaps of an act.
 * @param ctx - the screen context.
 * @param name - the act's command.
 * @returns the keyed part of an act.
 */
export function keyedOf(ctx: ScreenContext, name: CommandName): Pick<ActSpec, 'id' | 'command' | 'keycaps'> {
  const command = commandId(name)
  return { id: name, command, keycaps: ctx.keycaps(command) }
}

/**
 * An act with its command's current keycaps.
 * @param ctx - the screen context.
 * @param name - the act's command.
 * @param label - the act's label.
 * @param run - runs the act.
 * @param extra - the icon or the disabled state.
 * @returns the act.
 */
export function actOf(ctx: ScreenContext, name: CommandName, label: string, run: () => void, extra: Pick<ActSpec, 'icon' | 'disabled'> = {}): ActSpec {
  return { ...keyedOf(ctx, name), label, run, ...extra }
}
