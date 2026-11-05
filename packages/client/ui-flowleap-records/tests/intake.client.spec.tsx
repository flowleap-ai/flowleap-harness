// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentId, Fetched, FileNumber, IntakeDocument, OfficeEventId, RecordsApi } from '../src/client/api.ts'
import { shownOrder } from '../src/client/screens/IntakeScreen.tsx'
import { rowActions } from '../src/client/row-menu.ts'
import { menuEntries } from '@deepseek-ai/dsh-client-ui-context-menu/src/client/View.tsx'
import type { Route } from '../src/client/model.ts'
import { createFixtureApi, fixtures, OUTSIDE_WALL, OUTSIDER, R71_DOCUMENT, sha } from './fixtures.client.ts'
import { flush, mountPanel, press } from './screen-harness.client.tsx'

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query !== '(min-width: 1366px)', addEventListener() {}, removeEventListener() {} })))
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
})
afterEach(() => {
  mounted?.dispose()
  mounted = null
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const WAITING: Route = { view: 'intake', list: 'waiting', open: null }
const open = (document: string): Route => ({ view: 'intake', list: 'waiting', open: document as DocumentId })

async function mount(api: RecordsApi = createFixtureApi().api, route: Route = WAITING) {
  mounted = await mountPanel(api, route)
  return mounted
}

/** A letter of the fixtures in another state. */
function letter(patch: Partial<IntakeDocument>): IntakeDocument {
  return { ...fixtures.intakeDocument, ...patch }
}

const decision = (heading = 'Your decision') => screen.getAllByRole('region', { name: heading }).at(-1)!

describe('the intake list', () => {
  it('shows the three lists as chips with their counts, newest first in each group, and a forwarder outside the team unnamed', async () => {
    const { model } = await mount()
    const chips = screen.getAllByRole('button', { pressed: true }).concat(screen.getAllByRole('button', { pressed: false }))
    expect(chips.map(chip => chip.textContent).toSorted()).toEqual(['Filed today6', 'Not relevant1', 'Waits for a person22'])
    expect(screen.getByText('Oldest last')).toBeTruthy()
    const rows = [...document.querySelectorAll('[data-row]')].map(row => row.getAttribute('data-row'))
    expect(rows).toEqual(shownOrder(fixtures.intake.rows).map(row => row.document))
    expect(rows.slice(0, 2)).toEqual([sha(1), sha(2)])
    expect(rows.indexOf(sha(9))).toBe(rows.indexOf(sha(8)) + 1)
    const outsider = document.querySelector('[data-row="' + sha(22) + '"] [role="img"]')
    expect(outsider?.getAttribute('aria-label')).toBe('Forwarded by a person outside the team')
    expect(outsider?.textContent).toBe('')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
    fireEvent.click(screen.getByRole('button', { name: /Filed today/ }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'filed-today', open: null })
    expect(screen.getByText('Nothing filed today')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Waits for a person/ })[0]!)
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'waiting' })
  })

  it('draws the keys of the row context menu as the decision bar draws them', async () => {
    const { model, registry } = await mount(createFixtureApi().api, open(R71_DOCUMENT))
    const barKeys = (name: RegExp) => [...within(decision()).getByRole('button', { name }).querySelectorAll('kbd')].map(kbd => kbd.textContent)
    const acts = rowActions(model, key => key, {
      document: R71_DOCUMENT as DocumentId, list: 'waiting', proposed: 'FL-2026-0001' as FileNumber,
    }, () => '')
    const entries = menuEntries(acts, registry.catalog.getSnapshot(), () => null)
    const menuKeys = (id: string) => {
      const entry = entries.find(item => item.id === id)
      return entry !== undefined && 'shortcut' in entry ? entry.shortcut?.keys : undefined
    }
    expect(barKeys(/^Accept and file/)).toEqual(['⇧⌘↵'])
    expect(menuKeys('accept')).toEqual(['⇧⌘↵'])
    expect(menuKeys('not-relevant')).toEqual(barKeys(/^Not relevant/))
    expect(menuKeys('other-matter')).toEqual(barKeys(/^Other matter/))
  })

  it('shows the empty waiting list with the next step', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'intake').mockResolvedValue({ ok: true, value: { ...fixtures.intake, rows: [] } })
    const { model } = await mount(api)
    expect(screen.getByText('Nothing waits for you')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Show filed today/ }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'filed-today' })
    fireEvent.click(screen.getByRole('button', { name: 'Waits for a person' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'waiting' })
  })

  it('moves with J, K and the arrows, opens with ↵, and pages "1 / N" in the order the list shows', async () => {
    const { model, panel } = await mount()
    const order = shownOrder(fixtures.intake.rows).map(row => row.document)
    act(() => { panel.focus() })
    press(panel, 'Enter')
    press(panel, 'KeyX')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: null })
    expect(screen.queryByText('1 selected')).toBeNull()
    press(panel, 'KeyK')
    expect(document.activeElement?.getAttribute('data-row')).toBe(order.at(-1))
    act(() => { panel.focus() })
    press(panel, 'KeyJ')
    expect(document.activeElement?.getAttribute('data-row')).toBe(order[0])
    press(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.getAttribute('data-row')).toBe(order[1])
    press(document.activeElement!, 'KeyK')
    expect(document.activeElement?.getAttribute('data-row')).toBe(order[0])
    press(panel, 'KeyK')
    press(document.activeElement!, 'Enter')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: order[0] })
    press(panel, 'KeyJ')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: order[1] })
    expect(screen.getByLabelText(`Letter 2 of ${order.length}`)).toBeTruthy()
    press(panel, 'ArrowUp')
    press(panel, 'ArrowUp')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: order[0] })
    act(() => { model.navigate(open(order.at(-1)!)) })
    await flush()
    press(panel, 'KeyJ')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: order.at(-1) })
  })

  it('shows Markus Brandt, who forwarded a letter from outside the wall, as a person outside the team with no initial', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter({ document: sha(22) as DocumentId, mail: { ...fixtures.intakeDocument.mail, forwarder: OUTSIDER } }) })
    await mount(api, open(sha(22)))
    expect(document.body.textContent).toContain('A person outside the team forwarded this letter to the AI mailbox.')
    const from = screen.getAllByText('From').map(label => label.parentElement!.textContent)
    expect(from).toContain('FromA person outside the team')
    expect([...document.querySelectorAll('[data-anonymous]')].every(avatar => avatar.textContent === '')).toBe(true)
    expect(document.querySelectorAll('[data-anonymous]').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('Esc closes the open letter, and the person outside the wall shows nowhere', async () => {
    const { model, panel } = await mount(undefined, open(R71_DOCUMENT))
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
    fireEvent.click(screen.getByRole('button', { name: /Other matter/ }))
    await flush()
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(document.body.textContent).toContain('Only the matters that you may see show here.')
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: R71_DOCUMENT })
    fireEvent.keyDown(screen.getByTestId('intake'), { key: 'Escape' })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: null })
    fireEvent.keyDown(screen.getByTestId('intake'), { key: 'Escape' })
    fireEvent.keyDown(screen.getByTestId('intake'), { key: 'Enter' })
    expect(model.screen.getSnapshot()).toMatchObject({ open: null })
    expect(panel).toBeTruthy()
  })
})

