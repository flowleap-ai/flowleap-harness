// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  parsers, type DeadlineId, type FileNumber, type IntakeDocument, type IsoDate, type Me, type OfficeEventId, type PersonId, type RecordsApi,
  type SearchAnswer,
} from '../src/client/api.ts'
import { AccountButton, type AccountProps } from '../src/client/Account.tsx'
import { SEARCH_PAUSE_MS } from '../src/client/find.ts'
import { FindDialog, type FindDialogProps } from '../src/client/FindDialog.tsx'
import type { Load } from '../src/client/load.ts'
import { de, en } from '../src/client/locales.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS, intakeDocumentWire, PEOPLE, R71_DOCUMENT, searchWire } from './fixtures.client.ts'
import { flush, mountPanel } from './screen-harness.client.tsx'

const device = vi.hoisted(() => ({ mobile: false }))
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async original => ({
  ...await original<typeof import('@deepseek-ai/dsh-client-ui-primitives')>(), isMobileDevice: () => device.mobile,
}))

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
})
afterEach(() => {
  mounted?.dispose()
  mounted = null
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  device.mobile = false
})

const lena = { ...PEOPLE.lena, id: PEOPLE.lena.id as PersonId }
const filed = { fileNumber: 'FL-2026-0001' as FileNumber, title: 'Pressure sensor housing' }

/**
 * Mount the letter page of a card.
 * @param letter - the card.
 * @param language - the UI language.
 * @param api - the Records API, when the test changes more than the card.
 */
async function mountLetter(letter: IntakeDocument, language: 'en' | 'de' = 'en', api: RecordsApi = createFixtureApi().api) {
  vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter })
  mounted = await mountPanel(api, { view: 'letter', document: letter.document }, language, 'my-work')
}

/** Unmount the panel, so the test can mount the next card. */
function unmount() {
  mounted?.dispose()
  mounted = null
  cleanup()
}

const table = () => screen.getByRole('table', { name: en['deadline.read'] })

describe('the account menu with Sign out', () => {
  /**
   * Render the account button.
   * @param load - the read of the signed-in person.
   * @param signOutHref - where Sign out goes.
   * @returns the leave spy.
   */
  function mountAccount(load: Load<Me>, signOutHref: string | null) {
    const leave = vi.fn()
    const props = {
      t: makeTranslate(en), wide: true, useMe: bindSnapshotSelector(createSnapshotStore(load)), signOutHref, leave,
    } as AccountProps
    render(<AccountButton {...props} />)
    return leave
  }
  const ready: Load<Me> = { phase: 'ready', data: fixtures.me, at: 0, refreshing: false }

  it('shows nothing until the person is known', () => {
    mountAccount({ phase: 'waiting' }, '/oauth2/sign_out')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers Sign out with what happens after it, and leaves the app for the sign-out path', () => {
    const leave = mountAccount(ready, '/oauth2/sign_out')
    fireEvent.click(screen.getByRole('button', { name: 'Account: Dr. Anna Becker' }))
    const menu = screen.getByRole('menu')
    expect(menu.textContent).toContain(en['account.after'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: en['account.signOut'] }))
    expect(leave).toHaveBeenCalledWith('/oauth2/sign_out')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the menu with Escape and leaves nothing', () => {
    const leave = mountAccount(ready, '/oauth2/sign_out')
    const button = screen.getByRole('button', { name: 'Account: Dr. Anna Becker' })
    fireEvent.click(button)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(leave).not.toHaveBeenCalled()
  })
})

