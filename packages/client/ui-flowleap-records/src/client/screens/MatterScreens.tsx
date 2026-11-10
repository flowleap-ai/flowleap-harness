/**
 * The matters list and the matter page (mockup c-matter). The list shows each matter the person may see, next due
 * first. The matter page has the eyebrow (file number and client), the title, the facts that wait for a person, the
 * detail tables of deadlines, work, office events and documents, Activity with Audit, and the properties panel, which
 * stacks under the content at 390px.
 */

import {
  Avatar, IconFolderOpenOutlineRegular, IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { routeOfAct } from '../address.ts'
import type { AtlasRef } from '../atlas.ts'
import { taskDueDay, workStatus } from '../my-work.ts'
import type { MatterDetail, MattersList } from '../api.ts'
import { formatApplicationNumber, formatDate, languageName } from '../format.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import { DueText } from '../parts/Due.tsx'
import { DetailHeader, DetailLayout, PropertiesPanel, Section } from '../parts/Layout.tsx'
import { SkeletonBone, type SkeletonCell } from '../parts/List.tsx'
import { EmptyState, LoadView, PageSpinner } from '../parts/States.tsx'
import { AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { avatarOf, letterTitle, listTimeText, personInText, personName, type Translate } from '../words.ts'
import { actOf, type ScreenContext, type ScreenProps } from './context.ts'
import { Cell, DetailRow, DetailTable, formatDay, OpenCell, matterRows, openDocument, responsibleRow, ruleWords, Team, Who, type HeaderCell } from './detail.tsx'
import { LoadError, RecordActivity } from './shared.tsx'
import css from './Detail.module.css'

/** The bone of each column of a loading matters row, and whether the column hides at 390px. */
const MATTERS_SKELETON: readonly { readonly cell: SkeletonCell; readonly kind: 'icon' | 'main' | 'meta' | 'end'; readonly wide: boolean }[] = [
  { cell: 'dot', kind: 'icon', wide: false },
  { cell: 'bar', kind: 'main', wide: false },
  { cell: 'bar', kind: 'meta', wide: true },
  { cell: 'avatar', kind: 'icon', wide: true },
  { cell: 'end', kind: 'end', wide: true },
  { cell: 'end', kind: 'end', wide: false },
]

/**
 * The column header of the matters list.
 * @param t - the translate function.
 * @returns the header cells.
 */
function mattersHeader(t: ScreenContext['t']): readonly HeaderCell[] {
  return [
    { text: '' }, { text: t('matter.list.matter') }, { text: t('matter.list.fileNumber'), wide: true }, { text: '', wide: true },
    { text: t('matter.list.deadlines'), wide: true, end: true }, { text: t('matter.list.nextDue'), end: true },
  ]
}

/**
 * Render the loading matters list (R18): the column header and skeleton rows on the list's own column grid.
 * @param props.ctx - the screen context.
 * @returns the loading list.
 */
function MattersSkeleton({ ctx }: { ctx: ScreenContext }) {
  return (
    <div className={css.listPage} role="status" aria-label={ctx.t('loading')}>
      <DetailTable label={ctx.t('matters.listLabel')} variant="list" grid={css.mattersColumns} header={mattersHeader(ctx.t)}>
        {Array.from({ length: 6 }, (_, row) => (
          <DetailRow key={row}>
            {MATTERS_SKELETON.map(({ cell, kind, wide }, column) => (
              <Cell key={column} kind={kind} wide={wide}><SkeletonBone cell={cell} place={row + column} /></Cell>
            ))}
          </DetailRow>
        ))}
      </DetailTable>
    </div>
  )
}

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
        loading: () => <MattersSkeleton ctx={ctx} />,
        failed: (at, error) => <LoadError ctx={ctx} at={at} error={error} />,
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
  const goIntake = () => { ctx.navigate({ view: 'intake', list: 'waiting', open: null }) }
  useKeyActs(ctx, { next: move(1), previous: move(-1), goIntake })
  if (data.rows.length === 0) {
    return (
      <EmptyState
        icon={<IconFolderOpenOutlineRegular size={16} />}
        title={t('empty.matters.title')}
        body={t('empty.matters.body')}
        action={actOf(ctx, 'goIntake', t('keys.goIntake'), goIntake)}
      />
    )
  }
  return (
    <div className={css.listPage} data-matters-list="">
      <DetailTable
        label={t('matters.listLabel')}
        variant="list"
        grid={css.mattersColumns}
        header={mattersHeader(t)}
      >
        {data.rows.map(row => (
          <DetailRow key={row.fileNumber} opens>
            <Cell kind="icon"><IconFolderOpenOutlineRegular size={14} /></Cell>
            <OpenCell onOpen={() => { ctx.navigate({ view: 'matter', fileNumber: row.fileNumber }) }}>
              {row.title}
              <span className={css.source}>{row.state === 'closed' ? t('matter.closedClient', { client: row.client }) : row.client}</span>
            </OpenCell>
            <Cell kind="meta" wide>{row.fileNumber}</Cell>
            <Cell kind="icon" wide>{row.responsible !== null && <Avatar person={avatarOf(t, row.responsible, t('matter.responsibleIs', { person: personName(t, row.responsible) }))} />}</Cell>
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
        failed: (at, error) => <LoadError ctx={ctx} at={at} error={error} />,
        ready: data => <MatterView ctx={ctx} data={data} />,
      }}
    />
  )
}

/**
 * The EPO Register address of an EP application number, such as `EP23771920` or `23 771 920.8`.
 * @param number - the application number from the record.
 * @returns the address, or null for a number that is not an EP application.
 */
export function registerHref(number: string): string | null {
  const match = /^(?:EP\s*)?(\d{2})\s*(\d{3})\s*(\d{3})(?:\s*\.\s*\d)?$/u.exec(number.trim())
  return match === null ? null : `https://register.epo.org/application?number=EP${match[1]}${match[2]}${match[3]}&lng=en`
}

/**
 * Render a matter, the dossier (mockup `5-dossier`): the title and the matter's line (file number, client, the
 * application linked to the EPO Register), What waits with the next step first, the deadlines, the e-file, Activity,
 * and the properties panel with the matter and its people.
 * @param props.ctx - the screen context.
 * @param props.data - the matter.
 * @returns the detail page.
 */
function MatterView({ ctx, data }: { ctx: ScreenContext; data: MatterDetail }) {
  const { t } = ctx
  const open = (route: Parameters<ScreenContext['navigate']>[0]) => () => { ctx.navigate(route) }
  const titleOfDocument = (document: (typeof data.documents)[number]) => {
    const code = document.code ?? data.officeEvents.find(item => item.document === document.sha256)?.code ?? null
    if (code !== null) return letterTitle(t, code)
    return document.source === 'agent' ? t('work.clientReport') : t('code.unknown')
  }
  const application = data.matter.applicationNumber
  const register = application === null ? null : registerHref(application)
  useCommandItem(ctx, {
    label: `${data.matter.fileNumber} · ${data.matter.title}`,
    groups: [{
      id: 'matter',
      label: t('matter.openGroup'),
      acts: [
        ...data.waits.flatMap((item) => {
          const route = routeOfAct(item.act)
          return route === null ? [] : [{ id: `waits:${item.id}`, label: t(`mywork.task.${item.kind}`), run: open(route) }]
        }),
        ...data.deadlines.map(deadline => ({
          id: `deadline:${deadline.id}`, label: t('crumb.deadline', { date: formatDate(deadline.due, ctx.locale) }), run: open({ view: 'deadline', id: deadline.id }),
        })),
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
              ...matterRows(t, data.matter, data.clientRules),
              { label: t('dossier.prop.language'), value: data.language === null ? t('matter.notRecorded') : languageName(ctx.locale, data.language) },
              { label: t('prop.application'), value: application === null ? t('matter.notRecorded') : formatApplicationNumber(application) },
            ],
          },
          {
            heading: t('dossier.prop.people'),
            rows: [
              responsibleRow(t, data.responsible),
              { label: t('dossier.prop.formalities'), value: data.formalitiesPerson === null ? t('matter.none') : <Who t={t} person={data.formalitiesPerson} /> },
              { label: t('prop.team'), value: <Team t={t} team={data.team} /> },
              { label: t('dossier.prop.wall'), value: wallWords(t, data.wall) },
            ],
          },
        ]} />
      )}>
        <div className={css.content}>
          <div className={css.inner}>
            <DetailHeader
              eyebrow={null}
              title={data.matter.title}
              lede={(
                <span className={css.eyebrowFacts}>
                  <span>{data.matter.fileNumber}</span>
                  <span>{data.matter.client}</span>
                  {application !== null && (register === null
                    ? <span>{formatApplicationNumber(application)}</span>
                    : <a className={css.registerLink} href={register} target="_blank" rel="noopener noreferrer">{formatApplicationNumber(application)}<IconRightUpOutlineRegular size={12} /></a>)}
                </span>
              )}
            />
            <Section heading={t('dossier.waits')} count={data.waits.length} empty={t('dossier.noWaits')}>
              <DetailTable
                label={t('dossier.waits')}
                grid={css.waitsColumns}
                header={[{ text: t('matter.col.state') }, { text: t('mywork.col.task') }, { text: t('dossier.col.owner'), wide: true }, { text: t('mywork.col.due'), end: true }]}
              >
                {data.waits.map((item, index) => {
                  const status = workStatus(item, null, null)
                  const route = routeOfAct(item.act)
                  return (
                    <DetailRow key={item.id} opens={route !== null}>
                      <Cell kind="status">{status !== null && <AtlasStatus status={status} word={atlasWord(t, status)} />}</Cell>
                      {route === null
                        ? <Cell kind="main">{t(`mywork.task.${item.kind}`)}</Cell>
                        : (
                          <OpenCell onOpen={open(route)}>
                            {index === 0 && <span className={css.nextTag}>{t('dossier.next')}</span>}
                            {t(`mywork.task.${item.kind}`)}
                          </OpenCell>
                        )}
                      <Cell kind="meta" wide><Who t={t} person={item.owner} /></Cell>
                      <Cell kind="end"><DueText words={ctx} due={taskDueDay(item, ctx.timeZone)} /></Cell>
                    </DetailRow>
                  )
                })}
              </DetailTable>
            </Section>
            <Section heading={t('section.deadlines')} count={data.deadlines.length} empty={t('section.noDeadlines')}>
              <DetailTable
                label={t('section.deadlines')}
                grid={css.deadlinesColumns}
                header={[
                  { text: t('matter.col.state') }, { text: t('prop.due'), endNarrow: true }, { text: '', wide: true }, { text: t('matter.col.rule'), wide: true },
                  { text: '', wide: true },
                ]}
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
                      <Cell kind="meta" wide>
                        {deadline.confirmedBy !== null
                          ? t('deadline.confirmedBy', { person: personInText(t, deadline.confirmedBy) })
                          : deadline.rejectedBy === null ? '' : t('dossier.rejectedBy', { person: personInText(t, deadline.rejectedBy) })}
                      </Cell>
                    </DetailRow>
                  )
                })}
              </DetailTable>
            </Section>
            <Section heading={t('dossier.efile')} count={data.documents.length} empty={t('section.noDocuments')}>
              <DetailTable label={t('dossier.efile')} grid={css.documentsColumns} header={null}>
                {data.documents.map(document => (
                  <DetailRow key={document.sha256} opens>
                    <Cell kind="status"><AtlasStatus status={documentStatus(document)} word={atlasWord(t, documentStatus(document))} /></Cell>
                    <OpenCell onOpen={() => { openDocument(ctx, document.sha256) }}>
                      <span title={document.fileName}>{titleOfDocument(document)}</span>
                    </OpenCell>
                    <Cell kind="meta" wide>
                      {document.letterDate === null
                        ? t('dossier.doc.arrived', { time: listTimeText(ctx, document.at) })
                        : t('dossier.doc.letterArrived', { date: formatDay(document.letterDate, ctx.locale), time: listTimeText(ctx, document.at) })}
                    </Cell>
                    <Cell kind="meta" wide>{document.filedBy === null ? '' : <Who t={t} person={document.filedBy} />}</Cell>
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

/**
 * The status of an E-file row: a filed document, or a letter that the intake proposed for the matter and no person
 * filed yet.
 * @param document - the document.
 * @returns the atlas state.
 */
function documentStatus(document: MatterDetail['documents'][number]): AtlasRef {
  return { machine: 'intake', state: document.state === 'filed' ? 'filed' : 'match_proposed' }
}

/**
 * Who sees the matter: the team, and the count of people the wall screens from it.
 * @param t - the translate function.
 * @param wall - the matter's wall.
 * @returns the words, such as "The team · 2 people screened".
 */
function wallWords(t: Translate, wall: MatterDetail['wall']): string {
  const team = t('dossier.wall.team')
  return wall.screened === 0 ? team : `${team} · ${t(wall.screened === 1 ? 'dossier.wall.screened.one' : 'dossier.wall.screened', { count: wall.screened })}`
}
