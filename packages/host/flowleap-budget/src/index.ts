/**
 * Host half of the FlowLeap budget: the `flowleapBudget` Remote reads the attorney's model spend and budget of this
 * month from the firm's model gateway, with the runtime's own virtual key. The gateway knows the spend of a key; a
 * runtime has only its own key, so it reads only its own figures. Without a configured gateway, without the key, or
 * without a valid answer the read reports `unknown` and the reason, never a number.
 * @module @deepseek-ai/dsh-flowleap-budget
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
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
   * Base URL of the firm's model gateway, the same value as the `baseURL` of the gateway routes in `llm-pi-ai`, for
   * example `http://flowleap-gateway:4000`; empty when the runtime has no gateway, and every read then reports
   * `unknown` (`not_configured`).
   */
  baseURL: string
  /** Path of the budget read on the gateway origin. */
  path: string
  /** Credential reference (environment-variable name) of the runtime's own virtual key; sent as a bearer token. */
  apiKeyRef: string
  /** Longest time one read may take, body included, in milliseconds. */
  timeoutMs: number
}

/** Most bytes of an answer body; a larger body is an invalid answer. The budget record is less than 100 bytes. */
const MAX_BODY_BYTES = 16 * 1024

/** The gateway's answer: the month, the spend, and the budget (`null` for none) of the key's attorney. */
const answerSchema = zod.object({
  month: zod.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  spent_usd: zod.number().nonnegative(),
  budget_usd: zod.number().nonnegative().nullable(),
})

/**
 * Whether plain http may carry the key to this host: a loopback address, or a single-label name such as the
 * in-cluster `flowleap-gateway`, which does not leave the firm's network.
 * @param hostname - the URL host name.
 * @returns `true` for such a host.
 */
function privateHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(\.\d{1,3}){3}$/u.test(hostname)
    || /^[a-z0-9-]+$/iu.test(hostname)
}

/**
 * Make the address of the budget read at load.
 * @param config - the gateway base URL and the read path.
 * @returns the address, or `undefined` when no base URL is configured.
 * @throws when the base URL is not https (or http to a private host), or when the path does not start with `/`.
 */
function budgetUrl(config: Pick<Config, 'baseURL' | 'path'>): URL | undefined {
  if (!config.path.startsWith('/')) throw new Error(`flowleap-budget: path must start with "/", got "${config.path}"`)
  if (config.baseURL === '') return undefined
  const base = URL.parse(config.baseURL)
  const allowed = base !== null && (base.protocol === 'https:' || (base.protocol === 'http:' && privateHost(base.hostname)))
  if (!allowed) {
    throw new Error(`flowleap-budget: baseURL must be empty, an https URL, or an http URL to a loopback or single-label host, got "${config.baseURL}"`)
  }
  return new URL(config.path, base.origin)
}

/**
 * Read a body up to a size limit.
 * @param response - the gateway answer.
 * @returns the text, or `undefined` when the body is larger than the limit.
 * @throws when the read fails, for example at the read deadline.
 */
async function limitedText(response: Response): Promise<string | undefined> {
  /* v8 ignore next -- fetch gives every 200 answer a body stream; an absent one is an empty body. */
  if (response.body === null) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(chunk)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Host service backing the generated `ctx.remote.flowleapBudget` namespace. */
export default class FlowleapBudget extends TypertRemoteService {
  static inject = ['credentials']
  static Config: z<Config> = z.object({
    baseURL: z.string().default(''),
    path: z.string().default('/flowleap/budget'),
    apiKeyRef: z.string().required(),
    timeoutMs: z.number().step(1).min(100).max(60_000).default(5000),
  })

  private readonly url: URL | undefined
  private readonly keyRef: CredentialRef

  /**
   * @param ctx - Host context.
   * @param config - the gateway base URL, the read path, the key reference, and the read deadline.
   * @throws when the base URL, the path, or the key reference is not valid.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'flowleapBudget')
    this.url = budgetUrl(config)
    this.keyRef = credentialRef(config.apiKeyRef)
  }

  /**
   * Read this month's spend and budget of the attorney from the gateway.
   * @returns the figures, or `unknown` with the reason.
   */
  @Remote
  async month(): Promise<BudgetMonth> {
    if (this.url === undefined) return { state: 'unknown', reason: 'not_configured' }
    const key = await this.key()
    if (key === undefined) return { state: 'unknown', reason: 'no_key' }
    let text: string | undefined
    try {
      const response = await fetch(this.url, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs),
      })
      if (response.status === 401 || response.status === 403) return { state: 'unknown', reason: 'refused' }
      if (!response.ok) {
        this.ctx.logger.warn(`flowleap-budget: gateway answered HTTP ${String(response.status)}`)
        return { state: 'unknown', reason: 'gateway_error' }
      }
      text = await limitedText(response)
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-budget: gateway not reached or answer not read: ${String(error).slice(0, 300)}`)
      return { state: 'unknown', reason: 'unreachable' }
    }
    if (text === undefined) return { state: 'unknown', reason: 'invalid_answer' }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch (_error: unknown) {
      // A body that is not JSON is an invalid answer; the reason says so.
      return { state: 'unknown', reason: 'invalid_answer' }
    }
    const parsed = answerSchema.safeParse(body)
    if (!parsed.success) return { state: 'unknown', reason: 'invalid_answer' }
    return { state: 'known', month: parsed.data.month, spentUsd: parsed.data.spent_usd, budgetUsd: parsed.data.budget_usd }
  }

  private async key(): Promise<string | undefined> {
    let value: string | undefined
    try {
      value = (await this.ctx.credentials.resolve(this.keyRef))?.value
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-budget: the key was not read: ${String(error).slice(0, 300)}`)
      return undefined
    }
    return value === undefined || value === '' ? undefined : value
  }
}
