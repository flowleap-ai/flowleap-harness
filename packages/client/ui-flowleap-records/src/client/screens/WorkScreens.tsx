/**
 * The work on a letter and the work board (placeholders for the work screen agents). The work page shows the client
 * report's statements with their exact spans and blocks Record decision while a statement has no span (R14); the
 * board shows a column for each state of the work machine with its cards.
 */

import { IconCheckOutlineRegular, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createAct, type TicketDetail, type TicketsList } from '../api.ts'
import type { TicketState } from '../atlas.ts'
import { formatDate } from '../format.ts'
import { BoardCard, BoardColumn } from '../parts/Board.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote, MissingEvidence, StatementRow, StatementTable } from '../parts/Evidence.tsx'
import { DetailHeader, DetailLayout, PropertiesPanel, Section, WorkColumn } from '../parts/Layout.tsx'
import { LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { letterTitle } from '../words.ts'
import { actOf, type ScreenContext, type ScreenProps } from './context.ts'
import { deciderText, LoadError, RecordActivity } from './shared.tsx'
import css from './Screens.module.css'

/**
 * Render the work on one letter.
 * @param props.screen - the work route with its load.
 * @param props.ctx - the screen context.
 * @returns the decision page.
 */
export function WorkScreen({ screen, ctx }: ScreenProps<'work'>) {
  return (
    <LoadView
      load={screen.ticket}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <WorkView ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * Render the work: the report's statements with their evidence, Activity and the decision.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the decision page.
 */
function WorkView({ ctx, data }: { ctx: ScreenContext; data: TicketDetail }) {
  const { t } = ctx
  const status = { machine: 'ticket', state: data.ticket.state } as const
  const missing = data.reports.flatMap(report => report.statements.map((statement, index) => ({ statement, number: index + 1 })))
    .filter(({ statement }) => statement.evidence.every(evidence => evidence.span === null))
  const first = missing[0]
  const blocked = first === undefined ? null : t('decision.statementMissing', { number: first.number })
  const deadline = data.deadline
  const decision = ctx.me === null
    ? null
    : (
      <DecisionBar
        person={ctx.me.person}
        question={t('decision.parts', { count: data.reports.length })}
        labels={{ yours: t('decision.yours'), more: t('decision.more') }}
        decider={deciderText(ctx, data.mayDecide)}
        blocked={blocked}
        parts={data.reports.map(report => (
          <DecisionPart key={report.proposalId} icon={<IconListPenOutlineRegular size={16} />} title={t('work.clientReport')} missing={blocked} detail={report.fileName} />
        ))}
        primary={actOf(ctx, 'record', t('act.recordDecision'), () => {
          void ctx.perform([createAct({
            kind: 'ticket.decide',
            id: data.ticket.id,
            reports: data.reports.map(report => ({ proposalId: report.proposalId, decision: 'approve' as const })),
            deadlineCheck: deadline === null ? { id: 'none-yet', state: 'none-yet', seq: data.recordSeq } : { id: deadline.id, state: 'active', seq: data.recordSeq },
          })])
        }, { icon: <IconCheckOutlineRegular size={16} /> })}
      />
    )
  return (
    <DetailLayout decision properties={(
      <PropertiesPanel label={t('prop.label')} groups={[{ heading: t('prop.matter'), rows: [{ label: t('prop.matter'), value: data.matter.fileNumber }] }]} />
    )}>
      <WorkColumn decision={decision}>
        <DetailHeader
          eyebrow={<AtlasPill status={status} word={atlasWord(t, status)} />}
          title={letterTitle(t, data.letter?.code ?? null)}
        />
        {data.reports.map(report => (
          <Section key={report.proposalId} heading={t('work.clientReport')}>
            <StatementTable headers={{ number: t('statement.number'), says: t('statement.says'), source: t('statement.source') }}>
              {report.statements.map((statement, index) => {
                const spans = statement.evidence.flatMap(evidence => evidence.span === null ? [] : [evidence.span])
                return (
                  <StatementRow key={index} number={index + 1} text={statement.text} missing={spans.length === 0}>
                    {spans.length === 0
                      ? (
                        <MissingEvidence
                          labels={{ title: t('evidence.missing'), why: t('evidence.missingWhy'), find: t('evidence.find'), remove: t('evidence.remove') }}
                          onFind={() => { ctx.refresh() }}
                          onRemove={() => { ctx.refresh() }}
                        />
                      )
                      : spans.map(span => (
                        <EvidenceQuote key={`${span.page}:${span.start}`} span={span} labels={{ page: t('evidence.page', { page: span.page }), excerpt: t('evidence.excerpt', { page: span.page }), exact: t('evidence.exact') }} />
                      ))}
                  </StatementRow>
                )
              })}
            </StatementTable>
          </Section>
        ))}
        <RecordActivity ctx={ctx} events={data.activity} />
      </WorkColumn>
    </DetailLayout>
  )
}

/** The board's columns: the states of the work machine that work moves through, with who moves a card out. */
const COLUMNS: readonly { readonly state: TicketState; readonly owner: 'board.ownerFlowleap' | 'board.ownerAgent' | 'board.ownerYou' }[] = [
  { state: 'routed', owner: 'board.ownerFlowleap' },
  { state: 'running', owner: 'board.ownerAgent' },
  { state: 'proposals_ready', owner: 'board.ownerYou' },
  { state: 'decided', owner: 'board.ownerYou' },
]

/**
 * Render the work board.
 * @param props.screen - the board route with its load.
 * @param props.ctx - the screen context.
 * @returns the board.
 */
export function BoardScreen({ screen, ctx }: ScreenProps<'board'>) {
  return (
    <LoadView
      load={screen.tickets}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <Board ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * Render the board's columns and cards.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @returns the board.
 */
function Board({ ctx, data }: { ctx: ScreenContext; data: TicketsList }) {
  const { t } = ctx
  return (
    <div className={css.board}>
      {COLUMNS.map(({ state, owner }) => {
        const status = { machine: 'ticket', state } as const
        const cards = data.rows.filter(row => row.state === state)
        return (
          <BoardColumn key={state} status={status} word={atlasWord(t, status)} count={cards.length} owner={t(owner)}>
            {cards.map(card => (
              <BoardCard
                key={card.id}
                status={status}
                matterKey={card.matter.fileNumber}
                team={card.team}
                title={letterTitle(t, card.code)}
                sub={card.due === null ? card.matter.title : `${card.matter.title} · ${t('board.due', { date: formatDate(card.due, ctx.locale) })}`}
                facts={[
                  ...(card.deadline === null ? [] : [{ label: t('board.deadline'), status: { machine: 'deadline', state: card.deadline.state } as const, word: atlasWord(t, { machine: 'deadline', state: card.deadline.state }) }]),
                  ...(card.report === null ? [] : [{ label: t('board.report'), status: { machine: 'report', state: card.report.state } as const, word: atlasWord(t, { machine: 'report', state: card.report.state }) }]),
                ]}
                onOpen={() => { ctx.navigate({ view: 'work', id: card.id }) }}
              />
            ))}
          </BoardColumn>
        )
      })}
    </div>
  )
}
