// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import {
  allowAllAccess, bindSnapshotSelector, makeTranslate, RemoteError, StaticRemoteAccess, stubConfigForm,
} from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { BudgetUsedMetric, BudgetWidget, createBudgetSource, type BudgetDependencies } from '../src/client/budget.tsx'
import { en, NS, zh } from '../src/client/locales.ts'
import type { BudgetMonth } from '../src/types.ts'

afterEach(() => { cleanup() })

const t = makeTranslate(en)
const ok = (value: BudgetMonth): RemoteResult<BudgetMonth> => ({ ok: true, value })

function remote(month: BudgetDependencies['month']) {
  const reset = new Set<() => void>()
  const deps: BudgetDependencies = { month, subscribeReset: (listener) => { reset.add(listener); return () => { reset.delete(listener) } } }
  return { deps, emitReset: () => { for (const listener of reset) listener() }, listening: () => reset.size }
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
}

describe('budget source', () => {
  it('reads at the first observer, again at a reset and at a later first observer, and drops a read that settles after the last one left', async () => {
    let answer: ((value: RemoteResult<BudgetMonth>) => void) | undefined
    const month = vi.fn(() => new Promise<RemoteResult<BudgetMonth>>((resolve) => { answer = resolve }))
    const r = remote(month)
    const source = createBudgetSource(r.deps)
    expect(month).not.toHaveBeenCalled()
    const stop = source.subscribe(() => {})
    expect(month).toHaveBeenCalledOnce()
    answer!(ok({ state: 'unknown', reason: 'not_configured' }))
    await settle()
    expect(source.getSnapshot()).toEqual({ state: 'unknown', reason: 'not_configured' })
    r.emitReset()
    expect(month).toHaveBeenCalledTimes(2)
    stop()
    expect(r.listening()).toBe(0)
    answer!(ok({ state: 'known', month: '2026-10', spentUsd: 1, budgetUsd: 2 }))
    await settle()
    expect(source.getSnapshot()).toEqual({ state: 'unknown', reason: 'not_configured' })
    const again = source.subscribe(() => {})
    expect(month).toHaveBeenCalledTimes(3)
    again()
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
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('12.5')
  })

  it('shows the spend without a share or meter when the firm sets no budget or a zero budget', async () => {
    for (const budgetUsd of [null, 0]) {
      const view = await shown({ state: 'known', month: '2026-10', spentUsd: 3, budgetUsd })
      expect(view.container.textContent).toContain('$3.00 this month, no budget set')
      expect(view.container.textContent).not.toContain('%')
      expect(screen.queryByRole('meter')).toBeNull()
      cleanup()
    }
    const view = await shown({ state: 'known', month: '2026-10', spentUsd: 3, budgetUsd: null })
    expect(view.container.textContent).toContain(en.noLimit)
  })

  it('shows Unknown and the reason for each unknown state, never a number', async () => {
    for (const reason of ['not_configured', 'no_key', 'refused', 'unreachable', 'invalid_answer'] as const) {
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
        expect(month).toHaveBeenCalledTimes(2)
        stop()
        expect(ctx.locale.bind(NS)('unknown')).toBe(zh.unknown)
      }
      await fiber.dispose()
      for (const seat of ['dashboard.metric', 'dashboard.widget'] as const) expect(ctx.slots.entries(seat)).toEqual([])
      await ctx.fiber.dispose()
    }
  })
})
