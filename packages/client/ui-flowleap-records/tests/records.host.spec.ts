import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { answerRecordsLink, apply, checkConfig, Config, RECORDS_LINK_PATH } from '../src/index.ts'

describe('checkConfig', () => {
  it('accepts a document-relative path', () => {
    for (const recordsHref of ['records/', 'records', '../records/', 'firm/records/']) {
      expect(() => { checkConfig({ recordsHref, signOutHref: '' }) }).not.toThrow()
    }
  })

  it('refuses a target that leaves the document origin or path', () => {
    for (const recordsHref of ['', '/records/', '//evil.example/', 'https://evil.example/', 'javascript:alert(1)', 'records/?x', 'records/#top', '\\\\evil']) {
      expect(() => { checkConfig({ recordsHref, signOutHref: '' }) }).toThrow(/recordsHref/u)
    }
  })
})

describe('checkConfig signOutHref', () => {
  it('accepts no sign-out path or an absolute path on the same origin', () => {
    for (const signOutHref of ['', '/oauth2/sign_out', '/oauth2/sign_out?rd=%2F', '/sign-out']) {
      expect(() => { checkConfig({ recordsHref: 'records/', signOutHref }) }).not.toThrow()
    }
  })

  it('refuses a sign-out target that leaves the origin', () => {
    for (const signOutHref of ['oauth2/sign_out', '//evil.example/sign_out', 'https://evil.example/', 'javascript:alert(1)', '/sign_out#x', '/\\evil']) {
      expect(() => { checkConfig({ recordsHref: 'records/', signOutHref }) }).toThrow(/signOutHref/u)
    }
  })
})

describe('answerRecordsLink', () => {
  it('answers the configured paths as JSON that is never cached, with no sign-out path as null', async () => {
    const response = answerRecordsLink({ recordsHref: 'records/', signOutHref: '' })
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ href: 'records/', signOutHref: null })
    expect(await answerRecordsLink({ recordsHref: 'records/', signOutHref: '/oauth2/sign_out' }).json()).toEqual({ href: 'records/', signOutHref: '/oauth2/sign_out' })
  })
})

describe('ui-flowleap-records Host half', () => {
  it('registers the GET route on the connection, answers through it, and removes it on dispose', async () => {
    const routes = new Set<ConnectionFetchRoute>()
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register: (route: ConnectionFetchRoute) => { routes.add(route); return async () => { routes.delete(route) } } } } as never)
    const fiber = ctx.plugin({ inject: ['connection'], Config, apply }, { recordsHref: 'records/', signOutHref: '' })
    await fiber.await()
    const [route] = [...routes]
    expect(route).toMatchObject({ path: '/api/flowleap/records-link', methods: ['GET'] })
    const response = await route!.fetch(new Request(`http://runtime.test${RECORDS_LINK_PATH}`))
    expect(await response.json()).toEqual({ href: 'records/', signOutHref: null })
    await fiber.dispose()
    expect(routes.size).toBe(0)
    await ctx.fiber.dispose()
  })

  it('defaults recordsHref to records/ and fails to load with an invalid one', async () => {
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register: () => async () => {} } } as never)
    expect(Config({} as Partial<Config> as Config)).toEqual({ recordsHref: 'records/', signOutHref: '' })
    const fiber = ctx.plugin({ inject: ['connection'], Config, apply }, { recordsHref: '/records/', signOutHref: '' })
    await expect(fiber.await()).rejects.toThrow(/recordsHref/u)
    await ctx.fiber.dispose()
  })
})
