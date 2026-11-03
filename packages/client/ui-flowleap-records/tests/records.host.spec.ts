import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { answerRecordsLink, apply, checkConfig, Config, RECORDS_LINK_PATH } from '../src/index.ts'

describe('checkConfig', () => {
  it('accepts a document-relative path', () => {
    for (const recordsHref of ['records/', 'records', '../records/', 'firm/records/']) {
      expect(() => { checkConfig({ recordsHref }) }).not.toThrow()
    }
  })

  it('refuses a target that leaves the document origin or path', () => {
    for (const recordsHref of ['', '/records/', '//evil.example/', 'https://evil.example/', 'javascript:alert(1)', 'records/?x', 'records/#top', '\\\\evil']) {
      expect(() => { checkConfig({ recordsHref }) }).toThrow(/recordsHref/u)
    }
  })
})

describe('answerRecordsLink', () => {
  it('answers the configured path as JSON that is never cached', async () => {
    const response = answerRecordsLink({ recordsHref: 'records/' })
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ href: 'records/' })
  })
})

describe('ui-flowleap-records Host half', () => {
  it('registers the GET route on the connection, answers through it, and removes it on dispose', async () => {
    const routes = new Set<ConnectionFetchRoute>()
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register: (route: ConnectionFetchRoute) => { routes.add(route); return async () => { routes.delete(route) } } } } as never)
    const fiber = ctx.plugin({ inject: ['connection'], Config, apply }, { recordsHref: 'records/' })
    await fiber.await()
    const [route] = [...routes]
    expect(route).toMatchObject({ path: '/api/flowleap/records-link', methods: ['GET'] })
    const response = await route!.fetch(new Request(`http://runtime.test${RECORDS_LINK_PATH}`))
    expect(await response.json()).toEqual({ href: 'records/' })
    await fiber.dispose()
    expect(routes.size).toBe(0)
    await ctx.fiber.dispose()
  })

  it('defaults recordsHref to records/ and fails to load with an invalid one', async () => {
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register: () => async () => {} } } as never)
    expect(Config({}).recordsHref).toBe('records/')
    const fiber = ctx.plugin({ inject: ['connection'], Config, apply }, { recordsHref: '/records/' })
    await expect(fiber.await()).rejects.toThrow(/recordsHref/u)
    await ctx.fiber.dispose()
  })
})
