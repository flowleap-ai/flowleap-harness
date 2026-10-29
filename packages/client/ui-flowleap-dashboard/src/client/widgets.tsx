/**
 * The dashboard's own occupants: the Agent activity panel over the Session list, and the Chats group of the search
 * results. A running chat keeps running while the dashboard shows and is listed as running.
 */

import { useMemo } from 'react'
import { Button, IconFlatListOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from './contract.ts'
import type { NS } from './locales.ts'
import css from './Dashboard.module.css'

type Copy = PropsLocale<typeof NS>

/** Most chats one search group lists. */
const SEARCH_ROWS = 5

/** Injected share of a surface that opens a chat. */
export interface OpenSessionInjected {
  /**
   * Open one chat in the conversation column.
   * @param sessionId - the chat.
   */
  readonly onOpenSession: (sessionId: SessionId) => void
}

/** One chat row of a chat list. */
export interface ChatRow {
  readonly id: SessionId
  readonly title: string
  readonly running: boolean
  readonly updatedAt: number
}

/**
 * Select the user's chats: no blank chat and no subagent chat, running chats first, then the most recent.
 * @param list - the Session list.
 * @returns the rows in display order.
 */
export function chatRows(list: SessionListState): readonly ChatRow[] {
  return list.ids.flatMap((id) => {
    const summary = list.byId[id]
    if (summary === undefined || summary.blank || summary.origin === 'subagent') return []
    return [{ id, title: summary.displayTitle, running: summary.running, updatedAt: summary.updatedAt }]
  }).toSorted((left, right) => Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt)
}

/** Props of a chat list. */
export type ChatListProps = Pick<PropsRuntime<'dashboard.widget'>, 'useSessions'> & Copy & OpenSessionInjected & {
  /** Most rows to show; all rows when absent. */
  readonly limit?: number
}

/**
 * Render chats with their running state; each row opens its chat.
 * @param props - the Session list, the row limit, the open action, and copy.
 * @returns the list, a loading state, or the empty state.
 */
export function ChatList({ useSessions, onOpenSession, limit, t }: ChatListProps) {
  const list = useSessions(snapshot => snapshot)
  const rows = useMemo(() => chatRows(list), [list])
  const phase = list.phase
  const format = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeStyle: 'short' })
  if (phase !== 'ready' && rows.length === 0) return <p className={css.panelEmpty} role="status">{t('activity.loading')}</p>
  if (rows.length === 0) return <p className={css.panelEmpty}>{t('activity.empty')}</p>
  return (
    <ul className={css.rows}>
      {rows.slice(0, limit).map(row => (
        <li key={row.id}>
          <Button className={css.row} aria-label={t('activity.open', { title: row.title })} onClick={() => { onOpenSession(row.id) }}>
            <StateDot state={row.running ? 'ongoing' : 'idle'} />
            <span className={css.rowText}>
              <span className={css.rowTitle}>{row.title}</span>
              <span className={css.rowMeta}>
                {t(row.running ? 'activity.running' : 'activity.idle')}
                {' · '}
                <time dateTime={new Date(row.updatedAt).toISOString()}>{format.format(row.updatedAt)}</time>
              </span>
            </span>
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Props of the Agent activity panel. */
export type AgentActivityProps = PropsRuntime<'dashboard.widget'> & Copy & InjectFace<OpenSessionInjected>

/**
 * Render the five most relevant chats; a running chat keeps running while the user is on the dashboard.
 * @param props - the Session list, the open action, and copy.
 * @returns the panel body.
 */
export function AgentActivity(props: AgentActivityProps) {
  return <ChatList {...props} limit={5} />
}

/** Props of the Chats search group. */
export type ChatSearchProps = PropsRuntime<'dashboard.search'> & Copy & InjectFace<OpenSessionInjected>

/**
 * Render the chats whose title matches the query, running chats first; each row opens its chat.
 * @param props - the match rule for the query, the pick report, the Session list, the open action, and copy.
 * @returns the group, or nothing when no chat matches.
 */
export function ChatSearch({ matches, onPicked, useSessions, onOpenSession, t }: ChatSearchProps) {
  const list = useSessions(snapshot => snapshot)
  const rows = useMemo(() => chatRows(list).filter(row => matches(row.title)), [list, matches])
  if (rows.length === 0) return null
  return (
    <section className={css.searchGroup} aria-label={t('search.chats')}>
      <h3 className={css.subheading}>{t('search.chats')}</h3>
      <ul className={css.rows}>
        {rows.slice(0, SEARCH_ROWS).map(row => (
          <li key={row.id}>
            <Button className={css.row} aria-label={t('activity.open', { title: row.title })} onClick={() => {
              onPicked()
              onOpenSession(row.id)
            }}>
              {row.running ? <StateDot state="ongoing" /> : <IconFlatListOutlineRegular size={16} className={css.rowGlyph} aria-hidden="true" />}
              <span className={css.rowText}>
                <span className={css.rowTitle}>{row.title}</span>
                {row.running && <span className={css.rowMeta}>{t('activity.running')}</span>}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
