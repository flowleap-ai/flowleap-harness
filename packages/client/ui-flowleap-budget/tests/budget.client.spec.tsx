// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  allowAllAccess, bindSnapshotSelector, contextMenuHook, makeTranslate, RemoteError, StaticRemoteAccess, stubConfigForm,
} from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { apply as applyNode } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { BudgetUsedMetric, BudgetWidget } from '../src/client/budget.tsx'
import { createBudgetSource, type BudgetDependencies } from '../src/client/budget-source.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import type { BudgetMonth } from '@deepseek-ai/dsh-flowleap-budget/types'

afterEach(() => { cleanup() })

const t = makeTranslate(en)
const ok = (value: BudgetMonth): RemoteResult<BudgetMonth> => ({ ok: true, value })

function remote(month: BudgetDependencies['month']) {
  const reset = new Set<() => void>()
  const focus = new Set<() => void>()
  const channel = (set: Set<() => void>) => (listener: () => void) => {
    set.add(listener)
    return () => { set.delete(listener) }
  }
  const deps: BudgetDependencies = { month, subscribeReset: channel(reset), subscribeFocus: channel(focus) }
  return {
    deps,
    emitReset: () => { for (const listener of reset) listener() },
    emitFocus: () => { for (const listener of focus) listener() },
    listening: () => reset.size + focus.size,
  }
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

async function shown(month: BudgetMonth | (() => Promise<RemoteResult<BudgetMonth>>)) {
  const source = createBudgetSource(remote(typeof month === 'function' ? month : async () => ok(month)).deps)
  const useBudget = bindSnapshotSelector(source)
  const view = render(
    <><BudgetUsedMetric {...standard} useBudget={useBudget} t={t} /><BudgetWidget {...standard} useBudget={useBudget} t={t} /></>,
  )
  await settle()
  return view
}

/** The global standard seat every root-scope entry receives. */
const standardHook = <T,>(value: T) => <R,>(select: (state: T) => R): R => select(value)
const standard: GlobalStandardProps = {
  useSessions: standardHook<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
  useSessionStatus: standardHook(new Map()),
  useSessionRetainInfo: () => undefined,
  usePanelInfo: standardHook({ activePanelId: null }),
  useResource: () => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} }),
  useWorkspaces: standardHook<WorkspaceSnapshot>({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }),
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
}

describe('budget source', () => {
  it('reads at the first observer, again at a reset and when the window gets the focus, and stops listening after the last observer', async () => {
    const month = vi.fn(async () => ok({ state: 'unknown', reason: 'not_configured' }))
    const r = remote(month)
    const source = createBudgetSource(r.deps)
    expect(month).not.toHaveBeenCalled()
    const stop = source.subscribe(() => {})
    await settle()
    expect(source.getSnapshot()).toEqual({ state: 'unknown', reason: 'not_configured' })
    r.emitReset()
    r.emitFocus()
    expect(month).toHaveBeenCalledTimes(3)
    stop()
    expect(r.listening()).toBe(0)
  })

  it('turns a Remote failure and a transport rejection into the unreachable reason', async () => {
    for (const month of [
      async (): Promise<RemoteResult<BudgetMonth>> => ({ ok: false, error: new RemoteError('gateway/internal', 'Unavailable', {}) }),
      async (): Promise<RemoteResult<BudgetMonth>> => { throw new Error('transport closed') },
    ]) {
      const source = createBudgetSource(remote(month).deps)
      const stop = source.subscribe(() => {})
      await settle()
      expect(source.getSnapshot()).toEqual({ state: 'unknown', reason: 'unreachable' })
      stop()
    }
  })
})

