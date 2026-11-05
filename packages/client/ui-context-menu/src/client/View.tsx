/** Shared Web renderer for Client menu contributions. */
import { keycapText, Menu, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsStore, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { Shortcuts, ShortcutCatalogEntry, ShortcutFixedCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { createMenuStore } from './store.ts'
import type { MenuActionView } from './types.ts'

/**
 * The shortcut of a `keyText: 'keycap'` action: the boxed keycaps of its rebindable command or, when the command is
 * a fixed key such as ↵, of the fixed catalog row.
 * @param action - the action.
 * @param catalog - effective user shortcuts.
 * @param fixedCatalog - fixed keys.
 * @returns the boxed shortcut; the key labels as text for a row built without keycaps; undefined for an unlisted
 * command.
 */
function keycapShortcut(
  action: MenuActionView, catalog: readonly ShortcutCatalogEntry[], fixedCatalog: readonly ShortcutFixedCatalogEntry[],
) {
  const entry = catalog.find(row => row.id === action.commandId) ?? fixedCatalog.find(row => row.id === action.commandId)
  if (entry === undefined) return undefined
  const aria = 'aria' in entry ? entry.aria : undefined
  return entry.keycaps === undefined
    ? { keys: entry.keys, aria }
    : { keys: entry.keycaps.map(keycapText), aria, keycaps: entry.keycaps }
}

/**
 * @param actions - plain presentation.
 * @param catalog - effective user shortcuts.
 * @param fixedCatalog - fixed keys, which a `keyText: 'keycap'` action also shows.
 * @param renderSlot - owner-authorized keyed icon renderer.
 * @returns Existing Menu entries.
 */
export function menuEntries(
  actions: readonly MenuActionView[], catalog: readonly ShortcutCatalogEntry[], fixedCatalog: readonly ShortcutFixedCatalogEntry[],
  renderSlot: PropsRenderSlots<'contextMenu.icon'>['renderSlot'],
): MenuEntry[] {
  return actions.flatMap((action) => {
    const entry = catalog.find(row => row.id === action.commandId)
    const shortcut = action.keyText === 'keycap'
      ? keycapShortcut(action, catalog, fixedCatalog)
      : entry === undefined ? undefined : { keys: entry.keys, aria: entry.aria }
    const item: MenuEntry = { id: action.id, label: action.label,
      ...(shortcut === undefined ? {} : { shortcut }),
      ...(action.disabled === undefined ? {} : { disabled: action.disabled }),
      ...(action.danger === undefined ? {} : { danger: action.danger }),
      ...(action.icon === undefined ? {} : {
        icon: renderSlot('contextMenu.icon', { icon: action.icon }, { entryKey: action.icon.key }),
      }),
      ...(action.children === undefined ? {} : { submenu: menuEntries(action.children, catalog, fixedCatalog, renderSlot) }),
    }
    return action.separatorBefore ? [{ type: 'separator', id: `${action.id}:separator` }, item] : [item]
  })
}

/** Shared overlay callbacks. */
export interface MenuOverlayInjected {
  hooks: { catalog: Shortcuts['catalog']; fixedCatalog: Shortcuts['fixedCatalog'] }
  close: () => void
  returnFocus?: () => HTMLElement | null
  select: (id: string) => void
}
type Props = PropsStore<ReturnType<typeof createMenuStore>>
  & PropsRenderSlots<'contextMenu.content' | 'contextMenu.icon'> & InjectFace<MenuOverlayInjected>

/** @param props - registered state, target-specific legacy rows, and actions. @returns one menu and persistent feedback. */
export function MenuOverlay({ useStore, actions, renderSlot, close, select, returnFocus, useCatalog, useFixedCatalog }: Props) {
  const catalog = useCatalog(value => value)
  const fixedCatalog = useFixedCatalog(value => value)
  const { target, point, items, notice, occurrence, closing, replacing } = useStore(s => s)
  return <>
    <Menu key={occurrence} open={target !== null} anchor={null} portal autoFocus contextual returnFocus={returnFocus}
      exiting={closing ? replacing ? 'replace' : 'dismiss' : undefined}
      getAnchorRect={() => new DOMRect(point.x, point.y, 0, 0)}
      items={menuEntries(items.filter(item => !item.afterContent), catalog, fixedCatalog, renderSlot)}
      footer={menuEntries(items.filter(item => item.afterContent), catalog, fixedCatalog, renderSlot)} onClose={close} onSelect={select}>
      {target !== null && renderSlot('contextMenu.content', { target, dismiss: close }, { entryKey: target.kind })}
    </Menu>
    {notice !== null && <Toast key={notice.id} text={notice.text}
      {...notice.action === undefined ? {} : { actions: [notice.action] }}
      {...notice.success ? { tone: 'success' as const } : {}} onDone={() => { actions.notify(null) }} />}
  </>
}
