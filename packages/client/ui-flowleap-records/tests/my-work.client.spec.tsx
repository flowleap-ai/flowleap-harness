// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { MyWork, RecordsApi, WorkItem } from '../src/client/api.ts'
import type { Load } from '../src/client/load.ts'
import { en } from '../src/client/locales.ts'
import { groupWork, ledeCounts, letterOf, taskDueDay, workStatus } from '../src/client/my-work.ts'
import { MyWorkCount } from '../src/client/Panel.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, sha } from './fixtures.client.ts'
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
  vi.useRealTimers()
})

const item = (kind: WorkItem['kind'], act: string): WorkItem => ({ ...fixtures.myWork.work[0]!, kind, act })

/**
 * Mount My work over the fixture API, with My work's answer replaced where a test gives one.
 * @param myWork - the answer of `GET my-work`, or a failure.
 * @param language - the UI language.
 * @returns the mounted panel.
 */
async function mountMyWork(myWork?: Awaited<ReturnType<RecordsApi['myWork']>>, language: 'en' | 'de' = 'en') {
  const { api } = createFixtureApi()
  if (myWork !== undefined) vi.spyOn(api, 'myWork').mockResolvedValue(myWork)
  mounted = await mountPanel(api, { view: 'my-work' }, language, 'my-work')
  return mounted
}

describe('the view logic of My work', () => {
  it('groups the tasks by due time in the order Overdue, Today, Later, keeping the order of the answer in a group', () => {
    const [overdue, today, later] = fixtures.myWork.work
    expect(groupWork([later!, today!, overdue!])).toEqual([
      { group: 'overdue', items: [overdue] }, { group: 'today', items: [today] }, { group: 'later', items: [later] },
    ])
    expect(groupWork([later!])).toEqual([{ group: 'later', items: [later] }])
    expect(groupWork([])).toEqual([])
  })

  it('takes the status of a letter from the intake list and the one waiting state of every other kind', () => {
    const letter = item('file-letter', `intake/waiting/${sha(1)}`)
    expect(letterOf(letter)).toBe(sha(1))
    expect(letterOf(item('decide-work', `work/${FIXTURE_IDS.ticket}`))).toBeNull()
    expect(workStatus(letter, fixtures.intake, null)).toEqual(fixtures.intake.rows.find(row => row.document === sha(1))!.status)
    expect(workStatus(letter, null, null)).toBeNull()
    expect(workStatus(item('file-letter', `intake/waiting/${sha(99)}`), fixtures.intake, null)).toBeNull()
    // A deadline task takes the state of the deadline that its subject names, so an entered date never reads as proposed.
    expect(workStatus(item('confirm-deadline', 'deadline/x'), null, 'manual_proposed')).toEqual({ machine: 'deadline', state: 'manual_proposed' })
    expect(workStatus(item('decide-work', 'work/x'), null, 'active')).toEqual({ machine: 'ticket', state: 'proposals_ready' })
    expect(workStatus(item('confirm-deadline', 'deadline/x'), null, null)).toEqual({ machine: 'deadline', state: 'deadline_proposed' })
    expect(workStatus(item('decide-office-event', 'intake/waiting/x'), null, null)).toEqual({ machine: 'deadline', state: 'code_proposed' })
    expect(workStatus(item('decide-work', 'work/x'), null, null)).toEqual({ machine: 'ticket', state: 'proposals_ready' })
    expect(workStatus(item('answer', 'x'), null, null)).toBeNull()
  })

  it('counts each group that has tasks for the lede, and takes the day of a task due time', () => {
    expect(ledeCounts(fixtures.myWork)).toEqual([{ group: 'overdue', count: 1 }, { group: 'today', count: 1 }, { group: 'later', count: 1 }])
    expect(ledeCounts({ ...fixtures.myWork, summary: { ...fixtures.myWork.summary, overdue: 0, later: 0 } })).toEqual([{ group: 'today', count: 1 }])
    expect(taskDueDay(fixtures.myWork.work[2]!, 'UTC')).toBe('2026-11-06')
  })
})

describe('the My work count in the sidebar', () => {
  /**
   * Render the count over one state of the My work load.
   * @param load - the load, or null before the panel has one.
   * @returns the rendered text.
   */
  function countOf(load: Load<MyWork> | null): string {
    const props = { useMyWork: bindSnapshotSelector(createSnapshotStore(load)) } as Parameters<typeof MyWorkCount>[0]
    const view = render(<MyWorkCount {...props} />)
    const text = view.container.textContent ?? ''
    view.unmount()
    return text
  }

  it('counts the tasks once My work has loaded, keeps the last count after a failure, and shows no zero', () => {
    const ready = { phase: 'ready', data: fixtures.myWork, at: 0, refreshing: false } as const
    expect(countOf(null)).toBe('')
    expect(countOf({ phase: 'skeleton' })).toBe('')
    expect(countOf(ready)).toBe(String(fixtures.myWork.work.length))
    expect(countOf({ phase: 'failed', error: { kind: 'network' }, last: { data: fixtures.myWork, at: 0 }, retrying: false })).toBe('3')
    expect(countOf({ ...ready, data: { ...fixtures.myWork, work: [] } })).toBe('')
  })
})

