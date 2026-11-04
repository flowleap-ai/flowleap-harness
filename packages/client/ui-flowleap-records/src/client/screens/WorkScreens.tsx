/**
 * The work on a letter (mockup e-letter-work). The work page shows the letter's work: the client
 * report with its file row and the statement table, each statement with its exact spans in the letter, the related
 * deadline and reply, and Activity. The docked decision bar has two parts, the client report (Accept or Reject with
 * a reason) and the deadline check, and Record decision sends both with the record position that the person saw.
 * A statement with no span blocks Accept and Record decision (R14); another person's decision shows who decides and
 * has no primary act; a decided work item has no bar, and Activity shows the decision. The work board is in
 * `BoardScreen.tsx`.
 */

import { useState, type ReactNode } from 'react'
import {
  AvatarStack, Checkbox, IconAlarmClockOutlineRegular, IconCheckOutlineRegular, IconChevronRightOutlineRegular,
  IconCloseOutlineRegular, IconDeliverDocRegular, IconEditOutlineRegular, IconInspectOutlineRegular, IconShieldOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  createAct, type Act, type CheckedDeadlineState, type DeadlineCheck, type DeadlineId, type ProposalId, type ReportDecision,
  type TicketDetail,
  type TicketsList, type WorkRefusal,
} from '../api.ts'
import type { DeadlineState } from '../atlas.ts'
import { formatDate, intlLocale } from '../format.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import { commandId } from '../keys.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import type { Load } from '../load.ts'
import { shownData } from '../load.ts'
import { ActButton, type ActSpec } from '../parts/Act.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote, MissingEvidence, StatementRow, StatementTable } from '../parts/Evidence.tsx'
import { WorkColumn } from '../parts/Layout.tsx'
import { LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { dueText, letterTitle, listTimeText } from '../words.ts'
import { AgentRun } from './AgentRun.tsx'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { Cell, DetailRow, DetailTable, OpenCell, formatDay, openDocument, Who } from './detail.tsx'
import { LoadError, quoteLabels, RecordActivity } from './shared.tsx'
import detail from './Detail.module.css'

/** The work that waits for a decision, in board order, and where the open work item is in it. */
export interface WorkQueue {
  readonly rows: TicketsList['rows']
  /** -1 when the open work item does not wait for a decision. */
  readonly index: number
}

/**
 * The "1 / N" of the work page: the work that waits for a decision.
 * @param queue - the board's work.
 * @param id - the open work item.
 * @returns the queue.
 */
export function workQueue(queue: Load<TicketsList>, id: string): WorkQueue {
  const rows = (shownData(queue)?.data.rows ?? []).filter(row => row.state === 'proposals_ready')
  return { rows, index: rows.findIndex(row => row.id === id) }
}

/**
 * Render the work on one letter.
 * @param props.screen - the work route with its loads.
 * @param props.ctx - the screen context.
 * @returns the decision page.
 */
export function WorkScreen({ screen, ctx }: ScreenProps<'work'>) {
  const queue = workQueue(screen.queue, screen.id)
  const step = (by: 1 | -1) => {
    const row = queue.rows[queue.index + by]
    return queue.index === -1 || row === undefined ? {} : { [by === 1 ? 'next' : 'previous']: () => { ctx.navigate({ view: 'work', id: row.id }) } }
  }
  useKeyActs(ctx, { ...step(1), ...step(-1) }, { arrows: false })
  return (
    <LoadView
      load={screen.ticket}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <WorkView key={data.ticket.id} ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * The title of a work item: its letter and the letter's date, such as "Rule 71(3) communication of 30 Oct 2026".
 * @param words - the translate function and the UI language.
 * @param words.t - the translate function.
 * @param words.locale - the UI language.
 * @param data - the work.
 * @returns the title.
 */
export function workTitle({ t, locale }: { t: ScreenContext['t']; locale: string }, data: TicketDetail): string {
  const { letter } = data
  return letter === null || letter.documentDate === null
    ? letterTitle(t, letter?.code ?? null)
    : t('work.title', { title: letterTitle(t, letter.code), date: formatDay(letter.documentDate, locale) })
}

/** A person's choice on one proposed report. */
type Choice = { readonly decision: 'approve' } | { readonly decision: 'reject'; readonly reason: string }

const CHECKED: ReadonlySet<DeadlineState> = new Set<CheckedDeadlineState>(['deadline_proposed', 'active', 'rejected', 'engine_refused'])

/**
 * Whether a deadline state is one that a decision can record as checked.
 * @param state - the deadline state.
 * @returns true for a checked state.
 */
function isChecked(state: DeadlineState): state is CheckedDeadlineState {
  return CHECKED.has(state)
}

/** Why another person decides, by the refusal of the work's decide command. */
const DECIDERS: Readonly<Record<WorkRefusal, FlowleapRecordsKey>> = {
  'not-routed-person': 'work.decider.notRoutedPerson',
  'not-ready': 'work.decider.notReady',
  'decided': 'work.decider.decided',
}

/** The office events whose lede the views word. */
const LEDES: Readonly<Record<string, FlowleapRecordsKey>> = { 'EPO:R71(3)': 'work.lede.r71' }

/**
 * Render the work: the header, the client report, the related records, Activity and the decision bar.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the decision page.
 */
function WorkView({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const [choices, setChoices] = useState<Readonly<Record<string, Choice>>>({})
  const [rejecting, setRejecting] = useState<ProposalId | null>(null)
  const [checked, setChecked] = useState(false)
  const [failed, setFailed] = useState<Act | null>(null)
  const { ticket, letter, deadline, mayDecide } = data
  const status = { machine: 'ticket', state: ticket.state } as const
  const title = workTitle(ctx, data)
  const proposed = data.reports.filter(report => report.state === 'proposed')
  const deciding = ticket.state === 'proposals_ready' && proposed.length > 0
  const missingOf = (report: TicketDetail['reports'][number]) => report.statements
    .map((statement, index) => ({ number: index + 1, missing: statement.evidence.every(evidence => evidence.span === null) }))
    .filter(row => row.missing)
  const firstMissing = proposed.flatMap(report => choices[report.proposalId]?.decision === 'reject' ? [] : missingOf(report))[0]
  const blocked = firstMissing === undefined ? null : t('decision.statementMissing', { number: firstMissing.number })
  const check: DeadlineCheck | null = deadline === null
    ? { id: 'none-yet', state: 'none-yet', seq: data.recordSeq }
    : isChecked(deadline.state) ? { id: deadline.id, state: deadline.state, seq: data.recordSeq } : null

  const choose = (proposalId: ProposalId, choice: Choice) => { setChoices(current => ({ ...current, [proposalId]: choice })) }
  const firstOpen = proposed.find(report => choices[report.proposalId] === undefined) ?? proposed[0]
  const accept = (report: TicketDetail['reports'][number]) => {
    if (missingOf(report).length === 0) choose(report.proposalId, { decision: 'approve' })
  }
  const reject = (report: TicketDetail['reports'][number]) => { setRejecting(report.proposalId) }
  const reports: ReportDecision[] = proposed.flatMap((report) => {
    const choice = choices[report.proposalId]
    if (choice === undefined) return []
    return [choice.decision === 'approve'
      ? { proposalId: report.proposalId, decision: 'approve' }
      : { proposalId: report.proposalId, decision: 'reject', reason: choice.reason }]
  })
  const ready = reports.length === proposed.length && checked && check !== null
  const record = () => {
    if (!ready || blocked !== null) return
    const act = failed ?? createAct({ kind: 'ticket.decide', id: ticket.id, reports, deadlineCheck: check })
    void ctx.perform([act]).then((result) => { setFailed(result.failed.length === 0 ? null : act) })
  }
  const goMatter = () => { ctx.navigate({ view: 'matter', fileNumber: data.matter.fileNumber }) }
  const calculation = deadline === null ? null : () => { ctx.navigate({ view: 'deadline', id: deadline.id }) }
  const openLetter = letter === null ? null : () => { openDocument(ctx, letter.document) }
  const report = data.reports[0]
  const preview = report === undefined ? null : () => { openDocument(ctx, report.document) }
  const openInWord = report === undefined ? null : () => {
    window.open(`ms-word:ofe|u|${new URL(ctx.contentHref(report.document), window.location.href).href}`, '_self')
  }
  const allowed = deciding && mayDecide.allowed
  const keyed = allowed && firstOpen !== undefined ? firstOpen : null
  useKeyActs(ctx, {
    goMatter,
    ...(calculation === null ? {} : { calculation }),
    ...(openLetter === null ? {} : { openLetter }),
    ...(preview === null ? {} : { preview }),
    ...(keyed === null ? {} : { accept: () => { accept(keyed) }, reject: () => { reject(keyed) }, record }),
  }, { arrows: false })

  const calculationOverflow = deadline === null ? [] : [calculationAct(ctx, deadline.id)]
  const wordAct: ActSpec | null = openInWord === null
    ? null
    : { id: 'open-in-word', label: t('work.openInWord'), keycaps: [], icon: <IconEditOutlineRegular size={16} />, run: openInWord }
  const previewAct = preview === null ? null : actOf(ctx, 'preview', t('work.preview'), preview, { icon: <IconInspectOutlineRegular size={16} /> })
  const recordAct = actOf(ctx, 'record', t('work.recordDecision'), record, { icon: <IconCheckOutlineRegular size={16} />, disabled: !ready })

  useCommandItem(ctx, {
    label: `${data.matter.fileNumber} · ${title}`,
    groups: [
      ...(keyed === null
        ? []
        : [{
          id: 'decision', label: t('deadline.group.decision'), acts: [
            { id: 'accept', label: t('work.accept'), commandId: commandId('accept'), disabled: missingOf(keyed).length > 0, run: () => { accept(keyed) } },
            { id: 'reject', label: t('act.rejectStep'), commandId: commandId('reject'), run: () => { reject(keyed) } },
            { id: 'record', label: t('work.recordDecision'), commandId: commandId('record'), disabled: !ready || blocked !== null, run: record },
          ],
        }]),
      {
        id: 'work', label: t('matter.col.work'), acts: [
          ...(preview === null ? [] : [{ id: 'preview', label: t('work.preview'), commandId: commandId('preview'), run: preview }]),
          ...(openInWord === null ? [] : [{ id: 'open-in-word', label: t('work.openInWord'), run: openInWord }]),
          ...(calculation === null ? [] : [{ id: 'calculation', label: t('deadline.calculation'), commandId: commandId('calculation'), run: calculation }]),
          ...(openLetter === null ? [] : [{ id: 'open-letter', label: t('deadline.openLetter'), commandId: commandId('openLetter'), run: openLetter }]),
          { id: 'go-matter', label: t('deadline.goMatter', { matter: data.matter.fileNumber }), commandId: commandId('goMatter'), run: goMatter },
        ],
      },
    ],
  })

  const rejectingReport = proposed.find(item => item.proposalId === rejecting)
  const decision = !deciding || ctx.me === null
    ? null
    : (
      <DecisionBar
        person={ctx.me.person}
        question={t(proposed.length + 1 === 2 ? 'work.partsTwo' : 'work.partsMany', { count: proposed.length + 1 })}
        why={mayDecide.allowed
          ? mayDecide.as === 'responsible' ? t('work.whyResponsible') : t('work.whyDeputy', { person: data.responsible?.name ?? '' })
          : undefined}
        labels={{ yours: t('decision.yours'), more: t('decision.more') }}
        decider={mayDecide.allowed ? null : t(mayDecide.decider === null ? 'work.decider.nobody' : DECIDERS[mayDecide.reason], { person: mayDecide.decider?.name ?? '' })}
        blocked={blocked}
        note={failed === null ? t('work.note') : t('work.failed')}
        parts={(
          <>
            {proposed.map((item) => {
              const missing = missingOf(item)
              const firstOfReport = missing[0]
              const choice = choices[item.proposalId]
              const sourced = item.statements.length - missing.length
              return (
                <DecisionPart
                  key={item.proposalId}
                  icon={<IconDeliverDocRegular size={16} />}
                  title={t('work.clientReport')}
                  missing={firstOfReport !== undefined && choice?.decision !== 'reject' ? t('decision.statementMissing', { number: firstOfReport.number }) : null}
                  detail={choice?.decision === 'reject'
                    ? t('work.rejected', { reason: choice.reason })
                    : (
                      <>
                        <IconCheckOutlineRegular size={16} />
                        <span>
                          {t('work.sourced', { count: sourced, total: item.statements.length })}
                          {choice === undefined && mayDecide.allowed ? ` · ${t('work.choose')}` : ''}
                        </span>
                      </>
                    )}
                  control={mayDecide.allowed && (
                    <span className={detail.segment} role="group" aria-label={t('work.clientReport')}>
                      <ActButton
                        act={actOf(ctx, 'accept', t('work.accept'), () => { accept(item) }, { icon: <IconCheckOutlineRegular size={16} />, disabled: missing.length > 0 })}
                        rank="tertiary"
                        className={choice?.decision === 'approve' ? detail.on : undefined}
                      />
                      <ActButton
                        act={actOf(ctx, 'reject', t('act.rejectStep'), () => { reject(item) }, { icon: <IconCloseOutlineRegular size={16} /> })}
                        rank="tertiary"
                        className={choice?.decision === 'reject' ? detail.on : undefined}
                      />
                    </span>
                  )}
                />
              )
            })}
            <DeadlinePart ctx={ctx} data={data} checked={checked} onCheck={setChecked} disabled={!mayDecide.allowed} />
          </>
        )}
        negative={rejectingReport === undefined
          ? undefined
          : {
            ...keyedOf(ctx, 'reject'),
            label: t('act.rejectStep'),
            open: true,
            onOpenChange: () => { setRejecting(null) },
            reasonLabel: t('work.reason'),
            confirmLabel: t('act.reject'),
            cancelLabel: t('act.cancel'),
            onConfirm: (reason) => {
              choose(rejectingReport.proposalId, { decision: 'reject', reason })
              setRejecting(null)
            },
          }}
        overflow={[...calculationOverflow, wordAct].filter((item): item is ActSpec => item !== null)}
        primary={recordAct}
      />
    )

  return (
    <div className={detail.withDock} data-dock={ctx.agent.view}>
      <div className={detail.workArea}>
        <WorkColumn decision={decision}>
          <div className={detail.eyebrowLine}>
            <AtlasPill status={status} word={atlasWord(t, status)} />
            <WaitsText ctx={ctx} data={data} />
          </div>
          <h1 className={detail.pageTitle}>{title}</h1>
          <p className={detail.lede}>{lede(ctx, data)}</p>
          <div className={detail.people}>
            {data.responsible !== null && <><span className={detail.peopleKey}>{t('work.responsible')}</span><Who person={data.responsible} /></>}
            <span className={detail.peopleKey}>{t('prop.team')}</span>
            <AvatarStack people={data.team} />
            <span className={detail.wall}><IconShieldOutlineRegular size={16} />{t('work.wall', { matter: data.matter.fileNumber })}</span>
          </div>
          {data.reports.map(item => (
            <section key={item.proposalId} className={detail.section}>
              <div className={detail.sectionHead}>
                <h2 className={detail.subHeading}>{t('work.clientReport')}</h2>
                <AtlasStatus status={{ machine: 'report', state: item.state }} word={atlasWord(t, { machine: 'report', state: item.state })} />
                <div className={detail.sectionActs}>
                  {wordAct !== null && <ActButton act={wordAct} rank="tertiary" className={detail.wideOnly} />}
                  {previewAct !== null && <ActButton act={previewAct} rank="secondary" />}
                </div>
              </div>
              <div className={detail.file}>
                <span className={detail.fileIcon}><IconDeliverDocRegular size={16} /></span>
                <div>
                  <div className={detail.fileTitle}>{t('work.reportOn', { title: letterTitle(t, letter?.code ?? null) })}</div>
                  <div className={detail.fileMeta}>{fileFacts(ctx, item).join(' · ')}</div>
                </div>
              </div>
              <StatementTable headers={{ number: t('statement.number'), says: t('statement.says'), source: t('statement.source') }}>
                {item.statements.map((statement, index) => {
                  const spans = statement.evidence.flatMap(evidence => evidence.span === null ? [] : [evidence.span])
                  return (
                    <StatementRow key={index} number={index + 1} text={statement.text} missing={spans.length === 0}>
                      {spans.length === 0
                        ? (
                          <MissingEvidence
                            labels={{ title: t('evidence.missing'), why: t('evidence.missingWhy'), find: t('evidence.find'), remove: t('evidence.remove') }}
                            onFind={() => { openLetter?.() }}
                            onRemove={() => { if (allowed) reject(item) }}
                          />
                        )
                        : spans.map(span => <EvidenceQuote key={`${span.page}:${span.start}`} span={span} labels={quoteLabels(ctx, span.page)} />)}
                    </StatementRow>
                  )
                })}
              </StatementTable>
            </section>
          ))}
          <Related ctx={ctx} data={data} />
          <RecordActivity ctx={ctx} events={data.activity} />
        </WorkColumn>
      </div>
      <AgentRun ctx={ctx} data={data} />
    </div>
  )
}

/**
 * The Calculation act of a work item's deadline: it opens the deadline page with its calculation.
 * @param ctx - the screen context.
 * @param id - the deadline.
 * @returns the act.
 */
function calculationAct(ctx: ScreenContext, id: DeadlineId): ActSpec {
  return actOf(ctx, 'calculation', ctx.t('deadline.calculation'), () => { ctx.navigate({ view: 'deadline', id }) }, {
    icon: <IconAlarmClockOutlineRegular size={16} />,
  })
}

/**
 * The line after the eyebrow pill: who the work waits for, or who decided it.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the line, or nothing.
 */
function WaitsText({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const { ticket, mayDecide } = data
  if (ticket.state === 'decided' && ticket.decidedBy !== null) {
    return <span>{t('work.decidedBy', { person: ticket.decidedBy.name, time: ticket.decidedAt === null ? '' : listTimeText(ctx, ticket.decidedAt) })}</span>
  }
  if (ticket.state !== 'proposals_ready') return null
  return mayDecide.allowed
    ? <span>{t('work.waitsYou', { time: listTimeText(ctx, ticket.since) })}</span>
    : <span>{t('work.waitsFor', { person: ticket.routedTo?.name ?? '' })}</span>
}

/**
 * The lede: what the letter is, whether the agent drafted the report, and whether anything went to the client.
 * @param ctx - the screen context.
 * @param data - the work.
 * @returns the lede.
 */
function lede(ctx: ScreenContext, data: TicketDetail): string {
  const { t } = ctx
  const application = data.letter?.applicationNumber ?? data.matter.fileNumber
  const key = data.letter === null || data.letter.code === null ? undefined : LEDES[data.letter.code]
  const sent = data.reports.some(report => report.state === 'sent')
  return [
    t(key ?? 'work.lede.letter', { application }),
    t(data.reports.length > 0 ? 'work.lede.drafted' : 'work.lede.noDraft'),
    t(sent ? 'work.lede.sent' : 'work.lede.notSent'),
  ].join(' ')
}

/**
 * The facts of a report's file row: the file name, the language, the template and the pages.
 * @param ctx - the screen context.
 * @param report - the report.
 * @returns the facts.
 */
function fileFacts(ctx: ScreenContext, report: TicketDetail['reports'][number]): string[] {
  /* v8 ignore next -- Intl.DisplayNames answers undefined only for a code it cannot read; the os sends ISO 639 codes. */
  const language = report.language === null ? null : new Intl.DisplayNames([intlLocale(ctx.locale)], { type: 'language' }).of(report.language) ?? null
  return [
    report.fileName,
    ...(language === null ? [] : [language]),
    ...(report.templateName === null ? [] : [report.templateName]),
    ...(report.pages === null ? [] : [ctx.t('work.pages', { count: report.pages })]),
  ]
}

/**
 * Render the deadline check part: the checkbox with the deadline, its state, its confirmer and the days left, and
 * Calculation, which opens the deadline. A deadline in a state that a decision cannot record says what to do first.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.checked - the person checked the deadline.
 * @param props.onCheck - check or uncheck it.
 * @param props.disabled - the decision is another person's.
 * @returns the part.
 */
function DeadlinePart({ ctx, data, checked, onCheck, disabled }: {
  ctx: ScreenContext
  data: TicketDetail
  checked: boolean
  onCheck: (next: boolean) => void
  disabled: boolean
}) {
  const { t } = ctx
  const { deadline } = data
  if (deadline === null) {
    return (
      <DecisionPart
        icon={<IconAlarmClockOutlineRegular size={16} />}
        title={<Checkbox checked={checked} disabled={disabled} label={t('work.checkNone')} onChange={onCheck} />}
      />
    )
  }
  const word = atlasWord(t, { machine: 'deadline', state: deadline.state })
  const facts: ReactNode = deadline.confirmer === null
    ? t('work.deadlineFacts', { state: word, due: dueText(ctx, deadline.due) })
    : t('work.deadlineFactsConfirmed', { state: word, person: deadline.confirmer.name, due: dueText(ctx, deadline.due) })
  return (
    <DecisionPart
      icon={<IconAlarmClockOutlineRegular size={16} />}
      title={(
        <Checkbox
          checked={checked}
          disabled={disabled || !isChecked(deadline.state)}
          label={t('work.checkDeadline', { date: formatDate(deadline.due, ctx.locale) })}
          onChange={onCheck}
        />
      )}
      missing={isChecked(deadline.state) ? null : t('work.deadlineFirst', { state: word })}
      detail={facts}
      control={<ActButton act={calculationAct(ctx, deadline.id)} rank="tertiary" className={detail.wideOnly} />}
    />
  )
}

/**
 * The recipients of a reply by display name. An address that belongs to no person is a sign-in address, which shows
 * only in Audit, so it counts as "other addresses".
 * @param ctx - the screen context.
 * @param to - the recipients.
 * @returns the names.
 */
function recipients(ctx: ScreenContext, to: NonNullable<TicketDetail['reply']>['to']): string {
  const names = to.flatMap(person => person.id === null ? [] : [person.name])
  const others = to.length - names.length
  return [...names, ...(others === 0 ? [] : [ctx.t(others === 1 ? 'work.address' : 'work.addresses', { count: others })])].join(', ')
}

/**
 * Render the records related to the work: its deadline and its reply, each with its status and word.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the section, or nothing when the work has neither.
 */
function Related({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const { deadline, reply } = data
  const count = (deadline === null ? 0 : 1) + (reply === null ? 0 : 1)
  if (count === 0) return null
  return (
    <section className={detail.section}>
      <div className={detail.sectionHead}>
        <h2 className={detail.subHeading}>{t('work.related')}</h2>
        <span className={detail.subHint}>{count}</span>
      </div>
      <DetailTable label={t('work.related')} columns="136px 176px minmax(0, 1fr) auto 16px" narrowColumns="112px minmax(0, 1fr) auto" header={null}>
        {deadline !== null && (
          <DetailRow opens>
            <Cell kind="status"><AtlasStatus status={{ machine: 'deadline', state: deadline.state }} word={atlasWord(t, { machine: 'deadline', state: deadline.state })} /></Cell>
            <OpenCell onOpen={() => { ctx.navigate({ view: 'deadline', id: deadline.id }) }}>
              <span className={detail.strong}>{t('crumb.deadline', { date: formatDay(deadline.due, ctx.locale) })}</span>
            </OpenCell>
            <Cell kind="meta" wide>{deadline.confirmer === null ? '' : t('deadline.confirmedBy', { person: deadline.confirmer.name })}</Cell>
            <Cell kind="end">{dueText(ctx, deadline.due)}</Cell>
            <Cell kind="icon" wide><IconChevronRightOutlineRegular size={16} /></Cell>
          </DetailRow>
        )}
        {reply !== null && (
          <DetailRow>
            <Cell kind="status"><AtlasStatus status={{ machine: 'outbox', state: reply.state }} word={atlasWord(t, { machine: 'outbox', state: reply.state })} /></Cell>
            <Cell kind="main">{t('work.replyTo', { people: recipients(ctx, reply.to) })}</Cell>
            <Cell kind="meta" wide>{t('work.replyFrom')}</Cell>
            <Cell kind="end" />
            <Cell kind="icon" wide />
          </DetailRow>
        )}
      </DetailTable>
    </section>
  )
}