describe('budget surfaces', () => {
  it('shows the share used, the spend, the budget, a meter, and the month', async () => {
    const view = await shown({ state: 'known', month: '2026-10', spentUsd: 12.5, budgetUsd: 50 })
    expect(view.container.textContent).toContain('25 %')
    expect(view.container.textContent).toContain('$12.50 of $50.00 this month')
    expect(view.container.textContent).toContain('$12.50 used')
    expect(view.container.textContent).toContain('Budget $50.00')
    expect(view.container.textContent).toContain('October 2026, UTC')
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('25')
  })

  it('shows the spend without a share or meter when the firm sets no budget', async () => {
    const view = await shown({ state: 'known', month: '2026-10', spentUsd: 3, budgetUsd: null })
    expect(view.container.textContent).toContain('$3.00 this month, no budget set')
    expect(view.container.textContent).toContain(en.noLimit)
    expect(view.container.textContent).not.toContain('%')
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('shows a budget of 0 as a limit: used up on the card and the meter when there is spend', async () => {
    for (const [spentUsd, percent] of [[3, '100'], [0, '0']] as const) {
      const view = await shown({ state: 'known', month: '2026-10', spentUsd, budgetUsd: 0 })
      expect(view.container.textContent).toContain(`${percent} %`)
      expect(view.container.textContent).toContain('Budget $0.00')
      expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe(percent)
      cleanup()
    }
    const over = await shown({ state: 'known', month: '2026-10', spentUsd: 60, budgetUsd: 50 })
    expect(over.container.textContent).toContain('120 %')
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('100')
  })

  it('shows Unknown and the reason for each unknown state, never a number', async () => {
    for (const reason of ['not_configured', 'no_key', 'refused', 'gateway_error', 'unreachable', 'invalid_answer'] as const) {
      const view = await shown({ state: 'unknown', reason })
      expect(screen.getAllByText(en.unknown)).toHaveLength(2)
      expect(screen.getAllByText(en[`reason.${reason}`])).toHaveLength(2)
      expect(view.container.textContent).not.toMatch(/\d/u)
      cleanup()
    }
  })

  it('shows a reading state before the first answer', async () => {
    const view = await shown(() => new Promise<never>(() => {}))
    expect(view.container.textContent).toContain('…')
    expect(screen.getByRole('status').textContent).toBe(en.loading)
  })
})

class RemoteStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }
}

describe('ui-flowleap-budget browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.flowleapBudget', 'remoteAccess'])
  })

  it('registers the card and the panel while the Peer may read the budget, and removes them on dispose', async () => {
    for (const allowed of [false, true]) {
      const ctx = new Context()
      await ctx.plugin(SlotRegistry).await()
      const allows = vi.fn(() => allowed)
      new StaticRemoteAccess(ctx, allows)
      new RemoteStub(ctx)
      const month = vi.fn(async () => ok({ state: 'unknown', reason: 'not_configured' }))
      await ctx.plugin({ apply(provider: Context) { provider.provide('remote.flowleapBudget', { month } as never) } }).await()
      ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
      await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
      ctx.slots.register({
        name: 'root',
        children: { 'dashboard.metric': { kind: 'list', scope: 'root' }, 'dashboard.widget': { kind: 'list', scope: 'root' } },
      } as never, () => null)
      ctx.locale.setLocale('zh')
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      expect(allows).toHaveBeenCalledWith('flowleapBudget/month')
      for (const seat of ['dashboard.metric', 'dashboard.widget'] as const) {
        expect(ctx.slots.entries(seat)).toHaveLength(allowed ? 1 : 0)
      }
      if (allowed) {
        expect((ctx.slots.entries('dashboard.metric')[0]!.options.label as () => string)()).toBe(zh.metric)
        expect((ctx.slots.entries('dashboard.widget')[0]!.options.label as () => string)()).toBe(zh.widget)
        const injected = ctx.slots.entries('dashboard.widget')[0]!.inject!() as { hooks: { budget: ReturnType<typeof createBudgetSource> } }
        const stop = injected.hooks.budget.subscribe(() => {})
        await settle()
        expect(month).toHaveBeenCalledOnce()
        ctx.emit('connection/reset')
        window.dispatchEvent(new Event('focus'))
        expect(month).toHaveBeenCalledTimes(3)
        stop()
        expect(ctx.locale.bind(NS)('unknown')).toBe(zh.unknown)
      }
      await fiber.dispose()
      for (const seat of ['dashboard.metric', 'dashboard.widget'] as const) expect(ctx.slots.entries(seat)).toEqual([])
      await ctx.fiber.dispose()
    }
  })
})

describe('ui-flowleap-budget node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
