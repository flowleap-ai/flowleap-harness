// @vitest-environment jsdom
import { useEffect, useMemo } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ScheduleCatalogEntry, ScheduleId } from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TaskManagerPage, type TaskManagerPageProps } from '../src/client/TaskManagerPage.tsx'
import type { CatalogSnapshot } from '../src/client/catalog-source.ts'
import { filterEntryIds, MANAGER_FILTER_SLOT, type FilterEntrySource, type ScheduleManagerFilterOwnerProps } from '../src/client/manager-filter.ts'
import { en } from '../src/client/task-manager-locales.ts'

afterEach(() => { cleanup() })

function entry(id: string, title: string, status: ScheduleCatalogEntry['status'] = 'active'): ScheduleCatalogEntry {
  return {
    id: id as ScheduleId, kind: 'after', status, title, prompt: title, afterSeconds: 60, scheduledAt: '2026-10-01T08:00:00.000Z',
    target: { kind: 'session', sessionId: `session-${id}` as SessionId }, involvedSessionIds: [`session-${id}` as SessionId],
  }
}

const watch = entry('watch', 'Register watch')
const digest = entry('digest', 'Weekly digest')
const ended = entry('ended', 'Ended watch', 'ended')
const sessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
const workspaces: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }

/** A filter entry that selects the task ids its test passes, as a registering plugin does. */
function ReviewFilter({ taskIds, selected, select, className, selectedClassName }: ScheduleManagerFilterOwnerProps & {
  readonly taskIds: readonly string[]
}) {
  const set = useMemo(() => new Set(taskIds as readonly ScheduleId[]), [taskIds])
  useEffect(() => { if (selected) select(set) }, [selected, select, set])
  return (
    <button type="button" className={`${className} ${selected ? selectedClassName : ''}`} aria-pressed={selected}
      onClick={() => { select(set) }}>
      Needs review
    </button>
  )
}

function mount(taskIds: readonly string[], filters: readonly string[] = ['review']) {
  const snapshot: CatalogSnapshot<ScheduleCatalogEntry> = {
    records: [watch, digest, ended], status: 'ready', deleting: [], settled: true, readRequest: 0, readSettled: 0,
  }
  let current = taskIds
  // The page renders only this slot, so the double answers with the one entry it registers.
  const renderFilter = (_key: string, owner: ScheduleManagerFilterOwnerProps, opts?: { readonly only?: string }) =>
    opts?.only === 'review' ? <ReviewFilter {...owner} taskIds={current} /> : null
  const renderSlot = renderFilter as TaskManagerPageProps['renderSlot']
  const props = (ids: readonly string[]): TaskManagerPageProps => ({
    useCatalog: select => select(snapshot),
    useFilters: select => select(ids),
    renderSlot,
    useSessions: select => select(sessions),
    useWorkspaces: select => select(workspaces),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessionStatus: select => select(new Map()),
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The task manager does not load document resources') },
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    onDelete: async () => 'deleted',
    onRetry: async () => {},
    onNewTask: () => {},
    onClearEnded: async () => {},
    onCreateTask: async () => ({ failed: 'host.createError' }),
    onOpenSession: () => {},
    loadHistory: async ({ id }) => ({ ok: true, value: {
      id, records: [], earlierRecordsUnavailable: false, earlierRecordsPruned: false, retention: { days: 30, records: 200 },
    } }),
    hostActions: { edit: async () => 'saved', run: async () => 'queued', loadNewSessionInterval: async () => 7200 },
    t: makeTranslate(en),
  })
  const view = render(<TaskManagerPage {...props(filters)} />)
  return {
    setTaskIds(next: readonly string[]) {
      current = next
      view.rerender(<TaskManagerPage {...props(filters)} />)
    },
    unregister() {
      view.rerender(<TaskManagerPage {...props([])} />)
    },
  }
}

