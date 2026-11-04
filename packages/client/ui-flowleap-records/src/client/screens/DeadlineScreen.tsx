/**
 * The deadline page (mockup d-deadline): is this date right. The due date is the key fact. The page shows how
 * FlowLeap computed it, the two readings of the letter with their spans, the legal sources and Activity, and the
 * docked decision bar: Confirm deadline sends the record position that the person saw, and Reject asks for the reason.
 * When the person may not confirm, the evidence stays and the bar says who confirms and why, with no primary act.
 */

import { useRef, useState } from 'react'
import {
  IconCheckOutlineRegular, IconCloseOutlineRegular, IconDeliverDocRegular, IconInfoOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useActRunner } from '../act-runner.ts'
import type { DeadlineDetail, FieldValue, MayDecideReason, ReaderField } from '../api.ts'
import { formatDate } from '../format.ts'
import { useCommandItem, useKeyActs, type KeyActs } from '../key-layer.ts'
import { commandId } from '../keys.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import type { ActSpec } from '../parts/Act.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote } from '../parts/Evidence.tsx'
import { DetailLayout, KeyFact, PropertiesPanel, WorkColumn } from '../parts/Layout.tsx'
import { LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { dueText } from '../words.ts'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { formatDay, officeOf, openDocument, ruleWords, Who } from './detail.tsx'
import { failureNotice, LoadError, quoteLabels, RecordActivity } from './shared.tsx'
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
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <DeadlineView ctx={ctx} data={data} />,
      }}
    />
  )
}

/** How the two readings of the letter compare. */
type Comparison = 'agree' | 'differ' | 'one' | 'none'

/** What one reader read. */
type Reading = NonNullable<NonNullable<DeadlineDetail['readers']['model']>['result']>

/**
 * How the two readings of the letter compare.
 * @param readers - the readings.
 * @returns the comparison.
 */
function readingOf(readers: DeadlineDetail['readers']): Comparison {
  if (readers.agree !== null) return readers.agree ? 'agree' : 'differ'
  return readers.code === null && readers.model === null ? 'none' : 'one'
}

/** The words of each step of the engine's calculation. */
const STEPS: Readonly<Record<string, FlowleapRecordsKey>> = {
  'delivery': 'deadline.step.delivery',
  'start': 'deadline.step.start',
  'month-end': 'deadline.step.monthEnd',
  'add-period': 'deadline.step.addPeriod',
  'closure-roll': 'deadline.step.closureRoll',
}

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
 * The reading rows: the reader field whose span quotes the value, and the label. The office event has no quote: its
 * reader field is the form code, which shows only in Audit (R19).
 */
