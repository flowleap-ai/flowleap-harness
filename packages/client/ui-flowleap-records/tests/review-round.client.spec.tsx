// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineDetail, DeadlineId, FileNumber, IntakeDocument, OfficeEventId, TicketId } from '../src/client/api.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS } from './fixtures.client.ts'
import { flush, mountPanel, press } from './screen-harness.client.tsx'

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

const bar = () => screen.getByRole('region', { name: /decision|Done/u })

/**
 * Mount the letter page of a card.
 * @param letter - the card.
 */
async function mountLetter(letter: IntakeDocument) {
  const { api } = createFixtureApi()
  vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter })
  mounted = await mountPanel(api, { view: 'letter', document: letter.document }, 'en', 'my-work')
}

const oneReading = { ...fixtures.intakeDocument.readers, model: null, agree: null, differences: null }

describe('the readings of a letter', () => {
  it('shows one reading as one column, and says so in the heading', async () => {
    await mountLetter({ ...fixtures.intakeDocument, readers: oneReading })
    expect(screen.getByRole('heading', { name: /What FlowLeap read/u }).textContent).toBe('What FlowLeap read · one reading')
    const table = screen.getByRole('table', { name: 'What FlowLeap read' })
    expect(within(table).queryByRole('columnheader', { name: 'From the page image' })).toBeNull()
    expect(within(table).queryByText('Not read')).toBeNull()
  })

  it('shows a value that reader 1 quoted as read, never "Not read" above its quote', async () => {
    const readers = fixtures.intakeDocument.readers
    const code = { ...readers.code!, result: { code: null, documentDate: null, applicationNumber: null } }
    await mountLetter({ ...fixtures.intakeDocument, readers: { ...oneReading, code } })
    const rows = within(screen.getByRole('table', { name: 'What FlowLeap read' })).getAllByRole('row')
    expect(rows[2]!.textContent).toBe('Document dateFri, 30 Oct 202630.10.2026p. 1')
    expect(rows[1]!.textContent).toBe('Office eventNot read')
  })
})

describe('a letter whose office event no reader could tell', () => {
  it('titles it by its date, says why, and says that a person enters the office event after the filing', async () => {
    await mountLetter({ ...fixtures.intakeDocument, code: null, office: null, documentDate: null, readers: oneReading })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Letter of 30 Oct 2026')
    expect(screen.getByText('FlowLeap could not tell which office event this letter is.')).toBeTruthy()
    expect(screen.getByText(/After you file, a person enters it from the page/u)).toBeTruthy()
    expect(screen.queryByText(/FlowLeap records the office event and computes the deadline/u)).toBeNull()
  })
})

