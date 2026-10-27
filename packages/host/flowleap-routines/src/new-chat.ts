/**
 * A new chat for each run: the chat a redirected occurrence is delivered to, created once per occurrence in the
 * workspace of the task's chat, and its title from the first new event.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionController } from '@deepseek-ai/dsh-api-session-controller'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { TaskId } from './storage.ts'
import { cleanField, type RegisterReport } from './watch.ts'

/** Most characters of a run chat title; the session-title service applies its own byte bound after this one. */
export const MAX_CHAT_TITLE_LENGTH = 120

/** What opening a chat needs from the Host. */
export interface RunChatHost {
  /** Creates and renames chats. */
  readonly sessionController: Pick<SessionController, 'create' | 'rename'>
  /** Finds the workspace of the task's chat. */
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'list'>
  /** The live Sessions, for the directory of a task's chat outside every workspace. */
  readonly sessions: Pick<Context['sessions'], 'get'>
  /** Plugin logger for a title that could not be set. */
  readonly logger: Context['logger']
}

/**
 * The title of a run chat: `<application>: <event text> (<date>)` of the first new entry of the first report, then
 * ` +N` for the other new entries, cut to {@link MAX_CHAT_TITLE_LENGTH}.
 * @param reports - new entries per application; at least one entry.
 * @returns the title.
 */
export function runChatTitle(reports: readonly RegisterReport[]): string {
  const first = reports.flatMap(report => report.entries.map(entry => ({ application: report.application, entry })))[0]
  if (first === undefined) return 'Register event'
  const { application, entry } = first
  const more = reports.reduce((count, report) => count + report.entries.length, 0) - 1
  const suffix = more > 0 ? ` +${String(more)}` : ''
  const head = cleanField(`${application}: ${entry.description} (${entry.date})`, MAX_CHAT_TITLE_LENGTH - suffix.length)
  return `${head}${suffix}`
}

/** Opens one chat per occurrence; the same occurrence admitted again after a failed delivery reuses its chat. */
export class RunChats {
  /** Chat per occurrence until that occurrence is delivered. */
  private readonly opened = new Map<string, SessionId>()

  /**
   * @param host - the Session controller, the workspace registry, the Sessions, and the logger.
   */
  constructor(private readonly host: RunChatHost) {}

  /**
   * The chat of one occurrence: the one opened for it before, or a new chat in the workspace of the task's chat
   * (without one, in the directory of that chat when it is live, otherwise the controller's default directory),
   * titled `title`. A title the Session controller refuses is logged; the chat still receives the run.
   * @param taskId - the task.
   * @param scheduledAt - the occurrence's target, from the task record.
   * @param origin - the task's own chat.
   * @param title - the chat title.
   * @returns the chat.
   */
  async open(taskId: TaskId, scheduledAt: string, origin: SessionId, title: string): Promise<SessionId> {
    const key = occurrenceKey(taskId, scheduledAt)
    const known = this.opened.get(key)
    if (known !== undefined) return known
    const workspace = this.host.workspaceRegistry.list().find(candidate => candidate.sessionIds.includes(origin))
    const cwd = workspace === undefined ? this.host.sessions.get(origin)?.header.cwd : undefined
    const created = await this.host.sessionController.create(
      workspace !== undefined ? { workspaceId: workspace.id } : cwd !== undefined ? { cwd } : {},
    )
    this.opened.set(key, created.sessionId)
    try {
      await this.host.sessionController.rename({ sessionId: created.sessionId, title })
    } catch (error: unknown) {
      this.host.logger.warn(`register watch ${taskId}: chat ${created.sessionId} not titled: ${String(error)}`)
    }
    return created.sessionId
  }

  /**
   * Forget the chat of a delivered occurrence.
   * @param taskId - the task.
   * @param scheduledAt - the delivered occurrence's target, from its receipt.
   */
  settle(taskId: TaskId, scheduledAt: string): void {
    this.opened.delete(occurrenceKey(taskId, scheduledAt))
  }
}

function occurrenceKey(taskId: TaskId, scheduledAt: string): string {
  return `${taskId}@${scheduledAt}`
}