describe('Find a matter, by keyboard and pointer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Element.prototype.scrollIntoView = vi.fn()
  })

  /** Let the pause pass and the search answer settle. */
  async function settle(): Promise<void> {
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_PAUSE_MS + 10) })
  }

  /**
   * Render the dialog over a search read.
   * @param search - the search read.
   * @param opening - the opening, or null while the dialog is closed.
   * @returns the close and open-matter spies.
   */
  function mountDialog(search: RecordsApi['search'], opening: number | null = 1) {
    const close = vi.fn()
    const openMatter = vi.fn()
    const props = {
      t: makeTranslate(en), useOpening: bindSnapshotSelector(createSnapshotStore<number | null>(opening)), search, close, openMatter,
    } as FindDialogProps
    render(<FindDialog {...props} />)
    return { close, openMatter }
  }

  const type = (text: string) => { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }) }
  const fixtureSearch = () => vi.fn<RecordsApi['search']>(async query => ({ ok: true, value: parsers.searchAnswer(searchWire(query), 'search') }))
  const selected = () => screen.getAllByRole('option').find(option => option.getAttribute('aria-selected') === 'true')?.textContent?.slice(0, 12)
  const keyDown = (init: KeyboardEventInit) => { fireEvent.keyDown(screen.getByRole('dialog'), init) }

  it('shows nothing while it is closed', () => {
    mountDialog(fixtureSearch(), null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the last matters on screen while the next query reads', async () => {
    const search = fixtureSearch()
    mountDialog(search)
    type('nord')
    await settle()
    type('nordwind')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.queryByRole('status')).toBeNull()
    await settle()
    expect(search).toHaveBeenLastCalledWith('nordwind', expect.any(AbortSignal))
  })

  it('never shows the answer of a query that the person typed over', async () => {
    const answers: ((answer: SearchAnswer) => void)[] = []
    const search = vi.fn<RecordsApi['search']>(async () => new Promise((resolve) => { answers.push((value) => { resolve({ ok: true, value }) }) }))
    mountDialog(search)
    type('nord')
    await settle()
    type('kessler')
    await settle()
    await act(async () => {
      answers[1]!(parsers.searchAnswer(searchWire('kessler'), 'search'))
      answers[0]!(parsers.searchAnswer(searchWire('nord'), 'search'))
      await Promise.resolve()
    })
    expect(screen.getAllByRole('option').map(option => option.textContent?.slice(0, 12))).toEqual(['FL-2026-0001', 'FL-2025-0203', 'FL-2026-0007'])
  })

  it('heads the matters that matched no field with Matters alone', async () => {
    const answer = parsers.searchAnswer(searchWire('nord'), 'search')
    const unmatched = vi.fn<RecordsApi['search']>(async () => ({ ok: true, value: { ...answer, matters: answer.matters.map(matter => ({ ...matter, matched: [] })) } }))
    mountDialog(unmatched)
    type('nord')
    await settle()
    expect(within(screen.getByRole('listbox')).getByText(en['find.label'])).toBeTruthy()
    expect(screen.queryByText('Matters · client')).toBeNull()
  })

  it('moves up from the first matter to the last, follows the pointer, and opens the matter that the person clicks', async () => {
    const { close, openMatter } = mountDialog(fixtureSearch())
    type('nord')
    await settle()
    expect(selected()).toBe('FL-2026-0019')
    keyDown({ key: 'ArrowUp' })
    expect(selected()).toBe('FL-2023-0610')
    const second = screen.getAllByRole('option')[1]!
    fireEvent.mouseMove(second)
    expect(selected()).toBe('FL-2026-0044')
    fireEvent.mouseMove(second)
    expect(selected()).toBe('FL-2026-0044')
    fireEvent.click(screen.getAllByRole('option')[0]!)
    expect(close).toHaveBeenCalled()
    expect(openMatter).toHaveBeenCalledWith('FL-2026-0019')
  })

  it('ignores keys while the person composes text, keys that are not its own, and ↵ with no matter', async () => {
    const { close, openMatter } = mountDialog(fixtureSearch())
    keyDown({ key: 'Enter' })
    expect(openMatter).not.toHaveBeenCalled()
    type('nord')
    await settle()
    keyDown({ key: 'ArrowDown', isComposing: true })
    expect(selected()).toBe('FL-2026-0019')
    keyDown({ key: 'a' })
    expect(selected()).toBe('FL-2026-0019')
    expect(close).not.toHaveBeenCalled()
    expect(openMatter).not.toHaveBeenCalled()
  })

  it('puts the focus on the input on a desktop, and on the Matters chip on a phone so that no keyboard opens', () => {
    mountDialog(fixtureSearch())
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    cleanup()
    device.mobile = true
    mountDialog(fixtureSearch())
    expect(document.activeElement?.textContent).toBe(en['find.label'])
    expect(document.activeElement).not.toBe(screen.getByRole('textbox'))
  })
})

