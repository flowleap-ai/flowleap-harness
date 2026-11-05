/**
 * The context menu of an intake row, contributed to `ui-context-menu`: Open, Accept and file on the proposed
 * matter, File on another matter and Not relevant, each with the command whose key it shows (R16). A key in the open
 * menu acts on that row. The two acts that need a person's input open the letter at its step. Copy link writes the
 * address of the open letter.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { MenuAction } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { createAct, type DocumentId, type FileNumber, type IntakeView } from './api.ts'
import { commandId } from './keys.ts'
import type { RecordsModel, Route } from './model.ts'
import { copyLink } from './screens/links.ts'
import type { Translate } from './words.ts'

/** The target of an intake row's context menu. */
export interface IntakeRowTarget {
  readonly document: DocumentId
  readonly list: IntakeView
  /** The proposed matter; Accept and file shows only with one. */
  readonly proposed: FileNumber | null
}

declare module '@deepseek-ai/dsh-client-ui-context-menu/client' {
  interface ContextMenuTargetMap {
    /** An intake row of the Matters panel. */
    'records.intake-row': IntakeRowTarget
  }
}

/** The target family and the contribution id of the intake row menu. */
export const ROW_MENU_TARGET = 'records.intake-row'

/**
 * The acts of an intake row.
 * @param model - the panel model.
 * @param t - the translate function.
 * @param row - the row.
 * @param linkOf - the address of a route.
 * @returns the menu acts.
 */
export function rowActions(model: Pick<RecordsModel, 'navigate' | 'perform'>, t: Translate, row: IntakeRowTarget, linkOf: (route: Route) => string): MenuAction[] {
  const open = (step?: 'other-matter' | 'reason') => { model.navigate({ view: 'intake', list: row.list, open: row.document, step }) }
  const proposed = row.proposed
  return [
    { id: 'open', label: t('act.open'), commandId: commandId('open'), keyText: 'keycap', run: () => { open() } },
    ...(proposed === null ? [] : [{
      id: 'accept',
      label: t('act.acceptOn', { matter: proposed }),
      commandId: commandId('record'), keyText: 'keycap',
      failureLabel: t('act.acceptFailed'),
      run: async () => {
        const result = await model.perform([createAct({ kind: 'intake.match', document: row.document, fileNumber: proposed })])
        if (result.failed.length > 0) throw new Error('records: the letter was not filed')
      },
    }]),
    { id: 'other-matter', label: t('act.otherMatterMenu'), commandId: commandId('otherMatter'), keyText: 'keycap', run: () => { open('other-matter') } },
    { id: 'not-relevant', label: t('act.notRelevant'), commandId: commandId('reject'), keyText: 'keycap', run: () => { open('reason') } },
    {
      id: 'copy-link',
      label: t('intake.act.copyLink'),
      separatorBefore: true,
      failureLabel: t('intake.copyFailed'),
      run: async () => {
        if (!await copyLink(linkOf({ view: 'intake', list: row.list, open: row.document }))) throw new Error('records: the clipboard refused the link')
      },
    },
  ]
}

/**
 * Contribute the intake row menu.
 * @param ctx - the browser context with `contextMenus`.
 * @param model - the panel model.
 * @param t - the translate function.
 * @param linkOf - the address of a route.
 */
export function registerRowMenu(ctx: Context, model: Pick<RecordsModel, 'navigate' | 'perform'>, t: Translate, linkOf: (route: Route) => string): void {
  ctx.effect(() => ctx.contextMenus.register({
    id: ROW_MENU_TARGET,
    target: 'records.intake-row',
    order: 0,
    resolve: row => rowActions(model, t, row, linkOf),
  }), 'ui-flowleap-records: intake row menu')
}
