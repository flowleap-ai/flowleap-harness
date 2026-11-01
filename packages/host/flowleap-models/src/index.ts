/**
 * Host half of the desktop model step: the `flowleapModels` Remote tests the attorney's stored Anthropic, OpenAI, or
 * OpenRouter key with one free authenticated read at that provider only, and connects OpenRouter through its OAuth
 * PKCE flow with a loopback callback, storing the new key under the route's credential reference. When the default
 * model of new chats has no key, a successful test or connect makes new chats use the provider's configured model.
 * @module @deepseek-ai/dsh-flowleap-models
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-llm'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { OpenRouterAttempt } from './openrouter.ts'
import type {
  AdoptedModel, ModelProviderId, ModelTestResult, OpenRouterConnectResult, OpenRouterConnectStart,
} from './types.ts'

export type {
  AdoptedModel, ModelProviderId, ModelTestFailure, ModelTestResult, OpenRouterConnectFailure, OpenRouterConnectResult,
  OpenRouterConnectStart,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `flowleapModels` Remote namespace. */
    flowleapModels: FlowleapModels
  }
}

/** One provider of the model step. */
export interface ProviderConfig {
  /** API base URL, as the `llm-pi-ai` route resolves it; the test reads below it. */
  baseURL: string
  /** Credential reference (environment-variable name) of the route's key, the route's `apiKeyEnv`. */
  apiKeyRef: string
  /** Provider-owned model id that new chats use after this provider is the first one with a key. */
  model: string
}

/** Plugin config. */
export interface Config {
  /** The three providers, keyed by their `llm-pi-ai` route id. */
  providers: Record<ModelProviderId, ProviderConfig>
  /** The OpenRouter authorization page. */
  openRouterAuthURL: string
  /** The label OpenRouter prefills for a key made by a connect; empty for none. */
  openRouterKeyLabel: string
  /** Longest time one key test or code exchange may take, in milliseconds. */
  requestTimeoutMs: number
  /** Time the attorney has to authorize on OpenRouter, in milliseconds. */
  connectTimeoutMs: number
}

const MODEL_PROVIDER_IDS: readonly ModelProviderId[] = ['openrouter', 'anthropic', 'openai']

function isModelProviderId(value: string): value is ModelProviderId {
  return (MODEL_PROVIDER_IDS as readonly string[]).includes(value)
}

/** The `anthropic-version` header the Anthropic model list requires. */
const ANTHROPIC_VERSION = '2023-06-01'

function providerSchema(baseURL: string, apiKeyRef: string): z<ProviderConfig> {
  return z.object({
    baseURL: z.string().default(baseURL),
    apiKeyRef: z.string().default(apiKeyRef),
    model: z.string().required(),
  })
}

/**
 * The free authenticated read that tests one key, at that provider only: the Anthropic and OpenAI model lists, and
 * OpenRouter's key read (its model list answers without a key, so it cannot test one).
 * @param provider - the provider.
 * @param baseURL - its API base URL.
 * @param key - the stored key.
 * @returns the address and the headers.
 */
function probe(provider: ModelProviderId, baseURL: string, key: string): { url: string; headers: Record<string, string> } {
  const base = baseURL.replace(/\/+$/u, '')
  switch (provider) {
    case 'anthropic':
      return { url: `${base}/v1/models?limit=1`, headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION } }
    case 'openai':
      return { url: `${base}/models`, headers: { authorization: `Bearer ${key}` } }
    case 'openrouter':
      return { url: `${base}/key`, headers: { authorization: `Bearer ${key}` } }
  }
}

function parseProvider(method: string, value: string): ModelProviderId {
  if (!isModelProviderId(value)) {
    throw new RemoteError('gateway/bad-request', `invalid payload for ${method}: unknown provider "${value}"`, {})
  }
  return value
}

/** Host service backing the generated `ctx.remote.flowleapModels` namespace. */
export default class FlowleapModels extends TypertRemoteService {
  static inject = ['credentials']
  static Config: z<Config> = z.object({
    providers: z.object({
      anthropic: providerSchema('https://api.anthropic.com', 'ANTHROPIC_API_KEY'),
      openai: providerSchema('https://api.openai.com/v1', 'OPENAI_API_KEY'),
      openrouter: providerSchema('https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY'),
    }),
    openRouterAuthURL: z.string().default('https://openrouter.ai/auth'),
    openRouterKeyLabel: z.string().default(''),
    requestTimeoutMs: z.number().step(1).min(100).max(60_000).default(10_000),
    connectTimeoutMs: z.number().step(1).min(1000).max(3_600_000).default(600_000),
  })

  private readonly refs: Record<ModelProviderId, CredentialRef>
  private attempt: OpenRouterAttempt | undefined

