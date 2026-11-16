import { describe, expect, it, vi } from 'vitest'
import type { MyEpoApplicationDetailView } from '@deepseek-ai/dsh-api-remotes/client'
import { installationSource, readRecordsHref, recordSource, RECORDS_LINK_ROUTE, remoteSource, type MyEpoRemote } from '../src/client/shared/sources.ts'
import { DETAIL, LIST } from './applications-fixture.client.ts'
import { failed, ok, READ } from './letters-fixture.client.ts'

const PDF = new Uint8Array([37, 80, 68, 70])

function remote(): MyEpoRemote {
  return {
    myEpoMailbox: vi.fn(() => Promise.resolve(ok(READ))),
    myEpoLetterPdf: vi.fn((_id: string) => Promise.resolve(ok({ fileName: 'grant.pdf', pdf: PDF }))),
    myEpoApplications: vi.fn(() => Promise.resolve(ok(LIST))),
    myEpoApplication: vi.fn((_procedure: string, _number: string) => Promise.resolve(ok<MyEpoApplicationDetailView>(DETAIL))),
  }
}

/** A fetch that answers each path with what `answers` has for it, and records the paths. */
function fetchOf(answers: Record<string, () => Response>) {
  const paths: string[] = []
  const fetchImpl: typeof fetch = (input, init) => {
    const path = input instanceof Request ? input.url : input.toString()
    paths.push(path)
    expect(init).toEqual({ credentials: 'include', cache: 'no-store' })
    const answer = answers[path]
    return answer === undefined ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(answer())
  }
  return { fetchImpl, paths }
}

const refusal = (status: number, error: string) => () => Response.json({ error }, { status })

describe('the source that reads MyEPO through the Host', () => {
  it('passes each read to the Remote, and says that a download marks the letter as read', async () => {
    const calls = remote()
    const source = remoteSource(calls)
    expect(await source.mailbox()).toEqual(ok(READ))
    expect(await source.applications()).toEqual(ok(LIST))
    expect(await source.application('EPC', 'EP00000001')).toEqual(ok(DETAIL))
    expect(calls.myEpoApplication).toHaveBeenCalledWith('EPC', 'EP00000001')
    expect(await source.letterPdf('grant')).toEqual(ok({ fileName: 'grant.pdf', pdf: PDF, marksRead: true }))
    const none = remoteSource({ ...calls, myEpoLetterPdf: () => Promise.resolve(failed('the EPO did not answer')) })
    expect(await none.letterPdf('grant')).toEqual(failed('the EPO did not answer'))
  })
})

describe('the records link', () => {
  it('gives the path of the Firm Record, and null for no answer, an error status, or an answer it cannot read', async () => {
    expect(await readRecordsHref(fetchOf({ [RECORDS_LINK_ROUTE]: () => Response.json({ href: 'records/', signOutHref: null }) }).fetchImpl)).toBe('records/')
    expect(await readRecordsHref(fetchOf({}).fetchImpl)).toBeNull()
    expect(await readRecordsHref(fetchOf({ [RECORDS_LINK_ROUTE]: () => new Response(null, { status: 404 }) }).fetchImpl)).toBeNull()
    expect(await readRecordsHref(fetchOf({ [RECORDS_LINK_ROUTE]: () => Response.json({ href: '' }) }).fetchImpl)).toBeNull()
    expect(await readRecordsHref(fetchOf({ [RECORDS_LINK_ROUTE]: () => new Response('<html>') }).fetchImpl)).toBeNull()
  })
})

