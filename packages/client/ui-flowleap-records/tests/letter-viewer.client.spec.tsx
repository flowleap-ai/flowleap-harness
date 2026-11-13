// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parsers, type DeadlineDetail, type DeadlineId, type PageHref, type RecordsApi, type TicketId } from '../src/client/api.ts'
import { markOf } from '../src/client/screens/LetterViewer.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, R71_DOCUMENT, readingWire, ticketWire } from './fixtures.client.ts'
import { flush, mountPanel } from './screen-harness.client.tsx'

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
const opened = vi.fn()
const scrolled: Element[] = []
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
  opened.mockReset()
  scrolled.length = 0
  vi.spyOn(window, 'open').mockImplementation((url) => { opened(String(url)); return null })
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this) }
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
 * Page 1 of the Art. 94(3) letter of `readingWire`, with its two quotes at their stored offsets 380 and 410, and the period on its own
 * centred line, as the form prints it.
 */
const PAGE_1 = `${' '.repeat(380)}D1: EP 1 234 567 A1${' '.repeat(11)}nicht neu gegenüber D1 (Artikel 54(1) EPÜ).
You are invited to file your observations within a period
                                        of 4 months
from the notification of this communication.`
const PERIOD_WORDS = 'within a period\n                                        of 4 months'
const PERIOD_START = PAGE_1.indexOf(PERIOD_WORDS)
const PAGES = [PAGE_1, 'Seite 2 des Bescheids', 'Seite 3 des Bescheids']
const images = PAGES.map((_, index) => ({ page: index + 1, width: 1240, height: 1754, href: `documents/${R71_DOCUMENT}/pages/${index + 1}` as PageHref }))
const viewer = () => screen.getByRole('complementary', { name: /^Letter: / })
const textOf = (api: RecordsApi, pages: readonly string[] | null) => vi.spyOn(api, 'letterText').mockResolvedValue(pages === null
  ? { ok: false, error: { kind: 'refused', status: 404, code: 'not-found', detail: null } }
  : { ok: true, value: { pages } })

describe('the mark of a span', () => {
  it('marks the text at the stored offsets when it is the quote, a run of white space counting as one space', () => {
    expect(markOf('ab within a  period c', { start: 3, end: 19, quote: 'within a period' })).toEqual({ before: 'ab ', at: 'within a  period', after: ' c' })
    expect(markOf('ab within a period c', { start: 2, end: 10, quote: 'within a period' })).toBeNull()
    expect(markOf('short', { start: 2, end: 40, quote: 'ort' })).toBeNull()
  })
})

describe('the letter on the work page', () => {
  const ticket = parsers.ticketDetail({ ...ticketWire, letter: { ...ticketWire.letter, pages: 3, pageImages: images }, readings: [readingWire] }, 'ticket')

  async function mountWork(pages: readonly string[] | null = PAGES) {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: ticket })
    textOf(api, pages)
    mounted = await mountPanel(api, { view: 'work', id: FIXTURE_IDS.ticket as TicketId })
  }

  it('opens the letter at the page of a quote of the reading and marks the span in the page text; the decision and the page stay as they were', async () => {
    await mountWork()
    const bar = screen.getByRole('region', { name: 'Your decision' })
    fireEvent.click(within(within(bar).getByRole('group', { name: 'Reading of the letter' })).getByRole('button', { name: /^Accept/ }))
    const title = screen.getByRole('heading', { level: 1 })
    const quote = screen.getByRole('button', { name: 'nicht neu gegenüber D1 · Show on page 1 of the letter' })
    quote.focus()
    fireEvent.click(quote)
    await flush()

    const mark = viewer().querySelector('mark')
    expect(mark?.textContent).toBe('nicht neu gegenüber D1')
    expect(scrolled.at(-1)).toBe(mark)
    expect(within(viewer()).getByRole('tab', { name: 'Text' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { level: 1 })).toBe(title)
    expect(within(bar).getByText('Accepted')).toBeTruthy()

    fireEvent.click(within(viewer()).getByRole('tab', { name: 'Pages' }))
    expect(within(viewer()).getAllByRole('img', { name: /^Page \d of 3 of the letter$/u })).toHaveLength(3)
    expect(viewer().textContent).toContain('A page image cannot show the mark. Select Text to see the quote marked on page 1.')

    fireEvent.keyDown(viewer(), { key: 'Escape' })
    await flush()
    expect(screen.queryByRole('complementary', { name: /^Letter: / })).toBeNull()
    expect(document.activeElement).toBe(quote)
    expect(within(bar).getByText('Accepted')).toBeTruthy()
  })

  it('opens the letter at page 1 from Open the letter, as pages', async () => {
    await mountWork()
    act(() => { mounted!.keyActs.handler('openLetter')?.() })
    await flush()
    expect(within(viewer()).getByRole('tab', { name: 'Pages' }).getAttribute('aria-selected')).toBe('true')
    expect(scrolled.at(-1)).toBe(within(viewer()).getAllByRole('figure')[0])
    expect(opened).not.toHaveBeenCalled()
  })

  it('shows a scan with no text layer as pages, says that no quote can be marked, and offers no text', async () => {
    await mountWork(null)
    fireEvent.click(screen.getByRole('button', { name: 'D1: EP 1 234 567 A1 · Show on page 1 of the letter' }))
    await flush()
    expect(viewer().textContent).toContain('This letter has no text layer. You can read its pages, but FlowLeap cannot mark a quote on them.')
    expect(within(viewer()).queryByRole('tab', { name: 'Text' })).toBeNull()
    expect(within(viewer()).getAllByRole('img', { name: /^Page \d of 3 of the letter$/u })).toHaveLength(3)
    expect(viewer().querySelector('mark')).toBeNull()
  })
})

