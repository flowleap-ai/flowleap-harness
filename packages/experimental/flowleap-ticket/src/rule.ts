/**
 * The Ticket rule: a verified Ticket delivery becomes one run Session whose first message starts with the Mandate, and
 * the new Session is reported to the Firm Record as `run-started`.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-flowleap-record'
import { WebhookRuleId, type WebhookRule } from '@deepseek-ai/dsh-webhook'
import type { DeliveryLedger } from './ledger.ts'
import { runMessage, runTitle, taskTypeOf } from './mandate.ts'
import type { TicketDeliveryKind } from './types.ts'

/** Rule values validated once at plugin load. */
export interface TicketRuleConfig {
  readonly source: string
  readonly workspacePath: string
  readonly agentPreset: string
  readonly permissionPreset: string
  readonly template: string
}

/** The id of the Ticket rule. */
export const TICKET_RULE_ID = WebhookRuleId('flowleap-ticket-run')

/**
 * Build the Ticket rule.
 * @param ctx - context with `flowleapRecord`.
 * @param config - the source, the run Workspace, the presets, and the firm template.
 * @param ledger - the delivery ledger of this plugin instance.
 * @returns the rule to register.
 */
export function ticketRule(ctx: Context, config: TicketRuleConfig, ledger: DeliveryLedger): WebhookRule<TicketDeliveryKind> {
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
        prompt: runMessage(taskType, delivery.event, config.template),
      }
    },
    async started(session, delivery, signal) {
      await ledger.record(delivery.deliveryId, session, Date.now())
      const result = await ctx.flowleapRecord.runStarted(delivery.event.ticketId, { session }, signal)
      if ('error' in result) {
        ctx.logger.warn(`flowleap-ticket: the Firm Record refused run-started for delivery ${JSON.stringify(delivery.deliveryId)}: ${result.error}`)
      }
    },
  }
}