describe('the lede and reasons of a letter', () => {
  it('says that a scan came yesterday, with no sentence on readings when FlowLeap read nothing', async () => {
    const mail = { ...fixtures.intakeDocument.mail, route: 'scan-mailbox' as const, forwarder: null, receivedAt: '2026-11-03T09:00:00Z' as never }
    const readers = { ...fixtures.intakeDocument.readers, code: null, model: null, agree: null, differences: null, outcome: 'no-reading' as const }
    await mountLetter({ ...fixtures.intakeDocument, mail, readers })
    expect(document.body.textContent).toContain(`${en['intake.lede.scanYesterday']} ${en['intake.lede.matchProposed'].replace('{page}', '1')}`)
  })

  it('names the application number as the reason for the proposed matter, and asks the person to confirm the match', async () => {
    const proposed = { ...fixtures.intakeDocument.proposed!, matchedBy: 'application-number' as const }
    await mountLetter({ ...fixtures.intakeDocument, proposed })
    expect(document.body.textContent).toContain('The application number on page 1 names one matter.')
    expect(screen.getByRole('list', { name: en['intake.reason.label'] }).textContent).toContain('Found by the application number on page 1.')
    expect(screen.getByText(en['intake.note.confirmApplication'])).toBeTruthy()
    unmount()
    const { applicationNumber: _number, ...fields } = fixtures.intakeDocument.fields
    await mountLetter({ ...fixtures.intakeDocument, proposed, fields })
    expect(document.body.textContent).toContain('The application number on page 1 names one matter.')
    const reasons = screen.getByRole('list', { name: en['intake.reason.label'] }).textContent
    expect(reasons).not.toContain('Found by the application number')
    expect(reasons).toContain('Your reference on page 1 reads')
  })
})

describe('the Done bar of a letter whose office event is recorded', () => {
  const recorded = (state: 'active' | 'rejected' | 'deadline_proposed', confirmer: typeof lena | null): IntakeDocument => ({
    ...fixtures.intakeDocument,
    status: { machine: 'deadline', state },
    officeEvent: { id: FIXTURE_IDS.officeEvent as OfficeEventId, state },
    proposed: null,
    filed,
    mayDecide: { allowed: false, reason: 'decided', decider: null },
    deadline: { id: FIXTURE_IDS.deadline as DeadlineId, due: '2027-03-01' as IsoDate, state, confirmer },
  })
  const done = () => screen.getByRole('region', { name: en['letter.done.heading'] })

  it('says whether the deadline is confirmed, rejected or waits for a second person', async () => {
    await mountLetter(recorded('active', lena))
    expect(done().textContent).toContain(en['letter.done.active'])
    unmount()
    await mountLetter(recorded('rejected', lena))
    expect(done().textContent).toContain(en['letter.done.rejected'])
    unmount()
    await mountLetter(recorded('deadline_proposed', null))
    expect(done().textContent).toContain(en['letter.done.confirm'])
  })

  it('opens the matter of the letter', async () => {
    await mountLetter(recorded('active', lena))
    fireEvent.click(within(done()).getByRole('button', { name: /Go to FL-2026-0001/u }))
    await flush()
    expect(mounted!.model.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: 'FL-2026-0001' })
  })
})