describe('the split view from 1366px', () => {
  it('opens the first letter beside the list, follows the width, and keeps the letter open on Esc', async () => {
    const listeners: (() => void)[] = []
    let wide = true
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(min-width: 1366px)' ? wide : true,
      addEventListener: (_type: string, listener: () => void) => { listeners.push(listener) },
      removeEventListener: (_type: string, listener: () => void) => { listeners.splice(listeners.indexOf(listener), 1) },
    })))
    const { model } = await mount()
    const first = shownOrder(fixtures.intake.rows)[0]!.document
    expect(model.screen.getSnapshot()).toMatchObject({ open: first })
    fireEvent.keyDown(screen.getByTestId('intake'), { key: 'Escape' })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: first })
    wide = false
    act(() => { for (const listener of [...listeners]) listener() })
    act(() => { model.navigate(WAITING) })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: null })
  })
})

describe('the open letter', () => {
  it('draws the letter from reader 1 with the read spans marked, gives the reasons and the letter facts, and opens the PDF with O', async () => {
    const windowOpen = vi.fn()
    vi.stubGlobal('open', windowOpen)
    const { panel } = await mount(undefined, open(R71_DOCUMENT))
    const drawing = screen.getByRole('img', { name: 'Drawing of page 1 of the letter' })
    expect(drawing.hasAttribute('data-verbatim')).toBe(true)
    expect([...drawing.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['2004C', '30.10.2026', 'FL-2026-0001', '24 123 456.7'])
    expect(screen.getByText('Page 1 of 1')).toBeTruthy()
    const reasons = within(screen.getByRole('list', { name: 'Reasons' })).getAllByRole('listitem').map(item => item.textContent)
    expect(reasons[0]).toContain('Your reference on page 1 reads FL-2026-0001')
    expect(reasons[1]).toBe('One matter that you may see has this file number.')
    expect(reasons[2]).toContain('FlowLeap read the letter as a Rule 71(3) communication from the EPO, dated 30.10.2026')
    expect(within(decision()).getByText('3 reasons on page 1 agree')).toBeTruthy()
    expect(screen.getByText('Filing puts your name on the record')).toBeTruthy()
    expect(screen.getAllByText('Dr. Anna Becker').length).toBeGreaterThan(0)
    const facts = screen.getByRole('region', { name: 'Letter' })
    expect([...facts.querySelectorAll('dt')].map(label => label.textContent)).toEqual(['Received', 'Subject', 'Document'])
    expect([...facts.querySelectorAll('dd')].map(value => value.textContent)).toEqual([expect.stringMatching(/^\d\d:\d\d$/), 'Fwd: EPO communication', '1 page'])
    press(panel, 'KeyO')
    expect(windowOpen).toHaveBeenCalledWith(`records/api/documents/${R71_DOCUMENT}/content`, '_blank', 'noopener')
    fireEvent.click(screen.getByRole('button', { name: /Open the letter/ }))
    expect(windowOpen).toHaveBeenCalledTimes(2)
  })

  it('records Accept and file with ⇧⌘↵ and with 1, one act with its own key each time, and no second act while one runs', async () => {
    const { api, acts } = createFixtureApi()
    const { panel } = await mount(api, open(R71_DOCUMENT))
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    press(panel, 'Digit1')
    expect(within(decision()).getByRole('button', { name: /Accept and file/ }).getAttribute('aria-busy')).toBe('true')
    await flush()
    expect(acts).toHaveLength(1)
    press(panel, 'Digit1')
    press(panel, 'KeyX')
    await flush()
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(acts.map(act => act.command)).toEqual([
      { kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' },
      { kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' },
    ])
    expect(acts[0]!.key).not.toBe(acts[1]!.key)
  })

  it('opens the reason step with 2; a single key typed into the reason box runs no act', async () => {
    const { api, acts } = createFixtureApi()
    const windowOpen = vi.fn()
    vi.stubGlobal('open', windowOpen)
    const { panel, model } = await mount(api, open(R71_DOCUMENT))
    press(panel, 'Digit2')
    await flush()
    const field = screen.getByLabelText('Why is this letter not relevant?')
    for (const code of ['Digit1', 'Digit2', 'KeyM', 'KeyO', 'KeyJ', 'KeyX', 'KeyF']) press(field, code)
    press(field, 'Escape')
    await flush()
    expect(acts).toEqual([])
    expect(windowOpen).not.toHaveBeenCalled()
    expect(model.screen.getSnapshot()).toMatchObject({ open: R71_DOCUMENT, list: 'waiting' })
    press(panel, 'Digit2')
    await flush()
    fireEvent.change(screen.getByLabelText('Why is this letter not relevant?'), { target: { value: 'Advertising' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark not relevant' }))
    await flush()
    expect(acts.map(act => act.command)).toEqual([{ kind: 'intake.notRelevant', document: R71_DOCUMENT, reason: 'Advertising' }])
  })

  it('shows each failed act of a letter in its bar, tries it again with its act after no answer, and a new one after a pick', async () => {
    const { api, acts } = createFixtureApi()
    const answers: Fetched<null>[] = [
      { ok: false, error: { kind: 'network' } },
      { ok: false, error: { kind: 'network' } },
      { ok: false, error: { kind: 'refused', status: 409, code: 'not-ready', detail: null } },
      { ok: false, error: { kind: 'network' } },
    ]
    vi.spyOn(api, 'perform').mockImplementation((next) => {
      acts.push(next)
      return Promise.resolve(answers.shift() ?? { ok: true, value: null })
    })
    const { panel } = await mount(api, open(R71_DOCUMENT))
    fireEvent.click(within(decision()).getByRole('button', { name: /Accept and file/ }))
    await flush()
    expect(within(decision()).getByRole('alert').textContent).toContain('FlowLeap could not file the letter. FlowLeap did not answer, so it may be recorded.')
    press(panel, 'KeyR')
    await flush()
    expect(acts[1]!.key).toBe(acts[0]!.key)
    press(panel, 'KeyM')
    await flush()
    expect(within(decision()).queryByRole('alert')).toBeNull()
    fireEvent.click(within(screen.getByRole('menu')).getByText('FL-2025-0412 Brake caliper bracket'))
    await flush()
    fireEvent.click(within(decision()).getByRole('button', { name: /File on FL-2025-0412/ }))
    await flush()
    expect(within(decision()).getByRole('alert').textContent).toContain('FlowLeap refused it and recorded nothing.')
    expect(acts[2]!.key).not.toBe(acts[0]!.key)
    press(panel, 'Digit2')
    await flush()
    expect(within(decision()).queryByRole('alert')).toBeNull()
    fireEvent.click(within(decision()).getByRole('button', { name: 'Cancel' }))
    press(panel, 'Digit2')
    await flush()
    fireEvent.change(screen.getByLabelText('Why is this letter not relevant?'), { target: { value: 'Advertising' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark not relevant' }))
    await flush()
    expect(within(decision()).getByRole('alert').textContent).toContain('FlowLeap could not mark the letter not relevant.')
    fireEvent.click(within(within(decision()).getByRole('alert')).getByRole('button', { name: /Try again/ }))
    await flush()
    expect(acts.map(act => act.command)).toEqual([
      { kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' },
      { kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2026-0001' },
      { kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2025-0412' },
      { kind: 'intake.notRelevant', document: R71_DOCUMENT, reason: 'Advertising' },
      { kind: 'intake.notRelevant', document: R71_DOCUMENT, reason: 'Advertising' },
    ])
    expect(acts[4]!.key).toBe(acts[3]!.key)
    expect(within(decision()).queryByRole('alert')).toBeNull()
  })

  it('shows one load notice for the list and the open letter, and a service failure of an act only in its bar, as no answer', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
    const { api, acts } = createFixtureApi()
    const down: Fetched<never> = { ok: false, error: { kind: 'service', status: 503 } }
    vi.spyOn(api, 'perform').mockImplementation((next) => {
      acts.push(next)
      vi.spyOn(api, 'intake').mockResolvedValue(down)
      vi.spyOn(api, 'intakeDocument').mockResolvedValue(down)
      return Promise.resolve(down)
    })
    await mount(api, open(R71_DOCUMENT))
    fireEvent.click(within(decision()).getByRole('button', { name: /Accept and file/ }))
    await flush()
    const notices = screen.getAllByRole('alert')
    expect(notices.map(notice => notice.textContent?.split('.')[0])).toEqual(['FlowLeap could not load this view', 'FlowLeap could not file the letter'])
    expect(notices[0]!.textContent).toMatch(/It shows the data as of \d\d:\d\d\./)
    expect(within(decision()).getByRole('alert').textContent).toContain('FlowLeap did not answer, so it may be recorded.')
    expect(document.body.textContent).not.toContain('refused')
    expect(screen.getAllByRole('button', { name: /Try again/ })).toHaveLength(2)
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    fireEvent.click(within(within(decision()).getByRole('alert')).getByRole('button', { name: /Try again/ }))
    await flush()
    expect(acts.map(act => act.key)).toEqual([acts[0]!.key, acts[0]!.key])
  })

  it('files on another matter: M opens the picker of the matters the person may see, the pick becomes the part', async () => {
    const { api, acts } = createFixtureApi()
    const { panel } = await mount(api, open(R71_DOCUMENT))
    press(panel, 'KeyM')
    await flush()
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toContain('FL-2025-0412 Brake caliper bracket')
    fireEvent.click(within(menu).getByText('FL-2025-0412 Brake caliper bracket'))
    await flush()
    expect(within(decision()).getByText('FL-2025-0412 Brake caliper bracket')).toBeTruthy()
    fireEvent.click(within(decision()).getByRole('button', { name: /File on FL-2025-0412/ }))
    await flush()
    expect(acts.map(act => act.command)).toEqual([{ kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2025-0412' }])
    fireEvent.click(within(decision()).getByRole('button', { name: 'Change…' }))
    await flush()
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('opens the picker first for a letter with no proposal, and its row menu step opens with the letter', async () => {
    const { api, acts } = createFixtureApi()
    vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter({
      status: { machine: 'intake', state: 'unmatched' }, proposed: null, candidates: 0, fields: {}, code: null, office: null,
    }) })
    const { panel } = await mount(api, { view: 'intake', list: 'waiting', open: sha(10) as DocumentId, step: 'other-matter' })
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(within(decision()).getByText('No matter chosen')).toBeTruthy()
    expect(screen.getByText('FlowLeap found no file number on the letter.')).toBeTruthy()
    expect(screen.getByText(/No matter that you may see has its file number\./)).toBeTruthy()
    const primary = within(decision()).getByRole('button', { name: /Accept and file/ })
    expect(primary).toHaveProperty('disabled', true)
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    expect(acts).toEqual([])
  })

  it('words each state in the lede and the reasons', async () => {
    const { api } = createFixtureApi()
    const spy = vi.spyOn(api, 'intakeDocument')
    const cases: [Partial<IntakeDocument>, string][] = [
      [{ fields: {}, office: null }, 'The file number on page 1 names one matter.'],
      [{ fields: {}, office: null }, 'FlowLeap read the letter as a Rule 71(3) communication from the EPO.'],
      [{ status: { machine: 'intake', state: 'ambiguous' }, proposed: null, candidates: 2 }, 'Two or more matters have its file number.'],
      [{ status: { machine: 'intake', state: 'unreadable' }, proposed: null, fields: {}, code: null }, 'FlowLeap could not read its text.'],
      [{ status: { machine: 'intake', state: 'kind_proposed' }, proposed: null }, 'FlowLeap proposes the kind of this letter.'],
      [{ status: { machine: 'intake', state: 'duplicate_proposed' }, proposed: null }, 'FlowLeap found the same letter on the record.'],
      [{ status: { machine: 'intake', state: 'not_relevant' }, proposed: null, mayDecide: { allowed: false, reason: 'decided', decider: { id: 'p-jonas' as never, name: 'Jonas Weber' } } }, 'A person marked it not relevant.'],
      [{ status: { machine: 'intake', state: 'filed' }, proposed: null, filed: { fileNumber: 'FL-2026-0001' as FileNumber, title: 'Pressure sensor housing' }, mayDecide: { allowed: false, reason: 'decided', decider: null } }, 'It is filed on FL-2026-0001.'],
      [{ status: { machine: 'intake', state: 'matched' }, proposed: null, mail: { ...fixtures.intakeDocument.mail, forwarder: OUTSIDER } }, 'A person outside the team forwarded this letter to the AI mailbox.'],
      [{ status: { machine: 'deadline', state: 'awaiting_code' }, proposed: null, mayDecide: { allowed: false, reason: 'not-ready', decider: null } }, 'FlowLeap is still reading this letter.'],
    ]
    const { model } = await mount(api, open(sha(30)))
    for (const [index, [patch, text]] of cases.entries()) {
      spy.mockResolvedValue({ ok: true, value: letter({ ...patch, document: sha(40 + index) as DocumentId }) })
      act(() => { model.navigate(open(sha(40 + index))) })
      await flush()
      expect(document.body.textContent).toContain(text)
    }
    expect(screen.getByText('FlowLeap is still reading this letter.')).toBeTruthy()
    expect(screen.queryByText('Your decision')).toBeNull()
    expect(within(decision('Not your decision')).queryByRole('button', { name: /Accept and file/ })).toBeNull()
    spy.mockResolvedValue({ ok: true, value: letter({ document: sha(60) as DocumentId, candidates: 3, pages: null, fields: { reference: fixtures.intakeDocument.fields.reference! }, code: 'EPO:R71(3)' }) })
    act(() => { model.navigate(open(sha(60))) })
    await flush()
    expect(screen.getByText('3 matters that you may see have this file number.')).toBeTruthy()
    expect(screen.getByText('FlowLeap read the letter as a Rule 71(3) communication from the EPO.')).toBeTruthy()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(within(decision()).getByText('2 reasons on page 1 agree')).toBeTruthy()
    spy.mockResolvedValue({ ok: true, value: letter({
      document: sha(61) as DocumentId, candidates: 0, pages: 3, code: null, office: null, applicationNumber: null,
    }) })
    act(() => { model.navigate(open(sha(61))) })
    await flush()
    expect(screen.getAllByText('None').length).toBeGreaterThan(1)
    expect(screen.getByText('No matter that you may see has this file number.')).toBeTruthy()
    expect(within(decision()).getByText('1 reason on page 1')).toBeTruthy()
    expect(screen.getAllByText('3 pages')).toHaveLength(2)
  })

  it('lets a person outside the proposed team file the letter on another matter only', async () => {
    const { api, acts } = createFixtureApi()
    vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter({ mayDecide: { allowed: false, reason: 'not-in-team', decider: null } }) })
    const { panel } = await mount(api, open(R71_DOCUMENT))
    expect(within(decision('Not your decision')).getByText("Only the matter's team accepts this match. You can file the letter on another matter.")).toBeTruthy()
    expect(within(decision('Not your decision')).queryByRole('button', { name: /Not relevant/ })).toBeNull()
    press(panel, 'Digit1')
    press(panel, 'Digit2')
    expect(acts).toEqual([])
    press(panel, 'KeyM')
    await flush()
    fireEvent.click(within(screen.getByRole('menu')).getByText('FL-2025-0412 Brake caliper bracket'))
    await flush()
    expect(decision('Your decision')).toBeTruthy()
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    await flush()
    expect(acts.map(act => act.command)).toEqual([{ kind: 'intake.match', document: R71_DOCUMENT, fileNumber: 'FL-2025-0412' }])
  })

  it('records the office event of a letter whose reading waits for a person, with E or ⇧⌘↵, and blocks it when a field is missing', async () => {
    const { api, acts } = createFixtureApi()
    const event = { id: '00000000-0000-4000-8000-0000000000aa' as OfficeEventId, state: 'code_proposed' as const }
    const spy = vi.spyOn(api, 'intakeDocument').mockResolvedValue({ ok: true, value: letter({
      status: { machine: 'deadline', state: 'code_proposed' }, officeEvent: event, proposed: null,
      filed: { fileNumber: 'FL-2026-0001' as FileNumber, title: 'Pressure sensor housing' },
    }) })
    const { panel, model } = await mount(api, open(R71_DOCUMENT))
    expect(screen.getByText('Is this reading of the letter right?')).toBeTruthy()
    expect(within(decision()).getByText('Rule 71(3) communication of Fri, 30 Oct 2026')).toBeTruthy()
    expect(within(decision()).getByText('Application EP 24 123 456.7')).toBeTruthy()
    expect(mounted!.commandItems.item()!.groups[0]!.acts[0]!.label).toBe('Record office event')
    press(panel, 'KeyE')
    fireEvent.click(within(decision()).getByRole('button', { name: /Record office event/ }))
    await flush()
    fireEvent.click(within(decision()).getByRole('button', { name: /Record office event/ }))
    await flush()
    expect(acts.map(act => act.command)).toEqual([
      { kind: 'officeEvent.decide', id: event.id, code: 'EPO:R71(3)', documentDate: '2026-10-30', applicationNumber: '24 123 456.7' },
      { kind: 'officeEvent.decide', id: event.id, code: 'EPO:R71(3)', documentDate: '2026-10-30', applicationNumber: '24 123 456.7' },
    ])
    press(panel, 'KeyG')
    press(panel, 'KeyM')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: 'FL-2026-0001' })
    spy.mockResolvedValue({ ok: true, value: letter({
      document: sha(70) as DocumentId, status: { machine: 'deadline', state: 'code_proposed' }, officeEvent: event, proposed: null,
      documentDate: null, applicationNumber: null,
    }) })
    act(() => { model.navigate(open(sha(70))) })
    await flush()
    expect(within(decision()).getByText('FlowLeap did not read every field of this letter, so it cannot be recorded here.')).toBeTruthy()
    expect(within(decision()).getByRole('button', { name: /Record office event/ })).toHaveProperty('disabled', true)
  })

  it('offers the open letter and its acts in ⌘K, and goes to its matter and to Intake', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const windowOpen = vi.fn()
    vi.stubGlobal('open', windowOpen)
    const { api, acts } = createFixtureApi()
    const { commandItems, model, openSearch, panel } = await mount(api, open(R71_DOCUMENT))
    const item = commandItems.item()!
    expect(item.label).toBe('Rule 71(3) communication')
    expect(item.groups.map(group => group.acts.map(act => [act.label, act.commandId]))).toEqual([
      [
        ['Accept and file on FL-2026-0001', 'records.decision.record'],
        ['File on another matter…', 'records.intake.otherMatter'],
        ['Not relevant…', 'records.part.reject'],
        ['Open the letter', 'records.letter.open'],
        ['Copy link', undefined],
      ],
      [['Matter FL-2026-0001', 'records.go.matter'], ['Intake', 'records.go.intake']],
    ])
    const run = (group: number, index: number) => { act(() => { item.groups[group]!.acts[index]!.run() }) }
    run(0, 0)
    run(0, 3)
    run(0, 4)
    await flush()
    expect(acts).toHaveLength(1)
    expect(windowOpen).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('https://firm.test/?page=flowleap-records&records=intake')
    run(0, 1)
    await flush()
    expect(screen.getByRole('menu')).toBeTruthy()
    run(0, 2)
    await flush()
    expect(screen.getByLabelText('Why is this letter not relevant?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledTimes(2)
    for (const button of screen.getAllByRole('button', { name: /Search/ })) fireEvent.click(button)
    expect(openSearch).toHaveBeenCalledTimes(2)
    run(1, 0)
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: 'FL-2026-0001' })
    act(() => { model.navigate(open(R71_DOCUMENT)) })
    await flush()
    commandItems.item()!.groups[1]!.acts[1]!.run()
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake', open: null })
    press(panel, 'KeyG')
    press(panel, 'KeyI')
    press(panel, 'KeyF')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'filed-today' })
    press(panel, 'KeyG')
    press(panel, 'KeyI')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'waiting' })
    const lists = commandItems.item()!
    expect(lists.label).toBe('Waits for a person')
    expect(lists.groups[0]!.acts.map(act => act.label)).toEqual(['Waits for a person', 'Filed today', 'Not relevant'])
    act(() => { lists.groups[0]!.acts[2]!.run() })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ list: 'not-relevant' })
  })
})

describe('the bulk decision', () => {
  it('selects with X and ⇧ click, accepts each letter with its own act, keeps a failed letter selected, and clears with Esc', async () => {
    const { api, acts } = createFixtureApi()
    const perform = api.perform.bind(api)
    let failNext = true
    let failedKey: string | undefined
    vi.spyOn(api, 'perform').mockImplementation((next) => {
      if (failNext && next.command.kind === 'intake.match' && next.command.document === sha(3)) {
        failNext = false
        failedKey = next.key
        return Promise.resolve({ ok: false, error: { kind: 'network' } })
      }
      return perform(next)
    })
    const { panel, commandItems } = await mount(api)
    press(panel, 'KeyJ')
    press(document.activeElement!, 'KeyX')
    await flush()
    fireEvent.click(screen.getAllByText('Extended European search report')[0]!, { shiftKey: true })
    await flush()
    expect(screen.getByText('3 selected')).toBeTruthy()
    expect(screen.getAllByText('3 letters selected').length).toBeGreaterThan(0)
    expect(commandItems.item()!.label).toBe('3 letters selected')
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    await flush()
    expect(acts.map(act => act.command)).toEqual([
      { kind: 'intake.match', document: sha(1), fileNumber: 'FL-2026-0001' },
      { kind: 'intake.match', document: sha(2), fileNumber: 'FL-2025-0412' },
    ])
    expect(new Set(acts.map(act => act.key)).size).toBe(2)
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(screen.getAllByText('1 letter selected').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Not recorded: 1. These letters stay selected, so you can try again.').length).toBeGreaterThan(0)
    expect(within(decision()).getByRole('alert').textContent).toContain('FlowLeap did not answer, so it may be recorded.')
    press(panel, 'KeyR')
    await flush()
    expect(acts.at(-1)).toMatchObject({ key: failedKey, command: { kind: 'intake.match', document: sha(3) } })
    expect(screen.queryByText('1 selected')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('selects with a long press on a touch screen, checks rows with a tap, and offers the row acts in the overflow menu', async () => {
    const { model, openMenu } = await mount()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const rows = () => [...document.querySelectorAll<HTMLElement>('[data-row]')]
    const touch = (row: HTMLElement, hold: number) => {
      fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 20, clientY: 20 })
      act(() => { vi.advanceTimersByTime(hold) })
      fireEvent.pointerUp(row, { pointerType: 'touch' })
      fireEvent.click(row)
    }
    const bar = () => document.querySelector<HTMLElement>('[data-bulk]')
    const overflow = () => {
      fireEvent.click(within(bar()!).getByRole('button', { name: 'More acts' }))
      return screen.getAllByRole('menuitem').map(item => item.textContent)
    }
    fireEvent.pointerDown(rows()[1]!, { pointerType: 'touch', clientX: 20, clientY: 20 })
    fireEvent.pointerMove(rows()[1]!, { pointerType: 'touch', clientX: 20, clientY: 60 })
    act(() => { vi.advanceTimersByTime(600) })
    expect(bar()).toBeNull()
    // A touch that rests within a few pixels is still a long press.
    fireEvent.pointerDown(rows()[0]!, { pointerType: 'touch', clientX: 20, clientY: 20 })
    fireEvent.pointerMove(rows()[0]!, { pointerType: 'touch', clientX: 23, clientY: 24 })
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.pointerUp(rows()[0]!, { pointerType: 'touch' })
    fireEvent.click(rows()[0]!)
    await flush()
    expect(rows()[0]!.dataset['checked']).toBe('true')
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake', open: null })
    expect(within(bar()!).getByText('1 selected')).toBeTruthy()
    expect(within(bar()!).getByRole('button', { name: /Accept and file 1/ })).toBeTruthy()
    expect(overflow()).toEqual(['Open', 'File on another matter…', 'Copy link', 'Clear the selection'])
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith('https://firm.test/?page=flowleap-records&records=intake')
    touch(rows()[1]!, 100)
    await flush()
    expect(within(bar()!).getByText('2 selected')).toBeTruthy()
    expect(overflow()).toEqual(['Clear the selection'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    // A mouse click while rows are selected still opens the row, as it does on a fine pointer.
    fireEvent.pointerDown(rows()[2]!, { pointerType: 'mouse' })
    fireEvent.click(rows()[2]!)
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: rows()[2]!.dataset['row'] })
    touch(rows()[1]!, 100)
    touch(rows()[0]!, 100)
    await flush()
    expect(bar()).toBeNull()
    // Chrome on Android turns a long press into a context menu: the row is selected and no menu opens.
    fireEvent.pointerDown(rows()[3]!, { pointerType: 'touch', clientX: 20, clientY: 20 })
    fireEvent.contextMenu(rows()[3]!)
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.click(rows()[3]!)
    await flush()
    // Where the context menu comes after the long press, it selects nothing more and opens no menu.
    fireEvent.pointerDown(rows()[4]!, { pointerType: 'touch', clientX: 20, clientY: 20 })
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.contextMenu(rows()[4]!)
    fireEvent.click(rows()[4]!)
    await flush()
    expect(openMenu).not.toHaveBeenCalled()
    expect(within(bar()!).getByText('2 selected')).toBeTruthy()
    touch(rows()[4]!, 100)
    await flush()
    expect(within(bar()!).getByText('1 selected')).toBeTruthy()
    const open = rows()[3]!.dataset['row']
    fireEvent.click(within(bar()!).getByRole('button', { name: 'More acts' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }))
    await flush()
    expect(bar()).toBeNull()
    expect(model.screen.getSnapshot()).toMatchObject({ open })
    model.navigate(WAITING)
    await flush()
    touch(rows()[0]!, 500)
    await flush()
    const first = rows()[0]!.dataset['row']
    fireEvent.click(within(bar()!).getByRole('button', { name: 'More acts' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'File on another matter…' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ open: first, step: 'other-matter' })
  })

  it('sends one act for each letter while a bulk decision runs, so a second ⇧⌘↵ sends no act again', async () => {
    const { api } = createFixtureApi()
    const answers: ((result: Fetched<null>) => void)[] = []
    const sent: string[] = []
    vi.spyOn(api, 'perform').mockImplementation((next) => {
      sent.push(next.key)
      return new Promise((resolve) => { answers.push(resolve) })
    })
    const { panel } = await mount(api)
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0]!)
    fireEvent.click(boxes[1]!)
    await flush()
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    await flush()
    expect(within(decision()).getByRole('button', { name: /Accept and file 2/ }).getAttribute('aria-busy')).toBe('true')
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    fireEvent.click(within(decision()).getByRole('button', { name: /Accept and file 2/ }))
    for (let i = 0; i < 2; i++) {
      await act(async () => { answers.shift()?.({ ok: true, value: null }) })
      await flush()
    }
    expect(sent).toHaveLength(2)
    expect(new Set(sent).size).toBe(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps a bulk failure until the selection changes', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'perform').mockResolvedValue({ ok: false, error: { kind: 'refused', status: 409, code: 'not-ready', detail: null } })
    const { panel } = await mount(api)
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    await flush()
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    await flush()
    expect(within(decision()).getByRole('alert').textContent).toContain('Not recorded: 1. These letters stay selected, so you can try again. FlowLeap refused it and recorded nothing.')
    fireEvent.click(screen.getAllByRole('checkbox')[1]!)
    await flush()
    expect(within(decision()).queryByRole('alert')).toBeNull()
    fireEvent.keyDown(screen.getByTestId('intake'), { key: 'Escape' })
    await flush()
    expect(screen.queryByText('1 selected')).toBeNull()
  })

  it('marks every selected letter not relevant with one reason, one act each; Esc closes the reason step first', async () => {
    const { api, acts } = createFixtureApi()
    const { panel, commandItems } = await mount(api)
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0]!)
    fireEvent.click(boxes[21]!)
    await flush()
    expect(screen.getAllByRole('button', { name: /Accept and file 1/ })[0]).toHaveProperty('disabled', false)
    press(panel, 'Digit2')
    await flush()
    expect(screen.getAllByLabelText('Why are these letters not relevant?').length).toBeGreaterThan(0)
    fireEvent.keyDown(screen.getByTestId('intake'), { key: 'Escape' })
    await flush()
    expect(screen.queryAllByLabelText('Why are these letters not relevant?')).toEqual([])
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(document.querySelector<HTMLElement>('[data-bulk] [data-act="reject"]')!)
    await flush()
    const field = screen.getAllByLabelText('Why are these letters not relevant?')[0]!
    fireEvent.change(field, { target: { value: 'Duplicates' } })
    fireEvent.submit(field.closest('form')!)
    await flush()
    expect(acts.map(act => act.command)).toEqual([
      { kind: 'intake.notRelevant', document: sha(1), reason: 'Duplicates' },
      { kind: 'intake.notRelevant', document: sha(22), reason: 'Duplicates' },
    ])
    fireEvent.click(screen.getAllByRole('checkbox')[3]!)
    await flush()
    const selection = commandItems.item()!
    expect(selection.groups[0]!.acts.map(act => act.label)).toEqual(['Accept and file 1', 'Not relevant…', 'Clear the selection'])
    act(() => { selection.groups[0]!.acts[1]!.run() })
    await flush()
    expect(screen.getAllByLabelText('Why are these letters not relevant?').length).toBeGreaterThan(0)
    act(() => { selection.groups[0]!.acts[2]!.run() })
    await flush()
    expect(screen.queryByText('1 selected')).toBeNull()
    fireEvent.click(screen.getAllByRole('checkbox')[9]!)
    await flush()
    expect(screen.getAllByRole('button', { name: /Accept and file 0/ })[0]).toHaveProperty('disabled', true)
    press(panel, 'Enter', { metaKey: true, shiftKey: true })
    await flush()
    expect(acts).toHaveLength(2)
  })
})
