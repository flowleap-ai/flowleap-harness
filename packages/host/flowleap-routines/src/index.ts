/**
 * FlowLeap routines (ADR 0001 decision 27): work that an event starts, on the
 * `dsh-schedule` scheduler. The register watch is a daily scheduled task that
 * names applications; at each due run the Host reads their register events
 * through `ctx.flowleapRegister` without a model call, skips the run through
 * `schedule/admit` when no event is new, and otherwise sends the stored
 * instruction with the new events. Seen events are saved after
 * `schedule/delivered`, so an event is reported once.
 *
 * See packages/host/flowleap-routines/README.md.
 * @module @deepseek-ai/dsh-flowleap-routines
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-flowleap-connectors'
import type {} from '@deepseek-ai/dsh-schedule'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { RegisterWatches } from './register-watch.ts'
import { routinesDomain } from './storage.ts'
import { registerWatchTool } from './tool.ts'

export { RegisterWatches, failureMessage } from './register-watch.ts'
export type { ApplicationRead, WatchBaseline } from './register-watch.ts'
export { routinesDomain } from './storage.ts'
export type { ReadRecord, TaskId, WatchRecord } from './storage.ts'
export { REGISTER_WATCH_CREATE_NAME, registerWatchTool } from './tool.ts'
export type { RegisterWatchError, RegisterWatchView } from './tool.ts'
export {
  countEntries, entryKey, mergeSeen, newEntries, renderRunInstruction, watchedLine,
} from './watch.ts'
export type { RegisterFailure, RegisterReport, SeenEntries } from './watch.ts'

/** Cordis plugin name. */
export const name = 'flowleap-routines'

/** The scheduler the watches run on, their storage, the register reader, and the tool registry. */
export const inject = ['schedule', 'storageDomain', 'flowleapRegister', 'tools']

/** Plugin config. */
export interface Config {
  /** Shortest time between two register reads of one application, in hours; at least 12, the EPO OPS fair-use bound of two reads a day. */
  minReadIntervalHours: number
  /** Most applications one watch names; each is one register read in the scheduler's delivery operation. */
  maxApplications: number
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  minReadIntervalHours: z.number().min(12).default(12),
  maxApplications: z.number().step(1).min(1).default(20),
})

/**
 * Open the routines domain and contribute the admission, delivery, and change listeners and `register_watch_create`.
 * @param ctx - the mounting context, carrying `schedule`, `storageDomain`, `flowleapRegister`, and `tools`.
 * @param config - read interval and application cap.
 */
export function apply(ctx: Context, config: Config): void {
  const opened = ctx.storageDomain.open(routinesDomain)
  // A failed open rejects the plugin; the tool and the listeners below reject with it until then.
  ctx.effect(async () => {
    const domain = await opened
    return () => domain.close()
  }, 'flowleap-routines: storage')
  const watches = new RegisterWatches(opened, ctx.flowleapRegister, config.minReadIntervalHours * 3_600_000, ctx.logger)
  ctx.on('schedule/admit', (request, next) => watches.admit(request, next))
  ctx.on('schedule/delivered', (delivery) => {
    watches.delivered(delivery).catch((error: unknown) => {
      // The run was delivered; its events stay unseen and are reported again at the next run.
      ctx.logger.warn(`register watch ${delivery.id}: seen events not saved: ${String(error)}`)
    })
  })
  ctx.on('schedule/changed', () => {
    watches.prune(async () => new Set((await ctx.schedule.catalog()).map(entry => entry.id))).catch((error: unknown) => {
      ctx.logger.warn(`register watch: prune failed: ${String(error)}`)
    })
  })
  ctx.effect(() => registerWatchTool(ctx, watches, config.maxApplications), 'flowleap-routines: register_watch_create')
}
