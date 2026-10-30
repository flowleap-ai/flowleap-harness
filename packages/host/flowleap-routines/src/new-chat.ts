/**
 * A new chat for each run: the chat a redirected run is delivered to, created once per pending run in the workspace of
 * the task's chat, and its title from the first new event.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionController } from '@deepseek-ai/dsh-api-session-controller'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { routinesDomain, TaskId } from './storage.ts'
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

/**
 * Opens one chat per pending run of a task. The link from the task to its open chat, with the task's target, is stored
 * until `schedule/delivered`, so a run admitted again after a failed delivery, a Host stop, or a crash goes to the chat it
 * already opened. A link whose target differs from the task's current target belongs to a delivered run and is replaced.
 */
export class RunChats {
  /**
   * @param domain - the `flowleap_routines` domain while it opens; every operation waits for it.
   * @param host - reads the Host services when a run needs a chat; `undefined` while no Session controller is mounted.
   */
  constructor(
    private readonly domain: Promise<Domain<typeof routinesDomain>>,
    private readonly host: () => RunChatHost | undefined,
  ) {}

  /**
   * Whether this composition can open a chat now.
   * @returns true while a Session controller and a workspace registry are mounted.
   */
  available(): boolean {
    return this.host() !== undefined
  }

  /**
   * The chat of the task's pending run: the stored one for this target, or a new chat in the workspace of the task's chat (without one,
   * in the directory of that chat when it is live, otherwise the controller's default directory), titled `title`. The
   * link is stored before the title is set; a title the Session controller refuses is logged, and the chat still
   * receives the run.
   * @param taskId - the task.
   * @param scheduledAt - the task's current target, from its record; it stays the same until a delivery commits.
   * @param origin - the task's own chat; `undefined` for a task whose every run creates a chat, which opens the run chat in
   * the controller's default directory.
   * @param title - the chat title.
   * @returns the chat, or `undefined` while no Session controller is mounted.
   */
  async open(taskId: TaskId, scheduledAt: string, origin: SessionId | undefined, title: string): Promise<SessionId | undefined> {
    const runChats = (await this.domain).table('run_chats')
    const known = runChats.get(taskId)
    if (known?.scheduledAt === scheduledAt) return known.sessionId
    const host = this.host()
    if (host === undefined) return undefined
    const workspace = origin === undefined
      ? undefined
      : host.workspaceRegistry.list().find(candidate => candidate.sessionIds.includes(origin))
    const cwd = workspace === undefined && origin !== undefined ? host.sessions.get(origin)?.header.cwd : undefined
    const created = await host.sessionController.create(
      workspace !== undefined ? { workspaceId: workspace.id } : cwd !== undefined ? { cwd } : {},
    )
    await runChats.put(taskId, { scheduledAt, sessionId: created.sessionId, openedAt: new Date(Date.now()).toISOString() })
    try {
      await host.sessionController.rename({ sessionId: created.sessionId, title })
    } catch (error: unknown) {
      host.logger.warn(`register watch ${taskId}: chat ${created.sessionId} not titled: ${String(error)}`)
    }
    return created.sessionId
  }

  /**
   * Forget the open chat of tasks whose run was delivered or that no longer exist; a task without one is unchanged.
   * @param taskIds - the task ids, as the watch table keys them.
   */
  async settle(taskIds: readonly string[]): Promise<void> {
    const runChats = (await this.domain).table('run_chats')
    const stored = taskIds.filter(taskId => runChats.get(taskId) !== undefined)
    if (stored.length > 0) await runChats.deleteMany(stored)
  }
}