describe('the source that reads the copy of the firm', () => {
  const detail = { kind: 'read', ...(({ kind: _kind, ...rest }) => rest)(DETAIL) }

  it('reads the Mailbox, the applications and one application from the Firm Record', async () => {
    const { fetchImpl, paths } = fetchOf({
      'records/api/myepo/mailbox': () => Response.json({ ...READ, letters: READ.letters.map(letter => ({ ...letter, hasPdf: true })) }),
      'records/api/myepo/applications': () => Response.json(LIST),
      'records/api/myepo/applications/EPC/EP00000001': () => Response.json({ ...detail, readAt: '2026-11-16T08:00:00.000Z' }),
    })
    const source = recordSource('records/', fetchImpl)
    expect(await source.mailbox()).toEqual(ok(READ))
    expect(await source.applications()).toEqual(ok(LIST))
    expect(await source.application('EPC', 'EP00000001')).toEqual(ok({ ...detail, readAt: '2026-11-16T08:00:00.000Z' }))
    expect(paths).toEqual(['records/api/myepo/mailbox', 'records/api/myepo/applications', 'records/api/myepo/applications/EPC/EP00000001'])
  })

  it('says that the firm has no copy yet, and that the person does not have the MyEPO pages', async () => {
    const notRead = () => Response.json({ kind: 'not-read' })
    const waiting = recordSource('records/', fetchOf({
      'records/api/myepo/mailbox': notRead, 'records/api/myepo/applications': notRead, 'records/api/myepo/applications/EPC/EP00000001': notRead,
    }).fetchImpl)
    expect(await waiting.mailbox()).toEqual(ok({ kind: 'not-read' }))
    expect(await waiting.applications()).toEqual(ok({ kind: 'not-read' }))
    expect(await waiting.application('EPC', 'EP00000001')).toEqual(ok({ kind: 'not-read' }))
    const closed = recordSource('records/', fetchOf({
      'records/api/myepo/mailbox': refusal(403, 'no-myepo-access'), 'records/api/myepo/applications': refusal(403, 'no-myepo-access'),
    }).fetchImpl)
    expect(await closed.mailbox()).toEqual(ok({ kind: 'no-access' }))
    expect(await closed.applications()).toEqual(ok({ kind: 'no-access' }))
  })

  it('gets the PDF of the copy with its file name and no change of the read state, and null when the firm has no copy', async () => {
    const pdf = (headers: Record<string, string>) => () => new Response(PDF, { headers })
    const source = recordSource('records/', fetchOf({
      'records/api/myepo/letters/a%2Fb/content': pdf({ 'content-disposition': 'attachment; filename="EP18123456 grant.pdf"' }),
      'records/api/myepo/letters/plain/content': pdf({}),
      'records/api/myepo/letters/gone/content': refusal(404, 'no-copy'),
      'records/api/myepo/letters/closed/content': refusal(403, 'no-myepo-access'),
    }).fetchImpl)
    expect(await source.letterPdf('a/b')).toEqual(ok({ fileName: 'EP18123456 grant.pdf', pdf: PDF, marksRead: false }))
    expect(await source.letterPdf('plain')).toEqual(ok({ fileName: 'plain.pdf', pdf: PDF, marksRead: false }))
    expect(await source.letterPdf('gone')).toEqual(ok(null))
    expect(await source.letterPdf('closed')).toEqual(failed('The Firm Record answered 403 no-myepo-access.'))
  })

  it('fails a read that got no answer, an answer of another form, or another refusal', async () => {
    const source = recordSource('records/', fetchOf({
      'records/api/myepo/applications': () => Response.json({ kind: 'read', applications: 'none' }),
      'records/api/myepo/applications/EPC/EP00000001': () => new Response('<html>', { status: 502 }),
      'records/api/myepo/applications/EPC/EP00000002': () => new Response('<html>'),
    }).fetchImpl)
    expect(await source.mailbox()).toEqual(failed('TypeError: fetch failed'))
    expect(await source.applications()).toEqual(failed('The Firm Record gave an answer that this page cannot read.'))
    expect(await source.application('EPC', 'EP00000001')).toEqual(failed('The Firm Record answered 502.'))
    expect(await source.application('EPC', 'EP00000002')).toEqual(failed('The Firm Record gave an answer that this page cannot read.'))
  })
})

describe('the source of an installation', () => {
  it('reads the Firm Record when the Host names one, and asks the Host once', async () => {
    const calls = remote()
    const { fetchImpl, paths } = fetchOf({
      [RECORDS_LINK_ROUTE]: () => Response.json({ href: 'records/', signOutHref: null }),
      'records/api/myepo/mailbox': refusal(403, 'no-myepo-access'),
      'records/api/myepo/applications': () => Response.json({ kind: 'not-read' }),
      'records/api/myepo/applications/EPC/EP00000001': () => Response.json({ kind: 'not-read' }),
      'records/api/myepo/letters/grant/content': refusal(404, 'no-copy'),
    })
    const source = installationSource(calls, fetchImpl)
    expect(await source.mailbox()).toEqual(ok({ kind: 'no-access' }))
    expect(await source.applications()).toEqual(ok({ kind: 'not-read' }))
    expect(await source.application('EPC', 'EP00000001')).toEqual(ok({ kind: 'not-read' }))
    expect(await source.letterPdf('grant')).toEqual(ok(null))
    expect(paths.filter(path => path === RECORDS_LINK_ROUTE).length).toBe(1)
    expect(calls.myEpoMailbox).not.toHaveBeenCalled()
  })

  it('reads MyEPO through the Host when the installation has no Firm Record', async () => {
    const calls = remote()
    const source = installationSource(calls, fetchOf({}).fetchImpl)
    expect(await source.mailbox()).toEqual(ok(READ))
    expect(await source.applications()).toEqual(ok(LIST))
    expect(await source.application('EPC', 'EP00000001')).toEqual(ok(DETAIL))
    expect((await source.letterPdf('grant')).ok).toBe(true)
  })
})
