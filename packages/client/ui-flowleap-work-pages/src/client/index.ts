/**
 * Browser half of the FlowLeap work pages: the Office actions launcher in `sidebar.panellist` and the office action
 * board in the keyed `main` slot. The board reads the office action work pages through `flowleapWorkPages.list()` and
 * `read()`, reads again on `flowleap-work-pages/changed` and `connection/reset`, and changes the review fields of an
 * objection through `flowleapWorkPages.review()`. "Write response plan" sends one message into the chat that saved the
 * analysis through `session.prompt()`; the form opens a new chat with the request drafted. The page never calls the
 * model or a connector.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { createBoard } from './board.ts'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapWorkPagesKey } from './locales.ts'
import { OfficeActionBoard } from './OfficeActionBoard.tsx'
import { WorkPagesPanelIcon } from './WorkPagesPanelIcon.tsx'

export type { FlowleapWorkPagesKey } from './locales.ts'
export type { Board, BoardDependencies, BoardSnapshot, Notice } from './board.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Office actions launcher, office action board, side panel, analysis form, and board message copy. */
    'flowleapWorkPages': FlowleapWorkPagesKey
  }
}

/** Main panel id of the office action board and its Sidebar launcher. */
export const PANEL_ID = 'flowleap-office-actions' as MainPanelId

/** Required services: slots, copy, the Remote namespaces, Session navigation, and access. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapWorkPages', 'remote.session', 'uiWorkspace', 'remoteAccess']

/**
 * The report path of a work page path.
 * @param path - the work page file path.
 * @returns the path without its `.work.json` suffix.
 */
export function reportPathOf(path: string): string {
  return path.replace(/\.work\.json$/, '')
}

/**
 * Register the launcher and the board page while the current Peer may list the work pages.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-work-pages: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.remoteAccess.whenAccess('flowleapWorkPages/list', function* () {
    const board = createBoard({
      list: () => ctx.remote.flowleapWorkPages.list(),
      read: id => ctx.remote.flowleapWorkPages.read(id),
      review: request => ctx.remote.flowleapWorkPages.review(request),
      send: (sessionId: SessionId, text: string) => ctx.remote.session.prompt({
        requestId: randomUUID() as SessionRequestId, sessionId, mode: 'queue', content: [{ type: 'text', text }],
      }),
      openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
      draftChat: (text) => { ctx.uiWorkspace.startSession(undefined, { prompt: text, whenDraftExists: 'replace' }) },
      planMessage: (view: WorkPageView) => t('message.plan', {
        application: view.file.findings.application, report: reportPathOf(view.summary.path), workPage: view.summary.path,
      }),
      analysisMessage: application => t('message.analysis', { application }),
      subscribeChanged: listener => ctx.remote.$on('flowleap-work-pages/changed', listener),
      subscribeReset: listener => ctx.on('connection/reset', listener),
    })
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist', id: PANEL_ID, order: 16, locale: NS, label: () => t('panel'), inject: () => ({ hooks: board.hooks }),
    }, WorkPagesPanelIcon))
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ ...board, now: () => Date.now() }),
    }, OfficeActionBoard))
  })
}
