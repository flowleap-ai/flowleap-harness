// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonId, RecordsApi, TicketDetail, TicketId } from '../src/client/api.ts'
import { fakeReference } from './agent-fakes.client.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, PEOPLE } from './fixtures.client.ts'
import { flush, mountPanel } from './screen-harness.client.tsx'

const WORK = { view: 'work', id: FIXTURE_IDS.ticket as TicketId } as const

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
})
afterEach(() => {
  mounted?.dispose()
  mounted = null
  cleanup()
  vi.useRealTimers()
})

/**
 * Mount the work page over a ticket that replaces the fixture's.
 * @param ticket - the work, or the fixture's when absent.
 * @returns the mounted panel.
 */
async function work(ticket?: TicketDetail) {
  const { api } = createFixtureApi()
  const records: RecordsApi = ticket === undefined ? api : { ...api, ticket: () => Promise.resolve({ ok: true, value: ticket }) }
  mounted = await mountPanel(records, WORK)
  return mounted
}

const dock = () => screen.queryByRole('complementary', { name: 'Patent agent' })
const workArea = () => mounted!.panel.querySelector('[data-dock]:not(button)')!
const withRun = (run: TicketDetail['run']): TicketDetail => ({ ...fixtures.ticket, run })

describe('the agent panel of the work page', () => {
  it('shows the run Session\'s conversation beside the work, and keeps the decision bar', async () => {
    const { agent } = await work()
    const panel = dock()!
    expect(within(panel).getByText('Patent agent')).toBeTruthy()
    expect(within(panel).getByText('· OpenRouter')).toBeTruthy()
    expect(agent.addresses.at(-1)).toBe('dsh-resource://recordsrun/session/ses_r71work')
    act(() => { agent.resource.set({ status: 'loading', value: undefined, failure: undefined }) })
    expect(within(panel).getByRole('status', { name: 'Loading the conversation' })).toBeTruthy()
    const ready = { kind: 'ready', reference: fakeReference('ses_r71work') } as const
    act(() => { agent.resource.set({ status: 'live', value: ready, failure: undefined }) })
    const bound = panel.querySelector('[data-session="ses_r71work"]')!
    expect(bound.querySelector('[data-slot="records.agent.conversation"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Record decision/ })).toBeTruthy()
    expect(workArea().getAttribute('data-dock')).toBe('docked')
  })

  it('says in one sentence when the Session is not in this app, or is in the app of the person who ran the work', async () => {
    const { agent } = await work()
    expect(within(dock()!).getByText('This app does not have the conversation of this run.')).toBeTruthy()
    act(() => { agent.resource.set({ status: 'live', value: { kind: 'missing' }, failure: undefined }) })
    expect(within(dock()!).getByText('This app does not have the conversation of this run.')).toBeTruthy()
    cleanup()
    mounted!.dispose()
    const jonas = { ...PEOPLE.jonas, id: PEOPLE.jonas.id as PersonId }
    await work({ ...fixtures.ticket, ticket: { ...fixtures.ticket.ticket, routedTo: jonas } })
    expect(within(dock()!).getByText('The conversation of this run is in the app of Jonas Weber.')).toBeTruthy()
  })

  it('says when no run started or the record names no Session, and words the model', async () => {
    await work(withRun(null))
    expect(within(dock()!).getByText('The patent agent has not started on this letter.')).toBeTruthy()
    expect(within(dock()!).queryByText(/^·/)).toBeNull()
    cleanup()
    mounted!.dispose()
    await work(withRun({ model: 'local', steps: null, finishedAt: null, session: null }))
    expect(within(dock()!).getByText('FlowLeap has no record of the conversation of this run.')).toBeTruthy()
    expect(within(dock()!).getByText('· Local model')).toBeTruthy()
    cleanup()
    mounted!.dispose()
    await work(withRun({ model: 'mistral', steps: null, finishedAt: null, session: null }))
    expect(within(dock()!).getByText('· Cloud model')).toBeTruthy()
    cleanup()
    mounted!.dispose()
    await work(withRun({ model: null, steps: null, finishedAt: null, session: null }))
    expect(within(dock()!).queryByText(/^·/)).toBeNull()
  })

  it('minimises, closes, expands and opens again from the top bar', async () => {
    const { panel } = await work()
    const reopen = () => panel.querySelector('button[data-dock]:not([aria-label])')!
    const narrow = () => panel.querySelector('button[data-dock][aria-label="Patent agent"]')!
    expect(reopen().getAttribute('data-dock')).toBe('docked')

    const minimise = within(dock()!).getByRole('button', { name: 'Minimise' })
    act(() => { minimise.focus() })
    fireEvent.click(minimise)
    expect(panel.querySelector('aside')!.hidden).toBe(true)
    expect(workArea().getAttribute('data-dock')).toBe('minimised')
    expect(document.activeElement).toBe(panel)
    fireEvent.click(reopen())
    expect(dock()!.hidden).toBe(false)

    fireEvent.click(within(dock()!).getByRole('button', { name: 'Close' }))
    expect(panel.querySelector('aside')).toBeNull()
    fireEvent.click(reopen())
    expect(dock()).toBeTruthy()

    const expand = within(dock()!).getByRole('button', { name: 'Expand' })
    expect(expand.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(expand)
    expect(workArea().getAttribute('data-dock')).toBe('full')
    const collapse = within(dock()!).getByRole('button', { name: 'Show at the side' })
    expect(collapse.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(collapse)
    expect(workArea().getAttribute('data-dock')).toBe('docked')

    fireEvent.click(narrow())
    expect(dock()!.getAttribute('data-view')).toBe('full')
    await flush()
  })

  it('shows no agent button on another view', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel(api, { view: 'board' })
    expect(screen.queryByRole('button', { name: 'Patent agent' })).toBeNull()
  })
})
