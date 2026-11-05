// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalId, TicketDetail, TicketId } from '../src/client/api.ts'
import { createFixtureApi, fixtures, FIXTURE_IDS } from './fixtures.client.ts'
import { flush, mountPanel, press } from './screen-harness.client.tsx'

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
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

const WORK = { view: 'work', id: FIXTURE_IDS.ticket as TicketId } as const

/** The Rule 71(3) work with two proposed reports, each with a span for every statement. */
const twoReports: TicketDetail = (() => {
  const report = { ...fixtures.ticket.reports[0]!, statements: fixtures.ticket.reports[0]!.statements.slice(0, 4) }
  return { ...fixtures.ticket, reports: [report, { ...report, proposalId: 'proposal-2' as ProposalId }] }
})()

const bar = () => screen.getByRole('region', { name: 'Your decision' })
const keysOf = (button: HTMLElement) => [...button.querySelectorAll('kbd')].map(kbd => kbd.textContent)

describe('the keys of the work page', () => {
  it('shows the keycaps 1 and 2 only on the report part that the keys act on', async () => {
    const { api } = createFixtureApi()
    vi.spyOn(api, 'ticket').mockResolvedValue({ ok: true, value: twoReports })
    mounted = await mountPanel(api, WORK)
    const accepts = () => within(bar()).getAllByRole('button', { name: /^Accept/ })
    const rejects = () => within(bar()).getAllByRole('button', { name: /^Reject/ })
    expect(accepts().map(keysOf)).toEqual([['1'], []])
    expect(rejects().map(keysOf)).toEqual([['2'], []])
    press(mounted.panel, 'Digit1')
    await flush()
    expect(accepts().map(keysOf)).toEqual([[], ['1']])
    expect(rejects().map(keysOf)).toEqual([[], ['2']])
    fireEvent.click(accepts()[1]!)
    expect(accepts().map(keysOf)).toEqual([['1'], []])
  })
})
