/**
 * The client folders among the runtime's workspaces: the Clients list shows a workspace only when the Host names it as
 * a client folder in `clientsRoot`, so the runtime's default workspace and every other workspace stay out of the list.
 * @module
 */

import type { ObservableSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
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
