// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { RecordsApi, TicketRow } from '../src/client/api.ts'
import { BOARD_COLUMNS, dropOf, mayMove } from '../src/client/screens/BoardScreen.tsx'
import type { ScreenContext } from '../src/client/screens/context.ts'
import { en } from '../src/client/locales.ts'
import type { Route } from '../src/client/model.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS, OUTSIDE_WALL, PEOPLE } from './fixtures.client.ts'
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

const BOARD: Route = { view: 'board' }

async function mount(api: RecordsApi = createFixtureApi().api, route: Route = BOARD) {
  mounted = await mountPanel(api, route)
  return mounted
}

const column = (name: string) => screen.getByRole('region', { name })
const card = (key: string) => screen.getByText(key).closest('article')!

/** A drag event with a data transfer, which jsdom does not make. */
function drag(type: 'dragStart' | 'dragOver' | 'drop' | 'dragEnd', target: Element) {
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }
  act(() => { fireEvent[type](target, { dataTransfer }) })
  return dataTransfer
}

describe('the work board', () => {
  it('shows a column for each state that work waits or works in, the cards with their facts, and the other states', async () => {
    await mount()
    expect(BOARD_COLUMNS.map(spec => spec.state)).toEqual(['routed', 'running', 'proposals_ready', 'decided'])
    expect(within(column('Assigned')).getByText('FlowLeap')).toBeTruthy()
    expect(within(column('Running')).getByText('Agent')).toBeTruthy()
    expect(within(column('Proposals ready')).getAllByRole('article')).toHaveLength(3)
    const r71 = card('FL-2026-0001')
    expect(r71.textContent).toContain('Rule 71(3) communication')
    expect(r71.textContent).toContain('Pressure sensor housing · due Mon, 1 Mar 2027')
    expect(within(r71).getByText('Deadline').parentElement!.textContent).toBe('DeadlineActive')
    expect(within(r71).getByText('Report').parentElement!.textContent).toBe('ReportProposed')
    const other = screen.getByRole('region', { name: 'Other states' })
    expect(within(other).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'No one assigned0', 'Run failed0', 'Observed only0', 'By hand0', 'Cancelled0',
    ])
    expect(document.body.textContent).not.toContain(OUTSIDE_WALL.name)
  })

  it('moves a card with proposals ready only to Decided: the drop opens the work page, and every other column says why', async () => {
    const { model } = await mount()
    const r71 = card('FL-2026-0001')
    expect(r71.getAttribute('draggable')).toBe('true')
    expect(card('FL-2025-0412').getAttribute('draggable')).toBeNull()
    const started = drag('dragStart', r71)
    expect(started.setData).toHaveBeenCalledWith('text/plain', FIXTURE_IDS.ticket)
    expect(r71.hasAttribute('data-dragging')).toBe(true)
    expect(screen.getByText('A move that is a decision opens the decision bar. Other moves are not allowed.')).toBeTruthy()
    expect(within(column('Assigned')).getByText('FlowLeap assigns the work; a person cannot move a card here.')).toBeTruthy()
    expect(within(column('Running')).getByText('Only FlowLeap starts the agent; a person cannot move a card here.')).toBeTruthy()
    expect(within(column('Decided')).getByText('Drop to decide')).toBeTruthy()
    expect(within(column('Decided')).getByText('Nothing moves until you record it.')).toBeTruthy()
    expect(column('Proposals ready').getAttribute('data-drop')).toBe('idle')
    const refused = drag('dragOver', column('Running'))
    expect(refused.dropEffect).toBe('')
    drag('drop', column('Running'))
    expect(model.screen.getSnapshot().view).toBe('board')
    const allowed = drag('dragOver', column('Decided'))
    expect(allowed.dropEffect).toBe('move')
    drag('drop', column('Decided'))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work', id: FIXTURE_IDS.ticket })
  })

  it('ends a drag with nothing moved', async () => {
    const { model } = await mount()
    const r71 = card('FL-2026-0001')
    drag('dragStart', r71)
    drag('dragEnd', r71)
    expect(r71.hasAttribute('data-dragging')).toBe(false)
    expect(screen.queryByText('Drop to decide')).toBeNull()
    expect(model.screen.getSnapshot().view).toBe('board')
  })

  it('refuses a decision move by a team member the work is not routed to, and a move that is no transition', () => {
    const words: Partial<ScreenContext> = { t: makeTranslate(en), me: fixtures.me }
    const ctx = words as ScreenContext
    const routed = fixtures.tickets.rows[3]!
    expect(mayMove(routed, fixtures.me)).toBe(true)
    const row: TicketRow = { ...routed, team: [PEOPLE.anna, PEOPLE.jonas] as never, routedTo: PEOPLE.jonas as never }
    expect(mayMove(row, fixtures.me)).toBe(false)
    expect(mayMove({ ...row, routedTo: null }, fixtures.me)).toBe(false)
    expect(mayMove(row, null)).toBe(false)
    const decided = BOARD_COLUMNS[3]!
    expect(dropOf(ctx, decided, row)).toEqual({ kind: 'refused', reason: 'Only the person the work is assigned to decides it.' })
    expect(dropOf(ctx, BOARD_COLUMNS[2]!, { ...row, state: 'decided' })).toEqual({ kind: 'refused', reason: 'The agent prepares the proposals; a person cannot move a card back here.' })
    expect(dropOf(ctx, decided, { ...row, state: 'routed' })).toEqual({ kind: 'refused', reason: 'Only work with proposals ready can be decided.' })
    expect(dropOf(ctx, decided, null)).toEqual({ kind: 'idle' })
  })

  it('opens a card, filters to the work routed to the person, and shows the empty board', async () => {
    const { model } = await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Notice of allowance' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work' })
    act(() => { model.navigate(BOARD) })
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'For me' }))
    await flush()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.queryByText('FL-2025-0203')).toBeNull()
    const { api } = createFixtureApi()
    vi.spyOn(api, 'tickets').mockResolvedValue({ ok: true, value: { rows: [] } })
    mounted?.dispose()
    cleanup()
    const { model: empty } = await mount(api)
    expect(screen.getByText('No work for you')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Go to Intake/ }))
    await flush()
    expect(empty.screen.getSnapshot()).toMatchObject({ view: 'intake' })
  })

  it('switches to the list layout, groups the work by state with the other states after the columns, and opens a row with ↵', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'tickets').mockResolvedValue({ ok: true, value: { rows: [
      ...fixtures.tickets.rows,
      { ...fixtures.tickets.rows[0]!, id: '00000000-0000-4000-8000-0000000000f1' as never, state: 'run_failed', due: null },
      { ...fixtures.tickets.rows[0]!, id: '00000000-0000-4000-8000-0000000000f2' as never, state: 'waking' },
      { ...fixtures.tickets.rows[0]!, id: '00000000-0000-4000-8000-0000000000f3' as never, reply: { state: 'sent' } },
    ] } })
    const { model, panel, commandItems } = await mount(api)
    expect(commandItems.item()!.label).toBe('Work board')
    const other = screen.getByRole('region', { name: 'Other states' })
    expect(within(other).getAllByRole('listitem').map(item => item.textContent)).toContain('Starting1')
    expect(within(column('Assigned')).getByText('Reply').parentElement!.textContent).toBe('ReplySent')
    fireEvent.click(within(other).getByRole('button', { name: 'Run failed' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'board', layout: 'list' })
    const groups = [...document.querySelectorAll('[role="list"] [data-atlas]')].map(group => group.textContent)
    expect(groups).toEqual(['Assigned', 'Running', 'Proposals ready', 'Decided', 'Run failed', 'Starting'])
    press(panel, 'KeyK')
    expect(document.activeElement?.getAttribute('data-row')).toBe('00000000-0000-4000-8000-0000000000f2')
    act(() => { panel.focus() })
    press(panel, 'KeyJ')
    press(document.activeElement!, 'KeyJ')
    press(document.activeElement!, 'KeyK')
    press(document.activeElement!, 'ArrowUp')
    expect(document.activeElement?.getAttribute('data-row')).toBe(fixtures.tickets.rows[0]!.id)
    press(document.activeElement!, 'Enter')
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'work' })
    act(() => { model.navigate({ view: 'board', layout: 'list' }) })
    await flush()
    fireEvent.click(screen.getByRole('tab', { name: 'Board' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'board', layout: 'board' })
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ layout: 'list' })
    for (const [index, layout] of [[0, 'board'], [1, 'list']] as const) {
      act(() => { commandItems.item()!.groups[0]!.acts[index]!.run() })
      await flush()
      expect(model.screen.getSnapshot()).toMatchObject({ layout })
    }
    act(() => { commandItems.item()!.groups[0]!.acts[2]!.run() })
    await flush()
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake' })
  })

  it('shows the list and board skeletons on their own grids while loading, tries again with R after an error, and goes to Intake with G I', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
    const { api } = createFixtureApi()
    let answer: ((value: Awaited<ReturnType<RecordsApi['tickets']>>) => void) | null = null
    const tickets = vi.spyOn(api, 'tickets').mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    const { panel, model } = await mount(api, { view: 'board', layout: 'list' })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    const list = screen.getByRole('status', { name: 'Loading' })
    expect(list.className).toContain('listColumns')
    expect(list.firstElementChild!.textContent).toBe('WorkMatterTeamDue')
    expect(list.querySelector('[data-skeleton]')!.firstElementChild!.children).toHaveLength(5)
    act(() => { model.navigate(BOARD) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    const board = screen.getByRole('status', { name: 'Loading' })
    expect(board.querySelectorAll('section')).toHaveLength(4)
    expect([...board.querySelectorAll('section')].map(column => column.querySelectorAll('header ~ div').length)).toEqual([2, 1, 2, 1])
    await act(async () => { answer?.({ ok: false, error: { kind: 'network' } }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByRole('alert').textContent).toContain('FlowLeap could not load this view.')
    press(panel, 'KeyR')
    expect(tickets.mock.calls.length).toBeGreaterThan(1)
    press(panel, 'KeyG')
    press(panel, 'KeyI')
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'intake' })
  })
})
