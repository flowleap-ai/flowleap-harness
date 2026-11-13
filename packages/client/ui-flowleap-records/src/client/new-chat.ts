/**
 * The new chat of the agent panel's composer: it opens a new chat in the Workspace that New Session uses and sends the
 * question in it, so the person does not send it a second time.
 * @module
 */

import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * The Workspace with the most recent Session activity, else the newest Workspace; New Session opens the same one when no
 * chat is open.
 * @param workspaces - the Workspace rows.
 * @param sessions - the Session catalog.
 * @returns the Workspace, or undefined when there is none.
 */
export function latestWorkspace(workspaces: IWorkspaces, sessions: ISessions): WorkspaceId | undefined {
  const byId = sessions.list.getSnapshot().byId
  const activity = (sessionIds: readonly SessionId[], createdAt: string) =>
    Math.max(Date.parse(createdAt), ...sessionIds.map(id => byId[id]?.updatedAt ?? Number.NEGATIVE_INFINITY))
  return workspaces.list.getSnapshot().items
    .map(item => ({ id: item.workspaceId, at: activity(item.sessionIds, item.createdAt) }))
    .reduce<{ id: WorkspaceId; at: number } | undefined>((best, next) => best === undefined || next.at > best.at ? next : best, undefined)
    ?.id
}

/**
 * Open a new chat and send the prompt in it. The Session shows a refused prompt as its own prompt error; with no
 * Workspace, New Session's notice asks for one and the prompt stays as a draft.
 * @param services - the navigation, the Session catalog, and the Workspace rows.
 * @param prompt - the message to send.
 */
export function askInNewChat(
  services: { uiWorkspace: UiWorkspace; sessions: ISessions; workspaces: IWorkspaces },
  prompt: string,
): void {
  const { uiWorkspace, sessions, workspaces } = services
  const target = latestWorkspace(workspaces, sessions)
  if (target === undefined) {
    uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'append' })
    return
  }
  uiWorkspace.openWorkspace(target, (sessionId) => {
    const binding = sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`ui-flowleap-records: the new chat ${sessionId} has no binding`)
    binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
      .catch((reason: unknown) => { console.warn('ui-flowleap-records: the question was not sent:', reason) })
  }).catch((reason: unknown) => { console.warn('ui-flowleap-records: the new chat did not open:', reason) })
}
