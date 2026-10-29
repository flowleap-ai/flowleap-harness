/**
 * The budget surfaces on the FlowLeap dashboard: the "Budget this month" panel and the "Budget used" card, over one
 * shared read of `flowleapBudget.month()`. An unknown spend shows "Unknown" and the reason, never a number.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-flowleap-dashboard/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { BudgetMonth } from '../types.ts'
import type { NS } from './locales.ts'
import css from './Budget.module.css'

type Copy = PropsLocale<typeof NS>

/** The shared read: `undefined` until the first answer. */
export type BudgetSnapshot = BudgetMonth | undefined

/** Injected share of both surfaces. */
export interface BudgetInjected {
  readonly hooks: { readonly budget: HostObservable<BudgetSnapshot> }
}

/** Remote call and invalidation the source uses. */
export interface BudgetDependencies {
  /** Read the month's figures. */
  readonly month: () => Promise<RemoteResult<BudgetMonth>>
  /** Observe connection resets. */
  readonly subscribeReset: (listener: () => void) => () => void
}

/**
 * Create the shared read. It reads when the first surface observes it, again at each later first observer (each time
 * the dashboard shows), and at a connection reset; a failed call is the `unreachable` reason.
 * @param deps - the Remote call and the reset subscription.
 * @returns the observable snapshot.
 */
export function createBudgetSource(deps: BudgetDependencies): HostObservable<BudgetSnapshot> {
  let snapshot: BudgetSnapshot
  const listeners = new Set<() => void>()
  let stopReset: (() => void) | undefined
  let epoch = 0
  const read = async (): Promise<void> => {
    const current = ++epoch
    let next: BudgetMonth
    try {
      const result = await deps.month()
      next = result.ok ? result.value : { state: 'unknown', reason: 'unreachable' }
    } catch (_error: unknown) {
      // A transport rejection is the same visible state as a Remote failure: the gateway figures are not known.
      next = { state: 'unknown', reason: 'unreachable' }
    }
    if (current !== epoch) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        stopReset = deps.subscribeReset(() => { void read() })
        void read()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size !== 0) return
        stopReset?.()
        stopReset = undefined
        epoch++
      }
    },
  }
}

function usd(t: Copy['t'], value: number): string {
  return new Intl.NumberFormat(t('time.locale'), { style: 'currency', currency: 'USD' }).format(value)
}

function monthLabel(t: Copy['t'], month: string): string {
  const format = new Intl.DateTimeFormat(t('time.locale'), { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return t('month', { month: format.format(Date.parse(`${month}-01T00:00:00Z`)) })
}

/** Props of the panel. */
export type BudgetWidgetProps = PropsRuntime<'dashboard.widget'> & Copy & InjectFace<BudgetInjected>

/**
 * Render the month's spend against the budget, or "Unknown" with the reason.
 * @param props - the shared read and copy.
 * @returns the panel body.
 */
export function BudgetWidget({ useBudget, t }: BudgetWidgetProps) {
  const budget = useBudget(snapshot => snapshot)
  if (budget === undefined) return <p className={css.note} role="status">{t('loading')}</p>
  if (budget.state === 'unknown') {
    return (
      <div data-budget-state="unknown">
        <span className={css.value}>{t('unknown')}</span>
        <p className={css.note}>{t(`reason.${budget.reason}`)}</p>
      </div>
    )
  }
  const limit = budget.budgetUsd
  return (
    <div data-budget-state="known">
      <div className={css.line}>
        <span className={css.value}>{t('used', { used: usd(t, budget.spentUsd) })}</span>
        <span className={css.note}>{limit === null ? t('noLimit') : t('limit', { limit: usd(t, limit) })}</span>
      </div>
      {limit !== null && limit > 0 && (
        <div className={css.meter} role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={budget.spentUsd} aria-label={t('widget')}>
          <span style={{ width: `${Math.min(1, budget.spentUsd / limit) * 100}%` }} />
        </div>
      )}
      <p className={css.note}>{monthLabel(t, budget.month)}</p>
    </div>
  )
}

/** Props of the card. */
export type BudgetUsedMetricProps = PropsRuntime<'dashboard.metric'> & Copy & InjectFace<BudgetInjected>

/**
 * Render the share of the budget used, the spend without a budget, or "Unknown" with the reason.
 * @param props - the shared read and copy.
 * @returns the card body.
 */
export function BudgetUsedMetric({ useBudget, t }: BudgetUsedMetricProps) {
  const budget = useBudget(snapshot => snapshot)
  if (budget === undefined) return <span className={css.metricValue}>…</span>
  if (budget.state === 'unknown') {
    return (
      <>
        <span className={css.metricValue}>{t('unknown')}</span>
        <span className={css.caption}>{t(`reason.${budget.reason}`)}</span>
      </>
    )
  }
  const used = usd(t, budget.spentUsd)
  if (budget.budgetUsd === null || budget.budgetUsd === 0) {
    return (
      <>
        <span className={css.metricValue}>{used}</span>
        <span className={css.caption}>{t('metric.noLimit', { used })}</span>
      </>
    )
  }
  return (
    <>
      <span className={css.metricValue}>{Math.round((budget.spentUsd / budget.budgetUsd) * 100)} %</span>
      <span className={css.caption}>{t('metric.caption', { used, limit: usd(t, budget.budgetUsd) })}</span>
    </>
  )
}
