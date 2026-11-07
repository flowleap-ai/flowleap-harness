/**
 * The Ticket rule: a verified Ticket delivery becomes one run Session whose first message starts with the Mandate, and
 * the new Session is reported to the Firm Record as `run-started`. The rule ends the delivery's claim in the ledger:
 * it records the delivery when the Firm Record accepted the Session, and it gives the claim back when no Session
 * opened or the Firm Record refused or did not answer, so a repeat of the delivery can start the run.
 * @module
 */

import { setTimeout as sleep } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { RecordCommandRefusal } from '@deepseek-ai/dsh-flowleap-record'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { WebhookRuleId, type VerifiedWebhookDelivery, type WebhookRule } from '@deepseek-ai/dsh-webhook'
import type { DeliveryLedger } from './ledger.ts'
import { serverWarn } from './log.ts'
import { type LetterTemplates, runMessage, runTitle, taskTypeOf } from './mandate.ts'
import type { TicketDeliveryKind } from './types.ts'

/** Rule values validated once at plugin load. */
export interface TicketRuleConfig {
  readonly source: string
  readonly workspacePath: string
  readonly agentPreset: string
  readonly permissionPreset: string
  readonly templates: LetterTemplates
  /** How many times the rule sends `run-started` at most while the Firm Record does not answer or answers 5xx. */
  readonly runStartedAttempts: number
  /** The wait before the second send in milliseconds; it doubles before each later send. */
  readonly runStartedBackoffMs: number
}

/** The id of the Ticket rule. */
export const TICKET_RULE_ID = WebhookRuleId('flowleap-ticket-run')

/** The refusals after which the same `run-started` can succeed; the repeat has the same Idempotency-Key. */
const TRANSIENT: ReadonlySet<RecordCommandRefusal> = new Set(['unreachable', 'service_error'])

/**
 * Build the Ticket rule.
 * @param ctx - context with `flowleapRecord`.
 * @param config - the source, the run Workspace, the presets, the firm templates, and the `run-started` repeats.
 * @param ledger - the delivery ledger of this plugin instance.
 * @returns the rule to register.
 */
export function ticketRule(ctx: Context, config: TicketRuleConfig, ledger: DeliveryLedger): WebhookRule<TicketDeliveryKind> {
  /** Send `run-started` until the Firm Record answers with a receipt or a refusal that a repeat cannot change. */
  async function reportStart(session: SessionId, delivery: Readonly<VerifiedWebhookDelivery<TicketDeliveryKind>>, signal: AbortSignal) {
    for (let attempt = 1; ; attempt++) {
      const result = await ctx.flowleapRecord.runStarted(delivery.event.ticketId, { session }, signal)
      if (!('error' in result) || !TRANSIENT.has(result.error) || attempt >= config.runStartedAttempts) return result
      await sleep(config.runStartedBackoffMs * 2 ** (attempt - 1), undefined, { signal })
    }
  }

  return {
    id: TICKET_RULE_ID,
    kind: 'flowleap-ticket',
    run(delivery) {
      if (delivery.source !== config.source) return null
      const taskType = taskTypeOf(delivery.event)
      if (taskType === undefined) throw new Error('no task type for the office event codes of the Ticket')
      return {
        workspacePath: config.workspacePath,
        agentPreset: config.agentPreset,
        permissionPreset: config.permissionPreset,
        title: runTitle(taskType, delivery.event),
        prompt: runMessage(taskType, delivery.event, config.templates),
      }
    },
    async started(session, delivery, signal) {
      const result = await reportStart(session, delivery, signal)
      const id = JSON.stringify(delivery.deliveryId)
      if ('error' in result) {
        ledger.release(delivery.deliveryId)
        serverWarn(`the Firm Record did not accept run-started of Session ${session} for delivery ${id}: ${result.error}; a repeat of the delivery can start the run`)
        return
      }
      try {
        await ledger.record(delivery.deliveryId, session, Date.now())
      } catch (error: unknown) {
        serverWarn(`the ledger did not record delivery ${id}: ${String(error).slice(0, 300)}`)
      }
    },
    failed(error, delivery) {
      ledger.release(delivery.deliveryId)
      serverWarn(`no run Session opened for delivery ${JSON.stringify(delivery.deliveryId)}: ${String(error).slice(0, 300)}`)
    },
  }
}
