/**
 * The Ticket ingress of an attorney's runtime: the Work router of the Firm Record posts a signed Ticket delivery to one
 * exact route; the ingress verifies `X-Flowleap-Signature`, parses the delivery, opens at most one run Session per
 * `X-Flowleap-Delivery`, and the rule reports the Session to the Firm Record as `run-started`.
 * @module @deepseek-ai/dsh-experimental-flowleap-ticket
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-webhook'
import z from '@deepseek-ai/schemastery'
import { createTicketHandler } from './handler.ts'
import { DeliveryLedger } from './ledger.ts'
import { ticketRule } from './rule.ts'

export { deliveryIdOf, parseTicketDelivery, signatureMatches } from './delivery.ts'
export { DeliveryLedger } from './ledger.ts'
export type { DeliveryState } from './ledger.ts'
export { runMessage, runTitle, taskTypeOf } from './mandate.ts'
export type { TicketTaskType } from './mandate.ts'
export { TICKET_RULE_ID, ticketRule } from './rule.ts'
export type * from './types.ts'

/** Cordis function-plugin name. */
export const name = 'flowleap-ticket'

/** The web server, the webhook runtime, the credentials, and the Firm Record seam. */
export const inject = ['webServer', 'webhookRuntime', 'credentials', 'flowleapRecord']

/** Plugin config. */
export interface Config {
  /** Adapter instance name carried to the rule. */
  readonly source: string
  /** Exact absolute route path; the Work router's `ticket.wake.path`. */
  readonly path: string
  /** Credential reference of the shared secret of the runtime's person (the Firm Record's `ticket-keys/<person id>`). */
  readonly secretRef: string
  /** Positive raw body ceiling in bytes. */
  readonly maxBodyBytes: number
  /** Absolute folder of the delivery ledger; it must outlive a restart. */
  readonly stateDir: string
  /** Absolute existing folder of the run Workspace; each run writes its letter there. */
  readonly workspacePath: string
  /** Agent preset of the run Session. */
  readonly agentPreset: string
  /** Permission preset of the run Session. */
  readonly permissionPreset: string
  /** File name of the firm template of the report letter, in the Office tools' template folder. */
  readonly template: string
  /** Most sends of `run-started` for one Session while the Firm Record does not answer or answers with a 5xx status. */
  readonly runStartedAttempts: number
  /** Wait in milliseconds before the second send of `run-started`; the wait doubles before each later send. */
  readonly runStartedBackoffMs: number
}

/** Config schema. */
export const Config: z<Config> = z.object({
  source: z.string().default('firm-record'),
  path: z.string().default('/api/flowleap/ticket'),
  secretRef: z.string().role('credential-ref').default('FLOWLEAP_TICKET_SECRET'),
  maxBodyBytes: z.number().step(1).min(1).max(1024 * 1024).default(65_536),
  stateDir: z.string().required(),
  workspacePath: z.string().required(),
  agentPreset: z.string().required(),
  permissionPreset: z.string().required(),
  template: z.string().required(),
  runStartedAttempts: z.number().step(1).min(1).max(10).default(4),
  runStartedBackoffMs: z.number().step(1).min(1).max(60_000).default(2000),
})

/**
 * Check the facts that the schema cannot express.
 * @param config - the resolved config.
 * @throws when a value is not usable.
 */
function assertConfig(config: Config): void {
  if (config.source.trim() !== config.source || config.source === '') {
    throw new Error('flowleap-ticket: source must be a non-empty trimmed string')
  }
  if (!config.path.startsWith('/') || config.path === '/' || config.path.endsWith('/')
    || config.path.includes('?') || config.path.includes('#')) {
    throw new Error('flowleap-ticket: path must be an absolute non-root pathname without a trailing slash, query, or fragment')
  }
  for (const [key, value] of [['stateDir', config.stateDir], ['workspacePath', config.workspacePath]] as const) {
    if (!isAbsolute(value)) throw new Error(`flowleap-ticket: ${key} must be an absolute path, got ${JSON.stringify(value)}`)
  }
  if (!/^[^/\\]+\.docx$/iu.test(config.template)) {
    throw new Error(`flowleap-ticket: template must be a .docx file name, got ${JSON.stringify(config.template)}`)
  }
}

/**
 * Register the route and the rule; disposing the plugin removes both.
 * @param ctx - the mounting context.
 * @param config - the validated config.
 * @throws when the config is not usable or the secret reference is invalid.
 */
export function apply(ctx: Context, config: Config): void {
  assertConfig(config)
  const ledger = new DeliveryLedger(config.stateDir)
  const route = {
    kind: 'exact' as const,
    path: config.path,
    handler: createTicketHandler(ctx, {
      source: config.source,
      secretRef: credentialRef(config.secretRef),
      maxBodyBytes: config.maxBodyBytes,
    }, ledger),
  }
  ctx.effect(() => ctx.webhookRuntime.register(ticketRule(ctx, config, ledger)), 'flowleap-ticket: rule')
  ctx.effect(() => ctx.webServer.register(route), `flowleap-ticket: ${config.path}`)
}
