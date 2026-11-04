/**
 * The Matters panel: a 44px top bar and the screen of the current route. The top bar shows the view tabs (Matters,
 * Intake with its count, Work) on a list, and the breadcrumb on a detail page. An intake list with an open letter
 * shows the tabs from 1366px and, below it, the item page's breadcrumb with "1 / N" and the up and down buttons.
 */

import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button, IconArchiveOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutCatalogEntry, ShortcutFixedCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { Act, DocumentId, Me } from './api.ts'
import { formatDate } from './format.ts'
import type { CommandItemRegistry, KeyActRegistry } from './key-layer.ts'
import { keycapsFrom } from './keys.ts'
import { shownData, type Load } from './load.ts'
import type { NS } from './locales.ts'
import { TAB_OF, TAB_ROUTE, type ActsResult, type Route, type Screen, type Tab } from './model.ts'
import type { IntakeRowTarget } from './row-menu.ts'
import type { ScreenContext } from './screens/context.ts'
import { IntakeScreen } from './screens/IntakeScreen.tsx'
import { DeadlineScreen, MatterScreen, MattersScreen } from './screens/MatterScreens.tsx'
import { BoardScreen, WorkScreen } from './screens/WorkScreens.tsx'
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
}

/** Props of the panel. */
export type PanelProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<PanelInjected>

const TAB_ORDER: readonly Tab[] = ['matters', 'intake', 'work']

/**
 * Render the Matters panel.
 * @param props - the hooks, the callbacks and copy.
 * @returns the panel.
 */
export function RecordsPanel(props: PanelProps) {
  const { t, useScreen, useMe, useWaitingCount, useCatalog, useFixedCatalog, useLanguage, useContextMenu } = props
  const screen = useScreen(value => value)
  const me = useMe(load => shownData(load)?.data ?? null)
  const waitingCount = useWaitingCount(count => count)
  const catalog = useCatalog(rows => rows)
  const fixedCatalog = useFixedCatalog(rows => rows)
  const locale = useLanguage(language => language)
  const { getTriggerProps } = useContextMenu()
  const ctx: ScreenContext = {
    t, locale, now: Date.now(), me,
    keycaps: keycapsFrom(catalog, fixedCatalog),
    navigate: props.navigate,
    retry: props.retry,
    refresh: props.refresh,
    perform: props.perform,
    contentHref: props.contentHref,
    keyActs: props.keyActs,
    commandItems: props.commandItems,
    rowMenu: (target: IntakeRowTarget) => getTriggerProps({ kind: 'records.intake-row', value: target }),
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
  return (
    <section className={css.panel} data-testid="flowleap-records" data-shortcut-scope="records" tabIndex={-1}>
      <header className={css.topbar}>
        {detail === null ? tabs : null}
        {detail !== null && screen.view === 'intake' && <div className={css.wideOnly}>{tabs}</div>}
        {detail !== null && <div className={clsx(css.detailBar, screen.view === 'intake' && css.narrowOnly)}>{detail}</div>}
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
      const rows = shownData(screen.intake)?.data.rows ?? []
      const index = rows.findIndex(row => row.document === screen.open)
      const current = rows[index]
      const title = current === undefined ? '' : letterTitle(t, current.code, current.status)
      const previous = rows[index - 1]
      const next = rows[index + 1]
      const go = (row: (typeof rows)[number] | undefined) => row === undefined
        ? undefined
        : () => { ctx.navigate({ view: 'intake', list: screen.list, open: row.document }) }
      return (
        <>
          <Crumbs t={t} crumbs={[{ label: t('tab.intake'), route: { view: 'intake', list: screen.list, open: null } }, { label: title }]} navigate={ctx.navigate} />
          {index !== -1 && (
            <div className={css.pager}>
              <span className={css.pagerText} aria-label={t('pager.label', { index: index + 1, count: rows.length })}>{`${index + 1} / ${rows.length}`}</span>
              <Button variant="outline" size="sm" aria-label={t('pager.previous')} disabled={previous === undefined} onClick={go(previous)}>
                <IconChevronUpOutlineRegular size={16} />
              </Button>
              <Button variant="outline" size="sm" aria-label={t('pager.next')} disabled={next === undefined} onClick={go(next)}>
                <IconChevronDownOutlineRegular size={16} />
              </Button>
            </div>
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
          { label: t('crumb.deadline', { date: formatDate(data.deadline.due, ctx.locale) }) },
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
          { label: letterTitle(t, data.letter?.code ?? null) },
        ]
      return <Crumbs t={t} crumbs={crumbs} navigate={ctx.navigate} />
    }
  }
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