describe('My work', () => {
  it('opens with the first line, the day with the count of each group, and the tasks in the groups by due time', async () => {
    await mountMyWork()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('1 letter arrived, 1 letter worked, 3 need you')
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling?.textContent).toBe('Wednesday 4 November · 1 overdue · 1 due today · 1 later')
    const list = screen.getByRole('list', { name: en['mywork.label'] })
    const groups = within(list).getAllByRole('listitem').filter(node => node.parentElement === list)
    expect(groups.map(group => group.firstElementChild?.textContent)).toEqual(['Overdue1', 'Today1', 'Later1'])
    const rows = list.querySelectorAll('[data-row]')
    expect([...rows].map(row => row.textContent)).toEqual([
      expect.stringContaining('Review the work'),
      expect.stringContaining('File this letter'),
      expect.stringContaining('Confirm the deadline'),
    ])
    expect(rows[0]!.textContent).toContain('Proposals ready')
    expect(rows[0]!.textContent).toContain('Kessler Sensorik GmbH')
    expect(rows[0]!.textContent).toContain('Mon, 1 Mar 2027')
    expect(rows[0]!.textContent).toContain('Overdue by 3 days')
    expect(rows[1]!.textContent).toContain('arrived today')
    expect(rows[1]!.textContent).toContain('Due today')
    expect(rows[2]!.textContent).toContain('Deadline proposed')
    expect(rows[2]!.textContent).toContain('2 days left')
  })

  it('opens the page of a task from its row, with ↵ and J and K, and the matter with G M', async () => {
    const { model, panel, openInMatters } = await mountMyWork()
    const rows = [...panel.querySelectorAll<HTMLElement>('[data-row]')]
    fireEvent.click(rows[1]!)
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'letter', document: sha(1) })
    model.navigate({ view: 'my-work' })
    await flush()
    const again = [...panel.querySelectorAll<HTMLElement>('[data-row]')]
    again[0]!.focus()
    press(again[0]!, 'KeyJ')
    expect(document.activeElement).toBe(panel.querySelectorAll('[data-row]')[1])
    press(document.activeElement!, 'KeyG')
    press(document.activeElement!, 'KeyM')
    expect(openInMatters).toHaveBeenCalledWith({ view: 'matter', fileNumber: 'FL-2026-0001' })
    press(document.activeElement!, 'Enter')
    expect(model.screen.getSnapshot()).toMatchObject({ view: 'letter', document: sha(1) })
  })

  it('shows the breadcrumb from My work and "1 / N" over the tasks on the page a task opened', async () => {
    const { model } = await mountMyWork()
    model.navigate({ view: 'deadline', id: FIXTURE_IDS.deadline as never })
    await flush()
    const crumbs = screen.getByRole('navigation', { name: en['crumbs.label'] })
    expect(crumbs.textContent).toContain(en['mywork.panel'])
    expect(screen.getByLabelText('Task 3 of 3')).toBeTruthy()
  })

  it('names a dossier opened from My work in the breadcrumb by its file number and title', async () => {
    const { model } = await mountMyWork()
    model.navigate({ view: 'matter', fileNumber: 'FL-2026-0001' as never })
    await flush()
    const crumbs = screen.getByRole('navigation', { name: en['crumbs.label'] })
    expect(crumbs.textContent).toContain(en['mywork.panel'])
    expect(crumbs.textContent).toContain('FL-2026-0001')
    expect(crumbs.textContent).toContain('Pressure sensor housing')
  })

  it('opens the row menu of a task with Open, Open matter and Copy link', async () => {
    const { panel, openMenu } = await mountMyWork()
    fireEvent.contextMenu(panel.querySelectorAll('[data-row]')[2]!)
    expect(openMenu).toHaveBeenCalledWith({ kind: 'records.work-row', value: { act: `deadline/${FIXTURE_IDS.deadline}`, fileNumber: 'FL-2026-0001' } }, expect.anything())
  })

  it('says that nothing waits, with Show filed today as the next step', async () => {
    const summary = { lettersArrived: 0, lettersToFile: 0, lettersWorked: 0, needYou: 0, overdue: 0, today: 0, later: 0 }
    const empty: MyWork = { ...fixtures.myWork, summary, work: [] }
    const { openInMatters } = await mountMyWork({ ok: true, value: empty })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nothing needs you')
    expect(screen.getByText(en['mywork.empty.title'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Show filed today/u }))
    expect(openInMatters).toHaveBeenCalledWith({ view: 'intake', list: 'filed-today', open: null })
  })

  it('shows a failed load as a notice with Try again, and a refusal as not found with no Try again (#328)', async () => {
    await mountMyWork({ ok: false, error: { kind: 'network' } })
    expect(screen.getByText(en['error.load'])).toBeTruthy()
    expect(screen.getByRole('button', { name: /Try again/u })).toBeTruthy()
    mounted?.dispose()
    mounted = null
    cleanup()
    const { openMyWork } = await mountMyWork({ ok: false, error: { kind: 'refused', status: 404, code: 'not-found', detail: null } })
    expect(screen.getByText(en['notFound.title'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Try again/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en['notFound.myWork'] }))
    expect(openMyWork).toHaveBeenCalled()
  })

  it('shows the German copy of the mockups', async () => {
    await mountMyWork(undefined, 'de')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('1 Schreiben eingegangen, 1 Schreiben bearbeitet, 3 brauchen Sie')
    expect(screen.getByText('Dieses Schreiben ablegen')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Akte finden/u }).length).toBeGreaterThan(0)
  })
})
