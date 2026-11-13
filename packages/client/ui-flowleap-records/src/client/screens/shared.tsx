/**
 * Pieces that several screens share: the error notice of a failed load, the heading and the failure notice of a
 * decision bar, the copy of an evidence quote, and the Activity of a record with its Audit.
 */

import type { ActRun } from '../act-runner.ts'
import { IconFolderOpenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActivityEvent, Command, FieldValue, IsoTime, Person, ReaderField, RecordsError } from '../api.ts'
import { useKeyActs, useRetryHeld } from '../key-layer.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { ActivityTimeline, type AuditRow } from '../parts/Activity.tsx'
import type { DecisionHeading } from '../parts/Decision.tsx'
import type { QuoteLabels } from '../parts/Evidence.tsx'
import { EmptyState, ErrorNotice, type NoticeSpec } from '../parts/States.tsx'
import { activityLines, auditRows, avatarOf, listTimeText, personName } from '../words.ts'
import { actOf, type ScreenContext } from './context.ts'

/**
 * The error notice of a failed load, with the time of the data that stays on screen, and Try again, which loads the
 * view again. While a failed act in a decision bar holds R, the notice's Try again has no key and shows no keycap: R
 * tries the person's pending decision again, which also loads the view again.
 * A refusal of the record (a 403 or 404 answer, such as a matter outside the person's walls) is no fault and
 * cannot change on a retry: it shows a not-found state with no Try again and no word on whether the object exists
 * (#328).
 * @param props.ctx - the screen context.
 * @param props.at - the time of the last data, or null when there is none.
 * @param props.error - the failure, or null when the caller does not know it.
 * @returns the notice.
 */
export function LoadError({ ctx, at, error = null }: { ctx: ScreenContext; at: number | null; error?: RecordsError | null }) {
  if (error?.kind === 'refused' && (error.status === 403 || error.status === 404)) return <NotFound ctx={ctx} />
  return <LoadFailure ctx={ctx} at={at} />
}

/**
 * Render the not-found state of a refused read, with My work as the next step.
 * @param props.ctx - the screen context.
 * @returns the state.
 */
function NotFound({ ctx }: { ctx: ScreenContext }) {
  return (
    <EmptyState
      icon={<IconFolderOpenOutlineRegular size={16} />}
      title={ctx.t('notFound.title')}
      body={ctx.t('notFound.body')}
      action={{ id: 'my-work', label: ctx.t('notFound.myWork'), keycaps: [], run: () => { ctx.openMyWork() } }}
    />
  )
}

/**
 * Render the error notice of a load that failed for a reason that a retry can change.
 * @param props.ctx - the screen context.
 * @param props.at - the time of the last data, or null when there is none.
 * @returns the notice.
 */
function LoadFailure({ ctx, at }: { ctx: ScreenContext; at: number | null }) {
  useKeyActs(ctx, { retry: ctx.retry })
  const held = useRetryHeld(ctx)
  const body = at === null ? ctx.t('error.noData') : ctx.t('error.asOf', { time: listTimeText(ctx, new Date(at).toISOString() as IsoTime) })
  // A held R belongs to the decision bar, so this Try again is a keyless act of its own (R16: a keyed act shows its key).
  const retry = held
    ? { id: 'reload', label: ctx.t('act.retry'), keycaps: [], run: ctx.retry }
    : actOf(ctx, 'retry', ctx.t('act.retry'), ctx.retry)
  return <ErrorNotice lead={ctx.t('error.load')} body={body} retry={retry} />
}

/**
 * Who decides, for the header of a decision bar: the signed-in person may decide ("Your decision"), or another person
 * decides and the header names them ("Dr. Anna Becker decides"), never "Your decision" (product rule 6).
 * @param ctx - the screen context.
 * @param me - the signed-in person.
 * @param may - whether this person may decide, and who decides when not.
 * @returns the heading.
 */
