import { describe, expect, it, vi } from 'vitest'
import type { MyEpoLetterPdf, MyEpoMailboxView } from '@deepseek-ai/dsh-api-remotes/client'
import { createMailbox, inView, PAGE_SIZE, shownLetters, type Answer, type MailboxDependencies } from '../src/client/letters/mailbox.ts'
import { failed, FOLDERS, LETTERS, ok, READ } from './letters-fixture.client.ts'

const PDF: MyEpoLetterPdf = { fileName: 'letter.pdf', pdf: new Uint8Array([37, 80, 68, 70]) }

function bench(overrides: Partial<MailboxDependencies> = {}) {
  const deps = {
    read: vi.fn(() => Promise.resolve(ok<MyEpoMailboxView>(READ))),
    download: vi.fn((_id: string) => Promise.resolve(ok(PDF))),
    createUrl: vi.fn((_pdf: Uint8Array) => 'blob:letter'),
    revokeUrl: vi.fn(),
    ...overrides,
  }
  const mailbox = createMailbox(deps)
  const state = () => mailbox.hooks.mailbox.getSnapshot()
  return { deps, mailbox, state }
}

describe('the views and the text of the Letters list', () => {
  it('lists every letter, the unread ones, the ones not handled, or the letters of one folder', () => {
    const ids = (view: Parameters<typeof inView>[1]) => LETTERS.filter(letter => inView(letter, view)).map(letter => letter.id)
    expect(ids('all')).toEqual(['grant', 'search', 'reps', 'lost'])
    expect(ids('unread')).toEqual(['grant', 'reps', 'lost'])
    expect(ids('open')).toEqual(['grant', 'reps', 'lost'])
    expect(ids('folder:pdfs')).toEqual(['search'])
  })

  it('finds a letter by its title, application, reference, applicant or document code, inside the view', () => {
    const find = (query: string, view: Parameters<typeof inView>[1] = 'all') => shownLetters({ letters: LETTERS, view, query }).map(letter => letter.id)
    expect(find('  ')).toHaveLength(4)
    expect(find('SEARCH report')).toEqual(['search'])
    expect(find('ep18123456')).toEqual(['grant', 'lost'])
    expect(find('ref000261')).toEqual(['search'])
    expect(find('applicant 11')).toEqual(['search'])
    expect(find('52301')).toEqual(['reps'])
    expect(find('ep18123456', 'folder:pdfs')).toEqual([])
  })
})