const READ_ROWS = [
  { value: 'code', field: null, label: 'deadline.field.code' },
  { value: 'documentDate', field: 'documentDate', label: 'deadline.field.documentDate' },
  { value: 'applicationNumber', field: 'applicationNumber', label: 'deadline.field.application' },
] as const satisfies readonly { value: string; field: ReaderField | null; label: FlowleapRecordsKey }[]

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
  const reading = readingOf(readers)
  const due = formatDate(deadline.due, ctx.locale)
  const letter = officeEvent.document

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
  useKeyActs(ctx, acts, { arrows: false })
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

  const decision = !proposed || ctx.me === null
    ? null
    : (
      <DecisionBar
        person={ctx.me.person}
        question={t('decision.dateRight')}
        why={allowed ? t('deadline.whyYou') : undefined}
        labels={{ yours: t('decision.yours'), more: t('decision.more') }}
        decider={mayConfirm.allowed ? null : t(DECIDERS[mayConfirm.reason], { person: mayConfirm.decider?.name ?? t('deadline.secondPerson') })}
        failure={failureNotice(ctx, runner.run, retry)}
        parts={(
          <DecisionPart
            icon={<IconCheckOutlineRegular size={16} />}
            title={due}
            detail={t(`deadline.part.${reading}`, { count: deadline.trace.length })}
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
        primary={{ ...actOf(ctx, 'record', t('act.confirmDeadline'), confirm, { icon: <IconCheckOutlineRegular size={16} /> }), busy: runner.run.phase === 'running' }}
      />
    )

  const eyebrowText = proposed
    ? t('deadline.waitsSecond')
    : data.confirmer !== null
      ? t('deadline.confirmedBy', { person: data.confirmer.name })
      : data.rejecter !== null
        ? t('deadline.rejectedBy', { person: data.rejecter.name, reason: data.reason ?? '' })
        : null
  const office = officeOf(officeEvent.code)
  return (
    <DetailLayout decision={decision !== null} properties={(
      <PropertiesPanel label={t('prop.label')} groups={[
        {
          heading: t('prop.deadline'),
          rows: [
            { label: t('prop.due'), value: due },
            { label: t('deadline.prop.rule'), value: rule.short, title: rule.short },
            ...(rule.months === null ? [] : [{ label: t('deadline.prop.period'), value: rule.months }]),
          ],
        },
        {
          heading: t('deadline.prop.checks'),
          rows: [
            { label: t('deadline.prop.proposedBy'), value: data.proposer === null ? t('actor.flowleap') : <Who person={data.proposer} /> },
            { label: t('deadline.prop.reading'), value: t(`deadline.reading.${reading}`) },
            {
              label: t('deadline.prop.confirm'),
              value: data.confirmer !== null ? <Who person={data.confirmer} /> : data.rejecter !== null ? <Who person={data.rejecter} /> : t('deadline.secondPerson'),
            },
          ],
        },
        {
          heading: t('deadline.prop.source'),
          rows: [
            { label: t('prop.matter'), value: data.matter.fileNumber },
            {
              label: t('deadline.prop.officeEvent'),
              value: officeEvent.documentDate === null
                ? (office ?? t('matter.notRecorded'))
                : t('deadline.officeEventValue', { office: office ?? '', date: formatDay(officeEvent.documentDate, ctx.locale) }),
            },
          ],
        },
      ]} />
    )}>
      <WorkColumn decision={decision}>
        <div className={css.eyebrowLine}>
          <AtlasPill status={status} word={atlasWord(t, status)} />
          {eyebrowText !== null && <span>{eyebrowText}</span>}
        </div>
        <KeyFact value={formatDate(deadline.due, ctx.locale, 'long')} detail={dueText(ctx, deadline.due)} />
        <div className={css.ruleLine}>
          {rule.full}
          {rule.period !== null && officeEvent.documentDate !== null
            && <span>{` · ${t(rule.period, { date: formatDay(officeEvent.documentDate, ctx.locale) })}`}</span>}
        </div>

        <section className={css.section}>
          <h2 className={css.subHeading}>{t('deadline.computed')}</h2>
          <ol className={css.steps} ref={steps} tabIndex={-1} aria-label={t('deadline.computed')}>
            {deadline.trace.map((step, index) => (
              <li key={`${index}:${step.op}`} className={css.step}>
                <span className={css.dot} aria-hidden="true" />
                <div>
                  <div className={css.what}>
                    {step.op === 'closure-roll' && step.from === step.to ? t('deadline.step.openDay') : t(STEPS[step.op] ?? 'deadline.step.other')}
                  </div>
                  <div className={css.law}>{step.cite.split('; ').join(' · ')}</div>
                </div>
                <div className={css.to}>{'→ '}<b>{WEEKDAY_STEPS.has(step.op) ? formatDate(step.to, ctx.locale) : formatDay(step.to, ctx.locale)}</b></div>
              </li>
            ))}
          </ol>
          {deadline.notes.map((note, index) => (
            <div key={`${index}:${note.kind}`} className={css.note}>
              <IconInfoOutlineRegular size={16} />
              <span>{note.kind === 'late-receipt' ? t('deadline.note.lateReceipt') : note.text}</span>
            </div>
          ))}
        </section>

        <section className={css.section}>
          <h2 className={css.subHeading}>{t('deadline.read')}<span className={css.subHint}>{`· ${t('deadline.readHint')}`}</span></h2>
          {reading === 'none'
            ? <p className={css.subHint}>{t('deadline.noReading')}</p>
            : <Readings ctx={ctx} readers={readers} />}
        </section>

        {deadline.sources.length > 0 && (
          <section className={css.section}>
            <h2 className={css.subHeading}>{t('deadline.sources')}</h2>
            <div className={css.lawChips}>
              {deadline.sources.map((source) => {
                const href = httpsHref(source.url)
                return href === null
                  ? <span key={source.cite} className={css.lawChip}>{source.cite}</span>
                  : <a key={source.cite} className={css.lawChip} href={href} target="_blank" rel="noopener noreferrer">{source.cite}</a>
              })}
            </div>
          </section>
        )}
        <RecordActivity ctx={ctx} events={data.activity} />
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
 * Render the two readings side by side: each value from the text with its span, from the page image, and whether
 * they agree.
 * @param props.ctx - the screen context.
 * @param props.readers - the readings.
 * @returns the comparison table.
 */
function Readings({ ctx, readers }: { ctx: ScreenContext; readers: DeadlineDetail['readers'] }) {
  const { t } = ctx
  const shown = (row: (typeof READ_ROWS)[number], result: Reading | null): string | null => {
    if (result === null) return null
    switch (row.value) {
      case 'code': return result.code === null ? null : ruleWords(t, result.code).short
      case 'documentDate': return result.documentDate === null ? null : formatDate(result.documentDate, ctx.locale)
      case 'applicationNumber': return result.applicationNumber
    }
  }
  return (
    <div className={css.compare} role="table" aria-label={t('deadline.read')}>
      <div role="row" className={css.compareRow}>
        <span role="columnheader" className={css.compareHead} />
        <span role="columnheader" className={css.compareHead}>{t('deadline.fromText')}</span>
        <span role="columnheader" className={css.compareHead}>{t('deadline.fromImage')}</span>
        <span role="columnheader" className={css.compareHead} />
      </div>
      {READ_ROWS.map((row) => {
        const text = shown(row, readers.code?.result ?? null)
        const image = shown(row, readers.model?.result ?? null)
        const field: FieldValue | undefined = row.field === null ? undefined : readers.code?.fields[row.field]
        const agree = text !== null && image !== null && text === image
        return (
          <div key={row.value} role="row" className={css.compareRow}>
            <span role="rowheader" className={css.compareKey}>{t(row.label)}</span>
            <span role="cell" className={css.compareValue}>
              {text ?? t('deadline.notRead')}
              {field !== undefined && <EvidenceQuote span={field.span} labels={quoteLabels(ctx, field.span.page)} />}
            </span>
            <span role="cell" className={css.compareValue}>{image ?? t('deadline.notRead')}</span>
            <span role="cell" className={css.agree}>
              {text === null || image === null
                ? null
                : agree
                  ? <><IconCheckOutlineRegular size={16} />{t('deadline.agree')}</>
                  : <><IconWarningTriangleOutlineRegular size={16} />{t('deadline.differ')}</>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
