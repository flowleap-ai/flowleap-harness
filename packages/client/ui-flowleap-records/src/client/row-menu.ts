/**
 * The context menu of an intake row, contributed to `ui-context-menu`: Open, Accept and file on the proposed
 * matter, File on another matter and Not relevant, each with the command whose key it shows (R16). A key in the open
 * menu acts on that row. The two acts that need a person's input open the letter at its step.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { MenuAction } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { createAct, type DocumentId, type FileNumber, type IntakeView } from './api.ts'
import { commandId } from './keys.ts'
import type { RecordsModel } from './model.ts'
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
 * @returns the menu acts.
 */
export function rowActions(model: Pick<RecordsModel, 'navigate' | 'perform'>, t: Translate, row: IntakeRowTarget): MenuAction[] {
  const open = (step?: 'other-matter' | 'reason') => { model.navigate({ view: 'intake', list: row.list, open: row.document, step }) }
  const proposed = row.proposed
  return [
    { id: 'open', label: t('act.open'), commandId: commandId('open'), run: () => { open() } },
    ...(proposed === null ? [] : [{
      id: 'accept',
      label: t('act.acceptOn', { matter: proposed }),
      commandId: commandId('record'),
      failureLabel: t('act.acceptFailed'),
      run: async () => {
        const result = await model.perform([createAct({ kind: 'intake.match', document: row.document, fileNumber: proposed })])
        if (result.failed.length > 0) throw new Error('records: the letter was not filed')
      },
    }]),
    { id: 'other-matter', label: t('act.otherMatterMenu'), commandId: commandId('otherMatter'), run: () => { open('other-matter') } },
    { id: 'not-relevant', label: t('act.notRelevant'), commandId: commandId('reject'), run: () => { open('reason') } },
  ]
}

/**
 * Contribute the intake row menu.
 * @param ctx - the browser context with `contextMenus`.
 * @param model - the panel model.
 * @param t - the translate function.
 */
export function registerRowMenu(ctx: Context, model: Pick<RecordsModel, 'navigate' | 'perform'>, t: Translate): void {
  ctx.effect(() => ctx.contextMenus.register({
    id: ROW_MENU_TARGET,
    target: 'records.intake-row',
    order: 0,
    resolve: row => rowActions(model, t, row),
  }), 'ui-flowleap-records: intake row menu')
}
