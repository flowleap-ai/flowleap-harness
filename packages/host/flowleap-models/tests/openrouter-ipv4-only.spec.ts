/** OpenRouter connect on a host whose IPv6 loopback cannot take the listener port. */
import type { Server } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { OpenRouterAttempt } from '../src/openrouter.ts'

vi.mock('node:http', async (importOriginal) => {
  const http = await importOriginal<typeof import('node:http')>()
  const createServer = (): Server => {
    const server = http.createServer()
    const listen = server.listen.bind(server) as (port: number, host: string, callback: () => void) => Server
    Object.assign(server, {
      listen: (port: number, host: string, callback: () => void): Server => {
        if (host !== '::1') return listen(port, host, callback)
        queueMicrotask(() => server.emit('error', Object.assign(new Error('address not available'), { code: 'EADDRNOTAVAIL' })))
        return server
      },
    })
    return server
  }
  return { ...http, createServer }
})

describe('OpenRouterAttempt without IPv6 loopback', () => {
  it('keeps the IPv4 listener alone and still takes the callback there', async () => {
    const attempt = await OpenRouterAttempt.start({
      authURL: 'https://openrouter.example/auth',
      exchangeURL: 'http://127.0.0.1:9/api/v1/auth/keys',
      keyLabel: '',
      timeoutMs: 60_000,
      exchangeTimeoutMs: 1000,
      store: async () => {},
      warn: () => {},
    })
    const target = new URL(new URL(attempt.url).searchParams.get('callback_url')!)
    target.hostname = '127.0.0.1'
    expect(await (await fetch(target)).text()).toContain('OpenRouter was not connected')
    expect(await attempt.result).toEqual({ state: 'failed', reason: 'denied' })
  })
})
