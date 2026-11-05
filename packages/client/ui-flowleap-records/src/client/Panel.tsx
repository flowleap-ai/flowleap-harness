/**
 * The Matters panel: a 44px top bar and the screen of the current route. The top bar shows the view tabs (Matters,
 * Intake with its count, Work) on a list, and the breadcrumb on a detail page. An intake list with an open letter
 * shows the tabs from 1366px and, below it, the item page's breadcrumb with "1 / N" and the up and down buttons. On
 * the work page in a view 700px high or less, the top bar also shows the responsible person and the team, which the
 * page header then hides. On the work page the top bar opens the agent panel again: beside the work after minimise or
 * close, and full screen at 390px. In a browser drawer the top bar is also the row of the client frame's sidebar
 * opener (`data-frame-top-row`), so a narrow screen has one top row.
 */

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconAgentPresetOutlineRegular, IconArchiveOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular,
  IconLinkOutlineRegular, IconSearchOutlineRegular, SegmentedControl, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutCatalogEntry, ShortcutFixedCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { Act, DocumentId, Me } from './api.ts'
import { RECORDS_SCOPE, type CommandItemRegistry, type KeyActRegistry } from './key-layer.ts'
import { keycapsFrom } from './keys.ts'
import { shownData, type Load } from './load.ts'
import type { NS } from './locales.ts'
import { TAB_OF, TAB_ROUTE, type ActsResult, type Route, type Screen, type Tab } from './model.ts'
import type { DockView } from './parts/AgentDock.tsx'
import type { IntakeRowTarget } from './row-menu.ts'
import type { NewChat, ScreenContext } from './screens/context.ts'
import { IntakeScreen } from './screens/IntakeScreen.tsx'
import { DeadlineScreen } from './screens/DeadlineScreen.tsx'
import { MatterScreen, MattersScreen } from './screens/MatterScreens.tsx'
import { ActButton, OverflowActs } from './parts/Act.tsx'
import { BoardScreen } from './screens/BoardScreen.tsx'
import { shownOrder } from './screens/IntakeScreen.tsx'
import { actOf } from './screens/context.ts'
import { formatDay } from './screens/detail.tsx'
import { copyLink } from './screens/links.ts'
import { BarPeople, WorkScreen, workQueue, workTitle } from './screens/WorkScreens.tsx'
import { letterTitle, type Translate } from './words.ts'
import css from './Panel.module.css'

/** Injected share of the panel. */
export interface PanelInjected {
  readonly hooks: {
    /** The current route with its loads. */
    readonly screen: ObservableSnapshot<Screen>
    /** The signed-in person. */
    readonly me: ObservableSnapshot<Load<Me>>
    /** The letters that wait for a person. */
    readonly waitingCount: ObservableSnapshot<number | null>
    /** The shortcut catalog, for the keycaps of the acts. */
    readonly catalog: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
    /** The fixed keys, for the keycap of ↵ Open the row. */
    readonly fixedCatalog: ObservableSnapshot<readonly ShortcutFixedCatalogEntry[]>
    /** The UI language. */
    readonly language: ObservableSnapshot<LocaleId>
    /** Start a new chat about a letter; null while the runtime has no Session navigation. */
    readonly ask: ObservableSnapshot<NewChat | null>
  }
  readonly navigate: (route: Route) => void
  readonly retry: () => void
  readonly refresh: () => void
  readonly perform: (acts: readonly Act[]) => Promise<ActsResult>
  readonly contentHref: (document: DocumentId) => string
  /** The key handlers of the mounted screens. */
  readonly keyActs: KeyActRegistry
  /** The ⌘K items of the mounted screens. */
  readonly commandItems: CommandItemRegistry
  /** The address of a route. */
  readonly linkOf: (route: Route) => string
  /** Open the command menu for the open item, as ⌘K does. */
  readonly openSearch: () => void
}

/** Props of the panel; the agent panel of the work page renders the run Session's conversation slot. */
export type PanelProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<PanelInjected>
  & PropsRenderSlots<'records.agent.conversation'>

