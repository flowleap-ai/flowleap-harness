/**
 * The matters list and the matter page (mockup c-matter). The list shows each matter the person may see, next due
 * first. The matter page has the eyebrow (file number and client), the title, the facts that wait for a person, the
 * detail tables of deadlines, work, office events and documents, Activity with Audit, and the properties panel, which
 * stacks under the content at 390px.
 */

import {
  Avatar, IconDeliverDocRegular, IconFolderOpenOutlineRegular, IconPaperPlaneOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MatterDetail, MattersList } from '../api.ts'
import { formatApplicationNumber, formatDate } from '../format.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import { DueText } from '../parts/Due.tsx'
import { DetailHeader, DetailLayout, PropertiesPanel, Section } from '../parts/Layout.tsx'
import { EmptyState, LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { letterTitle, listTimeText } from '../words.ts'
import type { ScreenContext, ScreenProps } from './context.ts'
import { Cell, dateOrNone, DetailRow, DetailTable, Facts, OpenCell, openDocument, ruleWords, Team, Who } from './detail.tsx'
import { LoadError, RecordActivity } from './shared.tsx'
import css from './Detail.module.css'


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
 * Render the matters as a table, or the empty state. J and K move the focus between the rows; ↵ opens one.
 * @param props.ctx - the screen context.
 * @param props.data - the matters.
 * @returns the rows.
 */
function MattersRows({ ctx, data }: { ctx: ScreenContext; data: MattersList }) {
  const { t } = ctx
  const move = (step: 1 | -1) => () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-matters-list] button[data-open-row]')]
    const index = buttons.findIndex(button => button === document.activeElement)
    buttons[Math.min(Math.max(index + step, 0), buttons.length - 1)]?.focus()
  }
  useKeyActs(ctx, { next: move(1), previous: move(-1) })
  if (data.rows.length === 0) {
    return <EmptyState icon={<IconFolderOpenOutlineRegular size={16} />} title={t('empty.matters.title')} body={t('empty.matters.body')} />
  }
  return (
    <div className={css.listPage} data-matters-list="">
      <DetailTable
        label={t('matters.listLabel')}
        variant="list"
        columns="14px minmax(0, 1fr) 112px 20px 112px 136px"
        narrowColumns="14px minmax(0, 1fr) auto"
        header={[
          { text: '' }, { text: t('matter.list.matter') }, { text: t('matter.list.fileNumber'), wide: true }, { text: '', wide: true },
          { text: t('matter.list.deadlines'), wide: true, end: true }, { text: t('matter.list.nextDue'), end: true },
        ]}
      >
        {data.rows.map(row => (
          <DetailRow key={row.fileNumber} opens>
            <Cell kind="icon"><IconFolderOpenOutlineRegular size={14} /></Cell>
            <OpenCell onOpen={() => { ctx.navigate({ view: 'matter', fileNumber: row.fileNumber }) }}>
              {row.title}
              <span className={css.source}>{row.state === 'closed' ? t('matter.closedClient', { client: row.client }) : row.client}</span>
            </OpenCell>
            <Cell kind="meta" wide>{row.fileNumber}</Cell>
            <Cell kind="icon" wide>{row.responsible !== null && <Avatar person={{ name: row.responsible.name, label: t('matter.responsibleIs', { person: row.responsible.name }) }} />}</Cell>
            <Cell kind="end" wide>{row.openDeadlines}</Cell>
            <Cell kind="end">{row.nextDue === null ? t('matter.noDeadline') : <DueText words={ctx} due={row.nextDue} />}</Cell>
          </DetailRow>
        ))}
      </DetailTable>
    </div>
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

/** Deadline states that wait for a second person. */
const WAITING_DEADLINES = new Set(['deadline_proposed', 'manual_proposed'])

/**
 * Render a matter: the header and its facts, the four detail tables, Activity and the properties panel.
 * @param props.ctx - the screen context.
 * @param props.data - the matter.
 * @returns the detail page.
 */
function MatterView({ ctx, data }: { ctx: ScreenContext; data: MatterDetail }) {
  const { t } = ctx
  const open = (route: Parameters<ScreenContext['navigate']>[0]) => () => { ctx.navigate(route) }
  const waiting = data.deadlines.filter(deadline => WAITING_DEADLINES.has(deadline.state)).length
  const ready = data.work.filter(work => work.state === 'proposals_ready')
  const deciders = [...new Set(ready.flatMap(work => work.routedTo === null ? [] : [work.routedTo.name]))]
  const nextDue = data.deadlines.find(deadline => deadline.state === 'deadline_proposed' || deadline.state === 'active')?.due ?? null
  const titleOfDocument = (document: (typeof data.documents)[number]) => {
    const event = data.officeEvents.find(item => item.document === document.sha256)
    if (event !== undefined) return letterTitle(t, event.code)
    return document.source === 'agent' ? t('work.clientReport') : t('code.unknown')
  }
  useCommandItem(ctx, {
    label: `${data.matter.fileNumber} · ${data.matter.title}`,
    groups: [{
      id: 'matter',
      label: t('matter.openGroup'),
      acts: [
        ...data.deadlines.map(deadline => ({
          id: `deadline:${deadline.id}`, label: t('crumb.deadline', { date: formatDate(deadline.due, ctx.locale) }), run: open({ view: 'deadline', id: deadline.id }),
        })),
        ...data.work.map(work => ({ id: `work:${work.id}`, label: letterTitle(t, work.code), run: open({ view: 'work', id: work.id }) })),
      ],
    }],
  })
  return (
    <div className={css.page}>
      <DetailLayout properties={(
        <PropertiesPanel label={t('prop.label')} groups={[
          {
            heading: t('prop.matter'),
            rows: [
              { label: t('prop.client'), value: data.matter.client, title: data.matter.client },
              { label: t('prop.responsible'), value: data.responsible === null ? t('matter.none') : <Who person={data.responsible} /> },
              { label: t('prop.team'), value: <Team t={t} team={data.team} /> },
              { label: t('prop.application'), value: data.matter.applicationNumber === null ? t('matter.notRecorded') : formatApplicationNumber(data.matter.applicationNumber) },
            ],
          },
          ...(nextDue === null ? [] : [{ heading: t('matter.nextDeadline'), rows: [{ label: t('prop.due'), value: formatDate(nextDue, ctx.locale) }] }]),
        ]} />
      )}>
        <div className={css.content}>
          <div className={css.inner}>
            <DetailHeader
              eyebrow={<span className={css.eyebrowFacts}><span>{data.matter.fileNumber}</span><span aria-hidden="true">·</span><span>{data.matter.client}</span></span>}
              title={data.matter.title}
            />
            <Facts facts={[
              ...(waiting === 0 ? [] : [{ key: 'deadlines', count: waiting, text: t(waiting === 1 ? 'matter.factDeadline' : 'matter.factDeadlines') }]),
              ...deciders.map((person) => {
                const count = ready.filter(work => work.routedTo?.name === person).length
                return { key: `work:${person}`, count, text: t(count === 1 ? 'matter.factWork' : 'matter.factWorks', { person }) }
              }),
            ]} />
            <Section heading={t('section.deadlines')} count={data.deadlines.length}>
              <DetailTable
                label={t('section.deadlines')}
                columns="168px 128px 160px minmax(0, 1fr)"
                narrowColumns="minmax(0, 1fr) auto"
                header={[{ text: t('matter.col.state') }, { text: t('prop.due') }, { text: '', wide: true }, { text: t('matter.col.rule'), wide: true }]}
              >
                {data.deadlines.map((deadline) => {
                  const status = { machine: 'deadline', state: deadline.state } as const
                  return (
                    <DetailRow key={deadline.id} opens>
                      <Cell kind="status"><AtlasStatus status={status} word={atlasWord(t, status)} /></Cell>
                      <OpenCell onOpen={open({ view: 'deadline', id: deadline.id })}>
                        <span className={css.strong}>{formatDate(deadline.due, ctx.locale)}</span>
                        <span className={css.narrowLine}><DueText words={ctx} due={deadline.due} /></span>
                      </OpenCell>
                      <Cell kind="main" wide><span className={css.strong}><DueText words={ctx} due={deadline.due} /></span></Cell>
                      <Cell kind="meta" wide>{ruleWords(t, deadline.code).short}</Cell>
                    </DetailRow>
                  )
                })}
              </DetailTable>
            </Section>
            <Section heading={t('section.work')} count={data.work.length}>
              <DetailTable
                label={t('section.work')}
                columns="168px minmax(0, 1fr) 20px 64px"
                narrowColumns="auto minmax(0, 1fr) 56px"
                header={[{ text: t('matter.col.state') }, { text: t('matter.col.work') }, { text: '', wide: true }, { text: t('matter.col.updated'), end: true }]}
              >
                {data.work.map((work) => {
                  const status = { machine: 'ticket', state: work.state } as const
                  return (
                    <DetailRow key={work.id} opens>
                      <Cell kind="status"><AtlasStatus status={status} word={atlasWord(t, status)} /></Cell>
                      <OpenCell onOpen={open({ view: 'work', id: work.id })}>{letterTitle(t, work.code)}</OpenCell>
                      <Cell kind="icon" wide>{work.routedTo !== null && <Avatar person={{ name: work.routedTo.name, label: t('matter.forPerson', { person: work.routedTo.name }) }} />}</Cell>
                      <Cell kind="end">{listTimeText(ctx, work.updatedAt)}</Cell>
                    </DetailRow>
                  )
                })}
              </DetailTable>
            </Section>
            <Section heading={t('matter.officeEvents')} count={data.officeEvents.length}>
              <DetailTable
                label={t('matter.officeEvents')}
                columns="168px minmax(0, 1fr) 120px 120px"
                narrowColumns="auto minmax(0, 1fr)"
                header={[
                  { text: t('matter.col.state') }, { text: t('matter.col.communication') }, { text: t('matter.col.documentDate'), wide: true },
                  { text: t('matter.col.received'), wide: true },
                ]}
              >
                {data.officeEvents.map((event) => {
                  const status = { machine: 'deadline', state: event.state } as const
                  const deadline = data.deadlines.find(item => item.officeEventId === event.id)
                  const letter = event.document
                  const title = letterTitle(t, event.code)
                  return (
                    <DetailRow key={event.id} opens={deadline !== undefined || letter !== null}>
                      <Cell kind="status"><AtlasStatus status={status} word={atlasWord(t, status)} /></Cell>
                      {deadline !== undefined
                        ? <OpenCell onOpen={open({ view: 'deadline', id: deadline.id })}>{title}</OpenCell>
                        : letter !== null
                          ? <OpenCell onOpen={() => { openDocument(ctx, letter) }}>{title}</OpenCell>
                          : <Cell kind="main">{title}</Cell>}
                      <Cell kind="meta" wide>{dateOrNone(ctx, event.documentDate)}</Cell>
                      <Cell kind="meta" wide>{dateOrNone(ctx, event.receivedAt)}</Cell>
                    </DetailRow>
                  )
                })}
              </DetailTable>
            </Section>
            <Section heading={t('matter.documents')} count={data.documents.length}>
              <DetailTable label={t('matter.documents')} columns="14px minmax(0, 1fr) 64px" narrowColumns="14px minmax(0, 1fr) 56px" header={null}>
                {data.documents.map(document => (
                  <DetailRow key={document.sha256} opens>
                    <Cell kind="icon">{document.source === 'mail' ? <IconPaperPlaneOutlineRegular size={14} /> : <IconDeliverDocRegular size={14} />}</Cell>
                    <OpenCell onOpen={() => { openDocument(ctx, document.sha256) }}>
                      {titleOfDocument(document)}
                      <span className={css.source}>{document.fileName}</span>
                    </OpenCell>
                    <Cell kind="end">{listTimeText(ctx, document.at)}</Cell>
                  </DetailRow>
                ))}
              </DetailTable>
            </Section>
            <RecordActivity ctx={ctx} events={data.activity} />
          </div>
        </div>
      </DetailLayout>
    </div>
  )
}
