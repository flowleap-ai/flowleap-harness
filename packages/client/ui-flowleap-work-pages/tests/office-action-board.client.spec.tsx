// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, bindSnapshotSelector, makeTranslate, StaticRemoteAccess, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkPageReviewRequest, WorkPageSummary, WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { apply, inject, PANEL_ID } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { createBoard, type Board, type BoardDependencies } from '../src/client/board.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh } from '../src/client/locales.ts'
import { OfficeActionBoard, type OfficeActionBoardProps } from '../src/client/OfficeActionBoard.tsx'
import { WorkPagesPanelIcon } from '../src/client/WorkPagesPanelIcon.tsx'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { WorkPageId } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { CHAT, FILE, ok, OTHER, OTHER_ID, PAGE_ID, reviewed, SUMMARY, TWIN, TWIN_CHAT, TWIN_ID, VIEW } from './fixture.client.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(en)
const NOW = Date.parse('2026-10-29T12:00:00.000Z')

/** A save time as the board writes it, in the time zone of the test process. */
function saved(savedAt: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(savedAt))
}

const NO_FOLDER = SessionId('chat-no-folder')

/** The Session list with the chats of the fixture pages: one with a title, one without, and one without a folder. */
const SESSIONS: SessionListState = {
  ids: [CHAT, TWIN_CHAT],
  byId: {
    [CHAT]: { id: CHAT, title: 'EP4814394 search report', displayTitle: 'EP4814394 search report', cwd: '/Users/novak/Matters/Heat pump' } as SessionSummary,
    [TWIN_CHAT]: { id: TWIN_CHAT, displayTitle: 'Second opinion', cwd: '/Users/keller/Second opinion' } as SessionSummary,
    [NO_FOLDER]: { id: NO_FOLDER, title: 'Claim 9 check', displayTitle: 'Claim 9 check' } as SessionSummary,
  },
  phase: 'ready',
  projectionsBySession: {},
}

function deps(overrides: Partial<BoardDependencies> = {}): BoardDependencies {
  return {
    list: vi.fn(async () => ok<WorkPageSummary[]>([SUMMARY])),
    read: vi.fn(async () => ok<WorkPageView>(VIEW)),
    review: vi.fn(async ({ id: _id, objection, ...fields }: WorkPageReviewRequest) => ok(reviewed(objection, fields))),
    send: vi.fn(async () => ok({ accepted: true })),
    openSession: vi.fn(),
    draftChat: vi.fn(),
    planMessage: () => 'plan',
    analysisMessage: application => `analyse ${application}`,
    subscribeChanged: () => () => {},
    subscribeReset: () => () => {},
    ...overrides,
  }
}

function renderBoard(
  board: Board = createBoard(deps()),
  now = NOW,
  sessions: Parameters<typeof bindSnapshotSelector<SessionListState>>[0] = { getSnapshot: () => SESSIONS, subscribe: () => () => {} },
  copy: typeof t = t,
) {
  const props: OfficeActionBoardProps = {
    ...board,
    useBoard: bindSnapshotSelector(board.hooks.board),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessions: bindSnapshotSelector(sessions),
    useWorkspaces: () => { throw new Error('The board reads no workspace') },
    useSessionStatus: () => { throw new Error('The board reads no Session status') },
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The board loads no document resources') },
    ...allowAllAccess,
    now: () => now,
    t: copy,
  }
  render(<OfficeActionBoard {...props} />)
  return board
}

function card(id: string): HTMLElement {
  return screen.getByRole('button', { name: `Open objection ${id} in the side panel` }).closest('li')!
}

