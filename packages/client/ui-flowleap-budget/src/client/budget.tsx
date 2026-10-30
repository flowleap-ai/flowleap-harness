/**
 * The budget surfaces on the FlowLeap dashboard: the "Budget this month" panel and the "Budget used" card, over one
 * shared read of `flowleapBudget.month()`. An unknown spend shows "Unknown" and the reason, never a number. Both
 * surfaces use one rule for the share used, so a budget of 0 shows as used up on both.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-flowleap-dashboard/client'
import type { BudgetSnapshot } from './budget-source.ts'
import type { NS } from './locales.ts'
import css from './Budget.module.css'

type Copy = PropsLocale<typeof NS>

/** Injected share of both surfaces. */
export interface BudgetInjected {
  readonly hooks: { readonly budget: HostObservable<BudgetSnapshot> }
}

/**
 * The share of the budget used, in percent. A budget of 0 is a limit: any spend uses all of it.
 * @param spent - the spend.
 * @param budget - the budget, 0 or more.
 * @returns the rounded percent; above 100 when the spend is above the budget.
 */
export function usedPercent(spent: number, budget: number): number {
  if (budget === 0) return spent > 0 ? 100 : 0
  return Math.round((spent / budget) * 100)
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
      {limit !== null && (
        <div
          className={css.meter} role="meter" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(100, usedPercent(budget.spentUsd, limit))} aria-label={t('widget')}
        >
          <span style={{ width: `${String(Math.min(100, usedPercent(budget.spentUsd, limit)))}%` }} />
        </div>
      )}
      <p className={css.note}>{monthLabel(t, budget.month)}</p>
    </div>
  )
}

/** Props of the card. */
export type BudgetUsedMetricProps = PropsRuntime<'dashboard.metric'> & Copy & InjectFace<BudgetInjected>

/**
 * Render the share of the budget used (a budget of 0 with a spend is 100 %), the spend without a budget, or "Unknown"
 * with the reason.
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
  if (budget.budgetUsd === null) {
    return (
      <>
        <span className={css.metricValue}>{used}</span>
        <span className={css.caption}>{t('metric.noLimit', { used })}</span>
      </>
    )
  }
  return (
    <>
      <span className={css.metricValue}>{usedPercent(budget.spentUsd, budget.budgetUsd)} %</span>
      <span className={css.caption}>{t('metric.caption', { used, limit: usd(t, budget.budgetUsd) })}</span>
    </>
  )
}
