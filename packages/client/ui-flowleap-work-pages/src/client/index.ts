/**
 * Browser half of the FlowLeap work pages: the Office actions launcher in `sidebar.panellist` and the office action
 * board in the keyed `main` slot. This look-first version shows one sample analysis from a fixture; state and owner
 * changes stay in the plugin instance and are lost on reload. It calls no Remote, no model, and no connector.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createBoard } from './board.ts'
import { en, NS, zh, type FlowleapWorkPagesKey } from './locales.ts'
import { OfficeActionBoard } from './OfficeActionBoard.tsx'
import { WorkPagesPanelIcon } from './WorkPagesPanelIcon.tsx'
import { SAMPLE_ANALYSIS } from './sample-board.ts'

export type { FlowleapWorkPagesKey } from './locales.ts'
export type {
  AttorneyFields, Board, BoardState, CitationLabel, CitedDocument, CitedPassage, DeferredAction, FeatureComparison,
  Objection, ObjectionBasis, OfficeActionAnalysis, ResponseKind, ResponseOption, ObjectionState,
} from './board.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Office actions launcher, office action board, side panel, and analysis form copy. */
    'flowleapWorkPages': FlowleapWorkPagesKey
  }
}

/** Main panel id of the office action board and its Sidebar launcher. */
export const PANEL_ID = 'flowleap-office-actions' as MainPanelId

/** Required services: slots and copy. */
export const inject = ['slots', 'locale']

/**
 * Register the launcher and the board page.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-flowleap-work-pages: dictionaries')
  const t = ctx.locale.bind(NS)
  const board = createBoard(SAMPLE_ANALYSIS)
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 16, locale: NS, label: () => t('panel'), inject: () => ({ hooks: board.hooks }),
  }, WorkPagesPanelIcon)), 'ui-flowleap-work-pages: launcher')
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ ...board, now: () => Date.now() }),
  }, OfficeActionBoard)), 'ui-flowleap-work-pages: board')
}
