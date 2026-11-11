// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commandRequest, createRecordsApi, ids, parsers, type DeadlineDetail, type DeadlineId, type DocumentId, type Fetched, type FileNumber,
  type MatterDetail, type MyWork, type PersonId, type TicketDetail, type TicketId, type WorkDraft,
} from '../src/client/api.ts'
import { en } from '../src/client/locales.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS, intakeDocumentWire, matterWire, PEOPLE, R71_DOCUMENT } from './fixtures.client.ts'
import { mountPanel, press } from './screen-harness.client.tsx'

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
const opened = vi.fn()
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
  opened.mockReset()
  vi.spyOn(window, 'open').mockImplementation((url) => { opened(String(url)); return null })
})
afterEach(() => {
  mounted?.dispose()
  mounted = null
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/**
 * The value of a row of the properties panel.
 * @param label - the row's label.
 * @returns the value's text, or undefined when no row has the label.
 */
const prop = (label: string) => [...document.querySelectorAll('dt')].find(term => term.textContent === label)?.nextElementSibling?.textContent

const lena = { ...PEOPLE.lena, id: PEOPLE.lena.id as PersonId }

/**
 * Mount My work over the fixture API with My work's answer replaced.
 * @param myWork - the answer of `GET my-work`.
 * @returns the mounted panel.
 */
async function mountMyWork(myWork: MyWork) {
  const { api } = createFixtureApi()
  vi.spyOn(api, 'myWork').mockResolvedValue({ ok: true, value: myWork })
  mounted = await mountPanel(api, { view: 'my-work' }, 'en', 'my-work')
  return mounted
}

describe('My work', () => {
  it('shows the skeleton of the list while My work loads', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
    const { api } = createFixtureApi()
    vi.spyOn(api, 'myWork').mockImplementation(() => new Promise<Fetched<MyWork>>(() => {}))
    mounted = await mountPanel(api, { view: 'my-work' }, 'en', 'my-work')
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    const loading = screen.getByRole('status', { name: 'Loading' })
    expect(loading.firstElementChild?.textContent).toBe('TaskStatusMatterClientLegal dateDue')
    expect(loading.querySelector('[data-skeleton]')?.children).toHaveLength(4)
  })

  it('counts more than one letter in the first line, and one task that needs the person', async () => {
    await mountMyWork({ ...fixtures.myWork, summary: { ...fixtures.myWork.summary, lettersToFile: 2, lettersWorked: 3, needYou: 1 } })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('2 letters arrived, 3 letters worked, 1 needs you')
  })

  it('opens the first task with ↵ when no row has the focus, and no matter with G M', async () => {
    const { model, panel, openInMatters } = await mountMyWork(fixtures.myWork)
    press(panel, 'KeyG')
    press(panel, 'KeyM')
    expect(openInMatters).not.toHaveBeenCalled()
    press(panel, 'Enter')
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work', id: FIXTURE_IDS.ticket })
  })

  it('shows a task with no matter and no page with no client, and opens nothing from it', async () => {
    const task = { ...fixtures.myWork.work[0]!, kind: 'answer' as const, matter: null, act: 'answer/1' }
    const { model, panel, openInMatters } = await mountMyWork({ ...fixtures.myWork, work: [task] })
    const row = panel.querySelector<HTMLElement>('[data-row]')!
    expect(row.textContent).not.toContain('Kessler Sensorik GmbH')
    fireEvent.click(row)
    row.focus()
    press(row, 'KeyG')
    press(document.activeElement!, 'KeyM')
    expect(openInMatters).not.toHaveBeenCalled()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'my-work' })
  })

  it('moves and opens nothing with J, K and ↵ when no task waits', async () => {
    const summary = { lettersArrived: 0, lettersToFile: 0, lettersWorked: 0, needYou: 0, overdue: 0, today: 0, later: 0 }
    const { model, panel } = await mountMyWork({ ...fixtures.myWork, summary, work: [] })
    const before = document.activeElement
    press(panel, 'KeyJ')
    press(panel, 'KeyK')
    press(panel, 'Enter')
    expect(document.activeElement).toBe(before)
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'my-work' })
  })
})

