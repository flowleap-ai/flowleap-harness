/** Host timer over stored tasks; Session activation is a delivery operation. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'schedule': { kind: 'schedule' } & ContextFormed
  }
}
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { isRecurringScheduleRecord, renderReminderFraming, renderRecurringReminderBatchFraming, resolveRecurringOccurrence } from './domain.ts'
import type { DeliveryRetentionBounds, RecurringScheduleRecord, ScheduleAdmission, ScheduleDeliveryReceipt, ScheduleRecord } from './types.ts'
import type { ScheduleTask } from './storage.ts'
import { appendDelivery } from './delivery-history.ts'

/** The `deliver` admission of one member. */
type DeliverAdmission = Extract<ScheduleAdmission, { kind: 'deliver' }>

/** Largest delay Node timers represent without clamping. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647

/** Owns at most one timer across recomputations; delivery and management share the serialized operation. */
export class ScheduleRuntime {
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | undefined
  private stopping = false
  /** Aborted at disposal, so `schedule/admit` listeners stop their work. */
  private readonly stop = new AbortController()
  private requested = false

  /**
   * @param ctx - Host services used to resume and enqueue.
   * @param tasks - Current durable tasks.
   * @param transact - Serialize delivery against management writes.
   * @param commit - Persist task status, target, receipt, and history together after durable inbox delivery.
   * @param resolveAgent - Host fallback after embedding activation handlers delegate.
   */
  constructor(
    private readonly ctx: Context,
    private readonly tasks: () => readonly ScheduleTask[],
    private readonly transact: (work: () => Promise<void>) => Promise<void>,
    private readonly commit: (task: ScheduleTask) => Promise<void>,
    private readonly retention: DeliveryRetentionBounds,
    private readonly resolveAgent: (sessionId: SessionId) => Promise<Agent>,
  ) {}

  /**
   * Recompute the nearest obligation after startup or a durable change.
   * Dispatch failures are logged; refused admission does not retry automatically.
   */
  requestDrive(): void {
    if (this.stopping) return
    this.requested = true
    this.clearTimer()
    if (this.running !== undefined) return
    let run: Promise<void>
    try {
      run = this.ctx.agents.withoutInitiator(async () => {
        while (this.requested && !this.stopping) {
          this.requested = false
          await this.transact(async () => { await this.drive() })
        }
      })
    } catch (error: unknown) {
      // Ancestor unloading closes initiator admission before runtime cleanup runs.
      this.requested = false
      this.ctx.logger.warn(`schedule: dispatch stopped: ${String(error)}`)
      return
    }
    this.running = run
    void run.catch((error: unknown) => {
      this.ctx.logger.warn(`schedule: dispatch stopped: ${String(error)}`)
    }).finally(() => {
      this.running = undefined
      if (this.requested && !this.stopping) this.requestDrive()
    })
  }

  /** Stop the timer and drain an accepted delivery before storage closes. */
  async dispose(): Promise<void> {
    this.stopping = true
    this.stop.abort(new Error('Schedule runtime is stopping'))
    this.clearTimer()
    // requestDrive reports execution failures; teardown only waits for quiescence.
    await this.running?.catch(() => undefined)
  }

  /**
   * Advance one skipped occurrence as a delivery would, without a receipt.
   * @param task - Due task a `schedule/admit` listener skipped.
   * @param now - Clock reading that selects the latest due occurrence.
   * @returns The task with its next target, or inactive when no target remains.
   */
  private advance(task: ScheduleTask, now: number): ScheduleTask {
    if (!isRecurringScheduleRecord(task.record)) return { ...task, status: 'inactive' }
    const occurrence = resolveRecurringOccurrence(task.record, now)
    return {
      ...task,
      record: { ...task.record, scheduledAt: occurrence.nextScheduledAt ?? occurrence.occurrenceAt },
      status: occurrence.nextScheduledAt === undefined ? 'inactive' : 'active',
    }
  }

  /**
   * Announce one committed delivery; a listener failure does not undo the commit.
   * @param task - Delivered task.
   * @param sessionId - Session that received the message.
   * @param receipt - Saved receipt of the delivery.
   */
  private announceDelivered(task: ScheduleTask, sessionId: SessionId, receipt: ScheduleDeliveryReceipt): void {
    try {
      this.ctx.emit('schedule/delivered', { sessionId, id: task.record.id, receipt })
    } catch (error: unknown) {
      this.ctx.logger.warn(`schedule: schedule/delivered listener failed: ${String(error)}`)
    }
  }