describe('the hand entry of a scan', () => {
  const scan: IntakeDocument = {
    ...fixtures.intakeDocument,
    status: { machine: 'intake', state: 'unreadable' },
    code: null, documentDate: null, applicationNumber: null, fields: {}, proposed: null, candidates: 0, filed: null, officeEvent: null,
    mayDecide: { allowed: true },
    nextConfirmer: null,
    entry: { codes: [{ code: 'EPO:R71(3)', form: '2004C', title: { en: 'Rule 71(3) communication', de: 'Mitteilung nach Regel 71(3)' } }], read: null },
  }

  it('names the office events in German for a German person', async () => {
    await mountLetter(scan, 'de')
    expect(screen.getByRole('combobox', { name: de['letter.hand.event'] }).textContent).toBe('Mitteilung nach Regel 71(3)')
  })

  it('names nobody as the confirmer when the record cannot tell for the picked matter', async () => {
    const { api } = createFixtureApi()
    const confirmer = vi.spyOn(api, 'nextConfirmer').mockResolvedValue({ ok: false, error: { kind: 'network' } })
    await mountLetter(scan, 'en', api)
    fireEvent.change(screen.getByRole('combobox', { name: en['prop.matter'] }), { target: { value: 'FL-2026-0001' } })
    await flush()
    expect(confirmer).toHaveBeenCalledWith(scan.document, 'FL-2026-0001', expect.any(AbortSignal))
    expect(screen.queryByText(/confirms the deadline/u)).toBeNull()
  })
})

describe('the office event of a filed letter with nothing read', () => {
  const event = FIXTURE_IDS.officeEvent as OfficeEventId
  const codes = [
    { code: 'EPO:A94(3)', form: '2001', title: { en: 'Communication under Article 94(3) EPC', de: 'Mitteilung nach Artikel 94(3) EPÜ' } },
    { code: 'EPO:R71(3)', form: '2004C', title: { en: 'Rule 71(3) communication', de: 'Mitteilung nach Regel 71(3)' } },
  ]
  // A MyEPO letter whose document code the code table does not know: filed on its matter, the office event waits for a person.
  const unknown: IntakeDocument = {
    ...fixtures.intakeDocument,
    status: { machine: 'deadline', state: 'code_proposed' },
    officeEvent: { id: event, state: 'code_proposed' },
    code: null, documentDate: null, applicationNumber: null, fields: {}, proposed: null, filed,
    mail: { ...fixtures.intakeDocument.mail, route: 'myepo', forwarder: null },
    mayDecide: { allowed: true },
    entry: { codes, read: { documentDate: '2026-09-18' as IsoDate, applicationNumber: 'EP24166597', fileNumber: filed.fileNumber } },
  }
  const record = () => screen.getByRole('button', { name: /^Record office event/u })

  it('starts from what MyEPO gave, asks for no matter, and records the office event that the person chooses', async () => {
    const { api, acts } = createFixtureApi()
    await mountLetter(unknown, 'en', api)
    expect(document.body.textContent).toContain('MyEPO gave the dispatch date 18 Sept 2026')
    expect(document.body.textContent).toContain(en['letter.entry.part'])
    expect(screen.queryByRole('combobox', { name: en['prop.matter'] })).toBeNull()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: en['prop.application'] }).value).toBe('EP24166597')
    fireEvent.change(screen.getByRole('combobox', { name: en['letter.hand.event'] }), { target: { value: 'EPO:R71(3)' } })
    fireEvent.change(screen.getByRole('combobox', { name: en['letter.hand.event'] }), { target: { value: 'EPO:A94(3)' } })
    fireEvent.click(record())
    await flush()
    expect(acts.map(act => act.command)).toEqual([{ kind: 'officeEvent.decide', id: event, code: 'EPO:A94(3)', documentDate: '2026-09-18', applicationNumber: 'EP24166597' }])
  })

  it('waits for every value before it records', async () => {
    await mountLetter(unknown)
    fireEvent.change(screen.getByRole('textbox', { name: en['prop.application'] }), { target: { value: ' ' } })
    expect(record().hasAttribute('disabled')).toBe(true)
    expect(document.body.textContent).toContain(en['letter.entry.incomplete'])
  })

  it('records that the letter holds no office event, with the reason', async () => {
    const { api, acts } = createFixtureApi()
    await mountLetter(unknown, 'en', api)
    fireEvent.click(screen.getByRole('button', { name: /^Not an office letter/u }))
    fireEvent.change(screen.getByLabelText(en['reason.notOfficeLetter']), { target: { value: 'A copy of the search report' } })
    fireEvent.click(screen.getByRole('button', { name: en['act.markNotOfficeLetter'] }))
    await flush()
    expect(acts.map(act => act.command)).toEqual([{ kind: 'officeEvent.noEvent', id: event, reason: 'A copy of the search report' }])
  })

  it('says it in German, and gives no MyEPO line for a mail letter', async () => {
    await mountLetter(unknown, 'de')
    expect(screen.getByText(de['letter.hand.question'])).toBeTruthy()
    expect(document.body.textContent).toContain('MyEPO hat das Versanddatum')
    unmount()
    await mountLetter({ ...unknown, mail: fixtures.intakeDocument.mail })
    expect(document.body.textContent).not.toContain('MyEPO gave')
    for (const read of [null, { documentDate: null, applicationNumber: 'EP24166597', fileNumber: null }, { documentDate: '2026-09-18' as IsoDate, applicationNumber: null, fileNumber: null }]) {
      unmount()
      await mountLetter({ ...unknown, entry: { codes, read } })
      expect(document.body.textContent, 'MyEPO gave no full pair of values').not.toContain('MyEPO gave')
    }
  })
})