describe('the letter on the deadline page', () => {
  /** Mount the deadline page; `fixtureText` keeps the fixture's page text of the Rule 71(3) letter, where reader 1's spans are. */
  async function mountDeadline(deadline: DeadlineDetail, fixtureText = false) {
    const { api, acts } = createFixtureApi()
    vi.spyOn(api, 'deadline').mockResolvedValue({ ok: true, value: deadline })
    if (!fixtureText) textOf(api, PAGES)
    mounted = await mountPanel(api, { view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId })
    return acts
  }
  const periodOf = (place: { start: number; end: number } | null): DeadlineDetail => ({
    ...fixtures.deadline,
    pageImages: images,
    deadline: { ...fixtures.deadline.deadline, state: 'deadline_proposed' },
    officeEvent: { ...fixtures.deadline.officeEvent, code: 'EPO:A94(3)', period: { state: 'known', months: 4, source: { kind: 'reader', page: 1, quote: 'within a period of 4 months', place } } },
  })
  const a94 = periodOf({ start: PERIOD_START, end: PERIOD_START + PERIOD_WORDS.length })

  it('shows page 1 of the letter; Open the letter shows every page beside the page, and the decision bar stays usable', async () => {
    const acts = await mountDeadline(a94)
    expect(screen.getAllByRole('img', { name: /of the letter$/u }).map(image => image.getAttribute('alt'))).toEqual(['Page 1 of 3 of the letter'])
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Page 1 of 3 of the letter' }))
    await flush()
    expect(viewer().getAttribute('data-placement')).toBe('side')
    expect(viewer().hasAttribute('data-card')).toBe(true)
    expect(viewer().parentElement?.hasAttribute('data-letter')).toBe(true)
    expect(within(viewer()).getAllByRole('img')).toHaveLength(3)

    const bar = screen.getByRole('region', { name: 'Your decision' })
    fireEvent.click(within(bar).getByRole('button', { name: /^Confirm/ }))
    await flush()
    expect(acts.at(-1)?.command).toMatchObject({ kind: 'deadline.confirm' })
    expect(screen.getByRole('complementary', { name: /^Letter: / })).toBeTruthy()

    fireEvent.click(within(viewer()).getByRole('button', { name: 'Close the letter' }))
    await flush()
    expect(screen.queryByRole('complementary', { name: /^Letter: / })).toBeNull()
  })

  it('marks the words of the period in the text of page 1', async () => {
    await mountDeadline(a94)
    fireEvent.click(screen.getByRole('button', { name: 'within a period of 4 months · Show on page 1 of the letter' }))
    await flush()
    expect(within(viewer()).getByRole('tab', { name: 'Text' }).getAttribute('aria-selected')).toBe('true')
    const mark = viewer().querySelector('mark')
    expect(mark?.textContent).toBe(PERIOD_WORDS)
    expect(scrolled.at(-1)).toBe(mark)
    expect(viewer().textContent).not.toContain('shows no mark')
  })

  it('opens page 1 with no mark for a period that FlowLeap read before it kept the place of its words', async () => {
    await mountDeadline(periodOf(null))
    fireEvent.click(screen.getByRole('button', { name: 'within a period of 4 months · Show on page 1 of the letter' }))
    await flush()
    expect(viewer().textContent).toContain('FlowLeap read this letter before it kept the place of its words, so page 1 shows no mark.')
    expect(within(viewer()).getByRole('tab', { name: 'Pages' }).getAttribute('aria-selected')).toBe('true')
    expect(scrolled.at(-1)).toBe(within(viewer()).getAllByRole('figure')[0])
  })

  it('marks a value that reader 1 read at its span', async () => {
    await mountDeadline({ ...fixtures.deadline, pageImages: images }, true)
    fireEvent.click(screen.getAllByRole('button', { name: '30.10.2026 · Show on page 1 of the letter' })[0]!)
    await flush()
    expect(viewer().querySelector('mark')?.textContent).toBe('30.10.2026')
  })
})
