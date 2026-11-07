// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  parsers, type FileNumber, type IntakeDocument, type MatterDetail, type Me, type OfficeEventId, type PersonId, type TicketDetail,
  type TicketId,
} from '../src/client/api.ts'
import { AccountButton, type AccountProps } from '../src/client/Account.tsx'
import type { Load } from '../src/client/load.ts'
import { de, en } from '../src/client/locales.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS, intakeDocumentWire, PEOPLE, R71_DOCUMENT } from './fixtures.client.ts'
import { mountPanel } from './screen-harness.client.tsx'

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
})

const PAGE = `documents/${R71_DOCUMENT}/pages/1`
const anna = { ...PEOPLE.anna, id: PEOPLE.anna.id as PersonId }
const lena = { ...PEOPLE.lena, id: PEOPLE.lena.id as PersonId }

/**
 * Mount the letter page of a card.
 * @param letter - the card.
 * @param language - the UI language.
 */
async function mountLetter(letter: IntakeDocument, language: 'en' | 'de' = 'en') {
  const { api } = createFixtureApi()
  vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter })
  mounted = await mountPanel(api, { view: 'letter', document: letter.document }, language, 'my-work')
}

describe('the page images of a letter', () => {
  it('shows each page image and quotes the read values with their page beside it, never the form code', async () => {
    await mountLetter(parsers.intakeDocument({ ...intakeDocumentWire, pageImages: [{ page: 1, width: 1240, height: 1754, href: PAGE }] }, 'card'))
    const image = screen.getByRole('img', { name: 'Page 1 of 1 of the letter' })
    expect(image.getAttribute('src')).toBe(`records/api/${PAGE}`)
    expect(screen.queryByRole('img', { name: /^Drawing of page/u })).toBeNull()
    const marks = document.querySelector<HTMLElement>('dl[aria-label="Read values"]')!
    expect([...marks.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Document date', 'Application'])
    expect(marks.textContent).toContain('30.10.2026p. 1')
    expect(marks.textContent).not.toContain('2004C')
  })

  it('draws the letter from reader 1 when the answer has no page image', async () => {
    await mountLetter(fixtures.intakeDocument)
    expect(screen.getByRole('img', { name: /^Drawing of page 1/u })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /^Page \d+ of \d+ of the letter$/u })).toBeNull()
  })

  it('refuses a page image path outside a document\'s pages', () => {
    for (const href of ['https://evil.example/page.png', `documents/${R71_DOCUMENT}/content`, `../documents/${R71_DOCUMENT}/pages/1`, `documents/${R71_DOCUMENT}/pages/0`]) {
      expect(() => parsers.intakeDocument({ ...intakeDocumentWire, pageImages: [{ page: 1, width: 1, height: 1, href }] }, 'card')).toThrow(/page image path/u)
    }
  })
})

describe('the readings and the next confirmer of a letter', () => {
  it('names the OCR text as the source of reader 1 for a scan', async () => {
    const readers = fixtures.intakeDocument.readers
    await mountLetter({ ...fixtures.intakeDocument, readers: { ...readers, code: { ...readers.code!, source: { kind: 'ocr', provider: 'mistral', model: 'mistral-ocr' } } } })
    expect(screen.getByRole('columnheader', { name: 'From the OCR text' })).toBeTruthy()
  })

  it('says in the decision bar who confirms the deadline when the person decides the date, and nobody when the person only files', async () => {
    await mountLetter(fixtures.intakeDocument)
    expect(screen.queryByText(/confirms the deadline|Warteschlange/u)).toBeNull()
    cleanup()
    mounted?.dispose()
    const waiting: IntakeDocument = {
      ...fixtures.intakeDocument,
      status: { machine: 'deadline', state: 'code_proposed' },
      officeEvent: { id: FIXTURE_IDS.officeEvent as OfficeEventId, state: 'code_proposed' },
      proposed: null,
      filed: { fileNumber: 'FL-2026-0001' as FileNumber, title: 'Pressure sensor housing' },
    }
    await mountLetter(waiting)
    expect(screen.getByText('Lena Hoffmann confirms the deadline, because you decide the date.')).toBeTruthy()
    cleanup()
    mounted?.dispose()
    await mountLetter({ ...waiting, nextConfirmer: { person: lena, queued: true } }, 'de')
    expect(screen.getByText('Die Frist geht zur Bestätigung in die Warteschlange von Lena Hoffmann.')).toBeTruthy()
    cleanup()
    mounted?.dispose()
    await mountLetter({ ...waiting, nextConfirmer: null })
    expect(screen.queryByText(/confirms the deadline/u)).toBeNull()
  })

  it('names the next confirmer in the part of the two dates when the readings differ, and not again in the note', async () => {
    const readers = fixtures.intakeDocument.readers
    await mountLetter({
      ...fixtures.intakeDocument,
      status: { machine: 'deadline', state: 'code_proposed' },
      officeEvent: { id: FIXTURE_IDS.officeEvent as OfficeEventId, state: 'code_proposed' },
      proposed: null,
      filed: { fileNumber: 'FL-2026-0001' as FileNumber, title: 'Pressure sensor housing' },
      readers: { ...readers, model: { ...readers.model!, result: { ...readers.model!.result!, documentDate: '2026-10-25' as never } }, agree: false, differences: ['documentDate'] },
    })
    expect(screen.getByText('Lena Hoffmann confirms the deadline')).toBeTruthy()
    expect(screen.queryByText(/because you decide the date/u)).toBeNull()
  })
})