  /**
   * Restore one Session and send it the admitted members in one message, then commit each member's task write.
   * Members made future by a wall-clock rollback during restoration are left out and keep their timer obligation.
   * @param sessionId - Session that receives the message: the members' own, or an admission's redirect target.
   * @param task - The member whose rule selects the message framing; the one-shot itself, or any recurring member.
   * @param members - Admitted due members; all recurring, or one one-shot.
   * @param withPrompt - Replaces a record's stored prompt with its admitted prompt.
   * @param committed - Receives each member whose task write landed.
   */
  private async deliver(
    sessionId: SessionId,
    task: ScheduleTask,
    members: readonly ScheduleTask[],
    withPrompt: <R extends ScheduleRecord>(record: R) => R,
    committed: Set<ScheduleTask['record']['id']>,
  ): Promise<void> {
    if (this.stopping) return
    const agent = await this.ctx.waterfall('schedule/resolve-agent', sessionId, () => this.resolveAgent(sessionId))
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Disposal can run while Session restoration is awaited.
    if (this.stopping) return
    const now = Date.now()
    const admitted = members.filter(member => Date.parse(member.record.scheduledAt) <= now)
    if (admitted.length === 0) return
    const recurring = admitted.filter((member): member is ScheduleTask & { record: RecurringScheduleRecord } =>
      isRecurringScheduleRecord(member.record))
    const occurrences = recurring.map(member => ({
      task: member, occurrence: resolveRecurringOccurrence(member.record, now),
    }))
    const text = isRecurringScheduleRecord(task.record)
      ? renderRecurringReminderBatchFraming(occurrences.map(({ task: member, occurrence }) => ({
        record: withPrompt(member.record), occurrenceAt: occurrence.occurrenceAt,
      })))
      : renderReminderFraming(withPrompt(task.record))
    const message = createUserMessage({
      content: [{ type: 'text', text }], source: { kind: 'schedule' },
    })
    // followup synchronously appends the inbox splice before flush observes the Session.
    agent.followup(message)
    const flushed = await this.ctx.sessions.flush(agent.session)
    if (!flushed) throw new Error('Session persistence did not acknowledge the reminder')
    const deliveredAt = new Date(Date.now()).toISOString()
    if (!isRecurringScheduleRecord(task.record)) {
      const receipt = { scheduledAt: task.record.scheduledAt, deliveredAt, messageId: message.id }
      await this.commit({
        ...task, status: 'inactive',
        ...appendDelivery({ ...task, record: withPrompt(task.record) }, receipt, this.retention),
      })
      committed.add(task.record.id)
      this.announceDelivered(task, sessionId, receipt)
    }
    for (const { task: member, occurrence } of occurrences) {
      await this.commit({
        ...member,
        record: { ...member.record, scheduledAt: occurrence.nextScheduledAt ?? occurrence.occurrenceAt },
        status: occurrence.nextScheduledAt === undefined ? 'inactive' : 'active',
        ...appendDelivery({ ...member, record: withPrompt(member.record) },
          { scheduledAt: occurrence.occurrenceAt, deliveredAt, messageId: message.id }, this.retention),
      })
      committed.add(member.record.id)
      this.announceDelivered(member, sessionId, { scheduledAt: occurrence.occurrenceAt, deliveredAt, messageId: message.id })
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private async drive(): Promise<void> {
    this.clearTimer()
    const failed = new Set<string>()
    const handled = new Set<string>()
    const scanNow = Date.now()
    const due = this.tasks().filter(task => task.status === 'active' && Date.parse(task.record.scheduledAt) <= scanNow)
    for (const task of due) {
      if (this.stopping) return
      if (handled.has(task.record.id)) continue
      const group = isRecurringScheduleRecord(task.record)
        ? due.filter(candidate => candidate.sessionId === task.sessionId && isRecurringScheduleRecord(candidate.record))
        : [task]
      for (const member of group) handled.add(member.record.id)
      let admitted = group
      const committed = new Set<ScheduleTask['record']['id']>()
      try {
        const admissions = new Map<ScheduleTask['record']['id'], DeliverAdmission>()
        for (const member of group) {
          const admission = await this.ctx.waterfall('schedule/admit',
            { sessionId: member.sessionId, record: member.record, signal: this.stop.signal },
            () => Promise.resolve<ScheduleAdmission>({ kind: 'deliver', prompt: member.record.prompt }))
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- Disposal can run while a listener is awaited.
          if (this.stopping) return
          if (admission.kind === 'deliver') {
            admissions.set(member.record.id, admission)
            continue
          }
          await this.commit(this.advance(member, Date.now()))
          committed.add(member.record.id)
        }
        admitted = group.filter(member => admissions.has(member.record.id))
        if (admitted.length === 0) continue
        // The admitted prompt replaces the stored one in the message and the saved snapshot only.
        /* v8 ignore start -- every admitted member has an admitted prompt; the fallback only satisfies the Map type. */
        const withPrompt = <R extends ScheduleRecord>(record: R): R =>
          ({ ...record, prompt: admissions.get(record.id)?.prompt ?? record.prompt })
        /* v8 ignore stop */
        // A redirected member is delivered alone to its target; the others share the original Session's message.
        const shared = admitted.filter(member => admissions.get(member.record.id)?.sessionId === undefined)
        const batches = shared.length === 0 ? [] : [{ sessionId: task.sessionId, task, members: shared }]
        for (const member of admitted) {
          const target = admissions.get(member.record.id)?.sessionId
          if (target !== undefined) batches.push({ sessionId: target, task: member, members: [member] })
        }
        for (const batch of batches) await this.deliver(batch.sessionId, batch.task, batch.members, withPrompt, committed)
      } catch (error: unknown) {
        // Successful commits and targets made future by clock rollback keep their timer obligation.
        const pending = admitted.filter(member => !committed.has(member.record.id))
        const failedAt = Date.now()
        for (const member of pending) {
          if (Date.parse(member.record.scheduledAt) <= failedAt) failed.add(member.record.id)
        }
        const ids = pending.map(member => member.record.id)
        this.ctx.logger.warn(`schedule: reminders ${JSON.stringify(ids)} were not acknowledged: ${String(error)}`)
      }
    }
    if (this.stopping) return
    const next = this.tasks().filter(task => task.status === 'active' && !failed.has(task.record.id))
      .reduce<number | undefined>((at, task) => {
        const target = Date.parse(task.record.scheduledAt)
        return at === undefined ? target : Math.min(at, target)
      }, undefined)
    if (next !== undefined) {
      this.timer = setTimeout(() => { this.timer = undefined; this.requestDrive() },
        Math.max(0, Math.min(next - Date.now(), MAX_TIMER_DELAY_MS)))
      this.timer.unref()
    }
  }
}
