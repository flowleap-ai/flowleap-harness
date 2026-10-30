/**
 * FlowLeap routines (ADR 0001 decision 27): work that an event starts, on the
 * `dsh-schedule` scheduler. The register watch is a daily scheduled task that
 * names applications; at each due run the Host reads their register events
 * through `ctx.flowleapRegister` without a model call, skips the run through
 * `schedule/admit` when no event is new, and otherwise sends the stored
 * instruction with the new events. Seen events are saved after
 * `schedule/delivered`, so an event is reported once. A watch can open a new
 * chat for each run and mark the chat that received a run "Needs review"; the
 * `flowleapRoutines` Remote lists and clears the marks and lists the watches.
 *
 * See packages/host/flowleap-routines/README.md.
 * @module @deepseek-ai/dsh-flowleap-routines
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-flowleap-connectors'
import type {} from '@deepseek-ai/dsh-schedule'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { FlowleapRoutinesController } from './controller.ts'
import { RunChats } from './new-chat.ts'
import { RegisterWatches, watchViews } from './register-watch.ts'
import { ReviewMarks } from './reviews.ts'
import { routinesDomain } from './storage.ts'
import { registerWatchTool } from './tool.ts'
import type {} from './types.ts'

export { FlowleapRoutinesController } from './controller.ts'
export type { FlowleapRoutinesControllerOptions } from './controller.ts'
export { MAX_CHAT_TITLE_LENGTH, RunChats, runChatTitle } from './new-chat.ts'
export type { RunChatHost } from './new-chat.ts'
export { RegisterWatches, classifyFailure, deadlineSignal, taskChat, watchViews } from './register-watch.ts'
export type { ApplicationRead, RegisterWatchOptions, StoredWatches, WatchBaseline } from './register-watch.ts'
export { ReviewMarks } from './reviews.ts'
export type { AgentLookup } from './reviews.ts'
export { routinesDomain } from './storage.ts'
export type { ReadRecord, ReviewRecord, TaskId, WatchOptions, WatchRecord } from './storage.ts'
export { REGISTER_WATCH_CREATE_NAME, registerWatchTool, resolveOptions } from './tool.ts'
export type { RegisterWatchError, RegisterWatchView } from './tool.ts'
export type { RegisterEventView, ReviewState, RoutineReview, RoutineWatch, WatchedApplication } from './types.ts'
export {
  cleanField, countEntries, entryKey, mergeSeen, newEntries, renderRunInstruction, watchedLine,
} from './watch.ts'
export type { RegisterFailure, RegisterFailureClass, RegisterReport, RunTextBounds, SeenEntries } from './watch.ts'

/** Cordis plugin name. */
export const name = 'flowleap-routines'

/** The scheduler the watches run on, their storage, the register reader, the tool registry, and the live Agents. */
export const inject = ['schedule', 'storageDomain', 'flowleapRegister', 'tools', 'agents']

/** Plugin config. */
export interface Config {
  /** Shortest time between two register reads of one application, in hours; at least 12, the EPO OPS fair-use bound of two reads a day. */
  minReadIntervalHours: number
  /** Most applications one watch names; each is one register read in the scheduler's delivery operation. */
  maxApplications: number
  /** Longest time all register reads of one run, or of one watch creation, may take, in seconds; the scheduler waits for them. */
  readDeadlineSeconds: number
  /** Most new events one run lists; the rest are counted. */
  maxEventsPerRun: number
  /** Most characters of one event's office text in a run. */
  maxEventTextLength: number
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  minReadIntervalHours: z.number().min(12).default(12),
  maxApplications: z.number().step(1).min(1).default(20),
  readDeadlineSeconds: z.number().min(1).max(3600).default(120),
  maxEventsPerRun: z.number().step(1).min(1).max(1000).default(50),
  maxEventTextLength: z.number().step(1).min(20).max(2000).default(300),
})

/**
 * Open the routines domain and contribute the admission, delivery, change, status, and Session listeners,
 * `register_watch_create`, the chat opener, and the `flowleapRoutines` Remote.
 * @param ctx - the mounting context, carrying `schedule`, `storageDomain`, `flowleapRegister`, `tools`, and `agents`.
 * @param config - read interval, read deadline, application cap, and run text bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const opened = ctx.storageDomain.open(routinesDomain)
  // A failed open rejects the plugin; the tool and the listeners below reject with it until then.
  ctx.effect(async () => {
    const domain = await opened
    return () => domain.close()
  }, 'flowleap-routines: storage')
  // The Session controller and the workspace registry are optional services of the Web composition; a run reads them when
  // it needs a chat, so a run admitted before they mount and again after finds them.
  const chats = new RunChats(opened, () => {
    const sessionController = ctx.get('sessionController')
    const workspaceRegistry = ctx.get('workspaceRegistry')
    const sessions = ctx.get('sessions')
    if (sessionController === undefined || workspaceRegistry === undefined || sessions === undefined) return undefined
    return { sessionController, workspaceRegistry, sessions, logger: ctx.logger }
  })
  const watches = new RegisterWatches(opened, ctx.flowleapRegister, {
    minReadIntervalMs: config.minReadIntervalHours * 3_600_000,
    readDeadlineMs: config.readDeadlineSeconds * 1000,
    bounds: { maxEvents: config.maxEventsPerRun, maxTextLength: config.maxEventTextLength },
  }, ctx.logger, chats, () => { ctx.emit('flowleap-routines/changed') })
  const reviews = new ReviewMarks(opened, ctx.agents, () => { ctx.emit('flowleap-routines/changed') })
  const warn = (what: string) => (error: unknown) => { ctx.logger.warn(`register watch: ${what}: ${String(error)}`) }
  // A Host stop ended every run that was still working; the attorney still reviews what it did.
  reviews.convertRunning().catch(warn('marks of ended runs not converted'))
  ctx.on('schedule/admit', (request, next) => watches.admit(request, next))
  ctx.on('schedule/delivered', (delivery) => {
    // A run-now delivery did not pass schedule/admit: it reported no events, and the attorney started it.
    if (delivery.trigger === 'manual') return
    watches.delivered(delivery).catch((error: unknown) => {
      // The run was delivered; its events stay unseen and are reported again at the next run.
      ctx.logger.warn(`register watch ${delivery.id}: seen events not saved: ${String(error)}`)
    })
    watches.get(delivery.id).then(async (watch) => {
      if (watch?.needsReview === true) await reviews.started(delivery.receipt.targetSessionId, delivery.id)
    }).catch(warn(`${delivery.id} not marked`))
  })
  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle') reviews.idle(agent.session.id).catch(warn(`${agent.session.id} mark not updated`))
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message' || event.data.source.kind !== 'user') return
    reviews.clear(session.id).catch(warn(`${session.id} mark not cleared`))
  })
  ctx.on('schedule/changed', () => {
    watches.prune(async () => new Set((await ctx.schedule.catalog()).map(entry => entry.id))).catch(warn('prune failed'))
  })
  ctx.effect(() => registerWatchTool(ctx, watches, config.maxApplications), 'flowleap-routines: register_watch_create')
  ctx.plugin(FlowleapRoutinesController, {
    reviews,
    watches: async () => {
      const [catalog, stored] = await Promise.all([ctx.schedule.catalog(), watches.list()])
      return watchViews(catalog, stored)
    },
  })
}
