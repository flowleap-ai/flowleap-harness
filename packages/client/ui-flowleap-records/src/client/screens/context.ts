/**
 * What each screen of the Matters panel receives: its screen (the route with its loads) and the screen context, the
 * copy, the time, the signed-in person, the keycaps of the acts, navigation, the acts, the row context menu and the
 * agent panel of the work page with its new chat.
 */

import type { ReactNode } from 'react'
import type { UseResource } from '@deepseek-ai/dsh-client-resources/client'
import type { ContextMenuTriggerProps } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots'
import type { Act, DocumentId, Me } from '../api.ts'
import { commandId, type CommandName, type KeycapsOf } from '../keys.ts'
import type { KeyLayerContext } from '../key-layer.ts'
import type { ActsResult, Route, ScreenOf, View } from '../model.ts'
import type { ActSpec } from '../parts/Act.tsx'
import type { DockView } from '../parts/AgentDock.tsx'
import type { WordContext } from '../words.ts'
import type { IntakeRowTarget } from '../row-menu.ts'

/** The shared context of every screen. */
export interface ScreenContext extends WordContext, KeyLayerContext {
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
  /** The address of a route, for Copy link. */
  readonly linkOf: (route: Route) => string
  /** The agent panel of the work page. */
  readonly agent: AgentSeat
}

/** The agent panel of the work page: where it is, and the panel's framework parts that show a run Session. */
export interface AgentSeat {
  readonly view: DockView
  /** Move the panel. */
  readonly show: (view: DockView) => void
  /** The panel's `useResource` hook, which reads the run Session resource. */
  readonly useResource: UseResource
  /** Binds a retained Session around the conversation. */
  readonly SessionProvider: SessionProviderComponent
  /** Render the conversation slot inside the Session binding. */
  readonly renderConversation: () => ReactNode
  /** Starts a new chat with a drafted prompt; null where the runtime has no Session navigation. */
  readonly ask: NewChat | null
}

/** Starts a new chat; an object, because a snapshot store takes a function value as an updater. */
export interface NewChat {
  /**
   * Open a new chat with a prompt drafted for the person to send.
   * @param prompt - the drafted prompt.
   */
  readonly start: (prompt: string) => void
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