describe('office action board page', () => {
  it('shows the saved analysis: header, documents, cards, and the chat link', async () => {
    const board = createBoard(deps())
    renderBoard(board)
    expect(await screen.findByRole('heading', { level: 1, name: 'EP4814394 · EPO, European search report' })).toBeTruthy()
    expect(screen.getByText('Reply due in 152 days')).toBeTruthy()
    expect(screen.getByText('Time limit Mar 30, 2027')).toBeTruthy()
    expect(screen.getByText('Issued Sep 30, 2026')).toBeTruthy()
    expect(screen.getByText('Needs review: 1')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Analysis' }).textContent).toContain(`Saved ${saved(SUMMARY.savedAt)} by the chat`)
    expect(screen.getByTestId('office-action-board').getAttribute('data-work-page-id')).toBe(PAGE_ID)
    const documents = screen.getByRole('list', { name: 'Cited documents' })
    expect(within(documents).getAllByRole('listitem').map(item => item.textContent)).toEqual(['D1US2016107508 (A1)', 'family member'])
    const first = card('1')
    expect(within(first).getByText('Art. 54 EPC')).toBeTruthy()
    expect(within(first).getByText('Claims 1, 2, 3')).toBeTruthy()
    expect(within(first).getByText('D1 US2016107508A1 ¶[0059]')).toBeTruthy()
    expect(within(card('2')).getByText('No claim named')).toBeTruthy()
    expect(within(card('2')).getByText('The analysis lists no cited passage for this objection.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Analysis:/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(screen.getByText(en.footer)).toBeTruthy()
  })

  it('states a passed time limit, an analysis without dates, and no document list', async () => {
    renderBoard(createBoard(deps()), Date.parse('2027-04-02T08:00:00.000Z'))
    expect(await screen.findByText('Time limit passed 3 days ago')).toBeTruthy()
    cleanup()
    const findings = { ...FILE.findings, deadline: null, issued: null, documents: [] }
    renderBoard(createBoard(deps({ read: async () => ok({ ...VIEW, file: { ...FILE, findings } }) })))
    expect(await screen.findByText('Time limit: see the analysis')).toBeTruthy()
    expect(screen.queryByText(/^Issued/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Cited documents' })).toBeNull()
  })

  it('shows the loading line, the empty state, and a failed read with its retry', async () => {
    let answer: (value: Awaited<ReturnType<BoardDependencies['list']>>) => void = () => {}
    const list = vi.fn(() => new Promise<Awaited<ReturnType<BoardDependencies['list']>>>((resolve) => { answer = resolve }))
    renderBoard(createBoard(deps({ list })))
    expect(screen.getByText('Reading the office action analyses')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Write response plan' })).toBeNull()
    await act(async () => { answer(ok([])) })
    expect(screen.getByTestId('office-action-empty').textContent).toContain('No office action analysis yet')
    list.mockResolvedValueOnce({ ok: false, error: new Error('x') as never })
    cleanup()
    renderBoard(createBoard(deps({ list })))
    expect((await screen.findByRole('alert')).textContent).toContain(en['status.error'])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('changes state, owner and note through the board, and keeps unchanged values', async () => {
    const changed = new Set<(view: WorkPageView) => void>()
    const dependencies = deps({ subscribeChanged: (listener) => { changed.add(listener); return () => { changed.delete(listener) } } })
    renderBoard(createBoard(dependencies))
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(within(card('1')).getByRole('button', { name: 'Review state of objection 1: Needs review' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(within(card('1')).getByRole('button', { name: 'Review state of objection 1: Needs review' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Done' })) })
    expect(dependencies.review).toHaveBeenLastCalledWith({ id: PAGE_ID, objection: '1', state: 'done' })
    expect(screen.getByText('Needs review: 0')).toBeTruthy()
    const owner = within(card('1')).getByRole('textbox', { name: 'Owner of objection 1' }) as HTMLInputElement
    expect(owner.maxLength).toBe(200)
    fireEvent.change(owner, { target: { value: '  M. Keller ' } })
    fireEvent.keyDown(owner, { key: 'Tab' })
    expect(dependencies.review).toHaveBeenCalledTimes(1)
    // A page that another change brings does not replace the draft.
    act(() => { for (const listener of changed) listener(reviewed('2', { note: 'From another tab.' })) })
    expect(owner.value).toBe('  M. Keller ')
    expect(within(card('2')).getByRole('textbox', { name: 'Note on objection 2' })).toHaveProperty('value', 'From another tab.')
    await act(async () => { fireEvent.keyDown(owner, { key: 'Enter' }) })
    expect(dependencies.review).toHaveBeenLastCalledWith({ id: PAGE_ID, objection: '1', owner: '  M. Keller ' })
    fireEvent.blur(within(card('1')).getByRole('textbox', { name: 'Owner of objection 1' }))
    expect(dependencies.review).toHaveBeenCalledTimes(2)
    const note = within(card('2')).getByRole('textbox', { name: 'Note on objection 2' }) as HTMLTextAreaElement
    expect(note.maxLength).toBe(4000)
    expect(note.value).toBe('Amend claim 9.')
    fireEvent.blur(note)
    expect(dependencies.review).toHaveBeenCalledTimes(2)
    fireEvent.change(note, { target: { value: 'Argue first. ' } })
    await act(async () => { fireEvent.blur(note) })
    expect(dependencies.review).toHaveBeenLastCalledWith({ id: PAGE_ID, objection: '2', note: 'Argue first. ' })
  })

  it('shows the new review state for an objection that the review record does not name', async () => {
    renderBoard(createBoard(deps({ read: async () => ok({ ...VIEW, file: { ...FILE, review: { '1': FILE.review['1']! } } }) })))
    expect(await screen.findByRole('button', { name: 'Review state of objection 2: Needs review' })).toBeTruthy()
  })

  it('opens the side panel with the fields of the objection and the tables of its claims', async () => {
    renderBoard()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 1 in the side panel' }))
    const panel = screen.getByRole('complementary', { name: 'Objection details' })
    for (const text of ['Art. 54 EPC', 'Legal basis', 'Art. 54(1) EPC', 'D1 discloses a heat pump with a battery.', 'search report categories',
      'X · ¶[0059]', 'US2016107508A1:claims:1:en', 'Assessment', 'Disputable.', 'Claim 1 against D1', '"loop": a closed circuit.',
      '1a "a loop"', 'disclosed', 'In series.', 'Argue', 'D1 is a vehicle system', 'Each ground.', 'Low.', 'Sources']) {
      expect(within(panel).getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(within(panel).queryByText('Claim 12 against D1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 2 in the side panel' }))
    const second = screen.getByRole('complementary', { name: 'Objection details' })
    expect(within(second).queryByText('Response options')).toBeNull()
    expect(within(second).queryByText('Cited documents')).toBeNull()
    expect(within(second).queryByText('Examiner\'s reasoning')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 2 in the side panel' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 1 in the side panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close the side panel' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('renders the Markdown of passages and claim elements as the chat does, not as raw text', async () => {
    const reader = '[US2016107508A1 claim 2](flowleap://flowleap.patent-ai/patent?publication=US2016107508A1&section=claims&claim=2)'
    const [novelty, ...rest] = FILE.findings.objections
    const citations = [{ ...novelty!.citations[0]!, says: `"a second heat exchanger" (${reader})` }]
    const row = { element: '1a [EP4814394A1 claim 1](flowleap://flowleap.patent-ai/patent?publication=EP4814394A1&section=claims&claim=1): "a loop"', examiner: 'X', cited: 'See [the family](https://example.com/family).', assessment: 'disclosed' as const }
    const findings = {
      ...FILE.findings,
      objections: [{ ...novelty!, citations }, ...rest],
      comparison: [{ ...FILE.findings.comparison[0]!, rows: [row] }],
    }
    renderBoard(createBoard(deps({ read: async () => ok({ ...VIEW, file: { ...FILE, findings } }) })))
    await screen.findByRole('heading', { level: 1 })
    expect(within(card('1')).getByText('"a second heat exchanger" (US2016107508A1 claim 2)')).toBeTruthy()
    expect(document.body.textContent).not.toContain('](flowleap://')
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 1 in the side panel' }))
    const panel = screen.getByRole('complementary', { name: 'Objection details' })
    expect(within(panel).getByText('1a EP4814394A1 claim 1: "a loop"')).toBeTruthy()
    expect(within(panel).getByRole('link', { name: 'the family' }).getAttribute('href')).toBe('https://example.com/family')
    expect(panel.textContent).not.toContain('](')
  })

  it('keeps one newline in analysis text, shows an unsafe link as its label, and keeps the ground plain', async () => {
    const [novelty, ...rest] = FILE.findings.objections
    const objection = { ...novelty!, ground: '**Art. 54 EPC**', sources: 'get_claims EP4814394A1\nget_bibliography US2016107508A1', assessment: 'See [the note](javascript:alert(1)).' }
    const findings = { ...FILE.findings, objections: [objection, ...rest] }
    renderBoard(createBoard(deps({ read: async () => ok({ ...VIEW, file: { ...FILE, findings } }) })))
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 1 in the side panel' }))
    const panel = screen.getByRole('complementary', { name: 'Objection details' })
    expect(within(panel).getByText('get_claims EP4814394A1\nget_bibliography US2016107508A1', { normalizer: text => text }).tagName).toBe('P')
    expect(within(panel).getByText('See the note.')).toBeTruthy()
    expect(within(panel).queryByRole('link', { name: 'the note' })).toBeNull()
    expect(within(panel).getByText('**Art. 54 EPC**')).toBeTruthy()
    expect(within(card('1')).getByText('**Art. 54 EPC**')).toBeTruthy()
  })

  it('sends the response plan, reports the result, and dismisses the notice', async () => {
    const dependencies = deps()
    renderBoard(createBoard(dependencies))
    await screen.findByRole('heading', { level: 1 })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Write response plan' })) })
    expect(dependencies.send).toHaveBeenCalledWith(CHAT, 'plan')
    expect(screen.getByText(en['notice.sent'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(en['notice.sent'])).toBeNull()
  })

  it('chooses another analysis from the picker when there are several', async () => {
    const read = vi.fn(async (id: string) => ok<WorkPageView>(id === PAGE_ID ? VIEW : { ...VIEW, summary: OTHER }))
    renderBoard(createBoard(deps({ list: async () => ok([SUMMARY, OTHER]), read })))
    await screen.findByRole('heading', { level: 1 })
    const current = `Analysis: EP4814394, saved ${saved(SUMMARY.savedAt)}`
    fireEvent.click(screen.getByRole('button', { name: current }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: current }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^US 19/043,989, saved ${saved(OTHER.savedAt)}`) })) })
    expect(read).toHaveBeenLastCalledWith(OTHER.id)
    expect(screen.getByRole('button', { name: `Analysis: US 19/043,989, saved ${saved(OTHER.savedAt)}` })).toBeTruthy()
  })

  it('tells two analyses of one application on one day apart by the save time and the chat, and names each page id', async () => {
    const unlisted = { ...TWIN, id: OTHER_ID, sessionId: SessionId('chat-gone'), savedAt: '2026-10-29T09:15:00.000Z' }
    const folderless = { ...TWIN, id: brandString<WorkPageId>('99aa'), sessionId: NO_FOLDER, savedAt: '2026-10-29T07:00:00.000Z' }
    renderBoard(createBoard(deps({ list: async () => ok([SUMMARY, unlisted, TWIN, folderless]) })))
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: `Analysis: EP4814394, saved ${saved(SUMMARY.savedAt)}` }))
    const rows = screen.getAllByRole('menuitem')
    expect(rows.map(row => row.textContent)).toEqual([
      `EP4814394, saved ${saved(SUMMARY.savedAt)}EP4814394 search report · Heat pump`,
      `EP4814394, saved ${saved(unlisted.savedAt)}`,
      `EP4814394, saved ${saved(TWIN.savedAt)}Second opinion`,
      `EP4814394, saved ${saved(folderless.savedAt)}Claim 9 check`,
    ])
    expect(rows.map(row => row.querySelector('[data-work-page-id]')?.getAttribute('data-work-page-id'))).toEqual([PAGE_ID, OTHER_ID, TWIN_ID, folderless.id])
  })

  it('renders again for a change of a listed chat, not for a change of another chat', async () => {
    let state = SESSIONS
    const listeners = new Set<() => void>()
    const update = (next: SessionListState) => { state = next; act(() => { for (const listener of listeners) listener() }) }
    const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
    const sessions = { getSnapshot: () => state, subscribe }
    const copy = vi.fn(t)
    renderBoard(createBoard(deps({ list: async () => ok([SUMMARY, TWIN]) })), NOW, sessions, copy)
    await screen.findByRole('heading', { level: 1 })
    const other = SessionId('chat-streaming')
    const calls = copy.mock.calls.length
    update({ ...state, byId: { ...state.byId, [other]: { id: other, displayTitle: 'Streaming' } as SessionSummary } })
    expect(copy.mock.calls.length).toBe(calls)
    update({ ...state, byId: { ...state.byId, [TWIN_CHAT]: { ...state.byId[TWIN_CHAT]!, title: 'Renamed', displayTitle: 'Renamed' } } })
    expect(copy.mock.calls.length).toBeGreaterThan(calls)
  })

  it('names a newer save of another analysis and shows it on request, without replacing the page on show', async () => {
    const changed = new Set<(view: WorkPageView) => void>()
    const later = { ...TWIN, savedAt: '2026-10-29T15:00:00.000Z' }
    const read = vi.fn(async (id: string) => ok<WorkPageView>(id === TWIN_ID ? { ...VIEW, summary: later } : VIEW))
    const list = vi.fn(async () => ok([SUMMARY]))
    const subscribeChanged: BoardDependencies['subscribeChanged'] = (listener) => { changed.add(listener); return () => { changed.delete(listener) } }
    renderBoard(createBoard(deps({ list, read, subscribeChanged })))
    await screen.findByRole('heading', { level: 1 })
    act(() => { for (const listener of changed) listener({ ...VIEW, summary: later }) })
    const notice = screen.getByTestId('office-action-newer')
    expect(notice.parentElement!.getAttribute('role')).toBe('status')
    expect(notice.textContent).toContain(`A newer analysis of EP4814394 was saved ${saved(later.savedAt)}.`)
    expect(notice.getAttribute('data-work-page-id')).toBe(TWIN_ID)
    expect(screen.getByTestId('office-action-board').getAttribute('data-work-page-id')).toBe(PAGE_ID)
    fireEvent.click(within(notice).getByRole('button', { name: 'Hide this notice' }))
    expect(screen.queryByTestId('office-action-newer')).toBeNull()
    act(() => { for (const listener of changed) listener({ ...VIEW, summary: { ...later, savedAt: '2026-10-29T15:30:00.000Z' } }) })
    list.mockResolvedValueOnce(ok([{ ...later, savedAt: '2026-10-29T15:30:00.000Z' }, SUMMARY]))
    await act(async () => { fireEvent.click(within(screen.getByTestId('office-action-newer')).getByRole('button', { name: 'Show it' })) })
    expect(read).toHaveBeenLastCalledWith(TWIN_ID)
    expect(screen.getByTestId('office-action-board').getAttribute('data-work-page-id')).toBe(TWIN_ID)
    expect(screen.queryByTestId('office-action-newer')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('shows which analysis opens and keeps the page on show inert until it arrives', async () => {
    let answer: (value: Awaited<ReturnType<BoardDependencies['read']>>) => void = () => {}
    const read = vi.fn(async () => ok<WorkPageView>(VIEW))
    const dependencies = deps({ list: async () => ok([SUMMARY, OTHER]), read })
    const board = renderBoard(createBoard(dependencies))
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Open objection 1 in the side panel' }))
    const shown = card('1').closest('ul')!.parentElement!.parentElement!.parentElement!
    expect(shown.inert).toBe(false)
    read.mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))
    fireEvent.click(screen.getByRole('button', { name: `Analysis: EP4814394, saved ${saved(SUMMARY.savedAt)}` }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^US 19/043,989, saved ${saved(OTHER.savedAt)}`) })) })
    const opening = screen.getByTestId('office-action-opening')
    expect(opening.textContent).toBe(`Opening the analysis US 19/043,989, saved ${saved(OTHER.savedAt)}`)
    expect(opening.getAttribute('data-work-page-id')).toBe(OTHER_ID)
    expect(shown.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByTestId('office-action-board').hasAttribute('aria-busy')).toBe(false)
    expect(opening.parentElement!.getAttribute('role')).toBe('status')
    expect(shown.inert).toBe(true)
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('button', { name: 'Write response plan' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Open chat' }).hasAttribute('disabled')).toBe(true)
    await act(async () => { answer(ok({ ...VIEW, summary: OTHER })) })
    expect(screen.queryByTestId('office-action-opening')).toBeNull()
    expect(screen.getByTestId('office-action-board').getAttribute('data-work-page-id')).toBe(OTHER_ID)
    expect(screen.getByRole('button', { name: 'Write response plan' }).hasAttribute('disabled')).toBe(false)
    expect(shown.isConnected && shown.inert).toBe(false)
    // A page that the list no longer has opens without its label.
    read.mockReturnValueOnce(new Promise(() => {}))
    act(() => { void board.choose(brandString<WorkPageId>('0000')) })
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(3) })
    expect(screen.getByTestId('office-action-opening').textContent).toBe('Opening the analysis')
  })

  it('disables Export Word and Share with their reasons as tooltips', async () => {
    renderBoard()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('button', { name: 'Export Word' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Share' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('export-anchor').tabIndex).toBe(0)
    expect(screen.getByTestId('share-anchor').tabIndex).toBe(0)
  })

  it('opens the form, needs an application number, and opens the chat with the request', async () => {
    const dependencies = deps({ list: async () => ok([]) })
    renderBoard(createBoard(dependencies))
    fireEvent.click(screen.getByRole('button', { name: 'New analysis' }))
    const dialog = await screen.findByRole('dialog', { name: 'New office action analysis' })
    expect(within(dialog).getByText(en['form.pdfHint'])).toBeTruthy()
    const start = within(dialog).getByRole('button', { name: 'Open the chat' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Application number' }), { target: { value: 'EP 4814394' } })
    fireEvent.click(start)
    expect(dependencies.draftChat).toHaveBeenCalledWith('analyse EP 4814394')
    fireEvent.click(screen.getByRole('button', { name: 'New analysis' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })
})

describe('launcher glyph', () => {
  it('shows a dot while objections need review, with their count over all analyses in a data attribute', async () => {
    const list = vi.fn(async () => ok([SUMMARY, OTHER]))
    const board = createBoard(deps({ list }))
    const { container } = render(<WorkPagesPanelIcon size={18} useBoard={bindSnapshotSelector(board.hooks.board)} />)
    await vi.waitFor(() => { expect(container.querySelector('[data-work-pages-count]')?.getAttribute('data-work-pages-count')).toBe('4') })
    cleanup()
    const none = createBoard(deps({ list: async () => ok([]) }))
    const empty = render(<WorkPagesPanelIcon size={18} useBoard={bindSnapshotSelector(none.hooks.board)} />)
    expect(empty.container.querySelector('svg')).not.toBeNull()
    expect(empty.container.querySelector('[data-work-pages-count]')).toBeNull()
  })
})

class RemoteStub extends Service {
  constructor(ctx: Context, readonly $on: (event: string, listener: (view: WorkPageView) => void) => () => void) {
    super(ctx, 'remote')
  }
}

async function pluginContext(allows: (action: string) => boolean = () => true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new StaticRemoteAccess(ctx, allows)
  const listeners = new Map<string, Set<(view: WorkPageView) => void>>()
  new RemoteStub(ctx, (event, listener) => {
    const set = listeners.get(event) ?? new Set()
    set.add(listener)
    listeners.set(event, set)
    return () => { set.delete(listener) }
  })
  const workPages = {
    list: vi.fn(async () => ok([SUMMARY])),
    read: vi.fn(async () => ok(VIEW)),
    review: vi.fn(async () => ok(reviewed('1', { state: 'done' }))),
  }
  const session = { prompt: vi.fn(async () => ok({ accepted: true })) }
  await ctx.plugin({ apply(provider: Context) {
    provider.provide('remote.flowleapWorkPages', workPages as never)
    provider.provide('remote.session', session as never)
  } }).await()
  const uiWorkspace = { openSession: vi.fn(), startSession: vi.fn() }
  ctx.provide('uiWorkspace', uiWorkspace as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      main: { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, listeners, workPages, session, uiWorkspace }
}

describe('ui-flowleap-work-pages browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.flowleapWorkPages', 'remote.session', 'uiWorkspace', 'remoteAccess'])
  })

  it('registers the launcher and the board while the Peer may list the work pages, and removes them on dispose', async () => {
    for (const allowed of [false, true]) {
      const allows = vi.fn(() => allowed)
      const { ctx } = await pluginContext(allows)
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      expect(allows).toHaveBeenCalledWith('flowleapWorkPages/list')
      expect(ctx.slots.entries('sidebar.panellist').map(entry => entry.options.id)).toEqual(allowed ? [PANEL_ID] : [])
      expect(ctx.slots.entries('main').map(entry => entry.options.key)).toEqual(allowed ? [PANEL_ID] : [])
      await fiber.dispose()
      expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
      expect(ctx.slots.entries('main')).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('wires the board to the Remote namespaces, the change event, and Session navigation', async () => {
    const { ctx, listeners, workPages, session, uiWorkspace } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const launcher = ctx.slots.entries('sidebar.panellist')[0]!
    expect((launcher.options.label as () => string)()).toBe(en.panel)
    const icon = launcher.inject!()
    const injected = ctx.slots.entries('main')[0]!.inject!()
    const page = {
      hooks: injected.hooks as Board['hooks'],
      setReview: injected.setReview as Board['setReview'],
      writePlan: injected.writePlan as Board['writePlan'],
      startAnalysis: injected.startAnalysis as Board['startAnalysis'],
    }
    expect(icon.hooks).toBe(page.hooks)
    expect(Math.abs((injected.now as () => number)() - Date.now())).toBeLessThan(1000)
    const stop = page.hooks.board.subscribe(() => {})
    await vi.waitFor(() => { expect(page.hooks.board.getSnapshot().page).toEqual(VIEW) })
    expect(workPages.read).toHaveBeenCalledWith(PAGE_ID)
    for (const listener of listeners.get('flowleap-work-pages/changed') ?? []) listener(reviewed('2', { state: 'done' }))
    expect(page.hooks.board.getSnapshot().page?.file.review['2']?.state).toBe('done')
    expect(workPages.list).toHaveBeenCalledOnce()
    ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(workPages.list).toHaveBeenCalledTimes(2) })
    await page.setReview('1', { state: 'done' })
    expect(workPages.review).toHaveBeenCalledWith({ id: PAGE_ID, objection: '1', state: 'done' })
    await page.writePlan()
    expect(session.prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: CHAT,
      mode: 'queue',
      content: [{ type: 'text', text: en['message.plan']
        .replace('{application}', 'EP4814394')
        .replace('{report}', 'office-actions/EP4814394/2026-09-30-analysis.md')
        .replace('{workPage}', SUMMARY.path) }],
    }))
    expect(uiWorkspace.openSession).toHaveBeenCalledWith(CHAT)
    page.startAnalysis('EP 4814394')
    expect(uiWorkspace.startSession).toHaveBeenCalledWith(undefined, { prompt: 'Analyse the office action for EP 4814394.', whenDraftExists: 'replace' })
    stop()
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('registers key-identical dictionaries in eight locales and releases them with its fiber', async () => {
    const { ctx } = await pluginContext()
    ctx.locale.setLocale('zh')
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const translate = ctx.locale.bind(NS)
    expect(translate('action.plan')).toBe(zh['action.plan'])
    ctx.locale.setLocale('en')
    expect(translate('action.plan')).toBe('Write response plan')
    for (const dictionary of [zh, ja, es, fr, de, ru, pt]) expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort())
    await fiber.dispose()
    expect(translate('action.plan')).not.toBe(en['action.plan'])
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-work-pages node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
