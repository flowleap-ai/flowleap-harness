/**
 * The work on a letter (placeholder for the work screen agent). The work page shows the client report's statements
 * with their exact spans and blocks Record decision while a statement has no span (R14). The work board is in
 * `BoardScreen.tsx`.
 */

import { IconCheckOutlineRegular, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createAct, type TicketDetail } from '../api.ts'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote, MissingEvidence, StatementRow, StatementTable } from '../parts/Evidence.tsx'
import { DetailHeader, DetailLayout, PropertiesPanel, Section, WorkColumn } from '../parts/Layout.tsx'
import { LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { letterTitle } from '../words.ts'
import { actOf, type ScreenContext, type ScreenProps } from './context.ts'
import { deciderText, LoadError, RecordActivity } from './shared.tsx'

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
