/**
 * The work on a letter (mockup e-letter-work). The work page shows the letter's work: the client
 * report with its file row and the statement table, each statement with its exact spans in the letter, the agent's
 * reading of the letter with each objection and its quotes, the related deadline and reply, and Activity. The docked
 * decision bar has one part for each proposed report and each proposed reading (Accept or Reject with a reason) and the
 * deadline check, and Record decision sends them all with the deadline and the record position that the person saw when
 * they ticked the check.
 * A statement with no span blocks Accept and Record decision (R14); another person's decision shows who decides and
 * has no primary act; a decided work item has no bar, and Activity shows the decision. The work board is in
 * `BoardScreen.tsx`.
 */

import { useState, type ReactNode } from 'react'
import {
  AvatarStack, Button, Checkbox, IconAgentPresetOutlineRegular, IconAlarmClockOutlineRegular, IconCheckOutlineRegular,
  IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconDeliverDocRegular, IconEditOutlineRegular, IconInspectOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useActRunner } from '../act-runner.ts'
import type {
  CheckedDeadlineState, DeadlineCheck, DeadlineId, DocumentId, LetterReading, ReadingDecision, ReportDecision, TicketDetail, TicketsList,
  WorkDraft, WorkRefusal,
} from '../api.ts'
import type { DeadlineState } from '../atlas.ts'
import { formatApplicationNumber, formatDate, intlLocale, languageName } from '../format.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import { commandId } from '../keys.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import type { Load } from '../load.ts'
import { shownData } from '../load.ts'
import { ActButton, type ActSpec } from '../parts/Act.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote, MissingEvidence, StatementRow, StatementTable } from '../parts/Evidence.tsx'
import { DueText, dueSentence } from '../parts/Due.tsx'
import { PropertiesPanel, Section, WorkColumn } from '../parts/Layout.tsx'
import { LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { avatarOf, DRAFT_KINDS, draftWords, letterTitle, listTimeText, officeOfCode, personInText, personName, toOffice } from '../words.ts'
import { AgentRun } from './AgentRun.tsx'
import { LetterViewer, useLetterPane, type LetterPane, type ShownLetter } from './LetterViewer.tsx'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { Cell, DetailRow, DetailTable, OpenCell, formatDay, matterRows, openDocument, responsibleRow, Who } from './detail.tsx'
import { decisionHeading, failureNotice, LoadError, quoteLabels, RecordActivity } from './shared.tsx'
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
        failed: (at, error) => <LoadError ctx={ctx} at={at} error={error} />,
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

/** A person's choice on one proposed report or reading. */
type Choice = { readonly decision: 'approve' } | { readonly decision: 'reject'; readonly reason: string }

/** One part of the decision that the person accepts or rejects: a proposed report or a proposed reading of the letter. */
type Part =
  | { readonly kind: 'report'; readonly key: string; readonly report: WorkDraft }
  | { readonly kind: 'reading'; readonly key: string; readonly reading: LetterReading }

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
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [ticked, setTicked] = useState<DeadlineCheck | null>(null)
  const runner = useActRunner(ctx.perform)
  const pane = useLetterPane()
  const busy = runner.run.phase === 'running'
  const { ticket, letter, deadline, mayDecide } = data
  const status = { machine: 'ticket', state: ticket.state } as const
  const title = workTitle(ctx, data)
  const proposed = data.reports.filter(report => report.state === 'proposed').toSorted((a, b) => DRAFT_KINDS.indexOf(a.kind) - DRAFT_KINDS.indexOf(b.kind))
  const parts: readonly Part[] = [
    ...proposed.map(report => ({ kind: 'report', key: `report:${report.proposalId}`, report }) as const),
    ...data.readings.filter(reading => reading.state === 'proposed').map(reading => ({ kind: 'reading', key: `reading:${reading.readingId}`, reading }) as const),
  ]
  const deciding = ticket.state === 'proposals_ready' && parts.length > 0
  const missingOf = (part: Part) => part.kind === 'reading'
    ? []
    : part.report.statements
      .map((statement, index) => ({ number: index + 1, missing: statement.evidence.every(evidence => evidence.span === null) }))
      .filter(row => row.missing)
  const firstMissing = parts.flatMap(part => choices[part.key]?.decision === 'reject' ? [] : missingOf(part))[0]
  const blocked = firstMissing === undefined ? null : t('decision.statementMissing', { number: firstMissing.number })
  const check: DeadlineCheck | null = deadline === null
    ? { id: 'none-yet', state: 'none-yet', seq: data.recordSeq }
    : isChecked(deadline.state) ? { id: deadline.id, state: deadline.state, seq: data.recordSeq } : null
  // The tick holds the deadline as the person saw it; a refresh that shows another deadline or state clears it.
  const stale = ticked !== null && (check === null || check.id !== ticked.id || check.state !== ticked.state)
  if (stale) setTicked(null)
  const checked = stale ? null : ticked

  // A changed decision is a new act: its failure no longer applies.
  const choose = (key: string, choice: Choice) => {
    setChoices(current => ({ ...current, [key]: choice }))
    runner.clear()
  }
  const setChecked = (next: boolean) => {
    setTicked(next ? check : null)
    runner.clear()
  }
  const firstOpen = parts.find(part => choices[part.key] === undefined) ?? parts[0]
  const accept = (part: Part) => {
    if (missingOf(part).length === 0) choose(part.key, { decision: 'approve' })
  }
  const reject = (key: string) => { setRejecting(key) }
  const reports: ReportDecision[] = []
  const readings: ReadingDecision[] = []
  for (const part of parts) {
    const choice = choices[part.key]
    if (choice === undefined) continue
    const reason = choice.decision === 'reject' ? { reason: choice.reason } : {}
    if (part.kind === 'report') reports.push({ proposalId: part.report.proposalId, decision: choice.decision, ...reason })
    else readings.push({ readingId: part.reading.readingId, decision: choice.decision === 'approve' ? 'accept' : 'reject', ...reason })
  }
  const ready = reports.length + readings.length === parts.length && checked !== null
  const record = () => {
    if (!ready || blocked !== null) return
    void runner.submit([{ kind: 'ticket.decide', id: ticket.id, reports, readings, deadlineCheck: checked }])
  }
  const goMatter = () => { ctx.navigate({ view: 'matter', fileNumber: data.matter.fileNumber }) }
  const calculation = deadline === null ? null : () => { ctx.navigate({ view: 'deadline', id: deadline.id }) }
  const openLetter = letter === null ? null : () => { pane.show(shownLetter(ctx, data, letter.document), { kind: 'page', page: 1 }) }
  // The draft reply comes before the client report (mockup 4-review-work); Space previews the first one shown.
  const drafts = [data.draftReply, data.clientReport].flatMap(draft => draft === null ? [] : [draft])
  const report = drafts[0]
  const preview = report === undefined ? null : () => { openDocument(ctx, report.document) }
  const openInWord = report === undefined ? null : () => { openWord(ctx, report) }
  const allowed = deciding && mayDecide.allowed
  const keyed = allowed && firstOpen !== undefined ? firstOpen : null
  useKeyActs(ctx, {
    goMatter,
    ...(calculation === null ? {} : { calculation }),
    ...(openLetter === null ? {} : { openLetter }),
    ...(preview === null ? {} : { preview }),
    ...(keyed === null ? {} : { accept: () => { accept(keyed) }, reject: () => { reject(keyed.key) }, record }),
    ...(runner.run.phase === 'failed' ? { retry: record } : {}),
  }, { arrows: false, failed: runner.run.phase === 'failed' })

  const calculationOverflow = deadline === null ? [] : [calculationAct(ctx, deadline.id)]
  const wordAct = (draft: WorkDraft): ActSpec => ({
    id: 'open-in-word', label: t('work.openInWord'), keycaps: [], icon: <IconEditOutlineRegular size={16} />, run: () => { openWord(ctx, draft) },
  })
  const previewAct = (draft: WorkDraft): ActSpec => {
    const act = actOf(ctx, 'preview', t('work.preview'), () => { openDocument(ctx, draft.document) }, { icon: <IconInspectOutlineRegular size={16} /> })
    return draft === report ? act : { ...act, keycaps: [] }
  }
  const recordAct = { ...actOf(ctx, 'record', t('work.recordDecision'), record, { icon: <IconCheckOutlineRegular size={16} />, disabled: !ready }), busy }

  useCommandItem(ctx, {
    label: `${data.matter.fileNumber} · ${title}`,
    groups: [
      ...(keyed === null
        ? []
        : [{
          id: 'decision', label: t('deadline.group.decision'), acts: [
            { id: 'accept', label: t('work.accept'), commandId: commandId('accept'), disabled: missingOf(keyed).length > 0, run: () => { accept(keyed) } },
            { id: 'reject', label: t('act.rejectStep'), commandId: commandId('reject'), run: () => { reject(keyed.key) } },
            { id: 'record', label: t('work.recordDecision'), commandId: commandId('record'), disabled: !ready || blocked !== null || busy, run: record },
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

  const rejectingPart = parts.find(part => part.key === rejecting)
  const partTitle = (part: Part) => part.kind === 'report' ? draftWords(t, data.letter?.code ?? null, part.report.kind).heading : t('work.reading.heading')
  const decision = !deciding || ctx.me === null
    ? null
    : (
      <DecisionBar
        heading={decisionHeading(ctx, ctx.me.person, mayDecide)}
        question={t(parts.length + 1 === 2 ? 'work.partsTwo' : 'work.partsMany', { count: parts.length + 1 })}
        why={mayDecide.allowed
          ? mayDecide.as === 'responsible' ? t('work.whyResponsible') : t('work.whyDeputy', { person: data.responsible === null ? '' : personInText(t, data.responsible) })
          : undefined}
        labels={{ more: t('decision.more') }}
        decider={mayDecide.allowed ? null : t(mayDecide.decider === null ? 'work.decider.nobody' : DECIDERS[mayDecide.reason], { person: mayDecide.decider === null ? '' : personName(t, mayDecide.decider) })}
        blocked={blocked}
        note={t('work.note')}
        failure={failureNotice(ctx, runner.run, record)}
        parts={(
          <>
            {parts.map((item) => {
              const missing = missingOf(item)
              const firstOfReport = missing[0]
              const choice = choices[item.key]
              // The keys 1 and 2 act on the first open part only, so only that part shows them.
              const keys = item === keyed ? {} : { keycaps: [] }
              return (
                <DecisionPart
                  key={item.key}
                  icon={item.kind === 'report' ? <IconDeliverDocRegular size={16} /> : <IconInspectOutlineRegular size={16} />}
                  title={partTitle(item)}
                  missing={firstOfReport !== undefined && choice?.decision !== 'reject' ? t('decision.statementMissing', { number: firstOfReport.number }) : null}
                  detail={choice?.decision === 'reject'
                    ? t('work.rejected', { reason: choice.reason })
                    : (
                      <>
                        <IconCheckOutlineRegular size={16} />
                        <span>
                          {choice?.decision === 'approve'
                            ? <strong className={detail.accepted}>{t('work.acceptedPart')}</strong>
                            : null}
                          {item.kind === 'report'
                            ? t('work.sourced', { count: item.report.statements.length - missing.length, total: item.report.statements.length })
                            : objectionCount(ctx, item.reading)}
                        </span>
                      </>
                    )}
                  hint={choice === undefined && mayDecide.allowed ? t('work.choose') : undefined}
                  control={mayDecide.allowed && (
                    <span className={detail.segment} data-fdl-part="seg" role="group" aria-label={partTitle(item)}>
                      <ActButton
                        act={{ ...actOf(ctx, 'accept', t('work.accept'), () => { accept(item) }, { icon: <IconCheckOutlineRegular size={16} />, disabled: missing.length > 0 }), ...keys }}
                        rank="tertiary"
                        className={choice?.decision === 'approve' ? detail.onAccept : undefined}
                      />
                      <ActButton
                        act={{ ...actOf(ctx, 'reject', t('act.rejectStep'), () => { reject(item.key) }, { icon: <IconCloseOutlineRegular size={16} /> }), ...keys }}
                        rank="tertiary"
                        className={choice?.decision === 'reject' ? detail.on : undefined}
                      />
                    </span>
                  )}
                />
              )
            })}
            <DeadlinePart ctx={ctx} data={data} checked={checked !== null} onCheck={setChecked} disabled={!mayDecide.allowed} />
          </>
        )}
        negative={rejectingPart === undefined
          ? undefined
          : {
            ...keyedOf(ctx, 'reject'),
            label: t('act.rejectStep'),
            open: true,
            onOpenChange: () => { setRejecting(null) },
            reasonLabel: t(rejectingPart.kind === 'report' ? 'work.reason' : 'work.reading.reason'),
            confirmLabel: t('act.reject'),
            cancelLabel: t('act.cancel'),
            onConfirm: (reason) => {
              choose(rejectingPart.key, { decision: 'reject', reason })
              setRejecting(null)
            },
          }}
        overflow={[...calculationOverflow, ...report === undefined ? [] : [wordAct(report)]]}
        primary={recordAct}
      />
    )

  // The properties panel holds the right column (mockup 4-review-work); Drafted by opens the agent panel in its place.
  const agentShown = ctx.agent.view === 'docked' || ctx.agent.view === 'full'
  return (
    <div className={detail.withDock} data-dock={agentShown ? ctx.agent.view : 'docked'} data-letter={pane.shown !== null || undefined}>
      <div className={detail.workArea}>
        <WorkColumn decision={decision}>
          <div className={detail.eyebrowLine}>
            <AtlasPill status={status} word={atlasWord(t, status)} />
            <WaitsText ctx={ctx} data={data} />
          </div>
          <h1 className={detail.pageTitle}>{title}</h1>
          <p className={detail.lede}>{lede(ctx, data)}</p>
          <DeadlineSection ctx={ctx} data={data} />
          <ReadingSection ctx={ctx} data={data} pane={pane} />
          {data.draftReply === null && (
            <Section heading={draftWords(t, letter?.code ?? null, 'office-reply').heading} count={0} empty={noReply(ctx, data)}>
              {null}
            </Section>
          )}
          {drafts.map(item => (
            <section key={item.proposalId} className={detail.section}>
              <div className={detail.sectionHead}>
                <h2 className={detail.subHeading}>{draftWords(t, data.letter?.code ?? null, item.kind).heading}</h2>
                {/* The heading names the draft, so its status needs no "Report" label (R11). */}
                <AtlasStatus status={{ machine: 'report', state: item.state }} word={atlasWord(t, { machine: 'report', state: item.state })} />
                <div className={detail.sectionActs}>
                  <ActButton act={wordAct(item)} rank="tertiary" className={detail.wideOnly} />
                  <ActButton act={previewAct(item)} rank="secondary" />
                </div>
              </div>
              <div className={detail.file} data-fdl-part="file">
                <span className={detail.fileIcon}><IconDeliverDocRegular size={16} /></span>
                <div>
                  <div className={detail.fileTitle}>{draftWords(t, data.letter?.code ?? null, item.kind).file}</div>
                  <div className={detail.fileMeta} title={item.fileName}>{fileFacts(ctx, data, item).join(' · ')}</div>
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
                            onRemove={() => { if (allowed) reject(`report:${item.proposalId}`) }}
                          />
                        )
                        : statement.evidence.flatMap(({ document, span }) => span === null ? [] : [(
                          <EvidenceQuote
                            key={`${document}:${span.page}:${span.start}`}
                            span={span}
                            labels={quoteLabels(ctx, span.page)}
                            onShow={() => { pane.show(shownLetter(ctx, data, document), { kind: 'span', span }) }}
                          />
                        )])}
                    </StatementRow>
                  )
                })}
              </StatementTable>
            </section>
          ))}
          <RecordActivity ctx={ctx} events={data.activity} />
        </WorkColumn>
      </div>
      {agentShown
        ? <AgentRun ctx={ctx} data={data} title={title} />
        : <div className={detail.workProps}><WorkProperties ctx={ctx} data={data} /></div>}
      {/* From 1366px the letter takes the right column beside the reading; below, it opens over the page. */}
      {pane.shown !== null && <LetterViewer ctx={ctx} shown={pane.shown} placement="side" card={decision !== null} onClose={pane.close} />}
    </div>
  )
}

/**
 * Render the responsible person and the team of a work item as one avatar stack in the top bar. The stack shows only
 * in a short view, where the page header hides its people line; each avatar shows its name on hover, and a hidden
 * line gives a screen reader who is responsible and who is in the team.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the stack, or nothing for a work item with no responsible person and no team.
 */
export function BarPeople({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const { responsible, team } = data
  const others = responsible === null ? team : team.filter(person => person.id !== responsible.id)
  const people = [
    ...(responsible === null ? [] : [avatarOf(t, responsible, t('work.barResponsible', { person: personName(t, responsible) }))]),
    ...others.map(person => avatarOf(t, person)),
  ]
  if (people.length === 0) return null
  const names = new Intl.ListFormat(intlLocale(ctx.locale), { type: 'conjunction' }).format(team.map(person => personName(t, person)))
  const line = responsible === null
    ? t('work.barTeam', { team: names })
    : team.length === 0
      ? t('work.barResponsible', { person: personName(t, responsible) })
      : t('work.barPeople', { responsible: personName(t, responsible), team: names })
  return (
    <span className={detail.barPeople}>
      <span className={detail.hiddenText}>{line}</span>
      <AvatarStack people={people} />
    </span>
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
    return <span>{t('work.decidedBy', { person: personInText(t, ticket.decidedBy), time: ticket.decidedAt === null ? '' : listTimeText(ctx, ticket.decidedAt) })}</span>
  }
  if (ticket.state !== 'proposals_ready') return null
  return mayDecide.allowed
    ? <span>{t('work.waitsYou', { time: listTimeText(ctx, ticket.since) })}</span>
    : <span>{t('work.waitsFor', { person: ticket.routedTo === null ? '' : personInText(t, ticket.routedTo) })}</span>
}

/**
 * The lede: what the letter is, whether the agent drafted the report, and whether anything went to the client.
 * @param ctx - the screen context.
 * @param data - the work.
 * @returns the lede.
 */
function lede(ctx: ScreenContext, data: TicketDetail): string {
  const { t } = ctx
  const number = data.letter?.applicationNumber ?? null
  const application = number === null ? data.matter.fileNumber : formatApplicationNumber(number)
  const key = data.letter === null || data.letter.code === null ? undefined : LEDES[data.letter.code]
  const sent = data.reports.some(report => report.state === 'sent')
  return [
    t(key ?? 'work.lede.letter', { application }),
    drafted(ctx, data),
    t(sent ? 'work.lede.sent' : 'work.lede.notSent'),
  ].join(' ')
}

/**
 * The lede's sentence on what the agent drafted: the reply to the office, the client report, both, or nothing.
 * @param ctx - the screen context.
 * @param data - the work.
 * @returns the sentence.
 */
function drafted(ctx: ScreenContext, data: TicketDetail): string {
  const { t } = ctx
  const office = officeOfCode(data.letter?.code ?? null)
  const to = office === null ? '' : toOffice(t, office)
  if (data.draftReply !== null) return t(data.clientReport === null ? 'work.lede.draftedReply' : 'work.lede.draftedBoth', { to })
  return t(data.clientReport === null ? 'work.lede.noDraft' : 'work.lede.drafted')
}

/**
 * The empty state of a work with no draft reply to the office: the agent has not proposed one.
 * @param ctx - the screen context.
 * @param data - the work.
 * @returns the sentence.
 */
function noReply(ctx: ScreenContext, data: TicketDetail): string {
  const office = officeOfCode(data.letter?.code ?? null)
  return office === null ? ctx.t('work.noReplyPlain') : ctx.t('work.noReply', { to: toOffice(ctx.t, office) })
}

/**
 * Open a draft in Word on the desktop through its `ms-word:` link.
 * @param ctx - the screen context.
 * @param draft - the draft.
 */
function openWord(ctx: ScreenContext, draft: WorkDraft): void {
  window.open(`ms-word:ofe|u|${new URL(ctx.contentHref(draft.document), window.location.href).href}`, '_self')
}

/**
 * The facts of a draft's file row: who the reply goes to, or the client report's own name, and its language. The file
 * name shows on hover; the template's name is the firm's file and never shows. The firm cannot count the pages of a
 * .docx reliably, so no page count shows (a difference from the mockup).
 * @param ctx - the screen context.
 * @param data - the work.
 * @param report - the draft.
 * @returns the facts.
 */
function fileFacts(ctx: ScreenContext, data: TicketDetail, report: WorkDraft): string[] {
  const { t } = ctx
  const language = report.language === null ? null : languageName(ctx.locale, report.language)
  const office = officeOfCode(data.letter?.code ?? null)
  const to = report.kind === 'office-reply'
    ? office === null ? t('work.file.toOfficePlain') : t('work.file.toOffice', { to: toOffice(t, office) })
    : draftWords(t, data.letter?.code ?? null, 'client-report').heading
  return [to, ...(language === null ? [] : [language])]
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
    ? dueSentence(ctx, 'work.deadlineFacts', { state: word }, deadline.due)
    : dueSentence(ctx, 'work.deadlineFactsConfirmed', { state: word, person: personInText(t, deadline.confirmer) }, deadline.due)
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
 * The recipients of a reply: the team members by name, then the count of the people outside the team, whom the os
 * does not name (product rule 8).
 * @param ctx - the screen context.
 * @param to - the recipients.
 * @returns the names.
 */
function recipients(ctx: ScreenContext, to: NonNullable<TicketDetail['reply']>['to']): string {
  const names = to.flatMap(person => person.id === null ? [] : [personInText(ctx.t, person)])
  const outside = to.length - names.length
  const others = outside === 0 ? [] : [outside === 1 ? ctx.t('person.outsideInText') : ctx.t('person.outsideCount', { count: outside })]
  return [...names, ...others].join(', ')
}

/**
 * The count of a reading's objections, for its decision part.
 * @param ctx - the screen context.
 * @param reading - the reading.
 * @returns the words, such as "2 objections".
 */
function objectionCount(ctx: ScreenContext, reading: LetterReading): string {
  const count = reading.items.length
  return ctx.t(count === 0 ? 'work.reading.none' : count === 1 ? 'work.reading.count.one' : 'work.reading.count', { count })
}

/**
 * The state of a reading in words: proposed, accepted by a person, rejected by a person, or replaced by a newer reading.
 * @param ctx - the screen context.
 * @param reading - the reading.
 * @returns the words.
 */
function readingState(ctx: ScreenContext, reading: LetterReading): string {
  const { t } = ctx
  const by = reading.decidedBy === null ? null : personInText(t, reading.decidedBy)
  switch (reading.state) {
    case 'proposed': return t('work.reading.proposed')
    case 'approved': return by === null ? t('work.acceptedPart') : t('work.reading.acceptedBy', { person: by })
    case 'rejected': return by === null ? t('work.reading.rejected') : t('work.reading.rejectedBy', { person: by })
    case 'stale': return t('work.reading.stale')
  }
}

/**
 * Render the agent's reading of the letter for the work's current pass, the latest one when the pass has more: each
 * objection with its legal ground, claims, cited documents, reasoning in the letter's language and quotes, then the
 * cited documents with their quotes. A reading with no objection says why.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.pane - the letter panel, which a quote opens at its place.
 * @returns the section, or nothing when the pass has no reading.
 */
function ReadingSection({ ctx, data, pane }: { ctx: ScreenContext; data: TicketDetail; pane: LetterPane }) {
  const { t } = ctx
  const reading = data.readings.filter(each => each.pass === data.ticket.pass).at(-1)
  if (reading === undefined) return null
  const letter = shownLetter(ctx, data, reading.document)
  const quotes = (spans: LetterReading['items'][number]['evidence']) => spans.length === 0
    ? <span className={detail.readingMeta}>{t('evidence.missing')}</span>
    : spans.map(span => (
      <EvidenceQuote
        key={`${span.page}:${span.start}`}
        span={span}
        labels={quoteLabels(ctx, span.page)}
        onShow={() => { pane.show(letter, { kind: 'span', span }) }}
      />
    ))
  return (
    <section className={detail.section} aria-label={t('work.reading.heading')}>
      <div className={detail.sectionHead}>
        <h2 className={detail.subHeading}>{t('work.reading.heading')}</h2>
        <span className={detail.readingMeta}>{readingState(ctx, reading)}</span>
      </div>
      {reading.reason !== null && <p className={detail.readingMeta}>{t('work.reading.why', { reason: reading.reason })}</p>}
      {reading.items.length === 0
        ? <p className={detail.readingMeta}>{reading.noItemsReason ?? t('work.reading.none')}</p>
        : (
          <StatementTable headers={{ number: t('statement.number'), says: t('work.reading.objection'), source: t('statement.source') }}>
            {reading.items.map((item, index) => {
              const facts = [
                ...(item.claims.length === 0 ? [] : [t(item.claims.length === 1 ? 'work.reading.claims.one' : 'work.reading.claims', { claims: item.claims.join(', ') })]),
                ...(item.documents.length === 0 ? [] : [t('work.reading.cites', { documents: item.documents.join(', ') })]),
              ]
              return (
                <StatementRow
                  key={index}
                  number={index + 1}
                  text={(
                    <span className={detail.readingItem}>
                      <strong>{item.ground}</strong>
                      {facts.length > 0 && <span className={detail.readingMeta}>{facts.join(' · ')}</span>}
                      <span lang={reading.language}>{item.reasoning}</span>
                    </span>
                  )}
                  missing={item.evidence.length === 0}
                >
                  {quotes(item.evidence)}
                </StatementRow>
              )
            })}
          </StatementTable>
        )}
      {reading.documents.length > 0 && (
        <StatementTable headers={{ number: t('statement.number'), says: t('work.reading.documents'), source: t('statement.source') }}>
          {reading.documents.map((document, index) => (
            <StatementRow key={document.label} number={index + 1} text={`${document.label} · ${document.publication}`} missing={document.evidence.length === 0}>
              {quotes(document.evidence)}
            </StatementRow>
          ))}
        </StatementTable>
      )}
    </section>
  )
}

/**
 * A document of the work as the letter viewer shows it: the letter of the work with its page images, or another letter of
 * the work (one that joined it) with its text only.
 * @param ctx - the screen context.
 * @param data - the work.
 * @param document - the document.
 * @returns the letter.
 */
function shownLetter({ t }: ScreenContext, data: TicketDetail, document: DocumentId): ShownLetter {
  const { letter } = data
  return { document, title: letterTitle(t, letter?.code ?? null), images: letter?.document === document ? letter.pageImages : [] }
}

/**
 * Render the deadline of the work with its status, who confirmed it and the days left; the row names the deadline,
 * so its status has no label (mockup 4-review-work).
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the section, or nothing before the deadline exists.
 */
function DeadlineSection({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const { deadline } = data
  if (deadline === null) return null
  return (
    <section className={detail.section}>
      <div className={detail.sectionHead}>
        <h2 className={detail.subHeading}>{t('work.deadline')}</h2>
      </div>
      <DetailTable label={t('work.deadline')} grid={detail.relatedColumns} header={null}>
        <DetailRow opens>
          <Cell kind="status"><AtlasStatus status={{ machine: 'deadline', state: deadline.state }} word={atlasWord(t, { machine: 'deadline', state: deadline.state })} /></Cell>
          <OpenCell onOpen={() => { ctx.navigate({ view: 'deadline', id: deadline.id }) }}>
            <span className={detail.strong}>{formatDate(deadline.due, ctx.locale)}</span>
          </OpenCell>
          <Cell kind="meta" wide>{deadline.confirmer === null ? '' : t('deadline.confirmedBy', { person: personInText(t, deadline.confirmer) })}</Cell>
          <Cell kind="end"><DueText words={ctx} due={deadline.due} /></Cell>
          <Cell kind="icon" wide><IconChevronRightOutlineRegular size={16} /></Cell>
        </DetailRow>
      </DetailTable>
    </section>
  )
}

/**
 * Render the properties panel of the work (mockup 4-review-work): the matter, its people, and the work with the
 * agent that drafted it, which opens the agent panel in the panel's place.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the panel.
 */
function WorkProperties({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const application = data.letter?.applicationNumber ?? null
  const pages = data.letter?.pages ?? null
  const finished = data.run?.finishedAt ?? null
  const { formalitiesPerson } = data.matter
  const letterWords = pages === null
    ? null
    : [t(pages === 1 ? 'work.pages.one' : 'work.pages', { count: pages }), ...(data.letter?.source === 'ocr' ? [t('work.prop.scan')] : [])].join(', ')
  return (
    <PropertiesPanel label={t('prop.label')} groups={[
      {
        heading: t('prop.matter'),
        rows: [
          ...matterRows(t, data.matter, data.clientRules),
          ...(application === null ? [] : [{ label: t('prop.application'), value: formatApplicationNumber(application) }]),
        ],
      },
      {
        heading: t('dossier.prop.people'),
        rows: [
          responsibleRow(t, data.responsible),
          { label: t('dossier.prop.formalities'), value: formalitiesPerson === null ? t('matter.none') : <Who t={t} person={formalitiesPerson} /> },
          { label: t('prop.team'), value: <AvatarStack people={data.team.map(person => avatarOf(t, person))} /> },
        ],
      },
      {
        heading: t('work.prop.work'),
        rows: [
          {
            label: t('work.prop.draftedBy'),
            value: (
              <Button variant="ghost" size="sm" className={detail.agentLink} onClick={() => { ctx.agent.show('docked') }}>
                <IconAgentPresetOutlineRegular size={16} />
                {t('actor.agent')}
              </Button>
            ),
          },
          ...(finished === null ? [] : [{ label: t('work.prop.finished'), value: listTimeText(ctx, finished) }]),
          ...(letterWords === null ? [] : [{ label: t('work.prop.letter'), value: letterWords }]),
          ...(data.reply === null ? [] : [{
            label: t('work.prop.mail'),
            value: `${recipients(ctx, data.reply.to)} · ${atlasWord(t, { machine: 'outbox', state: data.reply.state })}`,
          }]),
        ],
      },
    ]} />
  )
}
