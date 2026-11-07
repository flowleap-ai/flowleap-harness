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
  // The work page opens with its properties panel; the top bar's Patent agent button opens the agent panel.
  fireEvent.click(mounted.panel.querySelector('button[data-dock]:not([aria-label])')!)
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

  it('shows the run summary and a composer for a new chat when the conversation is not in the person\'s chats', async () => {
    const { agent } = await work()
    act(() => { agent.resource.set({ status: 'live', value: { kind: 'missing' }, failure: undefined }) })
    const panel = dock()!
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('The patent agent finished its work on this letter')
    expect(within(panel).getByText('Its conversation is not in your chats.')).toBeTruthy()
    expect(within(panel).getByText(/^Finished /).textContent).toMatch(/^Finished \d\d:\d\d$/)
    const proposals = within(panel).getByRole('list', { name: 'Proposals of this run' })
    expect(within(proposals).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Client reportreport-FL-2026-0001-r71-3.docxProposed'])
    expect(proposals.querySelector('[data-atlas]')?.getAttribute('data-atlas')).toBe('report.proposed')
    expect(panel.querySelector('[data-shape="bad"]')).toBeNull()
    expect(panel.textContent).not.toMatch(/this app/i)
    const send = within(panel).getByRole('button', { name: 'Ask in a new chat' })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Ask about this letter' }), { target: { value: '  Which deadline applies?  ' } })
    fireEvent.click(send)
    expect(agent.prompts).toEqual(['About matter FL-2026-0001, Rule 71(3) communication of 30 Oct 2026: Which deadline applies?'])
    expect(within(panel).getByRole('textbox', { name: 'Ask about this letter' })).toHaveProperty('value', '')
    fireEvent.submit(send.closest('form')!)
    expect(agent.prompts).toHaveLength(1)
    cleanup()
    mounted!.dispose()
    const jonas = { ...PEOPLE.jonas, id: PEOPLE.jonas.id as PersonId }
    await work({ ...fixtures.ticket, ticket: { ...fixtures.ticket.ticket, routedTo: jonas }, run: { ...fixtures.ticket.run!, steps: 7 } })
    expect(within(dock()!).getByText('The patent agent ran for Jonas Weber.')).toBeTruthy()
    expect(within(dock()!).getByText(/ · 7 steps$/)).toBeTruthy()
  })

  it('says when no run started, the run works, or the record names no Session, and shows the refused shape only for a failed run', async () => {
    await work(withRun(null))
    expect(within(dock()!).getByRole('heading', { level: 2 }).textContent).toBe('The patent agent has not started')
    expect(within(dock()!).getByText('When FlowLeap gives this letter to the agent, its work shows here.')).toBeTruthy()
    expect(within(dock()!).queryByText(/^·/)).toBeNull()
    expect(within(dock()!).queryByText(/^Finished/)).toBeNull()
    cleanup()
    mounted!.dispose()
    await work({ ...withRun({ model: 'local', steps: 1, finishedAt: null, session: null }), reports: [] })
    expect(within(dock()!).getByRole('heading', { level: 2 }).textContent).toBe('The patent agent is working on this letter')
    expect(within(dock()!).getByText('FlowLeap kept no conversation of this run.')).toBeTruthy()
    expect(within(dock()!).getByText('1 step')).toBeTruthy()
    expect(within(dock()!).queryByRole('list', { name: 'Proposals of this run' })).toBeNull()
    expect(dock()!.querySelector('[data-shape="run"]')).toBeTruthy()
    expect(within(dock()!).getByText('· Local model')).toBeTruthy()
    cleanup()
    mounted!.dispose()
    await work({ ...withRun({ model: 'mistral', steps: null, finishedAt: null, session: null }), ticket: { ...fixtures.ticket.ticket, state: 'run_failed' } })
    expect(within(dock()!).getByRole('heading', { level: 2 }).textContent).toBe('The patent agent did not finish its work on this letter')
    expect(dock()!.querySelector('[data-shape="bad"]')).toBeTruthy()
    expect(within(dock()!).getByText('· Cloud model')).toBeTruthy()
    cleanup()
    mounted!.dispose()
    await work(withRun({ model: null, steps: null, finishedAt: null, session: null }))
    expect(within(dock()!).queryByText(/^·/)).toBeNull()
  })

  it('shows a failed read of the conversation as a notice with Try again above the summary, and reads it again', async () => {
    const { agent } = await work()
    act(() => { agent.resource.set({ status: 'failed', value: undefined, failure: { code: 'unavailable' } as never }) })
    const notice = within(dock()!).getByRole('alert')
    expect(notice.textContent).toContain('FlowLeap could not load the conversation of this run.')
    expect(within(dock()!).getByText('Its conversation is not in your chats.')).toBeTruthy()
    const reads = agent.addresses.length
    act(() => { agent.resource.set({ status: 'live', value: { kind: 'ready', reference: fakeReference('ses_r71work') }, failure: undefined }) })
    act(() => { agent.resource.set({ status: 'failed', value: { kind: 'ready', reference: fakeReference('ses_r71work') }, failure: { code: 'unavailable' } as never }) })
    expect(within(dock()!).getByRole('alert')).toBeTruthy()
    fireEvent.click(within(within(dock()!).getByRole('alert')).getByRole('button', { name: 'Try again' }))
    expect(agent.addresses.length).toBeGreaterThan(reads)
    act(() => { agent.resource.set({ status: 'live', value: { kind: 'ready', reference: fakeReference('ses_r71work') }, failure: undefined }) })
    expect(dock()!.querySelector('[data-session="ses_r71work"]')).toBeTruthy()
    expect(within(dock()!).queryByRole('alert')).toBeNull()
  })

  it('has no composer where the runtime has no Session navigation', async () => {
    const { agent } = await work(withRun(null))
    expect(within(dock()!).getByRole('textbox', { name: 'Ask about this letter' })).toBeTruthy()
    act(() => { agent.ask.set(null) })
    expect(within(dock()!).queryByRole('textbox', { name: 'Ask about this letter' })).toBeNull()
  })

  it('minimises, closes, expands and opens again from the top bar', async () => {
    const { panel } = await work()
    const reopen = () => panel.querySelector('button[data-dock]:not([aria-label])')!
    const narrow = () => panel.querySelector('button[data-dock][aria-label="Patent agent"]')!
    expect(reopen().getAttribute('data-dock')).toBe('docked')

    const minimise = within(dock()!).getByRole('button', { name: 'Minimise' })
    act(() => { minimise.focus() })
    fireEvent.click(minimise)
    // A minimised or closed agent panel gives its column back to the properties panel.
    expect(dock()).toBeNull()
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeTruthy()
    expect(document.activeElement).toBe(panel)
    fireEvent.click(reopen())
    expect(dock()!.hidden).toBe(false)

    fireEvent.click(within(dock()!).getByRole('button', { name: 'Close' }))
    expect(dock()).toBeNull()
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