describe('the matter page', () => {
  /**
   * Mount the matter page with the matter's answer replaced.
   * @param matter - the answer of `GET matters/<fileNumber>`.
   */
  async function mountMatter(matter: MatterDetail) {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'matter').mockResolvedValue({ ok: true, value: matter })
    mounted = await mountPanel(api, { view: 'matter', fileNumber: 'FL-2026-0001' as FileNumber })
  }

  it('says what the client allows the AI to do for each of the client\'s rules', async () => {
    const rules = fixtures.matter.clientRules!
    const cases: readonly (readonly [MatterDetail['clientRules'], string])[] = [
      [null, 'Not recorded'],
      [{ ...rules, aiUse: 'not-recorded' }, 'Not recorded'],
      [{ ...rules, aiUse: 'not-allowed' }, 'Nothing'],
      [{ ...rules, aiUse: 'allowed', aiLetters: 'not-allowed' }, 'Drafts'],
      [{ ...rules, aiUse: 'local-model-only', aiLetters: 'allowed' }, 'Drafts with the local model, client report'],
    ]
    for (const [clientRules, words] of cases) {
      await mountMatter({ ...fixtures.matter, clientRules })
      expect(prop(en['dossier.prop.ai'])).toBe(words)
      mounted?.dispose()
      mounted = null
      cleanup()
    }
  })

  it('shows a matter whose team has a person with no display name as an unnamed person', async () => {
    const unnamed = { id: PEOPLE.lena.id, name: null }
    const wire = {
      ...matterWire, formalitiesPerson: unnamed, team: matterWire.team.map(p => p.id === PEOPLE.lena.id ? unnamed : p),
      wall: { ...matterWire.wall, team: matterWire.wall.team.map(p => p.id === PEOPLE.lena.id ? { ...unnamed, role: p.role } : p) },
    }
    await mountMatter(parsers.matterDetail(wire, 'body'))
    expect(prop(en['dossier.prop.formalities'])).toBe(en['person.unnamed'])
    expect(prop(en['dossier.prop.wall'])).toBe('The team · 2 people screened')
  })

  it('shows an application number that is not an EP application as text, no language, and no screened people', async () => {
    await mountMatter({
      ...fixtures.matter, matter: { ...fixtures.matter.matter, applicationNumber: 'US 17/123,456' }, language: null, wall: { ...fixtures.matter.wall, screened: 0 },
    })
    const lede = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(lede.textContent).toContain('US 17/123,456')
    expect(within(lede).queryByRole('link')).toBeNull()
    expect(prop(en['dossier.prop.language'])).toBe('Not recorded')
    expect(prop(en['dossier.prop.wall'])).toBe('The team')
  })
})

describe('the work page', () => {
  /**
   * Mount the work page with the work's answer replaced.
   * @param ticket - the answer of `GET tickets/<id>`.
   * @returns the mounted panel.
   */
  async function mountWork(ticket: TicketDetail) {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: ticket })
    mounted = await mountPanel(api, { view: 'work', id: FIXTURE_IDS.ticket as TicketId })
    return mounted
  }

  const reply: WorkDraft = { ...fixtures.ticket.clientReport!, kind: 'office-reply', language: null }
  const replyOnly: TicketDetail = {
    ...fixtures.ticket,
    matter: { ...fixtures.ticket.matter, formalitiesPerson: null },
    letter: { ...fixtures.ticket.letter!, code: 'JPO:OA', pages: 3, source: 'ocr' },
    reports: [reply], draftReply: reply, clientReport: null,
  }

  it('names a draft reply to an office the views do not know, with no language, and opens it in Word and as a preview', async () => {
    await mountWork(replyOnly)
    expect(screen.getByText('The agent drafted the reply to JPO.', { exact: false })).toBeTruthy()
    const section = screen.getByRole('heading', { level: 2, name: 'Draft reply to JPO' }).closest('section')!
    expect(section.textContent).toContain('Letter to JPO')
    expect(section.textContent).not.toContain('English')
    expect(prop(en['dossier.prop.formalities'])).toBe('None')
    expect(prop(en['work.prop.letter'])).toBe('3 pages, scan')
    fireEvent.click(within(section).getByRole('button', { name: /Open in Word/u }))
    expect(opened.mock.lastCall?.[0]).toMatch(/^ms-word:ofe\|u\|http.*\/records\/api\/documents\/0+64\/content$/u)
    fireEvent.click(within(section).getByRole('button', { name: /Preview/u }))
    expect(opened).toHaveBeenLastCalledWith('records/api/documents/0000000000000000000000000000000000000000000000000000000000000064/content')
  })

  it('names a draft reply to the office of a letter with no code by the office alone', async () => {
    await mountWork({ ...replyOnly, letter: { ...replyOnly.letter!, code: null } })
    const section = screen.getByRole('heading', { level: 2, name: 'Draft reply' }).closest('section')!
    expect(section.textContent).toContain('Letter to the office')
  })

  it('offers no Open in Word in the decision bar when the work names no latest draft', async () => {
    await mountWork({ ...fixtures.ticket, draftReply: null, clientReport: null })
    expect(screen.getByText(en['work.lede.noDraft'], { exact: false })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('region', { name: 'Your decision' })).getByRole('button', { name: en['decision.more'] }))
    expect(screen.getByRole('menuitem', { name: /Calculation/u })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Open in Word/u })).toBeNull()
  })
})

