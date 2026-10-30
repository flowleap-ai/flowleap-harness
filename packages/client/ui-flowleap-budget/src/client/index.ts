/**
 * Browser half of the FlowLeap budget: the "Budget this month" panel and the "Budget used" card on the dashboard, over
 * one shared read of `flowleapBudget.month()`, read again at a connection reset and when the window gets the focus.
 * Both register only while the current Peer may call `flowleapBudget/month`; without the dashboard the registrations
 * wait and do nothing.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { BudgetUsedMetric, BudgetWidget } from './budget.tsx'
import { createBudgetSource } from './budget-source.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapBudgetKey } from './locales.ts'

export type { BudgetInjected } from './budget.tsx'
export type { BudgetDependencies, BudgetSnapshot } from './budget-source.ts'
export type { FlowleapBudgetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Budget panel and card copy. */
    'flowleapBudget': FlowleapBudgetKey
  }
}

/** Required services: slots, copy, the Remote namespace, and access. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapBudget', 'remoteAccess']

/**
 * Register the panel and the card while the current Peer may read the budget.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-budget: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.remoteAccess.whenAccess('flowleapBudget/month', function* () {
    const budget = createBudgetSource({
      month: () => ctx.remote.flowleapBudget.month(),
      subscribeReset: listener => ctx.on('connection/reset', listener),
      subscribeFocus: (listener) => {
        window.addEventListener('focus', listener)
        return () => { window.removeEventListener('focus', listener) }
      },
    })
    const shared = () => ({ hooks: { budget } })
    yield ctx.slots.inject('dashboard.metric', () => ctx.slots.register({
      name: 'dashboard.metric', id: 'flowleap-budget-used', order: 30, locale: NS, label: () => t('metric'), inject: shared,
    }, BudgetUsedMetric))
    yield ctx.slots.inject('dashboard.widget', () => ctx.slots.register({
      name: 'dashboard.widget', id: 'flowleap-budget', order: 40, locale: NS, label: () => t('widget'), inject: shared,
    }, BudgetWidget))
  })
}