  /**
   * @param ctx - Host context.
   * @param config - the providers, the OpenRouter authorization page, and the deadlines.
   * @throws when a key reference is not a valid credential reference.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'flowleapModels')
    this.refs = {
      anthropic: credentialRef(config.providers.anthropic.apiKeyRef),
      openai: credentialRef(config.providers.openai.apiKeyRef),
      openrouter: credentialRef(config.providers.openrouter.apiKeyRef),
    }
    ctx.effect(() => () => { this.attempt?.cancel() }, 'flowleap-models: OpenRouter connect')
  }

  /**
   * Test the stored key of one provider with one free authenticated read at that provider.
   * @param provider - `anthropic`, `openai`, or `openrouter`.
   * @param signal - cancels the read.
   * @returns success, with the model new chats now use when the test adopted one; or the failure reason.
   * @throws RemoteError `gateway/bad-request` for an unknown provider.
   */
  @Remote
  async test(provider: string, signal: AbortSignal): Promise<ModelTestResult> {
    const id = parseProvider('flowleapModels.test', provider)
    const key = await this.key(id)
    if (key === undefined) return { ok: false, reason: 'no_key' }
    const { url, headers } = probe(id, this.config.providers[id].baseURL, key)
    let response: Response
    try {
      response = await fetch(url, {
        headers: { ...headers, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
      })
      await response.body?.cancel()
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-models: ${id} not reached for the key test: ${String(error).slice(0, 300)}`)
      return { ok: false, reason: 'unreachable' }
    }
    if (response.status === 401 || response.status === 403) return { ok: false, reason: 'refused', status: response.status }
    if (!response.ok) return { ok: false, reason: 'provider_error', status: response.status }
    const adopted = await this.adopt(id)
    return adopted === undefined ? { ok: true } : { ok: true, adopted }
  }

  /**
   * Start an OpenRouter connect, and end an earlier attempt that has not ended.
   * @returns the OpenRouter authorization page to open in the attorney's browser.
   */
  @Remote
  async startOpenRouter(): Promise<OpenRouterConnectStart> {
    this.attempt?.cancel()
    const ref = this.refs.openrouter
    this.attempt = await OpenRouterAttempt.start({
      authURL: this.config.openRouterAuthURL,
      exchangeURL: `${this.config.providers.openrouter.baseURL.replace(/\/+$/u, '')}/auth/keys`,
      keyLabel: this.config.openRouterKeyLabel,
      timeoutMs: this.config.connectTimeoutMs,
      exchangeTimeoutMs: this.config.requestTimeoutMs,
      store: key => this.ctx.credentials.set(ref, key),
      warn: (message) => { this.ctx.logger.warn(message) },
    })
    return { url: this.attempt.url }
  }

  /**
   * Wait for the end of the current OpenRouter connect.
   * @param signal - cancels the attempt itself when the caller goes away.
   * @returns the end of the attempt; `connected` carries the model new chats now use when the connect adopted one.
   */
  @Remote
  async awaitOpenRouter(signal: AbortSignal): Promise<OpenRouterConnectResult> {
    const attempt = this.attempt
    if (attempt === undefined) return { state: 'failed', reason: 'not_started' }
    const cancel = (): void => { attempt.cancel() }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const result = await attempt.result
      if (result.state !== 'connected') return result
      const adopted = await this.adopt('openrouter')
      return adopted === undefined ? result : { ...result, adopted }
    } finally {
      signal.removeEventListener('abort', cancel)
      if (this.attempt === attempt) this.attempt = undefined
    }
  }

  /** End the current OpenRouter connect as `cancelled`, as the Cancel button does; without one, nothing happens. */
  @Remote
  cancelOpenRouter(): void {
    this.attempt?.cancel()
  }

  private async key(provider: ModelProviderId): Promise<string | undefined> {
    let value: string | undefined
    try {
      value = (await this.ctx.credentials.resolve(this.refs[provider]))?.value
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-models: the ${provider} key was not read: ${String(error).slice(0, 300)}`)
      return undefined
    }
    return value === undefined || value === '' ? undefined : value
  }

  /**
   * Make new chats use this provider's configured model when the current default cannot run: a model step provider
   * without a key, or a route that no adapter registered. A default on another registered route, or on a provider with
   * a key, stays.
   */
  private async adopt(provider: ModelProviderId): Promise<AdoptedModel | undefined> {
    const defaults = this.ctx.get('agentDefaultModel')
    if (defaults === undefined) return undefined
    const current = defaults.currentSelection().provider
    if (current === provider || !await this.unusable(current)) return undefined
    const model = this.config.providers[provider].model
    try {
      await defaults.saveSelection({ provider, model })
    } catch (error: unknown) {
      this.ctx.logger.warn(`flowleap-models: the default model was not saved: ${String(error).slice(0, 300)}`)
      return undefined
    }
    return { provider, model }
  }

  private async unusable(route: string): Promise<boolean> {
    if (isModelProviderId(route)) return await this.key(route) === undefined
    const registered = this.ctx.get('llm')?.listProviders()
    return registered !== undefined && !registered.some(info => info.id === route)
  }
}