describe('the two dates of a letter whose readings differ', () => {
  const readers = fixtures.intakeDocument.readers
  const differ: IntakeDocument = {
    ...fixtures.intakeDocument,
    status: { machine: 'deadline', state: 'code_proposed' },
    officeEvent: { id: FIXTURE_IDS.officeEvent as OfficeEventId, state: 'code_proposed' },
    proposed: null,
    filed,
    readers: { ...readers, model: { ...readers.model!, result: { ...readers.model!.result!, documentDate: '2026-10-25' as IsoDate } }, agree: false, differences: ['documentDate'] },
  }
  const part = () => screen.getByRole('group', { name: en['letter.differ.part'] })

  it('records the date that the person chooses', async () => {
    const { api, acts } = createFixtureApi()
    await mountLetter(differ, 'en', api)
    expect(document.body.textContent).toContain(en['letter.differ.notChosen'])
    const image = within(part()).getByRole('button', { name: /page image/u })
    fireEvent.click(image)
    expect(image.getAttribute('aria-pressed')).toBe('true')
    expect(within(part()).getByRole('button', { name: /· text/u }).getAttribute('aria-pressed')).toBe('false')
    expect(document.body.textContent).toContain('You chose Sun, 25 Oct 2026')
    fireEvent.click(screen.getByRole('button', { name: /^Record decision/u }))
    await flush()
    expect(acts.map(act => act.command)).toEqual([{
      kind: 'officeEvent.decide', id: FIXTURE_IDS.officeEvent, code: 'EPO:R71(3)', documentDate: '2026-10-25', applicationNumber: '24 123 456.7',
    }])
  })

  it('says that a second person confirms the deadline when the record names nobody, or the queue that it goes to', async () => {
    await mountLetter({ ...differ, nextConfirmer: null })
    expect(screen.getByText(en['letter.differ.second'])).toBeTruthy()
    expect(screen.getByText(en['letter.differ.secondWhy'])).toBeTruthy()
    unmount()
    await mountLetter({ ...differ, nextConfirmer: { person: lena, queued: true } })
    expect(screen.getByText(en['letter.differ.second'])).toBeTruthy()
    expect(screen.getByText('The deadline goes to the queue of Lena Hoffmann to confirm.')).toBeTruthy()
  })
})

