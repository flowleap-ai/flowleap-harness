// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeadlineDetail, DeadlineId, DocumentId, FileNumber, TicketId } from '../src/client/api.ts'
import type { Route } from '../src/client/model.ts'
import { ActivityTimeline } from '../src/client/parts/Activity.tsx'
import { EvidenceQuote, MissingEvidence, RecordSource } from '../src/client/parts/Evidence.tsx'
import { EmptyState, ErrorNotice } from '../src/client/parts/States.tsx'
import { shownOrder } from '../src/client/screens/IntakeScreen.tsx'
import { createFixtureApi, FIXTURE_IDS, fixtures, R71_DOCUMENT } from './fixtures.client.ts'
import { flush, mountPanel, press } from './screen-harness.client.tsx'

/** The part names that `panel-boxes.js` allows, read from its `tree` and `self` lists. */
const PANEL_BOXES = readFileSync(resolve(import.meta.dirname, '../../../../.agents/skills/flowleap-design-language/scripts/panel-boxes.js'), 'utf8')
const ALLOWED = new Set([...PANEL_BOXES.matchAll(/(?:tree|self): \[([^\]]*)\]/gu)]
  .flatMap(list => [...list[1]!.matchAll(/'([^']+)'/gu)].map(name => name[1]!)))

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query !== '(min-width: 1366px)', addEventListener() {}, removeEventListener() {} })))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
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

const part = (element: Element | null | undefined) => element?.getAttribute('data-fdl-part')
const parts = (name: string) => document.querySelectorAll(`[data-fdl-part="${name}"]`)

/** Every marked element on the page names a part that `panel-boxes.js` allows. */
function expectAllowedNames(): void {
  const names = [...document.querySelectorAll('[data-fdl-part]')].map(element => part(element))
  expect(names.length).toBeGreaterThan(0)
  for (const name of names) expect(ALLOWED).toContain(name)
}

async function mount(route: Route, deadline?: DeadlineDetail) {
  const { api } = createFixtureApi()
  if (deadline !== undefined) vi.spyOn(api, 'deadline').mockResolvedValue({ ok: true, value: deadline })
  mounted = await mountPanel(api, route)
  return mounted
}

describe('the design-language part markers (R8)', () => {
  it('reads the allowed part names of panel-boxes.js', () => {
    for (const name of ['decision', 'file', 'card', 'dock', 'seg', 'letter', 'quote', 'excerpt', 'notice', 'empty-art', 'col', 'other', 'fact', 'chip', 'av']) expect(ALLOWED).toContain(name)
  })

  it('marks the letter drawing, the decision bar and the quotes of an open letter', async () => {
    await mount({ view: 'intake', list: 'waiting', open: R71_DOCUMENT as DocumentId })
    expect(part(document.querySelector('[role="img"][data-verbatim]'))).toBe('letter')
    expect(part(screen.getAllByRole('region', { name: 'Your decision' }).at(-1))).toBe('decision')
    expect(parts('quote').length).toBeGreaterThan(0)
    expectAllowedNames()
  })

  it('marks the bulk bar as a decision bar and each selected letter as a file row', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
    const rows = shownOrder(fixtures.intake.rows).map(row => row.document)
    const { panel } = await mount({ view: 'intake', list: 'waiting', open: null })
    press(panel, 'KeyX')
    fireEvent.click(document.querySelector(`[data-row="${rows[2]}"]`)!, { shiftKey: true })
    await flush()
    expect(screen.getByText('3 selected')).toBeTruthy()
    expect(part(document.querySelector('[data-bulk]'))).toBe('decision')
    expect(parts('file')).toHaveLength(3)
    expectAllowedNames()
  })

  it('marks the work page\'s file row, segmented control and agent panel', async () => {
    await mount({ view: 'work', id: FIXTURE_IDS.ticket as TicketId })
    expect(part(screen.getByRole('region', { name: 'Your decision' }))).toBe('decision')
    expect(part(screen.getByRole('group', { name: 'Client report' }))).toBe('seg')
    expect(part(screen.getByRole('complementary', { name: 'Patent agent' }))).toBe('dock')
    expect(parts('file')).toHaveLength(1)
    expectAllowedNames()
  })

  it('marks the notes of a deadline and the note of an office event entered by hand', async () => {
    const late = { kind: 'late-receipt', text: 'late', cite: 'Rule 126(2) EPC' } as const
    await mount({ view: 'deadline', id: FIXTURE_IDS.deadline as DeadlineId }, {
      ...fixtures.deadline,
      deadline: { ...fixtures.deadline.deadline, state: 'manual_proposed', notes: [late] },
      officeEvent: { ...fixtures.deadline.officeEvent, document: null, fileName: null },
      readers: { code: null, model: null, agree: null },
    })
    expect(parts('notice')).toHaveLength(2)
    expectAllowedNames()
  })

  it('marks the facts of a matter', async () => {
    await mount({ view: 'matter', fileNumber: 'FL-2026-0001' as FileNumber })
    expect(parts('fact').length).toBeGreaterThan(0)
    expectAllowedNames()
  })

  it('marks the board columns, the cards and the Other states line', async () => {
    await mount({ view: 'board' })
    const columns = parts('col')
    expect(columns.length).toBeGreaterThan(0)
    for (const column of columns) expect(within(column as HTMLElement).queryAllByRole('article').every(card => part(card) === 'card')).toBe(true)
    expect(parts('card').length).toBeGreaterThan(0)
    expect(part(screen.getByRole('region', { name: 'Other states' }))).toBe('other')
    expectAllowedNames()
  })

  it('marks the empty state\'s tile, the error notice, the chips, the excerpt and a system avatar', () => {
    const span = fixtures.ticket.reports[0]!.statements[1]!.evidence[0]!.span!
    const act_ = { id: 'retry', label: 'Try again', keycaps: [], run: vi.fn() }
    render(
      <>
        <EmptyState icon={<svg />} title="Nothing waits for you" body="Forward a letter." action={act_} />
        <ErrorNotice lead="FlowLeap could not load this view." retry={act_} />
        <RecordSource icon={<span />}>Deadline, active</RecordSource>
        <MissingEvidence labels={{ title: 'Missing evidence', why: 'No span.', find: 'Find the source', remove: 'Remove from the draft' }} onFind={vi.fn()} onRemove={vi.fn()} />
        <EvidenceQuote span={span} labels={{ page: 'p. 1', excerpt: 'Letter, page 1', exact: 'Exact span' }} />
        <ActivityTimeline heading="Activity" lines={[{ key: 'a', actor: { kind: 'system', icon: <svg />, name: 'FlowLeap' }, text: 'read the letter', time: '14:16' }]} audit={{ label: 'Audit', rows: [] }} />
      </>,
    )
    expect(parts('empty-art')).toHaveLength(1)
    expect(part(screen.getByRole('alert'))).toBe('notice')
    expect(parts('chip')).toHaveLength(2)
    vi.useFakeTimers()
    fireEvent.pointerEnter(screen.getByText('intends to grant a European patent'), { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(200) })
    expect(parts('excerpt')).toHaveLength(1)
    expect(parts('av')).toHaveLength(1)
    expectAllowedNames()
  })
})
