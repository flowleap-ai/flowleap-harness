/**
 * The conversation of a work item's run Session in the agent panel: the shared Conversation content in its embedded
 * variant, with the chat view and the composer, inside the Session binding that the panel provides.
 */

import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The run Session's conversation in the agent panel of the work page of the Matters panel. */
    'records.agent.conversation': { kind: 'single'; scope: 'session' }
    /** The same conversation on the work page of My work: a slot is declared by one panel entry. */
    'records.mywork.agent.conversation': { kind: 'single'; scope: 'session' }
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

/** The conversation slot of each panel. */
export type ConversationSlot = 'records.agent.conversation' | 'records.mywork.agent.conversation'

/** Props of the run conversation. */
export type RunConversationProps = PropsRuntime<ConversationSlot> & PropsRenderFactories

/**
 * Render the run Session's conversation in its embedded variant. A run Session holds the agent's task, so it is never
 * a new conversation: it settles while its history opens with nothing shown yet, and is active after that.
 * @param props - the Session share and the factory renderer.
 * @returns the conversation.
 */
export function RunConversation({ useSession, renderFactorySlot }: RunConversationProps) {
  const settling = useSession(session => session.openState === 'loading' && session.blank)
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: settling ? 'settling' : 'active', hero: false }, {
    slots: { views: RunChatView },
  })
}