describe('the period that the letter sets', () => {
  const event = FIXTURE_IDS.officeEvent as OfficeEventId
  const missing = (reason: Extract<IntakeDocument['period'], { state: 'missing' }>['reason'], found: number[] = []): IntakeDocument => ({
    ...fixtures.intakeDocument,
    status: { machine: 'deadline', state: 'engine_refused' },
    mayDecide: { allowed: true },
    officeEvent: { id: event, state: 'engine_refused' },
    period: { state: 'missing', reason, found, range: { minMonths: 2, maxMonths: 6 }, recordSeq: 50 },
    proposed: null,
    filed,
  })
  const part = () => screen.getByRole('group', { name: en['letter.period.part'] })

  it('asks for the months that the letter states, and enters the chosen period with the record position', async () => {
    const { api, acts } = createFixtureApi()
    await mountLetter(missing('two-values', [4, 6]), 'en', api)
    expect(screen.getByText(en['letter.period.question'])).toBeTruthy()
    expect(document.body.textContent).toContain('The letter names more than one period: 4, 6 months.')
    expect(document.body.textContent).toContain(en['letter.period.note'])
    expect(within(part()).getAllByRole('button').map(button => button.textContent)).toEqual(['2 months', '3 months', '4 months', '5 months', '6 months'])
    const enter = () => screen.getByRole('button', { name: /^Enter the period/u })
    expect(enter().hasAttribute('disabled')).toBe(true)
    fireEvent.click(within(part()).getByRole('button', { name: '4 months' }))
    expect(document.body.textContent).toContain('Period set in the letter · 4 months')
    fireEvent.click(enter())
    await flush()
    expect(acts.map(act => act.command)).toEqual([{ kind: 'officeEvent.period', id: event, months: 4, seen: 50 }])
  })

  it('says why FlowLeap read no period, in English and German', async () => {
    for (const [reason, found, text] of [
      ['no-text', [], en['letter.period.why.no-text']], ['not-found', [], en['letter.period.why.not-found']],
      ['out-of-range', [7], 'The letter names 7 months, outside 2 to 6 months.'], ['ocr-text', [], en['letter.period.why.ocr-text']],
      ['not-read', [], en['letter.period.why.not-read']], ['other', [], en['letter.period.why.other']],
    ] as const) {
      await mountLetter(missing(reason, [...found]))
      expect(document.body.textContent).toContain(text)
      unmount()
    }
    await mountLetter(missing('no-text'), 'de')
    expect(screen.getByText(de['letter.period.question'])).toBeTruthy()
    expect(document.body.textContent).toContain(de['letter.period.why.no-text'])
  })
})

describe('the evidence of a letter', () => {
  it('shows a quoted date of the letter as the letter prints it when it is no calendar date', async () => {
    const code = { ...fixtures.intakeDocument.readers.code!, result: { code: null, documentDate: null, applicationNumber: null } }
    const fields = { ...code.fields, documentDate: { ...code.fields.documentDate!, value: '30.10.2026' } }
    const readers = { ...fixtures.intakeDocument.readers, code: { ...code, fields }, model: null, agree: null, differences: null, outcome: 'one-reading' as const }
    await mountLetter({ ...fixtures.intakeDocument, readers })
    expect(within(table()).getAllByRole('row')[2]!.textContent).toMatch(/^Document date30\.10\.2026/u)
  })

  it('counts the pages of a letter with more than one page image', async () => {
    const pageImages = [1, 2].map(page => ({ page, width: 1240, height: 1754, href: `documents/${R71_DOCUMENT}/pages/${page}` }))
    await mountLetter(parsers.intakeDocument({ ...intakeDocumentWire, pages: 2, pageImages }, 'card'))
    expect(screen.getByText('2 pages')).toBeTruthy()
    expect(screen.getAllByRole('img', { name: /^Page \d of 2 of the letter$/u })).toHaveLength(2)
  })
})
