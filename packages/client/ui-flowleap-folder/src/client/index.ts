/**
 * Browser half of the FlowLeap client folder page: the Clients row in `sidebar.panellist`, the page in the keyed
 * `main` slot, the row menu and the page's keys. The page opens a client's workspace folder with no chat. It reads
 * files under the workspace's blank Session from `uiWorkspace.connectWorkspace`, through `remote.workspaceFiles`
 * and `remote.officeToPdf`, and it writes through the folder routes of the Host half. Ask about this opens that blank
 * Session's draft with an `@` mention of each entry, and shows a single file in the Session's right sidebar. Add
 * client is a view of the same page: it reads public data through the Add client routes of the Host half and sends
 * every Firm Record command with the person's cookie.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceFileWatchFrame } from '@deepseek-ai/dsh-api-workspace-files/types'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type {} from '@deepseek-ai/dsh-office-to-pdf/remote'
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-files/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { addClientApi } from './add-client/api.ts'
import * as addClientCopy from './add-client/locales/index.ts'
import { AddClientModel } from './add-client/model.ts'
import { createFirmRecord } from './add-client/records.ts'
import { createFolderApi, readClientFolders } from './api.ts'
import { followClientFolders } from './clients.ts'
import { registerKeys, type KeyHandlers } from './keys.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapFolderKey } from './locales.ts'
import { FolderModel } from './model.ts'
import { ClientsIcon, FolderPanel, type AskTarget, type PanelInjected } from './Panel.tsx'
import { registerRowMenu } from './row-menu.ts'
import { clampTreeWidth, TREE_DEFAULT } from './TreeResize.tsx'
import type { ViewerReads } from './viewer.tsx'

export type { FlowleapFolderKey } from './locales.ts'
export type { AddClientKey } from './add-client/locales/index.ts'
export type { PanelInjected, PanelProps } from './Panel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Clients row and the client folder page. */
    'flowleapFolder': FlowleapFolderKey
    /** Add client, the Watching list and Check for new matters. */
    'flowleapAddClient': addClientCopy.AddClientKey
  }
}

/** How long Ask about this waits for the chat to be on screen before it gives up showing the file beside it. */
const ASK_SIDEBAR_WAIT_MS = 5000

/** Main panel id of the client folder page and its sidebar row. */
export const PANEL_ID = 'flowleap-folder' as MainPanelId

/** Required services: slots, copy, keys, the row menu, the layout, the workspaces and the file Remote. */
export const inject = ['slots', 'locale', 'shortcuts', 'contextMenus', 'layout', 'workspaces', 'uiWorkspace', 'remote', 'remote.workspaceFiles']

/**
 * The prompt that Ask about this drafts: one `@` mention for each entry, then a space for the person's question.
 * @param targets - the entries, relative to the client folder.
 * @returns the draft; an entry whose path a mention cannot hold is left out.
 */
export function askPrompt(targets: readonly AskTarget[]): string {
  const mentions = targets
    .map(target => target.path === '' ? undefined : formatFileMention({ path: target.path, kind: target.kind === 'directory' ? 'directory' : 'file' }, false))
    .filter((mention): mention is string => mention !== undefined)
    // A quoted folder mention stays open after its slash for completion; the draft closes it.
    .map(mention => mention.startsWith('@"') && !mention.endsWith('"') ? `${mention}"` : mention)
  return mentions.length === 0 ? '' : `${mentions.join(' ')} `
}

