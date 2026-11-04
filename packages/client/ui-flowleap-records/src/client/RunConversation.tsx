/**
 * The conversation of a work item's run Session in the agent panel: the shared Conversation content in its embedded
 * variant, with the chat view and the composer, inside the Session binding that the panel provides.
 */

import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The run Session's conversation in the agent panel of the work page. */
    'records.agent.conversation': { kind: 'single'; scope: 'session' }
  }
}

/**
 * Render the chat view of the conversation, with no view switch.
 * @param props - the views share of the Conversation content.
 * @returns the chat view.
 */
export function RunChatView(props: ConversationViewsProps) {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

/** Props of the run conversation. */
export type RunConversationProps = PropsRuntime<'records.agent.conversation'> & PropsRenderFactories

/**
 * Render the run Session's conversation in its embedded variant.
 * @param props - the Session share and the factory renderer.
 * @returns the conversation.
 */
export function RunConversation({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }: RunConversationProps) {
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const active = conversation.activeTargets.size > 0 || (!session.blank && !session.awaitingFirstTurn) || session.running
  const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank)
  const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
  const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: { views: RunChatView } })
}
