/**
 * The deadline page (mockup d-deadline): is this date right. The due date is the key fact. The page shows how
 * FlowLeap computed it, the two readings of the letter with their spans, the legal sources and Activity, and the
 * docked decision bar: Confirm deadline sends the record position that the person saw, and Reject asks for the reason.
 * When the person may not confirm, the evidence stays and the bar says who confirms and why, with no primary act.
 */

import { useRef, useState, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular, IconCloseOutlineRegular, IconDeliverDocRegular, IconInfoOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useActRunner } from '../act-runner.ts'
import type { DeadlineDetail, IsoDate, LetterPeriod, MayDecideReason, Person } from '../api.ts'
import { formatDate } from '../format.ts'
import { useCommandItem, useKeyActs, type KeyActs } from '../key-layer.ts'
import { commandId } from '../keys.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import type { ActSpec } from '../parts/Act.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { DueText } from '../parts/Due.tsx'
import { DetailLayout, EvidenceSplit, KeyFact, WorkColumn } from '../parts/Layout.tsx'
import { LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { citeText, letterTitle, listTimeText, officeName, officeOfCode, personInText, personName, type Translate } from '../words.ts'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { formatDay, openDocument, ruleWords } from './detail.tsx'
import { LetterDrawing, LetterPages, Readings, readTwice } from './evidence.tsx'
import { decisionHeading, failureNotice, formNumberAudit, LoadError, RecordActivity } from './shared.tsx'
import css from './Detail.module.css'

/**
 * Render one deadline.
 * @param props.screen - the deadline route with its load.
 * @param props.ctx - the screen context.
 * @returns the decision page.
 */
export function DeadlineScreen({ screen, ctx }: ScreenProps<'deadline'>) {
  return (
    <LoadView
      load={screen.deadline}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: (at, error) => <LoadError ctx={ctx} at={at} error={error} />,
        ready: data => <DeadlineView ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * How the two readings of the letter compare; `noLetter` for an office event that a person entered by hand, which has
 * no source letter to read (a second person confirms it, R14); `myepo` for a MyEPO letter that no reader read, whose
 * letter type comes from its MyEPO document code.
 */
type Comparison = 'agree' | 'differ' | 'one' | 'none' | 'noLetter' | 'myepo'

/**
 * How the two readings of the letter compare.
 * @param data - the deadline.
 * @returns the comparison.
 */
function readingOf({ readers, officeEvent, activity }: DeadlineDetail): Comparison {
  if (officeEvent.document === null) return 'noLetter'
  if (readers.agree !== null) return readers.agree ? 'agree' : 'differ'
  if (readers.code !== null || readers.model !== null) return 'one'
  return myepoCodeOf(activity) === null ? 'none' : 'myepo'
}

/**
 * The MyEPO document code that gave the code of the office event: the `codeSource` of its `office-event/observed` event.
 * @param activity - the deadline's events.
 * @returns the document code, or null when the code did not come from the MyEPO list.
 */
function myepoCodeOf(activity: DeadlineDetail['activity']): string | null {
  for (const event of activity) {
    const source = event.detail['codeSource']
    if (event.type === 'office-event/observed' && typeof source === 'object' && source !== null
      && 'kind' in source && source.kind === 'myepo-list' && 'documentCode' in source && typeof source.documentCode === 'string') return source.documentCode
  }
  return null
}

/**
 * The hint after the heading What FlowLeap read.
 * @param reading - how the letter was read.
 * @param readers - the readings.
 * @returns the text key.
 */
function readHintOf(reading: Comparison, readers: DeadlineDetail['readers']): FlowleapRecordsKey {
  if (reading === 'myepo' || readTwice(readers)) return 'deadline.readHint'
  return readers.outcome === 'no-reading' ? 'deadline.readHintNone' : 'deadline.readHintOnce'
}

/** The icon of the deadline part in the decision bar, by how the two readings compare. */
const READING_ICONS: Readonly<Record<Comparison, ReactNode>> = {
  agree: <IconCheckOutlineRegular size={16} />,
  differ: <IconWarningTriangleOutlineRegular size={16} />,
  one: <IconInfoOutlineRegular size={16} />,
  none: <IconWarningTriangleOutlineRegular size={16} />,
  noLetter: <IconInfoOutlineRegular size={16} />,
  myepo: <IconInfoOutlineRegular size={16} />,
}


/**
 * The words of each note code of the engine. A note with another code shows only in Audit, because its text is the
 * engine's English (R19).
 */
const NOTES: Readonly<Record<string, FlowleapRecordsKey>> = { 'late-receipt': 'deadline.note.lateReceipt' }

/** The steps whose date shows its weekday, because a closed day moves the end of a period. */
const WEEKDAY_STEPS: ReadonlySet<string> = new Set(['month-end', 'add-period', 'closure-roll'])

/** The words of each refusal of a confirm. */
const DECIDERS: Readonly<Record<MayDecideReason, FlowleapRecordsKey>> = {
  'proposer': 'deadline.decider.proposer',
  'code-decider': 'deadline.decider.codeDecider',
  'not-in-team': 'deadline.decider.notInTeam',
  'not-routed-person': 'deadline.decider.other',
  'not-ready': 'deadline.decider.notReady',
  'decided': 'deadline.decider.other',
}

/**
 * Why the signed-in person may confirm: a person who did not record or classify the letter, or, for an office event
 * that a person entered by hand, not the person who entered it.
 * @param ctx - the screen context.
 * @param data - the deadline.
 * @returns the why line of the decision bar.
 */
function whyYou({ t }: ScreenContext, data: DeadlineDetail): string {
  if (data.officeEvent.document !== null) return t('deadline.whyYou')
  return data.proposer === null ? t('deadline.whyEnteredPlain') : t('deadline.whyEntered', { person: personInText(t, data.proposer) })
}

/**
 * Why the signed-in person may not confirm. The person who entered an office event by hand entered no date: FlowLeap
 * computed it, so the words name the entry.
 * @param reason - the refusal of a confirm.
 * @param letter - the source letter, or null for an office event entered by hand.
 * @returns the text key.
 */
function deciderOf(reason: MayDecideReason, letter: DeadlineDetail['officeEvent']['document']): FlowleapRecordsKey {
  return reason === 'proposer' && letter === null ? 'deadline.decider.entered' : DECIDERS[reason]
}

/**
 * The whole months from one date to another, and whether the second date has the same day number.
 * @param from - the earlier date.
 * @param to - the later date.
 * @returns the months, and true when the day numbers are equal.
 */
function monthsBetween(from: IsoDate, to: IsoDate): { readonly months: number; readonly sameDay: boolean } {
  const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = to.split('-').map(Number) as [number, number, number]
  return { months: (y2 - y1) * 12 + (m2 - m1), sameDay: d1 === d2 }
}

/**
 * The days from one date to another.
 * @param from - the earlier date.
 * @param to - the later date.
 * @returns the days.
 */
function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * One step of the calculation as a plain sentence, as the mockups word it: the period in months or days from the
 * step's two dates, and the office by its name. An office event entered by hand has no letter, so its delivery step
 * names the date of the office event.
 * @param ctx - the screen context.
 * @param step - the step.
 * @param letter - the source letter, or null for an office event entered by hand.
 * @param office - the office's name, or null when the code names none.
 * @returns the sentence.
 */
function stepText(
  { t, locale }: ScreenContext, step: DeadlineDetail['deadline']['trace'][number], letter: DeadlineDetail['officeEvent']['document'], office: string | null,
): string {
  const named = office ?? t('deadline.step.office')
  switch (step.op) {
    case 'delivery': return t(letter === null ? 'deadline.step.deliveryEvent' : 'deadline.step.delivery')
    case 'start': return t('deadline.step.start')
    case 'add-period':
    case 'month-end': {
      const { months, sameDay } = monthsBetween(step.from, step.to)
      if (step.op === 'month-end') return t('deadline.step.monthEnd', { count: months })
      if (sameDay && months > 0) return t(months === 1 ? 'deadline.step.month' : 'deadline.step.months', { count: months })
      return t('deadline.step.days', { count: daysBetween(step.from, step.to) })
    }
    case 'closure-roll': return step.from === step.to
      ? t('deadline.step.openDay', { office: named })
      : t('deadline.step.closureRoll', { office: named, date: formatDate(step.from, locale) })
    default: return t('deadline.step.other')
  }
}

/**
 * Where the period of a deadline comes from, for a rule whose period the letter sets: read on a page of the letter, with the words,
 * or entered by a person.
 * @param t - the translate function.
 * @param period - the known period of the office event.
 * @returns the sentence.
 */
function periodText(t: Translate, period: Extract<LetterPeriod, { state: 'known' }>): string {
  return period.source.kind === 'reader'
    ? t('deadline.period.read', { count: period.months, page: period.source.page, quote: period.source.quote })
    : t('deadline.period.entered', { count: period.months, person: personInText(t, period.source.by) })
}

/**
 * The person who recorded the office event that starts the period: the actor of its `office-event/recorded` event.
 * @param activity - the deadline's events.
 * @returns the person, or null when FlowLeap recorded it.
 */
function recorderOf(activity: DeadlineDetail['activity']): Person | null {
  for (const event of activity) if (event.type === 'office-event/recorded' && event.actor.kind === 'person') return event.actor.person
  return null
}

/**
 * Render a deadline: the eyebrow, the key fact, the calculation, the readings, the legal sources, Activity, the
 * properties panel and the decision bar.
 * @param props.ctx - the screen context.
 * @param props.data - the deadline.
 * @returns the decision page.
 */
function DeadlineView({ ctx, data }: { ctx: ScreenContext; data: DeadlineDetail }) {
  const { t } = ctx
  const [reasonOpen, setReasonOpenState] = useState(false)
  const runner = useActRunner(ctx.perform)
  const steps = useRef<HTMLOListElement>(null)
  const { deadline, officeEvent, readers, mayConfirm } = data
  const status = { machine: 'deadline', state: deadline.state } as const
  const proposed = deadline.state === 'deadline_proposed' || deadline.state === 'manual_proposed'
  const allowed = proposed && mayConfirm.allowed
  const rule = ruleWords(t, officeEvent.code)
  const reading = readingOf(data)
  const due = formatDate(deadline.due, ctx.locale)
  const letter = officeEvent.document
  const officeCode = officeOfCode(officeEvent.code)
  const office = officeCode === null ? null : officeName(t, officeCode)
  const recorder = recorderOf(data.activity)

  // Opening the reason step changes the decision, so the failure of a confirm no longer applies.
  const setReasonOpen = (open: boolean) => {
    setReasonOpenState(open)
    if (open) runner.clear()
  }
  // The record position is the one on screen now, so a confirm after a refusal names the position the person sees.
  const confirm = () => { void runner.submit([{ kind: 'deadline.confirm', id: deadline.id, seen: data.recordSeq }]) }
  const reject = (reason: string) => {
    setReasonOpen(false)
    void runner.submit([{ kind: 'deadline.reject', id: deadline.id, reason }])
  }
  const retry = () => {
    if (runner.run.phase === 'failed' && runner.run.failed[0].act.command.kind === 'deadline.confirm') confirm()
    else void runner.retry()
  }
  const calculation = () => {
    steps.current?.scrollIntoView({ block: 'start' })
    steps.current?.focus()
  }
  const goMatter = () => { ctx.navigate({ view: 'matter', fileNumber: data.matter.fileNumber }) }
  const openLetter = letter === null ? null : () => { openDocument(ctx, letter) }

  const acts: KeyActs = {
    calculation, goMatter,
    ...(openLetter === null ? {} : { openLetter }),
    ...(allowed ? { record: confirm, reject: () => { setReasonOpen(true) } } : {}),
    ...(runner.run.phase === 'failed' ? { retry } : {}),
  }
  useKeyActs(ctx, acts, { arrows: false, failed: runner.run.phase === 'failed' })
  const letterAct: ActSpec | null = openLetter === null
    ? null
    : actOf(ctx, 'openLetter', t('deadline.openLetter'), openLetter, { icon: <IconDeliverDocRegular size={16} /> })
  useCommandItem(ctx, {
    label: `${t('crumb.deadline', { date: due })} · ${data.matter.fileNumber}`,
    groups: [
      ...(allowed
        ? [{
          id: 'decision', label: t('deadline.group.decision'), acts: [
            { id: 'record', label: t('act.confirmDeadline'), commandId: commandId('record'), disabled: runner.run.phase === 'running', run: confirm },
            { id: 'reject', label: t('act.rejectStep'), commandId: commandId('reject'), run: () => { setReasonOpen(true) } },
          ],
        }]
        : []),
      {
        id: 'deadline', label: t('deadline.group.deadline'), acts: [
          ...(openLetter === null ? [] : [{ id: 'open-letter', label: t('deadline.openLetter'), commandId: commandId('openLetter'), run: openLetter }]),
          { id: 'calculation', label: t('deadline.calculation'), commandId: commandId('calculation'), run: calculation },
          { id: 'go-matter', label: t('deadline.goMatter', { matter: data.matter.fileNumber }), commandId: commandId('goMatter'), run: goMatter },
        ],
      },
    ],
  })

  // Who confirms: the owner of the open Confirm the deadline task, whom the bar's heading and the eyebrow name (B4).
  const owner = mayConfirm.allowed || data.confirmTask === null ? null : data.confirmTask.owner
  const decision = !proposed || ctx.me === null
    ? null
    : (
      <DecisionBar
        heading={decisionHeading(ctx, ctx.me.person, owner === null ? mayConfirm : { allowed: false, decider: owner })}
        question={t('decision.dateRight')}
        why={allowed ? whyYou(ctx, data) : undefined}
        labels={{ more: t('decision.more') }}
        decider={mayConfirm.allowed ? null : [
          ...(data.confirmTask === null ? [] : [confirmTaskWords(ctx, data.confirmTask)]),
          t(deciderOf(mayConfirm.reason, letter), { person: mayConfirm.decider === null ? t('deadline.secondPerson') : personName(t, mayConfirm.decider) }),
        ].join(' ')}
        failure={failureNotice(ctx, runner.run, retry)}
        parts={(
          <DecisionPart
            icon={READING_ICONS[reading]}
            title={due}
            detail={`${t(`deadline.part.${reading}`, { count: deadline.trace.length })} · ${t(mayConfirm.allowed ? 'deadline.part.recheck' : 'deadline.part.recheckOther')}`}
          />
        )}
        negative={allowed
          ? {
            ...keyedOf(ctx, 'reject'),
            label: t('act.rejectStep'),
            icon: <IconCloseOutlineRegular size={16} />,
            open: reasonOpen,
            onOpenChange: setReasonOpen,
            reasonLabel: t('reason.reject'),
            confirmLabel: t('act.reject'),
            cancelLabel: t('act.cancel'),
            onConfirm: reject,
          }
          : undefined}
        secondary={letterAct === null ? [] : [letterAct]}
        note={allowed ? t('deadline.note.confirm', { person: personInText(t, ctx.me.person) }) : undefined}
        primary={{ ...actOf(ctx, 'record', t('act.confirm'), confirm, { icon: <IconCheckOutlineRegular size={16} /> }), busy: runner.run.phase === 'running' }}
      />
    )

  // The eyebrow names the owner of the Confirm the deadline task; another person who may confirm still sees the owner.
  const taskOwner = data.confirmTask?.owner ?? null
  const eyebrowText = proposed
    ? taskOwner !== null && taskOwner.id !== ctx.me?.person.id
      ? t('deadline.waitsFor', { person: personInText(t, taskOwner) })
      : allowed ? t('deadline.waitsYou') : t('deadline.waitsSecond')
    : data.confirmer !== null
      ? t('deadline.confirmedBy', { person: personInText(t, data.confirmer) })
      : data.rejecter !== null
        ? t('deadline.rejectedBy', { person: personInText(t, data.rejecter), reason: data.reason ?? '' })
        : null
  const drawing = openLetter === null
    ? null
    : (
      <LetterPages
        ctx={ctx}
        images={data.pageImages}
        marks={data.marks}
        fallback={<LetterDrawing ctx={ctx} letter={{ fields: readers.code?.fields ?? {}, pages: null }} onOpen={openLetter} />}
        onOpen={openLetter}
      />
    )
  return (
    <DetailLayout decision={decision !== null} properties={null}>
      <WorkColumn decision={decision}>
        <div className={css.eyebrowLine}>
          <AtlasPill status={status} word={atlasWord(t, status)} />
          {eyebrowText !== null && <span>{eyebrowText}</span>}
        </div>
        <KeyFact value={formatDate(deadline.due, ctx.locale, 'long')} detail={<DueText words={ctx} due={deadline.due} />} />
        <div className={css.ruleLine}>
          {rule.full}
          {rule.period !== null && officeEvent.documentDate !== null
            && <span>{` · ${t(rule.period, { date: formatDay(officeEvent.documentDate, ctx.locale) })}`}</span>}
        </div>

        {letter !== null && (
          <p className={css.lede}>
            {t(recorder === null ? 'deadline.fromLetter' : 'deadline.fromLetterBy', {
              title: letterTitle(t, officeEvent.code),
              matter: data.matter.fileNumber,
              ...(recorder === null ? {} : { person: personInText(t, recorder) }),
            })}
          </p>
        )}
        <EvidenceSplit evidence={drawing}>
          <section className={css.section}>
            <h2 className={css.subHeading}>{t('deadline.computed')}</h2>
            {officeEvent.period?.state === 'known' && <p className={css.lede}>{periodText(t, officeEvent.period)}</p>}
            <ol className={css.steps} ref={steps} tabIndex={-1} aria-label={t('deadline.computed')} data-state={deadline.state}>
              {deadline.trace.map((step, index) => (
                <li key={`${index}:${step.op}`} className={css.step}>
                  <span className={css.dot} aria-hidden="true" />
                  <div>
                    <div className={css.what}>
                      {stepText(ctx, step, letter, office)}
                      {/* The last step gives the deadline: the tag says so, and its dot has the deadline's colour. */}
                      {index === deadline.trace.length - 1 && <span className={css.nextTag}>{t('deadline.step.result')}</span>}
                    </div>
                    <div className={css.law}>{citeText(t, step.cite)}</div>
                  </div>
                  <div className={css.to}>{'→ '}<b>{WEEKDAY_STEPS.has(step.op) ? formatDate(step.to, ctx.locale) : formatDay(step.to, ctx.locale)}</b></div>
                </li>
              ))}
            </ol>
            {deadline.notes.flatMap((note, index) => {
              const key = NOTES[note.kind]
              return key === undefined
                ? []
                : [(
                  <div key={`${index}:${note.kind}`} className={css.note} data-fdl-part="notice">
                    <IconInfoOutlineRegular size={16} />
                    <span>{t(key)}</span>
                  </div>
                )]
            })}
          </section>

          {reading === 'noLetter'
            ? (
              <section className={css.section} aria-label={t('deadline.eventHeading')}>
                <h2 className={css.subHeading}>{t('deadline.eventHeading')}</h2>
                <NoSourceLetter ctx={ctx} data={data} />
              </section>
            )
            : (
              <section className={css.section} aria-label={t('deadline.read')}>
                <h2 className={css.subHeading}>{t('deadline.read')}<span className={css.subHint}>{`· ${t(readHintOf(reading, readers))}`}</span></h2>
                {reading === 'myepo'
                  ? <MyEpoReading ctx={ctx} data={data} />
                  : reading === 'none' ? <p className={css.subHint}>{t('deadline.noReading')}</p> : <Readings ctx={ctx} readers={readers} />}
              </section>
            )}

          {deadline.sources.length > 0 && (
            <section className={css.section}>
              <h2 className={css.subHeading}>{t('deadline.sources')}</h2>
              <div className={css.lawChips}>
                {deadline.sources.map((source) => {
                  const href = httpsHref(source.url)
                  const text = citeText(t, source.cite)
                  return href === null
                    ? <span key={source.cite} className={css.lawChip}>{text}</span>
                    : <a key={source.cite} className={css.lawChip} href={href} target="_blank" rel="noopener noreferrer">{text}</a>
                })}
              </div>
            </section>
          )}
        </EvidenceSplit>
        <RecordActivity
          ctx={ctx}
          events={data.activity}
          audit={[
            ...formNumberAudit(ctx, data.readers.code?.fields),
            ...deadline.notes.map((note, index) => ({ key: `note:${index}`, cells: [note.kind, note.text, note.cite] })),
          ]}
        />
      </WorkColumn>
    </DetailLayout>
  )
}

/**
 * The address of a legal source as a link target: only an absolute `https:` address, so a source address from the
 * record never runs script (`javascript:`) or opens another scheme.
 * @param url - the source address from the Records service.
 * @returns the address, or null when the source shows as text.
 */
function httpsHref(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (_error: unknown) {
    // A relative or malformed address is no link target; the source shows as text.
    return null
  }
  return parsed.protocol === 'https:' ? parsed.href : null
}

/**
 * The sentence on the open Confirm the deadline task: who confirms, and when FlowLeap sent the notice or that the task
 * waits in that person's queue.
 * @param ctx - the screen context.
 * @param task - the task.
 * @returns the sentence.
 */
function confirmTaskWords(ctx: ScreenContext, task: NonNullable<DeadlineDetail['confirmTask']>): string {
  const { t } = ctx
  const person = personInText(t, task.owner)
  if (task.queued) return t('deadline.task.queued', { person })
  return task.noticeAt === null ? t('deadline.task.owner', { person }) : t('deadline.task.notice', { person, time: listTimeText(ctx, task.noticeAt) })
}

/**
 * Render what FlowLeap read of a MyEPO letter that no reader read: the letter type from its MyEPO document code, and the
 * period that the letter sets, read on a page of the letter text or entered by a person.
 * @param props.ctx - the screen context.
 * @param props.data - the deadline.
 * @returns the lines.
 */
function MyEpoReading({ ctx: { t }, data }: { ctx: ScreenContext; data: DeadlineDetail }) {
  const { period, code } = data.officeEvent
  return (
    <>
      <p className={css.lede}>{t('deadline.myepo.type', { code: myepoCodeOf(data.activity) ?? '', title: letterTitle(t, code) })}</p>
      {period?.state === 'known' && (
        <p className={css.lede}>
          {period.source.kind === 'reader'
            ? t('deadline.myepo.periodRead', { count: period.months, page: period.source.page, quote: period.source.quote })
            : t('deadline.myepo.periodEntered', { count: period.months, person: personInText(t, period.source.by) })}
        </p>
      )}
    </>
  )
}

/**
 * Render the place of the readings for an office event that a person entered by hand: "No source letter" instead of
 * a quote (never "Missing evidence": the second person's confirm is its evidence, R14), and who entered it and who
 * confirmed it.
 * @param props.ctx - the screen context.
 * @param props.data - the deadline.
 * @returns the note and the people.
 */
function NoSourceLetter({ ctx, data }: { ctx: ScreenContext; data: DeadlineDetail }) {
  const { t } = ctx
  const entered = data.proposer === null ? null : personInText(t, data.proposer)
  return (
    <>
      <div className={css.note} data-fdl-part="notice">
        <IconInfoOutlineRegular size={16} />
        <span>{t('evidence.noSourceLetter')}</span>
      </div>
      {entered !== null && (
        <p className={css.subHint}>
          {data.confirmer === null
            ? t('deadline.entered', { person: entered })
            : t('deadline.enteredConfirmed', { entered, confirmed: personInText(t, data.confirmer) })}
        </p>
      )}
    </>
  )
}
