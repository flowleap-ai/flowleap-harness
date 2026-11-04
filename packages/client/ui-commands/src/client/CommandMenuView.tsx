/**
 * Item-scoped command menu overlay: the open item's chip, a search input, and the item's acts with their current
 * keys, then the application group. Typing filters the acts by label inside their groups; ↑/↓ move with wrapping,
 * Enter runs the highlighted act, and Escape or a click on the scrim closes the menu.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { MenuGroup, MenuSurface, ShortcutKeys, isMobileDevice, observeStickyMenuGroups, useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCatalogEntry, Shortcuts } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { filterOptions } from './popup.ts'
import type { CommandMenuRow, CommandMenuState } from './command-menu.ts'
import css from './CommandMenu.module.css'

/** Injected face of the command menu overlay. */
export interface CommandMenuInjected {
  hooks: { menu: ObservableSnapshot<CommandMenuState>; catalog: Shortcuts['catalog'] }
  select: (id: string) => void
  close: () => void
}
type Props = InjectFace<CommandMenuInjected> & PropsLocale<'command'>

/**
 * Render the command menu while it is open.
 * @param props - menu state, shortcut catalog, menu controls, and the `command` dictionary.
 * @returns the menu for the current opening, or null while closed.
 */
export function CommandMenuView({ useMenu, useCatalog, select, close, t }: Props) {
  const menu = useMenu(value => value)
  const catalog = useCatalog(value => value)
  if (!menu.open) return null
  return <CommandMenuBody key={menu.occurrence} menu={menu} catalog={catalog} select={select} close={close} t={t} />
}

function CommandMenuBody({ menu, catalog, select, close, t }: {
  menu: CommandMenuState
  catalog: readonly ShortcutCatalogEntry[]
  select: (id: string) => void
  close: () => void
  t: Props['t']
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  useModalLayer(dialog, true, close)
  const byId = useMemo(() => new Map(menu.rows.map(row => [row.id, row])), [menu.rows])
  const rows = useMemo(() => filterOptions(menu.rows, query, 'fuzzy-label').map(option => byId.get(option.id) as CommandMenuRow),
    [menu.rows, query, byId])
  // Every row has a group; filtering keeps the group order of the contribution.
  const groups = useMemo(() => {
    const result = new Map<string, { label: string; rows: CommandMenuRow[] }>()
    for (const row of rows) {
      const group = result.get(row.group.name) ?? { label: row.group.label, rows: [] }
      group.rows.push(row)
      result.set(row.group.name, group)
    }
    return [...result]
  }, [rows])
  useEffect(() => {
    const element = viewport.current
    return element === null ? undefined : observeStickyMenuGroups(element)
  }, [groups])
  useEffect(() => {
    viewport.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, rows])
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (rows.length > 0) setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[active]
      if (row !== undefined) select(row.id)
    }
  }
  const keysOf = (row: CommandMenuRow): readonly string[] => {
    const entry = catalog.find(candidate => candidate.id === row.commandId)
    return entry?.keycaps?.flat() ?? []
  }
  let index = 0
  const renderRow = (row: CommandMenuRow) => {
    const position = index++
    const keys = keysOf(row)
    return <div key={row.id} role="option" aria-selected={position === active} aria-disabled={row.disabled || undefined}
      className={clsx(css.row, position === active && css.rowActive, row.disabled && css.rowDisabled)}
      onClick={() => { select(row.id) }} onMouseMove={() => { if (position !== active) setActive(position) }}>
      <span className={css.label}>{row.label}</span>
      {keys.length > 0 && <span aria-hidden="true" className={css.keys}><ShortcutKeys keys={keys} /></span>}
    </div>
  }
  return <div className={css.root} role="presentation">
    <div className={css.scrim} aria-hidden="true" onClick={close} />
    <MenuSurface ref={dialog} role="dialog" aria-modal="true" aria-label={t('menu.aria')} data-shortcut-modal="command-menu"
      tabIndex={-1} className={css.menu} onKeyDown={onKeyDown}>
      {/* Phones and tablets start on the item chip, so the on-screen keyboard opens only on a tap in the search. */}
      <div className={css.chip} tabIndex={-1} {...isMobileDevice() ? { 'data-modal-autofocus': '' } : {}}>{menu.item}</div>
      <input className={css.search} type="text" aria-label={t('menu.placeholder')} placeholder={t('menu.placeholder')}
        value={query} {...isMobileDevice() ? {} : { 'data-modal-autofocus': '' }}
        onChange={(event) => { setQuery(event.currentTarget.value); setActive(0) }} />
      {rows.length === 0
        ? <div className={css.empty} role="status">{t('menu.empty')}</div>
        : <div ref={viewport} role="listbox" aria-label={t('menu.listbox')} className={css.viewport}>
          {groups.map(([name, group]) => <MenuGroup key={name} label={group.label}>{group.rows.map(renderRow)}</MenuGroup>)}
        </div>}
    </MenuSurface>
  </div>
}