const TAB_ORDER: readonly Tab[] = ['matters', 'intake', 'work']

/**
 * Render the Matters panel.
 * @param props - the hooks, the callbacks and copy.
 * @returns the panel.
 */
export function RecordsPanel(props: PanelProps) {
  const { t, useScreen, useMe, useWaitingCount, useCatalog, useFixedCatalog, useLanguage, useAsk, useContextMenu } = props
  const screen = useScreen(value => value)
  const me = useMe(load => shownData(load)?.data ?? null)
  const waitingCount = useWaitingCount(count => count)
  const catalog = useCatalog(rows => rows)
  const fixedCatalog = useFixedCatalog(rows => rows)
  const locale = useLanguage(language => language)
  const ask = useAsk(start => start)
  const { getTriggerProps } = useContextMenu()
  const [dock, setDock] = useState<DockView>('docked')
  const ctx: ScreenContext = {
    t, locale, now: Date.now(), me,
    keycaps: keycapsFrom(catalog, fixedCatalog, { Space: t('keycap.space') }),
    navigate: props.navigate,
    retry: props.retry,
    refresh: props.refresh,
    perform: props.perform,
    contentHref: props.contentHref,
    keyActs: props.keyActs,
    commandItems: props.commandItems,
    rowMenu: (target: IntakeRowTarget) => getTriggerProps({ kind: 'records.intake-row', value: target }),
    linkOf: props.linkOf,
    agent: {
      view: dock,
      show: setDock,
      useResource: props.useResource,
      SessionProvider: props.SessionProvider,
      renderConversation: () => props.renderSlot('records.agent.conversation', {}),
      ask,
    },
  }
  const tab = TAB_OF[screen.view]
  const tabs = (
    <nav className={css.tabs} aria-label={t('tabs.label')}>
      {TAB_ORDER.map(name => (
        <button
          key={name}
          type="button"
          className={css.tab}
          aria-current={name === tab ? 'page' : undefined}
          onClick={() => { props.navigate(TAB_ROUTE[name]) }}
        >
          {t(`tab.${name}`)}
          {name === 'intake' && waitingCount !== null && <span className={css.count}>{waitingCount}</span>}
        </button>
      ))}
    </nav>
  )
  const detail = detailBar(screen, ctx)
  const search = actOf(ctx, 'search', t('intake.act.search'), props.openSearch, { icon: <IconSearchOutlineRegular size={16} /> })
  return (
    <section ref={takeStartFocus} className={css.panel} data-testid="flowleap-records" data-shortcut-scope={RECORDS_SCOPE} tabIndex={-1}>
      <header className={css.topbar} data-frame-top-row="">
        {detail === null ? tabs : null}
        {detail !== null && screen.view === 'intake' && <div className={css.wideOnly}>{tabs}</div>}
        {detail !== null && <div className={clsx(css.detailBar, screen.view === 'intake' && css.narrowOnly)}>{detail}</div>}
        <div className={css.barRight}>
          {screen.view === 'board' && (
            <>
              <SegmentedControl
                id="records-board-layout"
                className={css.layoutToggle}
                label={t('board.layout')}
                value={screen.layout ?? 'board'}
                options={[{ value: 'list', label: t('board.layoutList') }, { value: 'board', label: t('board.layoutBoard') }]}
                onChange={(layout) => { props.navigate({ view: 'board', layout }) }}
              />
              {/* At 390px the switch has no room in the top bar: the overflow menu holds it. */}
              <OverflowActs
                className={css.layoutMenu}
                label={t('board.layout')}
                side="bottom"
                selectedId={screen.layout ?? 'board'}
                acts={(['list', 'board'] as const).map(layout => ({
                  id: layout,
                  label: t(layout === 'list' ? 'board.layoutList' : 'board.layoutBoard'),
                  keycaps: [],
                  run: () => { props.navigate({ view: 'board', layout }) },
                }))}
              />
            </>
          )}
          {screen.view === 'work' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={css.agentWide}
                data-dock={dock}
                icon={<IconAgentPresetOutlineRegular size={16} />}
                onClick={() => { setDock('docked') }}
              >
                {t('actor.agent')}
              </Button>
              <Tooltip label={t('actor.agent')} side="bottom" delayMs={500}>
                <Button variant="ghost" size="sm" className={css.agentNarrow} data-dock={dock} aria-label={t('actor.agent')} onClick={() => { setDock('full') }}>
                  <IconAgentPresetOutlineRegular size={16} />
                </Button>
              </Tooltip>
            </>
          )}
          <ActButton act={search} rank="tertiary" className={css.searchWide} />
          <Button variant="ghost" size="sm" className={css.searchNarrow} aria-label={t('intake.act.search')} data-act="search" onClick={props.openSearch}>
            <IconSearchOutlineRegular size={16} />
          </Button>
        </div>
      </header>
      <div className={css.body}>{renderScreen(screen, ctx)}</div>
    </section>
  )
}

