import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addClientApi, firmIdentityApi } from '../src/client/add-client/api.ts'
import { applicationLabel, asOfText, counted, dayText, publicationLabel, rich } from '../src/client/add-client/format.ts'
import { en } from '../src/client/add-client/locales/index.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { buildStatus, found, reviewed } from './add-client-fakes.client.ts'

afterEach(() => { vi.unstubAllGlobals() })

/** The Host's routes: one answer, and every request it got. */
function host(answer: () => Response | Promise<Response>) {
  const calls: [string, RequestInit | undefined][] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init])
    return answer()
  }))
  return calls
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('the Add client routes', () => {
  it('calls each route at its document-relative path with the cookie and no cache', async () => {
    const calls = host(() => json(found([['SYNTEGON TECHNOLOGY', 600]])))
    const signal = new AbortController().signal
    expect(await addClientApi.find('Syntegon & Co', signal)).toEqual({ ok: true, value: found([['SYNTEGON TECHNOLOGY', 600]]) })
    await addClientApi.find('Syntegon')
    await addClientApi.review({ names: ['SYNTEGON TECHNOLOGY'], clients: [] }, signal)
    await addClientApi.build({ clientId: 'c', name: 'Syntegon', names: [], applications: [] })
    await addClientApi.status(signal)
    await addClientApi.status()
    expect(calls.map(([url, init]) => [url, init?.method ?? 'GET', init?.body ?? null, init?.signal === signal, init?.credentials, init?.cache])).toEqual([
      ['api/flowleap/folder/add-client/find?name=Syntegon+%26+Co', 'GET', null, true, 'include', 'no-store'],
      ['api/flowleap/folder/add-client/find?name=Syntegon', 'GET', null, false, 'include', 'no-store'],
      ['api/flowleap/folder/add-client/review', 'POST', JSON.stringify({ names: ['SYNTEGON TECHNOLOGY'], clients: [] }), true, 'include', 'no-store'],
      ['api/flowleap/folder/add-client/build', 'POST', JSON.stringify({ clientId: 'c', name: 'Syntegon', names: [], applications: [] }), false, 'include', 'no-store'],
      ['api/flowleap/folder/add-client/status', 'GET', null, true, 'include', 'no-store'],
      ['api/flowleap/folder/add-client/status', 'GET', null, false, 'include', 'no-store'],
    ])
  })

  it('gives the failure code of a refusal, internal for an unknown or missing code, and network with no answer', async () => {
    host(() => json({ error: 'no-key' }, 424))
    expect(await addClientApi.review({ names: [], clients: [] })).toEqual({ ok: false, error: 'no-key' })
    host(() => json({ error: 'brand-new' }, 500))
    expect(await addClientApi.status()).toEqual({ ok: false, error: 'internal' })
    host(() => json(null, 500))
    expect(await addClientApi.status()).toEqual({ ok: false, error: 'internal' })
    host(() => new Response('<html>', { status: 200 }))
    expect(await addClientApi.status()).toEqual({ ok: false, error: 'internal' })
    host(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await addClientApi.build({ clientId: 'c', name: 'S', names: [], applications: [] })).toEqual({ ok: false, error: 'network' })
    host(() => json(reviewed()))
    expect(await addClientApi.review({ names: [], clients: [] })).toEqual({ ok: true, value: reviewed() })
    host(() => json(buildStatus('c', 'S'), 202))
    expect((await addClientApi.build({ clientId: 'c', name: 'S', names: [], applications: [] })).ok).toBe(true)
  })
})

describe('the firm identity routes', () => {
  it('calls each route at its document-relative path with the cookie and no cache', async () => {
    const calls = host(() => json({ status: 'no-plugin' }))
    const signal = new AbortController().signal
    const identity = { names: ['Muster & Partner'], addresses: [], representatives: [] }
    expect(await firmIdentityApi.docket()).toEqual({ ok: true, value: { status: 'no-plugin' } })
    await firmIdentityApi.identity(signal)
    await firmIdentityApi.identity()
    await firmIdentityApi.save(identity)
    await firmIdentityApi.docket(signal)
    await firmIdentityApi.readDocket('failed')
    expect(calls.map(([url, init]) => [url, init?.method ?? 'GET', init?.body ?? null, init?.signal === signal])).toEqual([
      ['api/flowleap/folder/add-client/docket', 'GET', null, false],
      ['api/flowleap/folder/add-client/identity', 'GET', null, true],
      ['api/flowleap/folder/add-client/identity', 'GET', null, false],
      ['api/flowleap/folder/add-client/identity/save', 'POST', JSON.stringify({ identity }), false],
      ['api/flowleap/folder/add-client/docket', 'GET', null, true],
      ['api/flowleap/folder/add-client/docket/read', 'POST', JSON.stringify({ slices: 'failed' }), false],
    ])
  })
})

describe('the forms of numbers, dates and copy', () => {
  const t = makeTranslate(en)

  it('writes EP numbers as the EP Register does, and keeps another form', () => {
    expect(applicationLabel('EP23171862')).toBe('EP 23 171 862')
    expect(applicationLabel('WO2024000001')).toBe('WO2024000001')
    expect(publicationLabel('EP4292805A1')).toBe('EP 4 292 805 A1')
    expect(publicationLabel('EP4292805')).toBe('EP 4 292 805')
    expect(publicationLabel('EP3296081B1')).toBe('EP 3 296 081 B1')
    expect(publicationLabel('DE102023133973')).toBe('DE102023133973')
  })

  it('writes dates in the UI language, and counts with one and many', () => {
    expect(dayText('2024-07-24', 'en')).toBe('Jul 24, 2024')
    expect(dayText('2024-07-24T10:00:00.000Z', 'de')).toBe('24.07.2024')
    expect(asOfText(t, '2026-11-08T14:02:00.000Z', 'en')).toMatch(/^Nov 8, 2026, \d{1,2}:02/)
    expect([counted(t, 1, 'matters.one', 'matters.many'), counted(t, 16, 'matters.one', 'matters.many')]).toEqual(['1 matter', '16 matters'])
  })

  it('puts elements in the place of their placeholders', () => {
    const node = rich(t, 'toast.party', { name: 'A' }, { application: createElement('b', null, 'EP 1') })
    expect(renderToStaticMarkup(createElement('p', null, node))).toBe('<p>A added as a party to <b>EP 1</b></p>')
  })
})
