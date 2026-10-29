/**
 * Host half of the FlowLeap budget: the `flowleapBudget` Remote reads the attorney's model spend and budget of this
 * month from the firm's model gateway, with the runtime's own virtual key. The gateway knows the spend of a key; a
 * runtime has only its own key, so it reads only its own figures. Without a configured address, without the key, or
 * without a valid answer the read reports `unknown` and the reason, never a number.
 * @module @deepseek-ai/dsh-flowleap-budget
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { BudgetMonth } from './types.ts'

export type { BudgetMonth, BudgetUnknownReason } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `flowleapBudget` Remote namespace. */
    flowleapBudget: FlowleapBudget
  }
}

/** Plugin config. */
export interface Config {
  /**
   * Address of the gateway's budget read, for example `http://flowleap-gateway:4000/flowleap/budget`; empty when the
   * runtime has no gateway, and every read then reports `unknown` (`not_configured`).
   */
  url: string
  /** Credential reference (environment-variable name) of the runtime's own virtual key; sent as a bearer token. */
  apiKeyRef: string
  /** Longest time one read may take, in milliseconds. */
  timeoutMs: number
}

/** The gateway's answer: the month, the spend, and the budget (`null` for none) of the key's attorney. */
const answerSchema = zod.object({
  month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  spent_usd: zod.number().nonnegative(),
  budget_usd: zod.number().nonnegative().nullable(),
})

/**
 * Validate the address at load: an empty text, or an absolute http or https URL.
 * @param url - the configured address.
 * @returns the address.
 * @throws when the address is not empty and not an http or https URL.
 */
function checkedUrl(url: string): string {
  if (url === '') return url
  const parsed = URL.parse(url)
  if (parsed === null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new Error(`flowleap-budget: url must be empty or an http or https URL, got "${url}"`)
  }
  return url
}

/**
 * Validate the key reference at load: a POSIX environment-variable name, the form every credential reference has.
 * @param ref - the configured reference.
 * @returns the reference.
 * @throws when the reference is not such a name.
 */
function checkedRef(ref: string): CredentialRef {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) throw new Error(`flowleap-budget: apiKeyRef must be an environment-variable name, got "${ref}"`)
  return ref as CredentialRef
}

/** Host service backing the generated `ctx.remote.flowleapBudget` namespace. */
export default class FlowleapBudget extends TypertRemoteService {
  static inject = ['credentials']
  static Config: z<Config> = z.object({
    url: z.string().default(''),
    apiKeyRef: z.string().required(),
    timeoutMs: z.number().step(1).min(100).max(60_000).default(5000),
  })

  private readonly url: string
  private readonly keyRef: CredentialRef

  /**
   * @param ctx - Host context.
   * @param config - the gateway address, the key reference, and the read deadline.
   * @throws when the address or the key reference is not valid.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'flowleapBudget')
    this.url = checkedUrl(config.url)
    this.keyRef = checkedRef(config.apiKeyRef)
  }

  /**
   * Read this month's spend and budget of the attorney from the gateway.
   * @returns the figures, or `unknown` with the reason.
   */
  @Remote
  async month(): Promise<BudgetMonth> {
    if (this.url === '') return { state: 'unknown', reason: 'not_configured' }
    const key = await this.key()
    if (key === undefined) return { state: 'unknown', reason: 'no_key' }
    let response: Response
    try {
      response = await fetch(this.url, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      })
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-budget: gateway not reached: ${String(error).slice(0, 300)}`)
      return { state: 'unknown', reason: 'unreachable' }
    }
    if (response.status === 401 || response.status === 403) return { state: 'unknown', reason: 'refused' }
    if (!response.ok) {
      this.ctx.logger.warn(`flowleap-budget: gateway answered HTTP ${String(response.status)}`)
      return { state: 'unknown', reason: 'unreachable' }
    }
    let body: unknown
    try {
      body = await response.json()
    } catch (_error: unknown) {
      // A body that is not JSON is an invalid answer; the reason says so.
      return { state: 'unknown', reason: 'invalid_answer' }
    }
    const parsed = answerSchema.safeParse(body)
    if (!parsed.success) return { state: 'unknown', reason: 'invalid_answer' }
    return { state: 'known', month: parsed.data.month, spentUsd: parsed.data.spent_usd, budgetUsd: parsed.data.budget_usd }
  }

  private async key(): Promise<string | undefined> {
    const value = (await this.ctx.credentials.resolve(this.keyRef))?.value
    return value === undefined || value === '' ? undefined : value
  }
}