/**
 * The screen of a route.
 * @param screen - the route with its loads.
 * @param ctx - the screen context.
 * @returns the screen.
 */
function renderScreen(screen: Screen, ctx: ScreenContext): ReactNode {
  switch (screen.view) {
    case 'matters': return <MattersScreen screen={screen} ctx={ctx} />
    case 'intake': return <IntakeScreen screen={screen} ctx={ctx} />
    case 'matter': return <MatterScreen screen={screen} ctx={ctx} />
    case 'deadline': return <DeadlineScreen screen={screen} ctx={ctx} />
    case 'work': return <WorkScreen screen={screen} ctx={ctx} />
    case 'board': return <BoardScreen screen={screen} ctx={ctx} />
  }
}

/** One step of a breadcrumb: a link to a route, or the current page. */
interface Crumb {
  readonly label: string
  readonly route?: Route | undefined
  /** The matter key before the label, in the secondary colour. */
  readonly key?: string | undefined
}

/**
 * The breadcrumb and the pager of a detail page, or null on a list.
 * @param screen - the route with its loads.
 * @param ctx - the screen context.
 * @returns the detail bar.
 */
function detailBar(screen: Screen, ctx: ScreenContext): ReactNode {
  const { t } = ctx
  const matters: Crumb = { label: t('tab.matters'), route: TAB_ROUTE.matters }
  switch (screen.view) {
    case 'matters':
    case 'board':
      return null
    case 'intake': {
      if (screen.open === null) return null
      const rows = shownOrder(shownData(screen.intake)?.data.rows ?? [])
      const index = rows.findIndex(row => row.document === screen.open)
      const current = rows[index]
      const title = current === undefined ? '' : letterTitle(t, current.code, current.status)
      return (
        <>
          <Crumbs t={t} crumbs={[{ label: t('tab.intake'), route: { view: 'intake', list: screen.list, open: null } }, { label: title }]} navigate={ctx.navigate} />
          {index !== -1 && (
            <Pager
              t={t}
              index={index}
              count={rows.length}
              go={(place) => {
                const row = rows[place]
                return row === undefined ? undefined : () => { ctx.navigate({ view: 'intake', list: screen.list, open: row.document }) }
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('intake.act.copyLink')}
                onClick={() => { void copyLink(ctx.linkOf({ view: 'intake', list: screen.list, open: screen.open })) }}
              >
                <IconLinkOutlineRegular size={16} />
              </Button>
            </Pager>
          )}
        </>
      )
    }
    case 'matter': {
      const data = shownData(screen.matter)?.data
      return <Crumbs t={t} crumbs={[matters, { label: data?.matter.title ?? '', key: screen.fileNumber }]} navigate={ctx.navigate} />
    }
    case 'deadline': {
      const data = shownData(screen.deadline)?.data
      const crumbs: Crumb[] = data === undefined
        ? [matters]
        : [
          matters,
          { label: data.matter.title, key: data.matter.fileNumber, route: { view: 'matter', fileNumber: data.matter.fileNumber } },
          { label: t('crumb.deadline', { date: formatDay(data.deadline.due, ctx.locale) }) },
        ]
      return <Crumbs t={t} crumbs={crumbs} navigate={ctx.navigate} />
    }
    case 'work': {
      const data = shownData(screen.ticket)?.data
      const crumbs: Crumb[] = data === undefined
        ? [matters]
        : [
          matters,
          { label: data.matter.fileNumber, route: { view: 'matter', fileNumber: data.matter.fileNumber } },
          { label: workTitle(ctx, data) },
        ]
      const queue = workQueue(screen.queue, screen.id)
      return (
        <>
          <Crumbs t={t} crumbs={crumbs} navigate={ctx.navigate} />
          {data !== undefined && <BarPeople ctx={ctx} data={data} />}
          {queue.index !== -1 && (
            <Pager
              t={t}
              index={queue.index}
              count={queue.rows.length}
              go={(index) => {
                const row = queue.rows[index]
                return row === undefined ? undefined : () => { ctx.navigate({ view: 'work', id: row.id }) }
              }}
            />
          )}
        </>
      )
    }
  }
}

/**
 * Render the "1 / N" of a detail page with the up and down buttons.
 * @param props.t - the translate function.
 * @param props.index - the open item's place, from 0.
 * @param props.count - the items.
 * @param props.go - the act that opens the item at a place, or undefined when there is none.
 * @param props.children - more buttons after the pager, such as Copy link.
 * @returns the pager.
 */
function Pager({ t, index, count, go, children }: {
  t: Translate
  index: number
  count: number
  go: (index: number) => (() => void) | undefined
  children?: ReactNode
}) {
  const previous = go(index - 1)
  const next = go(index + 1)
  return (
    <div className={css.pager}>
      <span className={css.pagerText} aria-label={t('pager.label', { index: index + 1, count })}>{`${index + 1} / ${count}`}</span>
      <Button variant="outline" size="sm" aria-label={t('pager.previous')} disabled={previous === undefined} onClick={previous}>
        <IconChevronUpOutlineRegular size={16} />
      </Button>
      <Button variant="outline" size="sm" aria-label={t('pager.next')} disabled={next === undefined} onClick={next}>
        <IconChevronDownOutlineRegular size={16} />
      </Button>
      {children}
    </div>
  )
}

/**
 * Render a breadcrumb: each step a link, the last the current page.
 * @param props.t - the translate function.
 * @param props.crumbs - the steps.
 * @param props.navigate - go to a step.
 * @returns the breadcrumb.
 */
function Crumbs({ t, crumbs, navigate }: { t: Translate; crumbs: readonly Crumb[]; navigate: (route: Route) => void }) {
  return (
    <nav className={css.crumbs} aria-label={t('crumbs.label')}>
      <ol className={css.crumbList}>
        {crumbs.map((crumb, index) => {
          const route = index === crumbs.length - 1 ? undefined : crumb.route
          return (
            <li key={index} className={css.crumb}>
              {crumb.key !== undefined && <span className={css.key}>{crumb.key}</span>}
              {route === undefined
                ? <span className={css.here} aria-current="page">{crumb.label}</span>
                : <button type="button" className={css.crumbLink} onClick={() => { navigate(route) }}>{crumb.label}</button>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Render the Matters launcher glyph.
 * @param props - the requested size.
 * @returns the glyph.
 */
export function MattersIcon({ size }: Pick<SidebarPanelIconOwnerProps, 'size'>) {
  return <IconArchiveOutlineRegular size={size} />
}

/**
 * Take the focus when the panel mounts, so the view's single keys and ⇧⌘↵ work without a first click, as in Linear.
 * A text field or an editable element that has the focus keeps it.
 * @param element - the mounted panel, or null on unmount.
 */
export function takeStartFocus(element: HTMLElement | null): void {
  const active = document.activeElement
  if (element === null || active?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])') === true) return
  element.focus({ preventScroll: true })
}