describe('the deadline page', () => {
  /**
   * Mount the deadline page with the deadline's answer replaced.
   * @param deadline - the answer of `GET deadlines/<id>`.
   */
  async function mountDeadline(deadline: DeadlineDetail) {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'deadline').mockResolvedValue({ ok: true, value: deadline })
    mounted = await mountPanel(api, { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId })
  }

  it('shows the period that an Art. 94(3) letter sets: read on a page with its words, or entered by a person', async () => {
    const a94 = { ...fixtures.deadline.officeEvent, code: 'EPO:A94(3)' }
    await mountDeadline({ ...fixtures.deadline, officeEvent: { ...a94, period: { state: 'known', months: 4, source: { kind: 'reader', page: 1, quote: 'within a period of 4 months' } } } })
    expect(document.body.textContent).toContain('The letter sets 4 months: read on page 1, “within a period of 4 months”')
    expect(document.body.textContent).toContain(en['deadline.rule.a94Short'])
    mounted?.dispose()
    mounted = null
    cleanup()
    await mountDeadline({ ...fixtures.deadline, officeEvent: { ...a94, period: { state: 'known', months: 2, source: { kind: 'entered', by: lena } } } })
    expect(document.body.textContent).toContain('The letter sets 2 months: entered by Lena Hoffmann')
    mounted?.dispose()
    mounted = null
    cleanup()
    await mountDeadline({ ...fixtures.deadline, officeEvent: { ...a94, period: null } })
    expect(document.body.textContent).not.toContain('The letter sets')
  })

  it('words a period that ends on the day with the same number in months, and another period in days', async () => {
    const cite = 'Article 94(3) EPC'
    const trace = [
      { op: 'add-period', from: '2026-10-30' as never, to: '2026-11-30' as never, cite },
      { op: 'add-period', from: '2026-10-30' as never, to: '2027-04-30' as never, cite },
      { op: 'add-period', from: '2026-10-30' as never, to: '2026-11-09' as never, cite },
    ]
    await mountDeadline({ ...fixtures.deadline, deadline: { ...fixtures.deadline.deadline, trace } })
    const page = document.body.textContent
    expect(page).toContain('One month later, on the day with the same number')
    expect(page).toContain('6 months later, on the day with the same number')
    expect(page).toContain('10 days later')
  })

  it('says that the deadline waits in the queue of the person who confirms it, or that this person confirms it', async () => {
    const other = { allowed: false, reason: 'code-decider', decider: null } as const
    await mountDeadline({ ...fixtures.deadline, mayConfirm: other, confirmTask: { owner: lena, queued: true, noticeAt: null } })
    expect(screen.getByRole('region', { name: 'Lena Hoffmann decides' }).textContent).toContain('The deadline waits in the queue of Lena Hoffmann.')
    mounted?.dispose()
    mounted = null
    cleanup()
    await mountDeadline({ ...fixtures.deadline, mayConfirm: other, confirmTask: { owner: lena, queued: false, noticeAt: null } })
    expect(screen.getByRole('region', { name: 'Lena Hoffmann decides' }).textContent).toContain('Lena Hoffmann confirms this deadline.')
  })
})

describe('the Records API client', () => {
  it('reads the office actions that the client wants a report on, a scan that reader 1 read, and a hand entry', () => {
    const matter = parsers.matterDetail({ ...matterWire, clientRules: { ...matterWire.clientRules, reportEvents: ['EPO:R71(3)'] } }, 'body')
    expect(matter.clientRules?.reportEvents).toEqual(['EPO:R71(3)'])
    const code = { ...intakeDocumentWire.readers.code, source: { kind: 'ocr', provider: 'mistral', model: 'mistral-ocr' } }
    const entry = { codes: [{ code: 'EPO:R71(3)', form: '2004C', title: { en: 'Rule 71(3)', de: 'Regel 71(3)' } }], read: null }
    const letter = parsers.intakeDocument({ ...intakeDocumentWire, readers: { ...intakeDocumentWire.readers, code }, entry }, 'body')
    expect(letter.readers.code?.source).toEqual({ kind: 'ocr', provider: 'mistral', model: 'mistral-ocr' })
    expect(letter.entry).toEqual(entry)
  })

  it('files a letter at its intake address with the matter and what the person read', () => {
    const document = R71_DOCUMENT as DocumentId
    expect(commandRequest({
      kind: 'intake.file', document, fileNumber: 'FL-2026-0001' as FileNumber, code: 'EPO:R71(3)', documentDate: '2026-10-30' as never, applicationNumber: '24 123 456.7',
    })).toEqual({
      path: `intake/documents/${R71_DOCUMENT}/file`,
      body: { fileNumber: 'FL-2026-0001', code: 'EPO:R71(3)', documentDate: '2026-10-30', applicationNumber: '24 123 456.7' },
    })
  })

  it('gives page addresses under the Records service, and empty addresses while no Records service is known', async () => {
    const page = ids.page(`documents/${R71_DOCUMENT}/pages/1`, 'page')
    expect(createRecordsApi('https://firm.test/records/').pageHref(page)).toBe(`https://firm.test/records/api/documents/${R71_DOCUMENT}/pages/1`)
    const none = createRecordsApi(Promise.resolve(null))
    await Promise.resolve()
    expect(none.contentHref(R71_DOCUMENT as DocumentId)).toBe('')
    expect(none.pageHref(page)).toBe('')
  })
})
