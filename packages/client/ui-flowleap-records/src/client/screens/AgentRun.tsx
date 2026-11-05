/**
 * The agent panel of the work page: the patent agent's run on the letter. With a run Session that this runtime has,
 * the panel shows its conversation and composer; otherwise one sentence says why there is nothing to show: the
 * agent has not started, the record names no Session, or the Session is in another person's app.
 */

import type { RunSessionId, TicketDetail } from '../api.ts'
import { runSessionAddress } from '../agent-run.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { AgentDock, AgentDockState } from '../parts/AgentDock.tsx'
import { PageSpinner } from '../parts/States.tsx'
import { personInText } from '../words.ts'
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

/**
 * Render the agent panel of a work item.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the panel, or nothing when the person closed it.
 */
export function AgentRun({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
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
        ? <AgentDockState shape="idle" text={t('agent.notStarted')} />
        : run.session === null
          ? <AgentDockState shape="idle" text={t('agent.noSession')} />
          : <RunSessionBody ctx={ctx} session={run.session} routedTo={data.ticket.routedTo} />}
    </AgentDock>
  )
}

/**
 * Render the run Session's conversation, a spinner while the Session list loads, or why it cannot show.
 * @param props.ctx - the screen context.
 * @param props.session - the run Session.
 * @param props.routedTo - the person whose app ran the work.
 * @returns the body.
 */
function RunSessionBody({ ctx, session, routedTo }: { ctx: ScreenContext; session: RunSessionId; routedTo: TicketDetail['ticket']['routedTo'] }) {
  const { t, agent } = ctx
  const resource = agent.useResource<'recordsrun'>(runSessionAddress(session))
  const value = resource.value
  if (value?.kind === 'ready') {
    const Provider = agent.SessionProvider
    return <Provider session={value.reference}>{agent.renderConversation()}</Provider>
  }
  if (resource.status === 'loading') return <PageSpinner label={t('agent.loading')} />
  const elsewhere = routedTo !== null && routedTo.id !== ctx.me?.person.id
  return <AgentDockState shape="bad" text={elsewhere ? t('agent.elsewhere', { person: personInText(t, routedTo) }) : t('agent.missing')} />
}
