/**
 * One OpenRouter connect attempt: the OAuth PKCE (S256) authorization of the app on OpenRouter, a loopback callback
 * listener on this machine, and the exchange of the code for the attorney's own key. The attempt owns its listener,
 * its deadline, and its result; the key goes to the `store` callback and never into the result.
 * @module
 */

import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import type { OpenRouterConnectFailure } from './types.ts'

/** The end of one attempt before the default model step. */
export type AttemptResult =
  | { readonly state: 'connected' }
  | { readonly state: 'cancelled' }
  | { readonly state: 'failed'; readonly reason: OpenRouterConnectFailure }

/** What one attempt needs. */
export interface OpenRouterAttemptOptions {
  /** The OpenRouter authorization page. */
  readonly authURL: string
  /** The OpenRouter code exchange endpoint. */
  readonly exchangeURL: string
  /** The label OpenRouter prefills for the new key; empty for none. */
  readonly keyLabel: string
  /** Time the attorney has to authorize, in milliseconds. */
  readonly timeoutMs: number
  /** Longest time the code exchange may take, in milliseconds. */
  readonly exchangeTimeoutMs: number
  /** Stores the key; a rejection ends the attempt as `store_refused`. */
  readonly store: (key: string) => Promise<void>
  /** Logs a failure reason; never a key or a code. */
  readonly warn: (message: string) => void
}

/** The exchange answer; OpenRouter sends more fields, and only the key is read. */
const exchangeSchema = z.object({ key: z.string().min(1) })

const CALLBACK_PATH = '/callback'

/** Most bytes of an exchange answer; the answer is a short JSON object. */
const MAX_EXCHANGE_BYTES = 16 * 1024

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

function page(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  response.end(`<!doctype html><meta charset="utf-8"><title>OpenRouter</title><p style="font:16px system-ui;margin:3em">${text}</p>`)
}

async function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

/** A started attempt: the page to open, its result, and its cancellation. */
export class OpenRouterAttempt {
  /** The OpenRouter authorization page for this attempt. */
  readonly url: string
  /** Settles once with the end of the attempt. */
  readonly result: Promise<AttemptResult>

  private settle!: (result: AttemptResult) => void
  private settled = false
  private exchanging = false
  private readonly timer: NodeJS.Timeout

  private constructor(
    private readonly options: OpenRouterAttemptOptions,
    private readonly servers: readonly Server[],
    private readonly verifier: string,
    private readonly state: string,
    port: number,
  ) {
    this.result = new Promise((resolve) => { this.settle = resolve })
    const url = new URL(options.authURL)
    url.searchParams.set('callback_url', `http://localhost:${String(port)}${CALLBACK_PATH}`)
    url.searchParams.set('code_challenge', base64url(createHash('sha256').update(verifier).digest()))
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', state)
    if (options.keyLabel !== '') url.searchParams.set('key_label', options.keyLabel)
    this.url = url.href
    for (const server of servers) server.on('request', (request, response) => { void this.handle(request, response) })
    this.timer = setTimeout(() => { this.finish({ state: 'failed', reason: 'timeout' }) }, options.timeoutMs)
  }

  /**
   * Start an attempt: listen on a free loopback port on 127.0.0.1, and on the same port on ::1 when the host has it,
   * because the browser may resolve `localhost` to either.
   * @param options - the endpoints, the deadlines, and the key store.
   * @returns the started attempt.
   * @throws when no loopback port can be opened.
   */
  static async start(options: OpenRouterAttemptOptions): Promise<OpenRouterAttempt> {
    const v4 = createServer()
    const port = await listen(v4, 0, '127.0.0.1')
    const servers = [v4]
    const v6 = createServer()
    try {
      await listen(v6, port, '::1')
      servers.push(v6)
    } catch (_error: unknown) {
      // A host without IPv6 loopback, or with the port taken there, keeps the IPv4 listener alone.
      v6.close()
    }
    return new OpenRouterAttempt(options, servers, base64url(randomBytes(32)), base64url(randomBytes(16)), port)
  }

  /** End the attempt as `cancelled` when it has not ended. */
  cancel(): void {
    this.finish({ state: 'cancelled' })
  }

  private finish(result: AttemptResult): void {
    if (this.settled) return
    this.settled = true
    clearTimeout(this.timer)
    for (const server of this.servers) {
      server.close()
      server.closeIdleConnections()
    }
    this.settle(result)
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(String(request.url), 'http://localhost')
    if (url.pathname !== CALLBACK_PATH) {
      page(response, 404, 'Not found.')
      return
    }
    if (this.settled || this.exchanging) {
      page(response, 409, 'This sign-in link was already used. Go back to the app.')
      return
    }
    const code = url.searchParams.get('code')
    if (code === null || code === '') {
      page(response, 200, 'OpenRouter was not connected. Go back to the app to try again.')
      this.finish({ state: 'failed', reason: 'denied' })
      return
    }
    // A code with another state did not come from this attempt's authorization page; the attempt keeps waiting.
    if (url.searchParams.get('state') !== this.state) {
      page(response, 400, 'This sign-in link is not from the app. Go back to the app to try again.')
      return
    }
    this.exchanging = true
    const result = await this.exchange(code)
    page(response, 200, result.state === 'connected'
      ? 'OpenRouter is connected. You can close this tab and go back to the app.'
      : 'OpenRouter was not connected. Go back to the app to try again.')
    this.finish(result)
  }

  private async exchange(code: string): Promise<AttemptResult> {
    let text: string
    try {
      const answer = await fetch(this.options.exchangeURL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ code, code_verifier: this.verifier, code_challenge_method: 'S256' }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.exchangeTimeoutMs),
      })
      if (!answer.ok) {
        this.options.warn(`flowleap-models: OpenRouter refused the code exchange with HTTP ${String(answer.status)}`)
        return { state: 'failed', reason: 'exchange_refused' }
      }
      text = await answer.text()
    } catch (error: unknown) {
      this.options.warn(`flowleap-models: OpenRouter not reached for the code exchange: ${String(error).slice(0, 300)}`)
      return { state: 'failed', reason: 'unreachable' }
    }
    let body: unknown
    try {
      body = text.length > MAX_EXCHANGE_BYTES ? undefined : JSON.parse(text)
    } catch (_error: unknown) {
      // A body that is not JSON carries no key; the parse below refuses it.
      body = undefined
    }
    const parsed = exchangeSchema.safeParse(body)
    if (!parsed.success) {
      this.options.warn('flowleap-models: OpenRouter answered the code exchange without a key')
      return { state: 'failed', reason: 'exchange_refused' }
    }
    try {
      await this.options.store(parsed.data.key)
    } catch (error: unknown) {
      this.options.warn(`flowleap-models: the OpenRouter key was not stored: ${String(error).slice(0, 300)}`)
      return { state: 'failed', reason: 'store_refused' }
    }
    return { state: 'connected' }
  }
}
