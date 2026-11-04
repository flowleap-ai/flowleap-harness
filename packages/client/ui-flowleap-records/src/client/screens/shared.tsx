/**
 * Pieces that several screens share: the error notice of a failed load, the deciding person's decision bar copy,
 * and the Activity of a record.
 */

import type { ActivityEvent, IsoTime, MayDecide } from '../api.ts'
import { useKeyActs } from '../key-layer.ts'
import { ActivityTimeline } from '../parts/Activity.tsx'
import type { QuoteLabels } from '../parts/Evidence.tsx'
import { ErrorNotice } from '../parts/States.tsx'
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

/**
 * Who decides when the signed-in person may not, as one sentence for the decision bar.
 * @param ctx - the screen context.
 * @param may - whether the person may decide.
 * @returns null when the person may decide.
 */
export function deciderText(ctx: ScreenContext, may: MayDecide): string | null {
  if (may.allowed) return null
  return may.decider === null ? ctx.t('decision.notYours') : ctx.t('decision.decider', { person: may.decider.name })
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
 * @returns the timeline.
 */
export function RecordActivity({ ctx, events }: { ctx: ScreenContext; events: readonly ActivityEvent[] }) {
  return (
    <ActivityTimeline
      heading={ctx.t('activity.title')}
      lines={activityLines(ctx, events)}
      audit={{ label: ctx.t('activity.audit'), rows: auditRows(events) }}
    />
  )
}
