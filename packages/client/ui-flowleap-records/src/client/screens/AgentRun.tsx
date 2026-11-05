/**
 * The agent panel of the work page: the patent agent's run on the letter. With a run Session that this runtime has,
 * the panel shows its conversation and composer. Otherwise it shows an empty state (R18): the run's state as the
 * heading, one sentence on where its conversation is, the run summary from the Firm Record (when it finished, its
 * steps, and each proposal of the work with its status), and a composer that starts a new chat about this letter. A
 * conversation that fails to load is a notice with Try again above the same summary. Only a failed run shows the
 * refused shape.
 */

import { useState, type ReactNode } from 'react'
import { IconAgentPresetOutlineRegular, IconDeliverDocRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RunSessionId, TicketDetail } from '../api.ts'
import { runSessionAddress } from '../agent-run.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { AgentDock, AgentEmpty, AgentResult, AskComposer } from '../parts/AgentDock.tsx'
import { Notice, PageSpinner } from '../parts/States.tsx'
import { AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { listTimeText, personInText } from '../words.ts'
import type { ScreenContext } from './context.ts'

/** The words of the cloud model providers that the Records service names. */
const PROVIDERS: ReadonlyMap<string, FlowleapRecordsKey> = new Map([
  ['anthropic', 'agent.model.anthropic'],
  ['openrouter', 'agent.model.openrouter'],
])

/**
 * The model of a run in words: the local model, the provider of a cloud model, or none.
 * @param ctx - the screen context.
 * @param model - `local`, a provider name, or null.
 * @returns the words, or null when the record names no model.
 */
function modelText(ctx: ScreenContext, model: string | null): string | null {
  if (model === null) return null
  return ctx.t(model === 'local' ? 'agent.model.local' : PROVIDERS.get(model) ?? 'agent.model.cloud')
}

/** Why the panel shows no conversation: no run yet, no recorded Session, or a Session that is not in this person's chats. */
type NoConversation = 'not-started' | 'no-record' | 'elsewhere' | 'not-here'

/**
 * Render the agent panel of a work item.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.title - the work's title, which a new chat about this letter names.
 * @returns the panel, or nothing when the person closed it.
 */
export function AgentRun({ ctx, data, title }: { ctx: ScreenContext; data: TicketDetail; title: string }) {
  const { t, agent } = ctx
  const { run } = data
  return (
    <AgentDock
      view={agent.view}
      name={t('actor.agent')}
      model={run === null ? null : modelText(ctx, run.model)}
      labels={{ minimise: t('agent.minimise'), expand: t('agent.expand'), collapse: t('agent.collapse'), close: t('agent.close') }}
      onView={agent.show}
    >
      {run === null
        ? <RunSummary ctx={ctx} data={data} title={title} why="not-started" />
        : run.session === null
          ? <RunSummary ctx={ctx} data={data} title={title} why="no-record" />
          : <RunSessionBody ctx={ctx} data={data} title={title} session={run.session} />}
    </AgentDock>
  )
}

/**
 * Render the run Session's conversation, a spinner while the Session list loads, a notice when it fails to load, or
 * the run summary when the Session is not in this person's chats.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.title - the work's title.
 * @param props.session - the run Session.
 * @returns the body.
 */
function RunSessionBody({ ctx, data, title, session }: { ctx: ScreenContext; data: TicketDetail; title: string; session: RunSessionId }) {
  const [attempt, setAttempt] = useState(0)
  return <RunSessionRead key={attempt} ctx={ctx} data={data} title={title} session={session} onRetry={() => { setAttempt(attempt + 1) }} />
}

/**
 * Read the run Session resource once; Try again mounts a new read.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.title - the work's title.
 * @param props.session - the run Session.
 * @param props.onRetry - read the Session again.
 * @returns the body.
 */
function RunSessionRead({ ctx, data, title, session, onRetry }: {
  ctx: ScreenContext
  data: TicketDetail
  title: string
  session: RunSessionId
  onRetry: () => void
}) {
  const { t, agent } = ctx
  const resource = agent.useResource<'recordsrun'>(runSessionAddress(session))
  const value = resource.value
  if (resource.status !== 'failed' && value?.kind === 'ready') {
    const Provider = agent.SessionProvider
    return <Provider session={value.reference}>{agent.renderConversation()}</Provider>
  }
  if (resource.status === 'loading') return <PageSpinner label={t('agent.loading')} />
  const routedTo = data.ticket.routedTo
  const why: NoConversation = routedTo !== null && routedTo.id !== ctx.me?.person.id ? 'elsewhere' : 'not-here'
  const notice = resource.status === 'failed'
    ? <Notice notice={{ lead: t('agent.loadFailed'), retry: { id: 'retry-conversation', label: t('act.retry'), keycaps: [], run: onRetry } }} />
    : null
  return <RunSummary ctx={ctx} data={data} title={title} why={why} notice={notice} />
}

/** The heading of each run state. */
const TITLES = {
  'not-started': 'agent.empty.notStarted',
  'working': 'agent.empty.working',
  'finished': 'agent.empty.finished',
  'failed': 'agent.empty.failed',
} as const satisfies Record<string, FlowleapRecordsKey>

/** Where the conversation is, by why the panel shows none. */
const WHERE = {
  'not-started': 'agent.where.notStarted',
  'no-record': 'agent.where.noRecord',
  'elsewhere': 'agent.where.elsewhere',
  'not-here': 'agent.where.notHere',
} as const satisfies Record<NoConversation, FlowleapRecordsKey>

/**
 * The state of a work item's run: not started, working, finished, or failed.
 * @param data - the work.
 * @returns the state.
 */
function runState(data: TicketDetail): keyof typeof TITLES {
  if (data.run === null) return 'not-started'
  if (data.ticket.state === 'run_failed') return 'failed'
  return data.run.finishedAt === null ? 'working' : 'finished'
}

/**
 * Render the panel with no conversation: the empty state, the run's facts, its proposals and the composer.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.title - the work's title.
 * @param props.why - why there is no conversation.
 * @param props.notice - the failure of the conversation's read, above the summary.
 * @returns the summary.
 */
function RunSummary({ ctx, data, title, why, notice = null }: {
  ctx: ScreenContext
  data: TicketDetail
  title: string
  why: NoConversation
  notice?: ReactNode
}) {
  const { t } = ctx
  const { run } = data
  const state = runState(data)
  const icon = state === 'failed' ? <StateDot shape="bad" /> : state === 'working' ? <StateDot shape="run" /> : <IconAgentPresetOutlineRegular size={16} />
  const facts = run === null
    ? []
    : [
      ...(run.finishedAt === null ? [] : [t('agent.run.finishedAt', { time: listTimeText(ctx, run.finishedAt) })]),
      ...(run.steps === null ? [] : [run.steps === 1 ? t('agent.run.oneStep') : t('agent.run.steps', { count: run.steps })]),
    ]
  const ask = ctx.agent.ask
  return (
    <>
      <AgentEmpty
        notice={notice}
        icon={icon}
        title={t(TITLES[state])}
        body={t(WHERE[why], { person: data.ticket.routedTo === null ? '' : personInText(t, data.ticket.routedTo) })}
        facts={facts.join(' · ')}
        results={data.reports.length === 0 ? null : {
          label: t('agent.run.proposals'),
          items: data.reports.map(report => (
            <AgentResult
              key={report.proposalId}
              icon={<IconDeliverDocRegular size={16} />}
              title={t('work.clientReport')}
              file={report.fileName}
              status={<AtlasStatus status={{ machine: 'report', state: report.state }} word={atlasWord(t, { machine: 'report', state: report.state })} />}
            />
          )),
        }}
      />
      {ask !== null && (
        <AskComposer
          labels={{ field: t('agent.ask.label'), placeholder: t('agent.ask.placeholder'), send: t('agent.ask.send') }}
          onAsk={(question) => { ask.start(t('agent.ask.prompt', { matter: data.matter.fileNumber, letter: title, question })) }}
        />
      )}
    </>
  )
}
