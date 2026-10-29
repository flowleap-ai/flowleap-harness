/**
 * Browser half of the FlowLeap "Needs review" mark: a chat that a routine run marked shows a badge on its Sidebar
 * row, lists on the Needs review page, offers Mark as done in its Session header, and selects its task through the
 * Automation tasks page's `schedule.manager.filter` tab. Every surface reads one shared source over
 * `flowleapRoutines.reviews()` and `schedule.catalog()`, which reads again on `flowleap-routines/changed`,
 * `schedule/changed`, and `connection/reset`. A `running` mark is not shown. On the FlowLeap dashboard it adds the
 * "Waiting for review" metric card and the "Needs your review" panel.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapRoutinesKey } from './locales.ts'
import { MarkDoneAction, NeedsReviewBadge, NeedsReviewFilter, NeedsReviewPanelIcon } from './marks.tsx'
import { NeedsReviewPage } from './NeedsReviewPage.tsx'
import { NeedsYourReviewWidget, WaitingForReviewMetric } from './dashboard.tsx'
import { createReviewsSource } from './reviews-source.ts'

export type { FlowleapRoutinesKey } from './locales.ts'
export type { ReviewsDependencies, ReviewsSnapshot, ReviewsSource } from './reviews-source.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Needs review badge, page, filter tab, and Mark as done copy. */
    'flowleapRoutines': FlowleapRoutinesKey
  }
}

/** Main panel id of the Needs review page and its Sidebar launcher. */
const PANEL_ID = 'flowleap-needs-review' as MainPanelId

/** Required services: slots, copy, the Remote namespaces, Session navigation, and access. */
export const inject = ['slots', 'locale', 'layout', 'remote', 'remote.flowleapRoutines', 'remote.schedule', 'uiWorkspace', 'remoteAccess']

/**
 * Register the Needs review surfaces while the current Peer may read the marks.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-routines: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.remoteAccess.whenAccess('flowleapRoutines/reviews', function* () {
    const source = createReviewsSource({
      reviews: () => ctx.remote.flowleapRoutines.reviews(),
      catalog: () => ctx.remote.schedule.catalog(),
      done: sessionId => ctx.remote.flowleapRoutines.done(sessionId),
      subscribeChanged: (listener) => {
        const routines = ctx.remote.$on('flowleap-routines/changed', listener)
        const schedule = ctx.remote.$on('schedule/changed', listener)
        return () => {
          routines()
          schedule()
        }
      },
      subscribeReset: listener => ctx.on('connection/reset', listener),
    })
    const shared = () => ({ hooks: source.hooks })
    yield ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
      name: 'sidebar.session.row.trailing', id: 'flowleap-needs-review', order: 10, locale: NS, inject: shared,
    }, NeedsReviewBadge))
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 15, locale: NS, label: () => t('panel'), inject: shared,
    }, NeedsReviewPanelIcon))
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID, locale: NS,
      inject: () => ({ ...source, onOpenSession: (sessionId: SessionId) => { ctx.uiWorkspace.openSession(sessionId) } }),
    }, NeedsReviewPage))
    // The dashboard (ui-flowleap-dashboard) declares these slots; without it the two registrations wait and do nothing.
    yield ctx.slots.inject('dashboard.metric', () => ctx.slots.register({
      name: 'dashboard.metric', id: 'flowleap-waiting-for-review', order: 10, locale: NS, label: () => t('dashboard.metric'),
      inject: shared,
    }, WaitingForReviewMetric))
    yield ctx.slots.inject('dashboard.widget', () => ctx.slots.register({
      name: 'dashboard.widget', id: 'flowleap-needs-your-review', order: 10, locale: NS, label: () => t('dashboard.widget'),
      inject: () => ({
        hooks: source.hooks,
        onOpenSession: (sessionId: SessionId) => { ctx.uiWorkspace.openSession(sessionId) },
        onOpenAll: () => { ctx.layout.selectPanel(PANEL_ID) },
      }),
    }, NeedsYourReviewWidget))
    yield ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
      name: 'conversation.session.header.utilities', id: 'flowleap-needs-review', order: -6, locale: NS,
      inject: () => ({ hooks: source.hooks, onDone: source.onDone }),
    }, MarkDoneAction))
    yield ctx.slots.inject('schedule.manager.filter', () => ctx.slots.register({
      name: 'schedule.manager.filter', id: 'flowleap-needs-review', order: 10, locale: NS, inject: shared,
    }, NeedsReviewFilter))
  })
}
