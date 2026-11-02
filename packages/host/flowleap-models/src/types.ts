/**
 * Client-safe vocabulary of the `flowleapModels` Remote: the model providers of the desktop model step, the result of
 * a key test, and the result of an OpenRouter connect. Types only.
 * @module @deepseek-ai/dsh-flowleap-models/types
 */

/** The model providers the model step offers; each is an `llm-pi-ai` route id of the same name. */
export type ModelProviderId = 'anthropic' | 'openai' | 'openrouter'

/** The model that new chats use after a step adopted it. */
export interface AdoptedModel {
  /** The provider route. */
  readonly provider: ModelProviderId
  /** The provider-owned model id. */
  readonly model: string
}

/** Why a key test failed. */
export type ModelTestFailure =
  /** No key is stored for the provider. */
  | 'no_key'
  /** The provider refused the key (HTTP 401 or 403). */
  | 'refused'
  /** The connection failed or the answer did not arrive in time. */
  | 'unreachable'
  /** The provider answered with another HTTP error status. */
  | 'provider_error'

/** The result of one key test. */
export type ModelTestResult =
  | {
    readonly ok: true
    /** The default model this test made new chats use, when the old default had no key. */
    readonly adopted?: AdoptedModel
  }
  | {
    readonly ok: false
    readonly reason: ModelTestFailure
    /** The HTTP status for `refused` and `provider_error`. */
    readonly status?: number
  }

/** Why an OpenRouter connect did not store a key. */
export type OpenRouterConnectFailure =
  /** The attorney did not authorize, or the callback carried no code. */
  | 'denied'
  /** OpenRouter refused the code exchange, or answered without a key. */
  | 'exchange_refused'
  /** OpenRouter was not reached for the code exchange. */
  | 'unreachable'
  /** The credential store refused the key, for example a firm `lockedRefs` entry. */
  | 'store_refused'
  /** No callback arrived before the attempt deadline. */
  | 'timeout'
  /** No attempt was started, or a later start replaced this one. */
  | 'not_started'

/** The address the attorney opens to authorize the app on OpenRouter. */
export interface OpenRouterConnectStart {
  /** The OpenRouter authorization page, with the PKCE challenge, the state, and the loopback callback. */
  readonly url: string
}

/** The end of one OpenRouter connect attempt. */
export type OpenRouterConnectResult =
  | {
    readonly state: 'connected'
    /** The default model this connect made new chats use, when the old default had no key. */
    readonly adopted?: AdoptedModel
  }
  | { readonly state: 'cancelled' }
  | { readonly state: 'failed'; readonly reason: OpenRouterConnectFailure }
