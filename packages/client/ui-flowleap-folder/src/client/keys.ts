/**
 * The keys of the client folder page: Ask about this `A`, New folder `⇧N`, Upload files `U`, Rename `F2`, Move to `⇧M`
 * (founder decision 3 of the design note), Move to Trash `Backspace` on macOS and `Delete` on Windows and Linux (where
 * Backspace goes back in the file manager), Find `/`, and Try again `R` on Add client. Each is a rebindable command of
 * the scope `flowleap.folder`, so a key runs only while the page has the focus and never while the focus is in a text
 * field; a button shows its command's current keycaps from the shortcut catalog. The Firm identity section of Settings
 * has its own scope `flowleap.identity` with one command, Try again `R`.
 *
 * The primary act of Add client's decision bar uses the one Record the decision command of the key map
 * (`records.decision.record`, `⇧⌘↵`), which `ui-flowleap-records` registers for the whole app. A second command with
 * the same key would conflict with it and block both, so the page reads that command's current binding from the
 * catalog and runs its own act on that key while the focus is inside Add client; the records command passes the key
 * there.
 * @module
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  ShortcutBinding, ShortcutCatalogEntry, ShortcutCommandId, ShortcutScopeId,
} from '@deepseek-ai/dsh-client-shortcuts/client'
import type { KeycapBox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AddClientTranslate } from './add-client/format.ts'
import type { FlowleapFolderKey } from './locales.ts'

/** The scope of the page root (`data-shortcut-scope="flowleap.folder"`). */
export const FOLDER_SCOPE = 'flowleap.folder' as ShortcutScopeId

/** The act of each command. */
export type KeyAct = 'ask' | 'newFolder' | 'upload' | 'rename' | 'move' | 'trash' | 'find' | 'retry'

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
  retry: { id: 'flowleap.folder.retry', binding: { code: 'KeyR', modifiers: [] } },
}

/** The app's Record the decision command (keys.md), which the decision bar of Add client shows and follows. */
export const RECORD_COMMAND = 'records.decision.record' as ShortcutCommandId

/** A binding as the shortcut catalog writes it, with physical modifiers. */
export type CatalogBinding = NonNullable<ShortcutCatalogEntry['binding']>

/** The key of Record the decision as the catalog has it now. */
export interface RecordKey {
  readonly keycaps: readonly KeycapBox[]
  /** The binding that runs the act; null when the command is unbound, in conflict, or not registered. */
  readonly binding: CatalogBinding | null
}

/**
 * The key of Record the decision.
 * @param rows - the catalog of rebindable commands.
 * @returns its keycaps and its usable binding.
 */
export function recordKeyOf(rows: readonly ShortcutCatalogEntry[]): RecordKey {
  const row = rows.find(item => item.id === RECORD_COMMAND)
  const usable = row !== undefined && row.binding !== null && row.issue === null && row.conflicts.length === 0
  return { keycaps: usable ? row.keycaps ?? [] : [], binding: usable ? row.binding : null }
}

/**
 * Whether a key press is a binding.
 * @param event - the key press.
 * @param binding - the binding; null matches nothing.
 * @returns true for the binding's key with exactly its modifiers.
 */
export function pressed(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, binding: CatalogBinding | null): boolean {
  if (binding === null || binding.secondCode !== undefined || binding.thenCode !== undefined || event.code !== binding.code) return false
  const held = { control: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey }
  return (['control', 'alt', 'shift', 'meta'] as const).every(modifier => held[modifier] === binding.modifiers.includes(modifier))
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
 * Register the scope and the eight commands, each as an effect of `ctx`.
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

/** The scope of the Firm identity section of Settings (`data-shortcut-scope="flowleap.identity"`). */
export const IDENTITY_SCOPE = 'flowleap.identity' as ShortcutScopeId

/** Try again of the Firm identity section. */
export const IDENTITY_RETRY = 'flowleap.identity.retry' as ShortcutCommandId

/**
 * Register the scope and the Try again command of the Firm identity section, each as an effect of `ctx`.
 * @param ctx - the client context with `shortcuts`.
 * @param retry - the act of Try again now; undefined passes the key on.
 * @param t - the translate function of the Add client namespace.
 */
export function registerIdentityKeys(ctx: ClientContext, retry: () => (() => void) | undefined, t: AddClientTranslate): void {
  ctx.effect(() => ctx.shortcuts.registerScope({ id: IDENTITY_SCOPE, label: () => t('keys.identity.scope') }), 'ui-flowleap-folder: identity key scope')
  const binding = KEYS.retry.binding
  ctx.effect(() => ctx.shortcuts.registerScoped({
    id: IDENTITY_RETRY, scope: IDENTITY_SCOPE, label: () => t('keys.identity.retry'), aliases: [], defaults: defaultsOf(binding, binding),
    resolve: () => {
      const run = retry()
      return run === undefined ? { status: 'pass' } : { status: 'handled', run }
    },
  }), 'ui-flowleap-folder: identity key retry')
}

/**
 * The keycaps of Try again of the Firm identity section.
 * @param rows - the catalog of rebindable commands.
 * @returns the keycaps; none when the command has no binding.
 */
export function identityRetryKeycaps(rows: readonly ShortcutCatalogEntry[]): readonly KeycapBox[] {
  return rows.find(row => row.id === IDENTITY_RETRY)?.keycaps ?? []
}
