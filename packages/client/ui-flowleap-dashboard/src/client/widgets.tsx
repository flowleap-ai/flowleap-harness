/**
 * The dashboard's own occupants of `dashboard.metric` and `dashboard.widget`: Agent activity over the Session list
 * (real data), and Coming up, Budget this month, and two metric cards over sample data with the "Sample data" tag.
 */

import { useMemo } from 'react'
import { Button, IconAlarmClockOutlineRegular, IconChecklistOutlineRegular, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from './contract.ts'
import type { NS } from './locales.ts'
import { SAMPLE_BUDGET, SAMPLE_CASES_WATCHED, SAMPLE_COMING_UP } from './sample-data.ts'
import css from './Dashboard.module.css'

type Copy = PropsLocale<typeof NS>

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

/** The "Sample data" tag; every surface that shows a value from `sample-data.ts` shows it. */
export function SampleTag({ t }: Copy) {
  return (
    <span className={css.sample} title={t('sample.description')} data-sample-data="">
      <Tag tone="warning">{t('sample.label')}</Tag>
    </span>
  )
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

/** Props of a sample occupant. */
export type SampleProps = PropsRuntime<'dashboard.widget'> & Copy

/**
 * Render the register events of the watched cases, nearest first.
 * @param props - copy.
 * @returns the panel body with the sample tag.
 */
export function ComingUp({ t }: SampleProps) {
  const format = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium' })
  return (
    <>
      <SampleTag t={t} />
      <ul className={css.rows}>
        {SAMPLE_COMING_UP.map(event => (
          <li key={event.caseRef} className={css.staticRow}>
            <IconAlarmClockOutlineRegular size={16} className={css.rowGlyph} aria-hidden="true" />
            <span className={css.rowText}>
              <span className={css.rowTitle}>{event.caseRef} · {event.title}</span>
              <span className={css.rowMeta}>{event.event}</span>
            </span>
            <time className={css.due} dateTime={event.due}>{format.format(Date.parse(event.due))}</time>
          </li>
        ))}
      </ul>
    </>
  )
}

function money(t: Copy['t'], cents: number): string {
  return new Intl.NumberFormat(t('time.locale'), { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/**
 * Render the month's spend against the limit, and the spend of each agent.
 * @param props - copy.
 * @returns the panel body with the sample tag.
 */
export function BudgetThisMonth({ t }: SampleProps) {
  const { usedCents, limitCents, byAgent } = SAMPLE_BUDGET
  const share = Math.min(1, usedCents / limitCents)
  return (
    <>
      <SampleTag t={t} />
      <div className={css.budgetLine}>
        <span className={css.budgetUsed}>{t('budget.used', { used: money(t, usedCents) })}</span>
        <span className={css.rowMeta}>{t('budget.limit', { limit: money(t, limitCents) })}</span>
      </div>
      <div className={css.meter} role="meter" aria-valuemin={0} aria-valuemax={limitCents} aria-valuenow={usedCents}
        aria-label={t('widget.budget')}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <h3 className={css.subheading}>{t('budget.byAgent')}</h3>
      <ul className={css.rows}>
        {byAgent.map(agent => (
          <li key={agent.name} className={css.staticRow}>
            <IconChecklistOutlineRegular size={16} className={css.rowGlyph} aria-hidden="true" />
            <span className={css.rowText}><span className={css.rowTitle}>{agent.name}</span></span>
            <span className={css.rowMeta}>{money(t, agent.usedCents)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Props of a sample metric card. */
export type SampleMetricProps = PropsRuntime<'dashboard.metric'> & Copy

/**
 * Render the number of watched cases.
 * @param props - copy.
 * @returns the card body with the sample tag.
 */
export function CasesWatchedMetric({ t }: SampleMetricProps) {
  return (
    <>
      <span className={css.metricValue}>{SAMPLE_CASES_WATCHED}</span>
      <span className={css.metricCaption}>{t('metric.casesWatched.caption')}</span>
      <SampleTag t={t} />
    </>
  )
}

/**
 * Render the share of the month's budget used.
 * @param props - copy.
 * @returns the card body with the sample tag.
 */
export function BudgetUsedMetric({ t }: SampleMetricProps) {
  const { usedCents, limitCents } = SAMPLE_BUDGET
  return (
    <>
      <span className={css.metricValue}>{Math.round((usedCents / limitCents) * 100)} %</span>
      <span className={css.metricCaption}>{t('metric.budgetUsed.caption', { used: money(t, usedCents), limit: money(t, limitCents) })}</span>
      <SampleTag t={t} />
    </>
  )
}
