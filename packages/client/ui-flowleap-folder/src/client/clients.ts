/**
 * The client folders among the runtime's workspaces, and the rows of the Clients list: the list shows a workspace only
 * when the Host names it as a client folder in `clientsRoot`, so the runtime's default workspace and every other
 * workspace stay out of the list.
 * @module
 */

import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { BuildStatus } from '../add-client/wire.ts'
import type { ClientFoldersAnswer } from '../route.ts'
import type { FolderResult } from './api.ts'

/**
 * Keep `clients` at the workspaces that are client folders, in the runtime's order. The Host is asked again each time
 * the set of workspace ids changes, so a client folder that Add client made shows once the Host names it. Only the
 * answer of the last question applies. A failed question keeps the client folders known before and is asked again at
 * the next change of the set.
 * @param workspaces - the runtime's workspaces.
 * @param read - the Host's answer about which workspaces are client folders.
 * @param clients - the store that takes the client folders.
 * @returns the end of the follow; an answer that comes after it changes nothing.
 */
export function followClientFolders(
  workspaces: ObservableSnapshot<{ readonly items: readonly WorkspaceView[] }>,
  read: () => Promise<FolderResult<ClientFoldersAnswer>>,
  clients: SnapshotStore<readonly WorkspaceView[]>,
): () => void {
  let clientIds: ReadonlySet<string> = new Set()
  let asked: string | undefined
  let question = 0
  let stopped = false
  const show = () => { clients.set(workspaces.getSnapshot().items.filter(item => clientIds.has(item.workspaceId))) }
  const sync = () => {
    show()
    const ids = workspaces.getSnapshot().items.map(item => item.workspaceId).sort().join('\n')
    if (ids === asked) return
    asked = ids
    const mine = ++question
    void read().then((result) => {
      if (stopped || mine !== question) return
      if (!result.ok) {
        asked = undefined
        return
      }
      clientIds = new Set(result.value.workspaces)
      show()
    })
  }
  const unsubscribe = workspaces.subscribe(sync)
  sync()
  return () => {
    stopped = true
    unsubscribe()
  }
}

/** What a row of the Clients list opens: the client folder, or the build, where Try again is. */
export type ClientRowOpens =
  | { readonly kind: 'folder'; readonly workspaceId: WorkspaceId }
  | { readonly kind: 'build'; readonly clientId: BuildStatus['clientId'] }

/** One row of the Clients list. */
export interface ClientRow {
  /** The workspace id of a client folder, or the client id of a build with no listed folder yet. */
  readonly key: string
  readonly name: string
  /** ISO-8601 instant: when the client folder was added, or when the build of a client with no folder yet started. */
  readonly added: string
  /** The build that the row shows: one that runs, failed or stopped. A done build shows nothing. */
  readonly build: BuildStatus | undefined
  readonly opens: ClientRowOpens
}

/**
 * The rows of the Clients list: one for each build whose folder is not a listed client folder yet, then one for each
 * client folder. While the build of a client folder runs, or after it failed or stopped, the row shows it and opens it.
 * @param clients - the client folders.
 * @param builds - the builds of the Host's last `status` answer.
 * @returns the rows, in that order.
 */
export function clientRows(clients: readonly WorkspaceView[], builds: readonly BuildStatus[]): ClientRow[] {
  const pending = builds.filter(build => build.state !== 'done' && !clients.some(item => item.workspaceId === build.workspace))
  return [
    ...pending.map((build): ClientRow => ({
      key: build.clientId, name: build.name, added: build.startedAt, build, opens: { kind: 'build', clientId: build.clientId },
    })),
    ...clients.map((item): ClientRow => {
      const found = builds.find(build => build.workspace === item.workspaceId)
      const build = found?.state === 'done' ? undefined : found
      return {
        key: item.workspaceId, name: item.title, added: item.createdAt, build,
        opens: build === undefined ? { kind: 'folder', workspaceId: item.workspaceId } : { kind: 'build', clientId: build.clientId },
      }
    }),
  ]
}