describe('the Letters page model', () => {
  it('reads the Mailbox when the first observer arrives, and once only', async () => {
    const { deps, mailbox, state } = bench()
    expect(state()).toMatchObject({ phase: 'loading', letters: [], limit: PAGE_SIZE })
    const seen = vi.fn()
    const stop = mailbox.hooks.mailbox.subscribe(seen)
    const stopSecond = mailbox.hooks.mailbox.subscribe(() => {})
    expect(state().reading).toBe(true)
    // A read is already crossing the wire.
    await mailbox.refresh()
    await vi.waitFor(() => { expect(state().phase).toBe('ready') })
    expect(deps.read).toHaveBeenCalledTimes(1)
    expect(state()).toMatchObject({ reading: false, failure: null, letters: LETTERS, folders: FOLDERS, total: 4, readAt: READ.readAt })
    expect(seen).toHaveBeenCalled()
    stop()
    stopSecond()
    // A later observer of a read Mailbox starts no read.
    mailbox.hooks.mailbox.subscribe(() => {})()
    expect(deps.read).toHaveBeenCalledTimes(1)
  })

  it('keeps the last list when a later read gives none, and says why', async () => {
    const answers: Answer<MyEpoMailboxView>[] = [ok(READ), ok({ kind: 'unreachable' }), failed('connection lost')]
    const { mailbox, state } = bench({ read: () => Promise.resolve(answers.shift() as Answer<MyEpoMailboxView>) })
    await mailbox.refresh()
    await mailbox.refresh()
    expect(state()).toMatchObject({ failure: { kind: 'unreachable' }, letters: LETTERS, readAt: READ.readAt })
    await mailbox.refresh()
    expect(state()).toMatchObject({ failure: { kind: 'error', message: 'connection lost' }, letters: LETTERS })
  })

  it('opens a letter with its PDF, shows it as read, and remembers the letters it opened while unread', async () => {
    const { deps, mailbox, state } = bench()
    await mailbox.refresh()
    const opening = mailbox.select('grant')
    expect(state()).toMatchObject({ selected: 'grant', pdf: { id: 'grant', status: 'loading' } })
    await opening
    expect(deps.download).toHaveBeenCalledWith('grant')
    expect(deps.createUrl).toHaveBeenCalledWith(PDF.pdf)
    expect(state()).toMatchObject({ pdf: { id: 'grant', status: 'ready', url: 'blob:letter', fileName: 'letter.pdf' }, opened: ['grant'] })
    expect(state().letters.find(letter => letter.id === 'grant')?.read).toBe(true)
    // The same letter again starts no download.
    await mailbox.select('grant')
    expect(deps.download).toHaveBeenCalledTimes(1)
    // A letter that MyEPO already showed as read is not remembered.
    await mailbox.select('search')
    expect(deps.revokeUrl).toHaveBeenCalledWith('blob:letter')
    expect(state().opened).toEqual(['grant'])
    await mailbox.select(null)
    expect(state()).toMatchObject({ selected: null, wide: false, pdf: null })
    expect(deps.revokeUrl).toHaveBeenCalledTimes(2)
  })

  it('says why a letter has no PDF, and drops a download that another letter overtook', async () => {
    const answers = new Map<string, (answer: Answer<MyEpoLetterPdf>) => void>()
    const { deps, mailbox, state } = bench({
      download: vi.fn((id: string) => new Promise<Answer<MyEpoLetterPdf>>((resolve) => { answers.set(id, resolve) })),
    })
    await mailbox.refresh()
    const first = mailbox.select('grant')
    const second = mailbox.select('search')
    answers.get('grant')?.(ok(PDF))
    await first
    expect(state().pdf).toEqual({ id: 'search', status: 'loading' })
    expect(deps.createUrl).not.toHaveBeenCalled()
    answers.get('search')?.(failed('the EPO did not answer'))
    await second
    expect(state().pdf).toEqual({ id: 'search', status: 'failed', message: 'the EPO did not answer' })
    // A failed PDF has no address to release.
    mailbox.dispose()
    expect(deps.revokeUrl).not.toHaveBeenCalled()
  })

  it('steps through the shown list and stops at its ends', async () => {
    const { mailbox, state } = bench()
    // Nothing is listed before the first read.
    await mailbox.step(1)
    expect(state().selected).toBeNull()
    await mailbox.refresh()
    await mailbox.step(1)
    expect(state().selected).toBe('grant')
    await mailbox.step(-1)
    expect(state().selected).toBe('grant')
    await mailbox.step(1)
    expect(state().selected).toBe('search')
    mailbox.setView('folder:drafts')
    // The open letter is not in this view: the step opens the first one.
    await mailbox.step(1)
    expect(state().selected).toBe('grant')
    await mailbox.step(1)
    await mailbox.step(1)
    await mailbox.step(1)
    expect(state().selected).toBe('reps')
  })

  it('changes the view, the text, the row limit and the width, and releases the PDF address when the page goes away', async () => {
    const { deps, mailbox, state } = bench()
    await mailbox.refresh()
    mailbox.more()
    expect(state().limit).toBe(2 * PAGE_SIZE)
    mailbox.setView('unread')
    expect(state()).toMatchObject({ view: 'unread', limit: PAGE_SIZE })
    mailbox.more()
    mailbox.setQuery('grant')
    expect(state()).toMatchObject({ query: 'grant', limit: PAGE_SIZE })
    mailbox.setWide(true)
    expect(state().wide).toBe(true)
    await mailbox.select('grant')
    mailbox.dispose()
    expect(deps.revokeUrl).toHaveBeenCalledWith('blob:letter')
  })
})