export function decisionHeading(
  ctx: ScreenContext, me: Person, may: { readonly allowed: true } | { readonly allowed: false; readonly decider: Person | null },
): DecisionHeading {
  const { t } = ctx
  if (may.allowed) return { person: avatarOf(t, me), text: t('decision.yours') }
  if (may.decider === null) return { person: null, text: t('decision.notYoursHeading') }
  return { person: avatarOf(t, may.decider), text: t('decision.theirs', { person: personName(t, may.decider) }) }
}

/** What FlowLeap refused, by the command of the first failed act. */
const REFUSED: Readonly<Record<Command['kind'], FlowleapRecordsKey>> = {
  'intake.match': 'failure.match',
  'intake.notRelevant': 'failure.notRelevant',
  'intake.file': 'failure.file',
  'officeEvent.decide': 'failure.officeEvent',
  'officeEvent.period': 'failure.period',
  'officeEvent.noEvent': 'failure.officeEvent',
  'deadline.confirm': 'failure.confirm',
  'deadline.reject': 'failure.reject',
  'ticket.decide': 'failure.decide',
}

/** The refusals that say the record changed after the person opened it. */
const STALE: ReadonlySet<string> = new Set(['seen-is-stale'])

/**
 * The failure notice of a decision's last acts, with one lead for each outcome and one Try again. With no answer or a
 * service failure (5xx) for any act, the outcome is unknown: the decision may be recorded, and a second try sends the
 * same act. When FlowLeap refused every act (4xx), the lead says what it refused, and nothing is recorded.
 * @param ctx - the screen context.
 * @param run - the decision's act runner state.
 * @param retry - Try again.
 * @param bulk - the acts are the letters of a bulk decision, which stay selected.
 * @returns the notice, or undefined when the last acts did not fail.
 */
export function failureNotice(ctx: ScreenContext, run: ActRun, retry: () => void, bulk = false): NoticeSpec | undefined {
  if (run.phase !== 'failed') return undefined
  const { t } = ctx
  const errors = run.failed.map(({ error }) => error)
  const refusals = errors.flatMap(error => error.kind === 'refused' ? [error] : [])
  const again = actOf(ctx, 'retry', t('act.retry'), retry)
  if (refusals.length < errors.length) {
    const unknown = errors.length - refusals.length
    return { lead: t('failure.noAnswer'), body: bulk ? t('intake.bulk.unknown', { count: unknown }) : t('failure.unknown'), retry: again }
  }
  const stale = refusals.some(error => error.code !== null && STALE.has(error.code))
  const body: FlowleapRecordsKey = stale ? 'failure.stale' : bulk ? 'intake.bulk.refusedBody' : 'failure.refused'
  return {
    lead: bulk ? t('intake.bulk.refused', { count: refusals.length }) : t(REFUSED[run.failed[0].act.command.kind]),
    body: t(body),
    retry: again,
  }
}

/**
 * The copy of an evidence quote on a page.
 * @param ctx - the screen context.
 * @param page - the page number.
 * @returns the page reference and the name of the act that shows the quote in the letter.
 */
export function quoteLabels(ctx: ScreenContext, page: number): QuoteLabels {
  return { page: ctx.t('evidence.page', { page }), show: ctx.t('evidence.show', { page }) }
}

/**
 * The Audit row of a letter's form code: reader 1's span of it, verbatim. The main view quotes the letter's title line
 * instead, because a form code is not the person's word (R19).
 * @param ctx - the screen context.
 * @param fields - what reader 1 read, or undefined when it read nothing.
 * @returns the row, or no row when reader 1 read no form code.
 */
export function formNumberAudit(ctx: ScreenContext, fields: Partial<Readonly<Record<ReaderField, FieldValue>>> | undefined): AuditRow[] {
  const form = fields?.formNumber
  return form === undefined ? [] : [{ key: 'field:formNumber', cells: ['formNumber', form.span.quote, ctx.t('evidence.page', { page: form.span.page })] }]
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
