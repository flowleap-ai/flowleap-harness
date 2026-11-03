/**
 * Provider of `ctx.flowleapRecord` over HTTP: reads `GET <baseURL>/records/api/matters/<fileNumber>/view` of the Firm
 * Record with the runtime's record token as a bearer token. Without a configured address, without the token, or without
 * a valid answer the read reports the refusal, never a view.
 * @module @deepseek-ai/dsh-flowleap-record/http
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {
  DeadlineId, FlowleapRecord, LocalDate, MatterFileNumber, MatterView, MatterViewRefusal, MatterViewResult, RecordSeq, RuleId,
  ViewHash,
} from './types.ts'

/** Plugin config. */
export interface Config {
  /**
   * Base URL of the Firm Record, for example `http://flowleap-record:8091`; empty when the runtime has no Firm Record,
   * and every read then reports `not_configured`.
   */
  baseURL: string
  /** Credential reference (environment-variable name) of the runtime's record token; sent as a bearer token. */
  apiKeyRef: string
  /** Longest time one read may take, body included, in milliseconds. */
  timeoutMs: number
}

/** Most bytes of an answer body; a larger body is an invalid answer. A view with its traces stays far below this. */
const MAX_BODY_BYTES = 1024 * 1024

const localDate = zod.string().regex(/^\d{4}-\d{2}-\d{2}$/u).transform(value => brandString<LocalDate>(value))

const traceStep = zod.object({ op: zod.string().min(1), from: localDate, to: localDate, cite: zod.string() })

const deadline = zod.object({
  id: zod.string().min(1).transform(value => brandString<DeadlineId>(value)),
  ruleId: zod.string().min(1).transform(value => brandString<RuleId>(value)),
  ruleVersion: zod.number().int().positive(),
  due: localDate,
  state: zod.enum(['proposed', 'active', 'rejected']),
  trace: zod.array(traceStep),
})

/** The Firm Record's answer to a view read. */
const answerSchema = zod.object({
  recordSeq: zod.number().int().nonnegative().transform(value => brandNumber<RecordSeq>(value)),
  viewHash: zod.string().regex(/^[0-9a-f]{64}$/u).transform(value => brandString<ViewHash>(value)),
  matter: zod.object({
    fileNumber: zod.string().min(1).transform(value => brandString<MatterFileNumber>(value)),
    title: zod.string(),
    client: zod.string(),
    responsible: zod.string(),
    state: zod.enum(['open', 'closed']),
  }),
  deadlines: zod.array(deadline),
})

/**
 * Whether plain http may carry the token to this host: a loopback address, or a single-label name such as the
 * in-cluster `flowleap-record`, which does not leave the firm's network.
 * @param hostname - the URL host name.
 * @returns `true` for such a host.
 */
function privateHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(\.\d{1,3}){3}$/u.test(hostname)
    || /^[a-z0-9-]+$/iu.test(hostname)
}

/**
 * Check the Firm Record address at load.
 * @param baseURL - the configured base URL.
 * @returns the origin, or `undefined` when no base URL is configured.
 * @throws when the base URL is not https (or http to a private host).
 */
function recordOrigin(baseURL: string): URL | undefined {
  if (baseURL === '') return undefined
  const base = URL.parse(baseURL)
  const allowed = base !== null && (base.protocol === 'https:' || (base.protocol === 'http:' && privateHost(base.hostname)))
  if (!allowed) {
    throw new Error(`flowleap-record: baseURL must be empty, an https URL, or an http URL to a loopback or single-label host, got "${baseURL}"`)
  }
  return new URL(base.origin)
}

/**
 * Read a body up to a size limit.
 * @param response - the service answer.
 * @returns the text, or `undefined` when the body is larger than the limit.
 * @throws when the read fails, for example at the read deadline.
 */
async function limitedText(response: Response): Promise<string | undefined> {
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

/**
 * The refusal an HTTP status stands for.
 * @param status - the answer status.
 * @returns the refusal, or `undefined` for a successful status.
 */
function refusalOf(status: number): MatterViewRefusal | undefined {
  if (status >= 200 && status < 300) return undefined
  if (status === 404) return 'not_found'
  if (status === 401 || status === 403) return 'refused'
  return 'service_error'
}

/**
 * The view a body holds.
 * @param text - the answer body.
 * @returns the typed view, or `undefined` when the body is not a matter view.
 */
function parseView(text: string): MatterView | undefined {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (_error: unknown) {
    return undefined
  }
  const parsed = answerSchema.safeParse(body)
  return parsed.success ? parsed.data : undefined
}

/** Provider of `ctx.flowleapRecord` over the Firm Record's HTTP API. */
export default class FlowleapRecordHttp extends Service implements FlowleapRecord {
  static inject = ['credentials']
  static Config: z<Config> = z.object({
    baseURL: z.string().default(''),
    apiKeyRef: z.string().required(),
    timeoutMs: z.number().step(1).min(100).max(60_000).default(5000),
  })

  private readonly origin: URL | undefined
  private readonly keyRef: CredentialRef

  /**
   * @param ctx - Host context.
   * @param config - the Firm Record address, the token reference, and the read deadline.
   * @throws when the base URL or the token reference is not valid.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'flowleapRecord')
    this.origin = recordOrigin(config.baseURL)
    this.keyRef = credentialRef(config.apiKeyRef)
  }

  /**
   * Read the current view of one matter from the Firm Record.
   * @param fileNumber - the matter's file number.
   * @param signal - ends the read; the method rejects when it fires.
   * @returns the view, or the refusal.
   */
  async matterView(fileNumber: MatterFileNumber, signal: AbortSignal): Promise<MatterViewResult> {
    if (this.origin === undefined) return { error: 'not_configured' }
    const key = await this.key()
    if (key === undefined) return { error: 'no_key' }
    const url = new URL(`/records/api/matters/${encodeURIComponent(fileNumber)}/view`, this.origin)
    let text: string | undefined
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)]),
      })
      const refusal = refusalOf(response.status)
      if (refusal !== undefined) {
        if (refusal === 'service_error') this.ctx.logger.warn(`flowleap-record: the Firm Record answered HTTP ${String(response.status)}`)
        return { error: refusal }
      }
      text = await limitedText(response)
    } catch (error: unknown) {
      if (signal.aborted) throw error
      this.ctx.logger.warn(`flowleap-record: the Firm Record was not reached or the answer not read: ${String(error).slice(0, 300)}`)
      return { error: 'unreachable' }
    }
    const view = text === undefined ? undefined : parseView(text)
    return view ?? { error: 'invalid_answer' }
  }

  private async key(): Promise<string | undefined> {
    let value: string | undefined
    try {
      value = (await this.ctx.credentials.resolve(this.keyRef))?.value
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-record: the record token was not read: ${String(error).slice(0, 300)}`)
      return undefined
    }
    return value === undefined || value === '' ? undefined : value
  }
}
