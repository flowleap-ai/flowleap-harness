/**
 * The keys of the client folder page: Ask about this `A`, New folder `⇧N`, Upload files `U`, Rename `F2`, Move to `⇧M`
 * (founder decision 3 of the design note), Move to Trash `Backspace` on macOS and `Delete` on Windows and Linux (where
 * Backspace goes back in the file manager), and Find `/`. Each is a rebindable command of the scope `flowleap.folder`,
 * so a key runs only while the page has the focus and never while the focus is in a text field; a button shows its
 * command's current keycaps from the shortcut catalog.
 * @module
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  ShortcutBinding, ShortcutCatalogEntry, ShortcutCommandId, ShortcutScopeId,
} from '@deepseek-ai/dsh-client-shortcuts/client'
import type { KeycapBox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FlowleapFolderKey } from './locales.ts'

/** The scope of the page root (`data-shortcut-scope="flowleap.folder"`). */
export const FOLDER_SCOPE = 'flowleap.folder' as ShortcutScopeId

/** The act of each command. */
export type KeyAct = 'ask' | 'newFolder' | 'upload' | 'rename' | 'move' | 'trash' | 'find'

/**
 * The command id and the default binding of each act, the same on desktop and Web; `other` replaces `binding` on Windows
 * and Linux.
 */
const KEYS: Readonly<Record<KeyAct, { readonly id: string; readonly binding: ShortcutBinding; readonly other?: ShortcutBinding }>> = {
  ask: { id: 'flowleap.folder.ask', binding: { code: 'KeyA', modifiers: [] } },
  newFolder: { id: 'flowleap.folder.newFolder', binding: { code: 'KeyN', modifiers: ['shift'] } },
  upload: { id: 'flowleap.folder.upload', binding: { code: 'KeyU', modifiers: [] } },
  rename: { id: 'flowleap.folder.rename', binding: { code: 'F2', modifiers: [] } },
  move: { id: 'flowleap.folder.move', binding: { code: 'KeyM', modifiers: ['shift'] } },
  trash: { id: 'flowleap.folder.trash', binding: { code: 'Backspace', modifiers: [] }, other: { code: 'Delete', modifiers: [] } },
  find: { id: 'flowleap.folder.find', binding: { code: 'Slash', modifiers: [] } },
}

/**
 * The command id of an act.
 * @param act - the act.
 * @returns the registry command id.
 */
export function commandOf(act: KeyAct): ShortcutCommandId {
  return KEYS[act].id as ShortcutCommandId
}

/** The handler of each act that the page runs now; an act with no handler passes its key on. */
export type KeyHandlers = Partial<Record<KeyAct, () => void>>

/** The page's current handlers, which the commands read on each key. */
export interface KeyHandlerSource {
  current(): KeyHandlers
}

/**
 * The keycaps of each act from the shortcut catalog.
 * @param rows - the catalog of rebindable commands.
 * @returns the lookup; an act with no binding has no keycap.
 */
export function keycapsOf(rows: readonly ShortcutCatalogEntry[]): (act: KeyAct) => readonly KeycapBox[] {
  const byId = new Map<string, readonly KeycapBox[]>(rows.map(row => [row.id, row.keycaps ?? []]))
  return act => byId.get(KEYS[act].id) ?? []
}

/** The binding on each desktop and Web profile: `mac` on macOS, `other` on Windows and Linux. */
function defaultsOf(mac: ShortcutBinding, other: ShortcutBinding): Readonly<Record<`${'desktop' | 'web'}:${'macos' | 'windows' | 'linux'}`, ShortcutBinding>> {
  return {
    'desktop:macos': mac, 'desktop:windows': other, 'desktop:linux': other,
    'web:macos': mac, 'web:windows': other, 'web:linux': other,
  }
}

/**
 * Register the scope and the seven commands, each as an effect of `ctx`.
 * @param ctx - the client context with `shortcuts`.
 * @param handlers - the page's current handlers.
 * @param t - the namespace's translate function.
 */
export function registerKeys(ctx: ClientContext, handlers: KeyHandlerSource, t: (key: FlowleapFolderKey) => string): void {
  ctx.effect(() => ctx.shortcuts.registerScope({ id: FOLDER_SCOPE, label: () => t('keys.scope') }), 'ui-flowleap-folder: key scope')
  for (const [act, { binding, other = binding }] of Object.entries(KEYS) as [KeyAct, (typeof KEYS)[KeyAct]][]) {
    ctx.effect(() => ctx.shortcuts.registerScoped({
      id: commandOf(act), scope: FOLDER_SCOPE, label: () => t(`keys.${act}`), aliases: [], defaults: defaultsOf(binding, other),
      resolve: () => {
        const run = handlers.current()[act]
        return run === undefined ? { status: 'pass' } : { status: 'handled', run }
      },
    }), `ui-flowleap-folder: key ${act}`)
  }
}
