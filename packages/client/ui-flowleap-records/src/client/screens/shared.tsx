/**
 * Pieces that several screens share: the error notice of a failed load, the failure notice of a decision's act, the
 * copy of an evidence quote, and the Activity of a record.
 */

import type { ActRun } from '../act-runner.ts'
import type { ActivityEvent, Command, IsoTime } from '../api.ts'
import { useKeyActs } from '../key-layer.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { ActivityTimeline, type AuditRow } from '../parts/Activity.tsx'
import type { QuoteLabels } from '../parts/Evidence.tsx'
import { ErrorNotice, type NoticeSpec } from '../parts/States.tsx'
import { activityLines, auditRows, listTimeText } from '../words.ts'
import { actOf, type ScreenContext } from './context.ts'

/**
 * The error notice of a failed load, with the time of the data that stays on screen; R tries again.
 * @param props.ctx - the screen context.
 * @param props.at - the time of the last data, or null when there is none.
 * @returns the notice.
 */
export function LoadError({ ctx, at }: { ctx: ScreenContext; at: number | null }) {
  useKeyActs(ctx, { retry: ctx.retry })
  const body = at === null ? ctx.t('error.noData') : ctx.t('error.asOf', { time: listTimeText(ctx, new Date(at).toISOString() as IsoTime) })
  return <ErrorNotice lead={ctx.t('error.load')} body={body} retry={actOf(ctx, 'retry', ctx.t('act.retry'), ctx.retry)} />
}

/** What failed, by the command of the first failed act. */
const FAILED: Readonly<Record<Command['kind'], FlowleapRecordsKey>> = {
  'intake.match': 'failure.match',
  'intake.notRelevant': 'failure.notRelevant',
  'officeEvent.decide': 'failure.officeEvent',
  'deadline.confirm': 'failure.confirm',
  'deadline.reject': 'failure.reject',
  'ticket.decide': 'failure.decide',
}

/** The refusals that say the record changed after the person opened it. */
const STALE: ReadonlySet<string> = new Set(['seen-is-stale'])

/**
 * The failure notice of a decision's last acts: what failed, what is still safe, and Try again. With no answer, the
 * outcome is unknown and a second try sends the same act; a refusal recorded nothing.
 * @param ctx - the screen context.
 * @param run - the decision's act runner state.
 * @param retry - Try again.
 * @param lead - what failed, when the command of the first failed act does not say it (a bulk decision).
 * @returns the notice, or undefined when the last acts did not fail.
 */
export function failureNotice(ctx: ScreenContext, run: ActRun, retry: () => void, lead?: string): NoticeSpec | undefined {
  if (run.phase !== 'failed') return undefined
  const errors = run.failed.map(({ error }) => error)
  const refusals = errors.flatMap(error => error.kind === 'refused' ? [error] : [])
  const body: FlowleapRecordsKey = refusals.length < errors.length
    ? 'failure.unknown'
    : refusals.some(error => error.code !== null && STALE.has(error.code)) ? 'failure.stale' : 'failure.refused'
  return {
    lead: lead ?? ctx.t(FAILED[run.failed[0].act.command.kind]),
    body: ctx.t(body),
    retry: actOf(ctx, 'retry', ctx.t('act.retry'), retry),
  }
}

/**
 * The copy of an evidence quote on a page.
 * @param ctx - the screen context.
 * @param page - the page number.
 * @returns the page reference and the excerpt's captions.
 */
export function quoteLabels(ctx: ScreenContext, page: number): QuoteLabels {
  return { page: ctx.t('evidence.page', { page }), excerpt: ctx.t('evidence.excerpt', { page }), exact: ctx.t('evidence.exact') }
}

/**
 * The Activity of a record with its Audit.
 * @param props.ctx - the screen context.
 * @param props.events - the record's events.
 * @param props.audit - more verbatim Audit rows after the events', such as the engine's notes in its own words.
 * @returns the timeline.
 */
export function RecordActivity({ ctx, events, audit = [] }: {
  ctx: ScreenContext
  events: readonly ActivityEvent[]
  audit?: readonly AuditRow[]
}) {
  return (
    <ActivityTimeline
      heading={ctx.t('activity.title')}
      lines={activityLines(ctx, events)}
      audit={{ label: ctx.t('activity.audit'), rows: [...auditRows(events), ...audit] }}
    />
  )
}
