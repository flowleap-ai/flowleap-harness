/**
 * My work (mockups `1-my-work-*`, decision B9): the first line ("1 letter arrived, 1 needs you"), the day with the
 * count of each group, and the person's tasks in the due-time groups Overdue, Today and Later. A row shows the task
 * in words with its reason, the status of its object, the matter key and its client, the legal date of a deadline
 * apart from the task's own due time, and that due time. A row opens the page of its object; its context menu has
 * Open, Open matter and Copy link. My work has no row selection and no bulk act (decision B9).
 */

import {
  IconAlarmClockOutlineRegular, IconClockOutlineRegular, IconGoalOutlineRegular, IconShieldOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import { routeOfAct } from '../address.ts'
import type { IntakeList, MyWork, WorkGroup, WorkItem } from '../api.ts'
import { formatDate, formatToday } from '../format.ts'
import { useKeyActs } from '../key-layer.ts'
import { shownData } from '../load.ts'
import { clientsOf, groupWork, ledeCounts, taskDueDay, workStatus } from '../my-work.ts'
import { DueText } from '../parts/Due.tsx'
import { ListFrame, ListGroup, ListRow, ListSkeleton, MetaCell, TimeCell, TitleCell } from '../parts/List.tsx'
import { EmptyState, LoadView } from '../parts/States.tsx'
import { AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { actOf, type ScreenContext, type ScreenProps } from './context.ts'
import { LoadError } from './shared.tsx'
import css from './MyWork.module.css'

/** The icon of each due-time group header. */
const GROUP_ICONS: Readonly<Record<WorkGroup, ReactNode>> = {
  overdue: <IconWarningTriangleOutlineRegular size={16} />,
  today: <IconAlarmClockOutlineRegular size={16} />,
  later: <IconClockOutlineRegular size={16} />,
}

/**
 * The column header of My work.
 * @param t - the translate function.
 * @returns the header cells.
 */
function header(t: ScreenContext['t']): readonly ReactNode[] {
  return [t('mywork.col.task'), t('mywork.col.status'), t('mywork.col.matter'), t('mywork.col.client'), t('mywork.col.legal'), t('mywork.col.due')]
}

/**
 * Render My work.
 * @param props.screen - the My work route with its loads.
 * @param props.ctx - the screen context.
 * @returns the view.
 */
export function MyWorkScreen({ screen, ctx }: ScreenProps<'my-work'>) {
  const letters = shownData(screen.letters)?.data ?? null
  return (
    <div className={css.screen}>
      <LoadView
        load={screen.myWork}
        render={{
          loading: () => (
            <>
              <div className={css.head}><span className={css.headBone} /></div>
              <ListSkeleton label={ctx.t('loading')} grid={css.columns} header={header(ctx.t)} cells={['bar', 'bar', 'bar', 'bar', 'bar', 'end']} count={4} />
            </>
          ),
          failed: (at, error) => <LoadError ctx={ctx} at={at} error={error} />,
          ready: data => <MyWorkList ctx={ctx} data={data} letters={letters} />,
        }}
      />
    </div>
  )
}

/**
 * The first line of My work, counted as the mockup counts its rows: the letters to file ("arrived"), the letters whose
 * work waits for a decision ("worked"), each only when there is one, and the tasks that need the person.
 * @param t - the translate function.
 * @param data - My work.
 * @returns the line, such as "1 letter worked, 1 needs you".
 */
export function firstLine(t: ScreenContext['t'], data: MyWork): string {
  const { lettersToFile: arrived, lettersWorked: worked, needYou: need } = data.summary
  const parts = [
    ...arrived === 0 ? [] : [t(arrived === 1 ? 'mywork.arrived.one' : 'mywork.arrived', { count: arrived })],
    ...worked === 0 ? [] : [t(worked === 1 ? 'mywork.worked.one' : 'mywork.worked', { count: worked })],
    need === 0 ? t('mywork.need.none') : t(need === 1 ? 'mywork.need.one' : 'mywork.need', { count: need }),
  ]
  return parts.reduce((line, part) => t('mywork.list', { first: line, next: part }))
}

/**
 * The reason of a task in the UI language: the os words it in English and German, and the other languages take the
 * English.
 * @param ctx - the screen context.
 * @param item - the task.
 * @returns the reason.
 */
function reasonOf(ctx: ScreenContext, item: WorkItem): string {
  return item.reason[ctx.locale === 'de' ? 'de' : 'en']
}

/**
 * Render the first line, the lede and the groups, or the empty state.
 * @param props.ctx - the screen context.
 * @param props.data - My work.
 * @param props.letters - the intake waiting list, for the status of each letter.
 * @returns the list.
 */
function MyWorkList({ ctx, data, letters }: { ctx: ScreenContext; data: MyWork; letters: IntakeList | null }) {
  const { t } = ctx
  const groups = groupWork(data.work)
  const clients = clientsOf(data)
  const rows = groups.flatMap(group => group.items)
  const open = (item: WorkItem) => {
    const route = routeOfAct(item.act)
    if (route !== null) ctx.navigate(route)
  }
  const focused = () => {
    const id = document.activeElement?.closest('[data-row]')?.getAttribute('data-row') ?? null
    return rows.find(item => item.id === id) ?? null
  }
  const move = (step: 1 | -1) => () => {
    const index = rows.findIndex(item => item.id === focused()?.id)
    const next = rows[Math.min(Math.max(index + step, 0), rows.length - 1)]
    if (next !== undefined) document.querySelector<HTMLElement>(`[data-row="${next.id}"]`)?.focus()
  }
  const showFiled = () => { ctx.openInMatters({ view: 'intake', list: 'filed-today', open: null }) }
  useKeyActs(ctx, {
    next: move(1),
    previous: move(-1),
    open: () => {
      const item = focused() ?? rows[0]
      if (item !== undefined) open(item)
    },
    goMatter: () => {
      const matter = focused()?.matter
      if (matter != null) ctx.openInMatters({ view: 'matter', fileNumber: matter.fileNumber })
    },
    showFiled,
  })
  const counts = ledeCounts(data)
  const day = formatToday(ctx.now, ctx.locale, ctx.timeZone)
  return (
    <>
      <header className={css.head}>
        <h1 className={css.title}>{firstLine(t, data)}</h1>
        <p className={css.lede}>{[day, ...counts.map(({ group, count }) => t(`mywork.lede.${group}`, { count }))].join(' · ')}</p>
      </header>
      {rows.length === 0
        ? (
          <EmptyState
            icon={<IconGoalOutlineRegular size={16} />}
            title={t('mywork.empty.title')}
            body={t('mywork.empty.body')}
            action={actOf(ctx, 'showFiled', t('act.showFiled'), showFiled)}
          />
        )
        : (
          <ListFrame label={t('mywork.label')} grid={css.columns} header={header(t)}>
            {groups.map(({ group, items }) => (
              <ListGroup key={group} icon={GROUP_ICONS[group]} label={t(`mywork.group.${group}`)} count={items.length}>
                {items.map((item) => {
                  const status = workStatus(item, letters, item.subject.deadline?.state ?? null)
                  const fileNumber = item.matter?.fileNumber ?? null
                  const client = fileNumber === null ? undefined : clients.get(fileNumber)
                  return (
                    <ListRow
                      key={item.id}
                      rowKey={item.id}
                      onOpen={() => { open(item) }}
                      menu={ctx.workRowMenu({ act: item.act, fileNumber })}
                    >
                      <TitleCell title={t(`mywork.task.${item.kind}`)} source={reasonOf(ctx, item)} />
                      <span className={css.status}>
                        {status !== null && <AtlasStatus status={status} word={atlasWord(t, status)} />}
                      </span>
                      <MetaCell>{fileNumber}</MetaCell>
                      <span className={css.client} title={client}>{client}</span>
                      <span className={css.legal}>
                        {item.due !== null && <><IconShieldOutlineRegular size={16} />{formatDate(item.due, ctx.locale)}</>}
                      </span>
                      <TimeCell><DueText words={ctx} due={taskDueDay(item, ctx.timeZone)} /></TimeCell>
                    </ListRow>
                  )
                })}
              </ListGroup>
            ))}
          </ListFrame>
        )}
    </>
  )
}
