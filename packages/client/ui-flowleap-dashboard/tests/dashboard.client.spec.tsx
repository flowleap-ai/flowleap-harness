// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { bindSnapshotSelector, makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS } from '../src/client/locales.ts'
import { DashboardPage, type DashboardPageProps } from '../src/client/DashboardPage.tsx'
import { BudgetThisMonth, chatRows, ComingUp } from '../src/client/widgets.tsx'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const t = makeTranslate(en) as DashboardPageProps['t']

function sessions(rows: readonly { id: string; title: string; running?: boolean; blank?: boolean; updatedAt: number }[]): SessionListState {
  const byId = Object.fromEntries(rows.map(row => [row.id, {
    id: row.id, displayTitle: row.title, running: row.running ?? false, blank: row.blank ?? false, updatedAt: row.updatedAt, retainedBy: {},
  }]))
  return { ids: rows.map(row => row.id as SessionId), byId, phase: 'ready', projectionsBySession: {} } as never
}

function pageProps(list: SessionListState, onAsk = vi.fn()): DashboardPageProps {
  const entries = (labels: readonly string[]) => labels.map((label, order) => ({ id: label, order, label }))
  return {
    useMetrics: bindSnapshotSelector(createSnapshotStore(entries(['Waiting for review']))),
    useWidgets: bindSnapshotSelector(createSnapshotStore(entries(['Needs your review', 'Coming up']))),
    useFocusRequests: bindSnapshotSelector(createSnapshotStore(0)),
    useSessions: bindSnapshotSelector(createSnapshotStore(list)),
    onAsk,
    renderSlot: ((name: string, _props: unknown, options: { only: string }) => <p>{`${name}:${options.only}`}</p>) as never,
    t,
  } as never
}

describe('dashboard page', () => {
  it('shows the first steps on a first sign-in until the user hides them', () => {
    render(<DashboardPage {...pageProps(sessions([{ id: 'blank', title: 'New', blank: true, updatedAt: 1 }]))} />)
    const steps = screen.getByRole('region', { name: en['firstSteps.title'] })
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: en['firstSteps.hide'] }))
    expect(screen.queryByRole('region', { name: en['firstSteps.title'] })).toBeNull()
    expect(window.localStorage.getItem('flowleap.dashboard.firstStepsHidden')).toBe('true')
  })

  it('shows no first steps after the first chat, and frames each registered card and panel with its label', () => {
    render(<DashboardPage {...pageProps(sessions([{ id: 'a', title: 'Claim chart', updatedAt: 1 }]))} />)
    expect(screen.queryByRole('region', { name: en['firstSteps.title'] })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Waiting for review' })).toBeTruthy()
    expect(screen.getByText('dashboard.widget:Coming up')).toBeTruthy()
    expect(screen.getByTestId('flowleap-install')).toBeTruthy()
  })

  it('opens a new chat with the asked text', () => {
    const onAsk = vi.fn()
    render(<DashboardPage {...pageProps(sessions([]), onAsk)} />)
    fireEvent.change(screen.getByRole('textbox', { name: en['ask.label'] }), { target: { value: '  Summarise EP 1 234 567  ' } })
    fireEvent.click(screen.getByRole('button', { name: en['ask.submit'] }))
    expect(onAsk).toHaveBeenCalledWith('Summarise EP 1 234 567')
  })
})

describe('dashboard panels', () => {
  it('lists the user chats running first, then the most recent, without blank or subagent chats', () => {
    const list = sessions([
      { id: 'old', title: 'Old', updatedAt: 1 },
      { id: 'new', title: 'New', updatedAt: 3 },
      { id: 'run', title: 'Run', running: true, updatedAt: 2 },
      { id: 'blank', title: 'Blank', blank: true, updatedAt: 4 },
    ])
    expect(chatRows(list).map(row => row.id)).toEqual(['run', 'new', 'old'])
  })

  it('tags every panel that shows sample data', () => {
    const sample = { t } as Parameters<typeof ComingUp>[0]
    const { container } = render(<><ComingUp {...sample} /><BudgetThisMonth {...sample} /></>)
    expect(container.querySelectorAll('[data-sample-data]')).toHaveLength(2)
    expect(screen.getAllByText(en['sample.label'])).toHaveLength(2)
  })
})

async function pluginContext() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const workspace = { openSession: vi.fn(), startSession: vi.fn() }
  const layout = { selectPanel: vi.fn() }
  ctx.provide('uiWorkspace', workspace as never)
  ctx.provide('layout', layout as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: {
      main: { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'sidebar.actions': { kind: 'list', scope: 'root' },
      'sidebar.sections': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, workspace, layout }
}

describe('ui-flowleap-dashboard browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'layout', 'uiWorkspace'])
  })

  it('lands on the dashboard, fills its slots and the sidebar layers, and removes everything on dispose', async () => {
    const { ctx, workspace, layout } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(layout.selectPanel).toHaveBeenCalledWith('flowleap-dashboard') })
    expect(ctx.slots.entries('main')).toHaveLength(3)
    expect(ctx.slots.entries('sidebar.panellist').map(entry => entry.options.id)).toEqual(['flowleap-dashboard', 'flowleap-chats', 'flowleap-agents'])
    expect(ctx.slots.entries('sidebar.actions')).toHaveLength(1)
    expect(ctx.slots.entries('sidebar.sections')).toHaveLength(1)
    expect(ctx.slots.entries('dashboard.metric')).toHaveLength(2)
    expect(ctx.slots.entries('dashboard.widget')).toHaveLength(3)

    const page = ctx.slots.entries('main').find(entry => entry.options.key === 'flowleap-dashboard')!.inject!() as {
      onAsk: (text: string) => void
      hooks: { widgets: { getSnapshot: () => readonly { label: string }[] } }
    }
    expect(page.hooks.widgets.getSnapshot().map(entry => entry.label)).toEqual([en['widget.comingUp'], en['widget.activity'], en['widget.budget']])
    page.onAsk('Watch EP 1')
    expect(workspace.startSession).toHaveBeenCalledWith(undefined, { prompt: 'Watch EP 1' })
    page.onAsk('')
    expect(workspace.startSession).toHaveBeenLastCalledWith(undefined, undefined)
    const searchAction = ctx.slots.entries('sidebar.actions')[0]!.inject!() as { onSearch: () => void }
    searchAction.onSearch()
    expect(layout.selectPanel).toHaveBeenLastCalledWith('flowleap-dashboard')
    expect(ctx.locale.bind(NS)('panel.dashboard')).toBe(en['panel.dashboard'])

    await fiber.dispose()
    for (const seat of ['main', 'sidebar.panellist', 'sidebar.actions', 'sidebar.sections'] as const) {
      expect(ctx.slots.entries(seat)).toEqual([])
    }
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-dashboard node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
