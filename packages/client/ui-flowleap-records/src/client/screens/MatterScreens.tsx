/**
 * The matters list, the matter and the deadline (placeholders for the matter screen agent). Each renders its data
 * through the IPMS parts: the matters as a plain list, the matter with its deadlines, work and Activity beside the
 * properties panel, and the deadline with its due date as the key fact and the confirm decision.
 */

import { useState } from 'react'
import { AvatarStack, IconCheckOutlineRegular, IconCloseOutlineRegular, IconFolderOpenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { createAct, type DeadlineDetail, type MatterDetail, type MattersList } from '../api.ts'
import { formatDate } from '../format.ts'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { DetailHeader, DetailLayout, KeyFact, PropertiesPanel, Section, WorkColumn } from '../parts/Layout.tsx'
import { EmptyState, LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasPill, AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { dueText, letterTitle } from '../words.ts'
import { actOf, keyedOf, type ScreenContext, type ScreenProps } from './context.ts'
import { deciderText, LoadError, RecordActivity } from './shared.tsx'
import css from './Screens.module.css'

/**
 * Render the matters list.
 * @param props.screen - the matters route with its load.
 * @param props.ctx - the screen context.
 * @returns the list.
 */
export function MattersScreen({ screen, ctx }: ScreenProps<'matters'>) {
  return (
    <LoadView
      load={screen.matters}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <MattersRows ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * Render the matters, or the empty state.
 * @param props.ctx - the screen context.
 * @param props.data - the matters.
 * @returns the rows.
 */
function MattersRows({ ctx, data }: { ctx: ScreenContext; data: MattersList }) {
  if (data.rows.length === 0) {
    return <EmptyState icon={<IconFolderOpenOutlineRegular size={16} />} title={ctx.t('empty.matters.title')} body={ctx.t('empty.matters.body')} />
  }
  return (
    <ul className={css.rows} aria-label={ctx.t('matters.listLabel')}>
      {data.rows.map(row => (
        <li key={row.fileNumber} className={css.row}>
          <button type="button" className={css.link} onClick={() => { ctx.navigate({ view: 'matter', fileNumber: row.fileNumber }) }}>
            <span className={css.key}>{row.fileNumber}</span>{row.title}
          </button>
          <span className={css.meta}>{row.client}</span>
          <span className={css.meta}>{row.nextDue === null ? '' : dueText(ctx, row.nextDue)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Render one matter.
 * @param props.screen - the matter route with its load.
 * @param props.ctx - the screen context.
 * @returns the detail page.
 */
export function MatterScreen({ screen, ctx }: ScreenProps<'matter'>) {
  return (
    <LoadView
      load={screen.matter}
      render={{
        loading: () => <PageSpinner label={ctx.t('loading')} />,
        failed: at => <LoadError ctx={ctx} at={at} />,
        ready: data => <MatterView ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * Render a matter's deadlines, work, Activity and properties.
 * @param props.ctx - the screen context.
 * @param props.data - the matter.
 * @returns the detail page.
 */
function MatterView({ ctx, data }: { ctx: ScreenContext; data: MatterDetail }) {
  const { t } = ctx
  return (
    <DetailLayout properties={(
      <PropertiesPanel label={t('prop.label')} groups={[{
        heading: t('prop.matter'),
        rows: [
          { label: t('prop.client'), value: data.matter.client },
          { label: t('prop.responsible'), value: data.responsible?.name ?? t('matter.none') },
          { label: t('prop.team'), value: <AvatarStack people={data.team} /> },
          { label: t('prop.application'), value: data.matter.applicationNumber ?? t('matter.none') },
        ],
      }]} />
    )}>
      <div className={css.content}>
        <DetailHeader eyebrow={<span>{`${data.matter.fileNumber} · ${data.matter.client}`}</span>} title={data.matter.title} />
        <Section heading={t('section.deadlines')} count={data.deadlines.length}>
          <ul className={css.rows}>
            {data.deadlines.map(deadline => (
              <li key={deadline.id} className={css.row}>
                <AtlasStatus status={{ machine: 'deadline', state: deadline.state }} word={atlasWord(t, { machine: 'deadline', state: deadline.state })} />
                <button type="button" className={css.link} onClick={() => { ctx.navigate({ view: 'deadline', id: deadline.id }) }}>
                  {formatDate(deadline.due, ctx.locale)}
                </button>
                <span className={css.meta}>{dueText(ctx, deadline.due)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section heading={t('section.work')} count={data.work.length}>
          <ul className={css.rows}>
            {data.work.map(work => (
              <li key={work.id} className={css.row}>
                <AtlasStatus status={{ machine: 'ticket', state: work.state }} word={atlasWord(t, { machine: 'ticket', state: work.state })} />
                <button type="button" className={css.link} onClick={() => { ctx.navigate({ view: 'work', id: work.id }) }}>
                  {letterTitle(t, work.code)}
                </button>
              </li>
            ))}
          </ul>
        </Section>
        <RecordActivity ctx={ctx} events={data.activity} />
      </div>
    </DetailLayout>
  )
}

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

/**
 * Render a deadline: the due date as the key fact, the calculation, Activity and the confirm decision.
 * @param props.ctx - the screen context.
 * @param props.data - the deadline.
 * @returns the decision page.
 */
function DeadlineView({ ctx, data }: { ctx: ScreenContext; data: DeadlineDetail }) {
  const { t } = ctx
  const [reasonOpen, setReasonOpen] = useState(false)
  const status = { machine: 'deadline', state: data.deadline.state } as const
  const decision = ctx.me === null
    ? null
    : (
      <DecisionBar
        person={ctx.me.person}
        question={t('decision.dateRight')}
        labels={{ yours: t('decision.yours'), more: t('decision.more') }}
        decider={deciderText(ctx, data.mayConfirm)}
        parts={<DecisionPart icon={<IconCheckOutlineRegular size={16} />} title={formatDate(data.deadline.due, ctx.locale)} detail={t('decision.steps', { count: data.deadline.trace.length })} />}
        negative={{
          ...keyedOf(ctx, 'reject'),
          label: t('act.rejectStep'),
          icon: <IconCloseOutlineRegular size={16} />,
          open: reasonOpen,
          onOpenChange: setReasonOpen,
          reasonLabel: t('reason.reject'),
          confirmLabel: t('act.reject'),
          cancelLabel: t('act.cancel'),
          onConfirm: (reason) => { void ctx.perform([createAct({ kind: 'deadline.reject', id: data.deadline.id, reason })]) },
        }}
        primary={actOf(ctx, 'record', t('act.confirmDeadline'), () => {
          void ctx.perform([createAct({ kind: 'deadline.confirm', id: data.deadline.id, seen: data.recordSeq })])
        }, { icon: <IconCheckOutlineRegular size={16} /> })}
      />
    )
  return (
    <DetailLayout decision properties={(
      <PropertiesPanel label={t('prop.label')} groups={[{
        heading: t('prop.deadline'),
        rows: [
          { label: t('prop.due'), value: formatDate(data.deadline.due, ctx.locale) },
          { label: t('prop.matter'), value: data.matter.fileNumber },
        ],
      }]} />
    )}>
      <WorkColumn decision={decision}>
        <div className={css.eyebrow}><AtlasPill status={status} word={atlasWord(t, status)} /></div>
        <KeyFact value={formatDate(data.deadline.due, ctx.locale, 'long')} detail={dueText(ctx, data.deadline.due)} />
        <ol className={css.steps}>
          {data.deadline.trace.map(step => <li key={`${step.op}:${step.to}`}>{`${step.cite} · ${step.to}`}</li>)}
        </ol>
        <RecordActivity ctx={ctx} events={data.activity} />
      </WorkColumn>
    </DetailLayout>
  )
}