describe('the draft reply', () => {
  it('shows the draft reply to the office before the client report, and decides it as its own part', async () => {
    const { api } = createFixtureApi()
    const clientReport = fixtures.ticket.clientReport!
    const draftReply = { ...clientReport, proposalId: 'proposal-2' as never, kind: 'office-reply' as const, fileName: 'reply-r71-3.docx' }
    const ticket: TicketDetail = { ...fixtures.ticket, reports: [draftReply, clientReport], draftReply, clientReport }
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: ticket })
    mounted = await mountPanel(api, { view: 'work', id: FIXTURE_IDS.ticket as TicketId }, 'en', 'my-work')
    const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(headings.indexOf('Draft reply to the EPO')).toBeGreaterThanOrEqual(0)
    expect(headings.indexOf('Draft reply to the EPO')).toBeLessThan(headings.indexOf('Client report'))
    expect(screen.getByText('Reply to the Rule 71(3) communication')).toBeTruthy()
    expect(document.body.textContent).toContain('The agent drafted the reply to the EPO and the client report.')
    const bar = screen.getByRole('region', { name: 'Your decision' })
    expect(within(bar).getByRole('group', { name: 'Draft reply to the EPO' })).toBeTruthy()
    expect(within(bar).getByRole('group', { name: 'Client report' })).toBeTruthy()
  })
})

describe('the missing draft reply', () => {
  it('says that the agent has not drafted a reply to the office, in the reply\'s place before the client report', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel(api, { view: 'work', id: FIXTURE_IDS.ticket as TicketId }, 'en', 'my-work')
    const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(headings.indexOf('Draft reply to the EPO')).toBeLessThan(headings.indexOf('Client report'))
    expect(screen.getByText('The agent has not drafted a reply to the EPO.')).toBeTruthy()
  })
})

describe('the dossier', () => {
  it('names who confirmed or rejected each deadline and words the client\'s AI rules', async () => {
    const { api } = createFixtureApi()
    const base = fixtures.matter
    const deadline = base.deadlines[0]!
    const matter: MatterDetail = {
      ...base,
      deadlines: [{ ...deadline, state: 'active', confirmedBy: lena }, { ...deadline, id: FIXTURE_IDS.officeEvent as never, state: 'rejected', rejectedBy: anna }],
      clientRules: { ...base.clientRules!, aiUse: 'local-model-only', aiLetters: 'not-allowed' },
      language: 'de',
      wall: { ...base.wall, screened: 1 },
    }
    vi.spyOn(api, 'matter').mockResolvedValue({ ok: true, value: matter })
    mounted = await mountPanel(api, { view: 'matter', fileNumber: 'FL-2026-0001' as never }, 'en', 'matters')
    const deadlines = screen.getByRole('table', { name: 'Deadlines' })
    expect(deadlines.textContent).toContain('Confirmed by Lena Hoffmann')
    expect(deadlines.textContent).toContain('Rejected by Dr. Anna Becker')
    const panel = screen.getByRole('complementary', { name: 'Properties' })
    expect(panel.textContent).toContain('Drafts with the local model')
    expect(panel.textContent).toContain('German')
    expect(panel.textContent).toContain('The team · 1 person screened')
  })
})

describe('My work from the os', () => {
  it('shows the os reason of each task in the UI language', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel(api, { view: 'my-work' }, 'de', 'my-work')
    expect(screen.getByText('Entwürfe warten auf Ihre Entscheidung')).toBeTruthy()
    expect(screen.queryByText('Drafts wait for your decision')).toBeNull()
  })
})

describe('the account menu', () => {
  /**
   * Render the account button of a person.
   * @param me - the person with the role.
   * @param language - the UI language.
   */
  function mountAccount(me: Me, language: 'en' | 'de' = 'en') {
    const load: Load<Me> = { phase: 'ready', data: me, at: 0, refreshing: false }
    const props = {
      t: makeTranslate(language === 'de' ? de : en), wide: true, useMe: bindSnapshotSelector(createSnapshotStore(load)),
      signOutHref: null, leave: vi.fn(),
    } as AccountProps
    render(<AccountButton {...props} />)
  }

  it('shows the firm role under the name and in the menu, and nothing for no role', () => {
    mountAccount(fixtures.me)
    const button = screen.getByRole('button', { name: /Dr\. Anna Becker/u })
    expect(button.textContent).toContain('Patent attorney')
    fireEvent.click(button)
    expect(screen.getByRole('menu').textContent).toContain('Patent attorney')
    cleanup()
    mountAccount({ ...fixtures.me, role: 'formalities' }, 'de')
    expect(screen.getByRole('button', { name: /Dr\. Anna Becker/u }).textContent).toContain('Formalitäten')
    cleanup()
    mountAccount({ ...fixtures.me, role: null })
    expect(screen.getByRole('button', { name: /Dr\. Anna Becker/u }).textContent).toBe('ADr. Anna Becker')
  })
})