function taskNames(): (string | null)[] {
  return within(screen.getByRole('list', { name: en['list.label'] })).queryAllByRole('button')
    .map(button => button.getAttribute('aria-label'))
}

function tab(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: en['statusFilter.label'] })).getByRole('button', { name })
}

describe('schedule.manager.filter', () => {
  it('adds the entry after the status tabs with the page tab class', () => {
    mount(['watch'])
    const tabs = within(screen.getByRole('group', { name: en['statusFilter.label'] })).getAllByRole('button')
    expect(tabs.map(button => button.textContent)).toEqual([en['status.active'], en['status.paused'], en['status.ended'], en['statusFilter.all'], 'Needs review'])
    expect(tabs[4]?.className).toContain(tabs[0]?.className.split(' ')[0])
    expect(tab('Needs review').getAttribute('aria-pressed')).toBe('false')
  })

  it('lists only the selected tasks, whatever their status, and keeps search', () => {
    mount(['watch', 'ended'])
    fireEvent.click(tab('Needs review'))
    expect(tab('Needs review').getAttribute('aria-pressed')).toBe('true')
    expect(tab(en['status.active']).getAttribute('aria-pressed')).toBe('false')
    expect(taskNames()).toEqual(['Register watch', 'Ended watch'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ended' } })
    expect(taskNames()).toEqual(['Ended watch'])
  })

  it('follows a changed set while selected', () => {
    const page = mount(['watch'])
    fireEvent.click(tab('Needs review'))
    expect(taskNames()).toEqual(['Register watch'])
    page.setTaskIds(['digest'])
    expect(taskNames()).toEqual(['Weekly digest'])
    page.setTaskIds([])
    expect(taskNames()).toEqual([])
    expect(screen.getByRole('status').textContent).toContain(en['list.noMatches'])
  })

  it('clears the selection when a status tab is chosen', () => {
    mount(['watch'])
    fireEvent.click(tab('Needs review'))
    fireEvent.click(tab(en['statusFilter.all']))
    expect(tab('Needs review').getAttribute('aria-pressed')).toBe('false')
    expect(taskNames()).toEqual(['Register watch', 'Weekly digest', 'Ended watch'])
  })

  it('returns to the status tab when the selected entry unregisters', () => {
    const page = mount(['watch'])
    fireEvent.click(tab('Needs review'))
    page.unregister()
    expect(tab(en['status.active']).getAttribute('aria-pressed')).toBe('true')
    expect(taskNames()).toEqual(['Register watch', 'Weekly digest'])
  })
})

describe('filterEntryIds', () => {
  it('lists registered entries by order and follows registration and disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({ name: 'root', children: { [MANAGER_FILTER_SLOT]: { kind: 'list', scope: 'root' } } } as never, () => null)
    const ids = filterEntryIds(ctx.slots)
    let changes = 0
    const stop = ids.subscribe(() => { changes++ })
    const Empty = () => null
    const late = ctx.slots.register({ name: MANAGER_FILTER_SLOT, id: 'late', order: 20 }, Empty)
    ctx.slots.register({ name: MANAGER_FILTER_SLOT, id: 'early', order: 10 }, Empty)
    expect(ids.getSnapshot()).toEqual(['early', 'late'])
    expect(ids.getSnapshot()).toBe(ids.getSnapshot())
    await Promise.resolve()
    const registered = changes
    expect(registered).toBeGreaterThan(0)
    late()
    expect(ids.getSnapshot()).toEqual(['early'])
    await Promise.resolve()
    expect(changes).toBeGreaterThan(registered)
    stop()
  })

  it('skips entries without an id and sorts entries without an order first', () => {
    const source: FilterEntrySource = {
      entriesOfSlot: () => [{ options: { id: 'ordered', order: 5 } }, { options: { id: 'unordered' } }, { options: {} }],
      subscribe: () => () => {},
    }
    expect(filterEntryIds(source).getSnapshot()).toEqual(['unordered', 'ordered'])
  })
})
