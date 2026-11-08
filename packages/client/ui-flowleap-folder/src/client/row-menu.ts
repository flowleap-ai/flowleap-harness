/**
 * The context menu of a row of the client folder page: Open, Ask about this, Rename, Move to and Copy path, with the
 * keys of the page's commands.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { MenuAction } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import {
  IconCopyOutlineRegular, IconEditOutlineRegular, IconNewChatOutlineRegular, IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { commandOf } from './keys.ts'
import type { FlowleapFolderKey } from './locales.ts'

/** The row a menu opens on. */
export interface FolderRowTarget {
  /** The entry relative to the client folder. */
  readonly path: string
  readonly kind: 'file' | 'directory'
}

declare module '@deepseek-ai/dsh-client-ui-context-menu/client' {
  interface ContextMenuTargetMap {
    /** A row of the client folder page. */
    'flowleap.folder-row': FolderRowTarget
  }
}

/** The menu's acts on a row, which the page provides. */
export interface FolderRowActs {
  readonly open: (row: FolderRowTarget) => void
  readonly ask: (row: FolderRowTarget) => void
  readonly rename: (row: FolderRowTarget) => void
  readonly move: (row: FolderRowTarget) => void
  /** The entry's path on the Host, for Copy path. */
  readonly hostPath: (row: FolderRowTarget) => string
}

const ICONS = {
  'flowleap.folder.open': IconRightUpOutlineRegular,
  'flowleap.folder.ask': IconNewChatOutlineRegular,
  'flowleap.folder.rename': IconEditOutlineRegular,
  'flowleap.folder.move': IconRightUpOutlineRegular,
  'flowleap.folder.copyPath': IconCopyOutlineRegular,
} as const

/**
 * The acts of one row.
 * @param acts - the page's acts.
 * @param t - the namespace's translate function.
 * @param row - the row.
 * @returns the menu items.
 */
export function rowActions(acts: FolderRowActs, t: (key: FlowleapFolderKey) => string, row: FolderRowTarget): MenuAction[] {
  return [
    { id: 'open', label: t('act.open'), icon: { key: 'flowleap.folder.open' }, run: () => { acts.open(row) } },
    { id: 'ask', label: t('act.ask'), icon: { key: 'flowleap.folder.ask' }, commandId: commandOf('ask'), keyText: 'keycap', run: () => { acts.ask(row) } },
    { id: 'rename', label: t('act.rename'), icon: { key: 'flowleap.folder.rename' }, commandId: commandOf('rename'), keyText: 'keycap', separatorBefore: true, run: () => { acts.rename(row) } },
    { id: 'move', label: t('act.move'), icon: { key: 'flowleap.folder.move' }, commandId: commandOf('move'), keyText: 'keycap', run: () => { acts.move(row) } },
    {
      id: 'copy-path', label: t('act.copyPath'), icon: { key: 'flowleap.folder.copyPath' }, separatorBefore: true,
      run: async () => { await navigator.clipboard.writeText(acts.hostPath(row)) },
    },
  ]
}

/**
 * Register the row menu and its icons, each as an effect of `ctx`.
 * @param ctx - the client context with `slots` and `contextMenus`.
 * @param acts - the page's acts.
 * @param t - the namespace's translate function.
 */
export function registerRowMenu(ctx: Context, acts: FolderRowActs, t: (key: FlowleapFolderKey) => string): void {
  ctx.slots.inject('contextMenu.icon', function* () {
    for (const [key, Icon] of Object.entries(ICONS)) yield ctx.slots.register({ name: 'contextMenu.icon', key }, Icon)
  })
  ctx.effect(() => ctx.contextMenus.register({
    id: 'flowleap.folder-row', target: 'flowleap.folder-row', order: 0, resolve: row => rowActions(acts, t, row),
  }), 'ui-flowleap-folder: row menu')
}
