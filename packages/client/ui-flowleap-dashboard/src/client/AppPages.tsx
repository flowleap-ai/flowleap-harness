/**
 * The Chats and Agents app pages of the OS sidebar. Chats lists every chat over the Session list; Agents is a
 * placeholder until the Agents page of flowleap-harness#59.
 */

import { Button, IconAgentPresetOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { ChatList, type OpenSessionInjected } from './widgets.tsx'
import css from './Dashboard.module.css'

/** Props of the Chats page. */
export type ChatsPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<OpenSessionInjected>

/**
 * Render every chat, running chats first.
 * @param props - the Session list, the open action, and copy.
 * @returns the page.
 */
export function ChatsPage({ useSessions, onOpenSession, t }: ChatsPageProps) {
  return (
    <section className={css.page} aria-label={t('chats.title')} data-testid="flowleap-chats">
      <div className={css.content}>
        <header className={css.heading}>
          <h1>{t('chats.title')}</h1>
          <p>{t('chats.summary')}</p>
        </header>
        <ChatList useSessions={useSessions} onOpenSession={onOpenSession} t={t} />
      </div>
    </section>
  )
}

/** Injected share of the Agents page. */
export interface AgentsPageInjected {
  /** Open a new chat, where the agent picker offers New agent. */
  readonly onNewChat: () => void
}

/** Props of the Agents page. */
export type AgentsPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<AgentsPageInjected>

/**
 * Render the Agents placeholder.
 * @param props - the new chat action and copy.
 * @returns the page.
 */
export function AgentsPage({ onNewChat, t }: AgentsPageProps) {
  return (
    <section className={css.page} aria-label={t('agents.title')} data-testid="flowleap-agents">
      <div className={css.content}>
        <header className={css.heading}>
          <h1>{t('agents.title')}</h1>
          <p>{t('agents.summary')}</p>
        </header>
        <div className={css.placeholder}>
          <IconAgentPresetOutlineRegular size={24} aria-hidden="true" />
          <p>{t('placeholder.later')}</p>
          <Button variant="outline" size="sm" onClick={onNewChat}>{t('placeholder.newAgent')}</Button>
        </div>
      </div>
    </section>
  )
}