describe('a scan whose office event reader 1 could not tell, with its date and application number read', () => {
  it('shows the read values, says that the person enters the office event, and starts the hand entry from them', async () => {
    const { fields } = fixtures.intakeDocument
    const readers = fixtures.intakeDocument.readers
    const read = { documentDate: fields.documentDate!, applicationNumber: fields.applicationNumber! }
    await mountLetter({
      ...fixtures.intakeDocument,
      status: { machine: 'intake', state: 'unreadable' },
      code: null, office: null, documentDate: null, applicationNumber: null, proposed: null, candidates: 0, filed: null, officeEvent: null,
      fields: read,
      readers: { ...oneReading, code: { ...readers.code!, result: null, fields: read } },
      mayDecide: { allowed: true },
      entry: { codes: [{ code: 'EPO:R71(3)', form: '2004C', title: { en: 'Rule 71(3) communication', de: 'Mitteilung nach Regel 71(3)' } }] },
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Letter of 30 Oct 2026')
    expect(document.body.textContent).toContain('FlowLeap read the date and the application number, but not which office event this letter is.')
    expect(screen.getByRole('table', { name: 'What FlowLeap read' }).textContent).toContain('Fri, 30 Oct 202630.10.2026p. 1')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Application' }).value).toBe('24 123 456.7')
    expect(document.querySelector<HTMLInputElement>('input[name="documentDate"]')!.value).toBe('2026-10-30')
  })
})

describe('the letter after the person acted', () => {
  const filed = { fileNumber: 'FL-2026-0001' as FileNumber, title: 'Pressure sensor housing' }

  it('says that the letter is filed and what FlowLeap does next, with no act of the person', async () => {
    await mountLetter({
      ...fixtures.intakeDocument,
      status: { machine: 'deadline', state: 'awaiting_code' },
      officeEvent: { id: FIXTURE_IDS.officeEvent as OfficeEventId, state: 'awaiting_code' },
      proposed: null,
      filed,
      mayDecide: { allowed: false, reason: 'not-ready', decider: null },
    })
    expect(screen.getByText(/^Waits for FlowLeap since/u)).toBeTruthy()
    const done = screen.getByRole('region', { name: 'Done' })
    expect(done.textContent).toContain('This letter is filed.')
    expect(done.textContent).toContain('Filed on FL-2026-0001')
    expect(done.textContent).toContain('FlowLeap reads the office event from the letter next.')
    expect(screen.queryByText('FlowLeap is still reading this letter.')).toBeNull()
    expect(within(done).getByRole('button', { name: /Go to FL-2026-0001/u })).toBeTruthy()
  })

  it('says that the office event is recorded and that a second person confirms the deadline', async () => {
    await mountLetter({
      ...fixtures.intakeDocument,
      status: { machine: 'deadline', state: 'deadline_proposed' },
      officeEvent: { id: FIXTURE_IDS.officeEvent as OfficeEventId, state: 'deadline_proposed' },
      proposed: null,
      filed,
      mayDecide: { allowed: false, reason: 'decided', decider: null },
    })
    const done = screen.getByRole('region', { name: 'Done' })
    expect(done.textContent).toContain('Filed on FL-2026-0001 · office event recorded')
    expect(done.textContent).toContain('A second person confirms the deadline.')
  })
})

describe('the why line of a letter', () => {
  it('names the formalities person of the matter as the mockups do', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'me').mockResolvedValue({ ok: true, value: { ...fixtures.me, role: 'formalities' } })
    vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: fixtures.intakeDocument })
    mounted = await mountPanel(api, { view: 'letter', document: fixtures.intakeDocument.document }, 'en', 'my-work')
    expect(within(bar()).getByText('You are the formalities person of FL-2026-0001')).toBeTruthy()
    expect(screen.getByText(/^Waits for you since/u)).toBeTruthy()
  })
})

describe('the keys of the panel', () => {
  it('opens Find a matter with / from every view', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel(api, { view: 'my-work' }, 'en', 'my-work')
    press(mounted.panel, 'Slash', { key: '/' })
    expect(mounted.openFind).toHaveBeenCalledTimes(1)
  })
})

describe('the deadline page with one reading', () => {
  it('says that the calculation uses one reading, and that the date waits for the person who may confirm it', async () => {
    const { api } = createFixtureApi()
    const readers = { ...fixtures.deadline.readers, model: null, agree: null, differences: null }
    const deadline: DeadlineDetail = { ...fixtures.deadline, readers, mayConfirm: { allowed: true } }
    vi.spyOn(api, 'deadline').mockResolvedValue({ ok: true, value: deadline })
    mounted = await mountPanel(api, { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId })
    const heading = screen.getByRole('heading', { name: /What FlowLeap read/u })
    expect(heading.textContent).toBe('What FlowLeap read· one reading · the calculation uses these values')
    expect(screen.getByText('Deadline')).toBeTruthy()
    expect(screen.getByText('Waits for you')).toBeTruthy()
  })
})

describe('the accepted part of a work decision', () => {
  it('says Accepted in the part after a click on Accept', async () => {
    const { api } = createFixtureApi()
    const report = fixtures.ticket.reports[0]!
    const statements = report.statements.filter(statement => statement.evidence.some(evidence => evidence.span !== null))
    const sourced = { ...report, statements }
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: { ...fixtures.ticket, reports: [sourced], clientReport: sourced } })
    mounted = await mountPanel(api, { view: 'work', id: FIXTURE_IDS.ticket as TicketId })
    const part = within(screen.getByRole('region', { name: 'Your decision' })).getByRole('group', { name: 'Client report' })
    fireEvent.click(within(part).getByRole('button', { name: /Accept/u }))
    await flush()
    expect(screen.getByRole('region', { name: 'Your decision' }).textContent).toContain('Accepted')
  })
})