/**
 * Register the dictionaries, the keys, the row menu, the Clients row and the page.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-folder: dictionaries')
  const { ADD_CLIENT_NS, ...addClientDictionaries } = addClientCopy
  ctx.effect(() => ctx.locale.register(ADD_CLIENT_NS, addClientDictionaries), 'ui-flowleap-folder: Add client dictionaries')
  const t = ctx.locale.bind(NS)
  const addClientT = ctx.locale.bind(ADD_CLIENT_NS)
  const language = createSnapshotStore<LocaleId>(ctx.locale.getLocale().active)
  ctx.on('locale/change', (snapshot) => { language.set(snapshot.active) })
  const clients = createSnapshotStore<readonly WorkspaceView[]>([])
  ctx.effect(() => followClientFolders(ctx.workspaces.list, readClientFolders, clients), 'ui-flowleap-folder: clients')
  const pathOf = (workspaceId: WorkspaceId | null): string | undefined =>
    clients.getSnapshot().find(item => item.workspaceId === workspaceId)?.path

  // The tree's width stays in this browser's storage, so the person finds the tree as wide as they left it.
  const treeWidth = createSnapshotStore<number>(TREE_DEFAULT, { persist: { name: 'flowleap-folder.tree-width' } })
  treeWidth.set(clampTreeWidth(treeWidth.getSnapshot()))
  const model = new FolderModel({
    connect: workspaceId => ctx.uiWorkspace.connectWorkspace(workspaceId),
    apiFor: workspaceId => createFolderApi(workspaceId),
    watch: (session, folder, changed) => {
      const root = pathOf(model.state.workspaceId)
      if (root === undefined) return () => {}
      const target = folder === '' ? root : `${root}/${folder}`
      const stream = ctx.remote.$stream<WorkspaceFileWatchFrame>({
        name: `client folder ${folder}`,
        open: lifetime => ctx.remote.workspaceFiles.changes(session, target, lifetime),
        ended: () => new Error(`client folder watch ended: ${folder}`),
      })
      void (async () => {
        for await (const item of stream) {
          if (item.value.kind === 'ready') item.accept()
          else changed()
        }
      })().catch(() => undefined)
      return () => { void stream.dispose() }
    },
  })
  ctx.effect(() => () => { model.dispose() }, 'ui-flowleap-folder: model')
  const addClient = new AddClientModel({
    api: addClientApi,
    record: createFirmRecord(),
    open: (workspaceId) => { void model.openClient(workspaceId) },
  })
  ctx.effect(() => () => { addClient.dispose() }, 'ui-flowleap-folder: Add client')

  let keys: KeyHandlers = {}
  registerKeys(ctx, { current: () => keys }, t)

  // The Office conversion is an optional Remote service: Word and PowerPoint files show while it is present.
  let office: ClientContext['remote']['officeToPdf'] | undefined
  ctx.inject(['remote.officeToPdf'], (scope) => {
    office = scope.remote.officeToPdf
    scope.effect(() => () => { office = undefined }, 'ui-flowleap-folder: Office conversion')
  })

  const reads = (session: string): ViewerReads => ({
    bytes: async (path, signal) => {
      const result = await ctx.remote.workspaceFiles.readBytes(session as SessionId, path, {}, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value.data
    },
    officePdf: async (path, signal) => {
      if (office === undefined) throw new Error('this runtime converts no Office file')
      const result = await office.render(session as SessionId, path, 'foreground', signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value.data
    },
  })

  const ask = (workspaceId: WorkspaceId, targets: readonly AskTarget[]): void => {
    ctx.uiWorkspace.startSession(workspaceId, { prompt: askPrompt(targets), whenDraftExists: 'append' })
    const session = model.state.session
    const [only] = targets
    // One file is also shown in the chat's right sidebar, beside the conversation.
    if (session === null || targets.length !== 1 || only === undefined || only.kind !== 'file') return
    const sidebar = ctx.get('sidebarRight')
    if (sidebar === undefined) return
    const address = fileAddressFor(session, pathOf(workspaceId), only.path)
    // The chat's surface mounts after the navigation; the file opens once that Session is on screen.
    if (sidebar.mounted.getSnapshot() === session) {
      sidebar.openResource(address)
      return
    }
    const unsubscribe = sidebar.mounted.subscribe(() => {
      if (sidebar.mounted.getSnapshot() !== session) return
      stop()
      sidebar.openResource(address)
    })
    const timer = setTimeout(stop, ASK_SIDEBAR_WAIT_MS)
    // Hoisted: the listener and the timer call it only after this function returns.
    function stop(): void {
      unsubscribe()
      clearTimeout(timer)
    }
  }

  registerRowMenu(ctx, {
    open: (row) => { if (row.kind === 'directory') void model.go(row.path); else model.openFile(row.path) },
    ask: (row) => { if (model.state.workspaceId !== null) ask(model.state.workspaceId, [row]) },
    rename: (row) => { model.startRename(row.path) },
    move: (row) => { model.startMove([row.path]) },
    trash: (row) => { void model.trash([row.path]) },
    restore: (row) => { void model.restore([row.path]) },
    hostPath: row => `${pathOf(model.state.workspaceId) ?? ''}/${row.path}`,
  }, t)

  const injected: PanelInjected = {
    hooks: { folder: model.store, clients, catalog: ctx.shortcuts.catalog, language, treeWidth, addClient: addClient.store },
    addClient,
    addClientT,
    setTreeWidth: (px) => { treeWidth.set(clampTreeWidth(px)) },
    model,
    reads,
    ask,
    setKeys: (handlers) => { keys = handlers },
  }
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 19, locale: NS, label: () => t('panel'),
  }, ClientsIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => injected }, FolderPanel))
}
