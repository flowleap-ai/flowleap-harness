/**
 * The context menu of an intake row, contributed to `ui-context-menu`: Open, Accept and file on the proposed
 * matter, File on another matter and Not relevant, each with the command whose key it shows (R16). A key in the open
 * menu acts on that row. The two acts that need a person's input open the letter at its step. Copy link writes the
 * address of the open letter. Each act has its icon, as the mockup's context menu draws it.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { MenuAction } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import {
  IconArchiveOutlineRegular, IconCheckOutlineRegular, IconCloseOutlineRegular, IconLinkOutlineRegular, IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
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

/** The `contextMenu.icon` key and the 16px UI icon of each row act; `registerRowMenu` registers their renderers. */
export const ROW_MENU_ICONS = {
  'records.row.open': IconRightUpOutlineRegular,
  'records.row.accept': IconCheckOutlineRegular,
  'records.row.otherMatter': IconArchiveOutlineRegular,
  'records.row.notRelevant': IconCloseOutlineRegular,
  'records.row.copyLink': IconLinkOutlineRegular,
} as const

/**
 * The icon of a row act, by its key.
 * @param key - a key of `ROW_MENU_ICONS`.
 * @returns the action's icon.
 */
const icon = (key: keyof typeof ROW_MENU_ICONS) => ({ key })

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
    { id: 'open', label: t('act.open'), icon: icon('records.row.open'), commandId: commandId('open'), keyText: 'keycap' as const, run: () => { open() } },
    ...(proposed === null ? [] : [{
      id: 'accept',
      label: t('act.acceptOn', { matter: proposed }),
      icon: icon('records.row.accept'),
      commandId: commandId('record'), keyText: 'keycap' as const,
      failureLabel: t('act.acceptFailed'),
      run: async () => {
        const result = await model.perform([createAct({ kind: 'intake.match', document: row.document, fileNumber: proposed })])
        if (result.failed.length > 0) throw new Error('records: the letter was not filed')
      },
    }]),
    { id: 'other-matter', label: t('act.otherMatterMenu'), icon: icon('records.row.otherMatter'), commandId: commandId('otherMatter'), keyText: 'keycap' as const, run: () => { open('other-matter') } },
    { id: 'not-relevant', label: t('act.notRelevant'), icon: icon('records.row.notRelevant'), commandId: commandId('reject'), keyText: 'keycap' as const, run: () => { open('reason') } },
    {
      id: 'copy-link',
      label: t('intake.act.copyLink'),
      icon: icon('records.row.copyLink'),
      separatorBefore: true,
      failureLabel: t('intake.copyFailed'),
      run: async () => {
        if (!await copyLink(linkOf({ view: 'intake', list: row.list, open: row.document }))) throw new Error('records: the clipboard refused the link')
      },
    },
  ]
}

/**
 * Contribute the intake row menu and the renderers of its icons.
 * @param ctx - the browser context with `contextMenus` and `slots`.
 * @param model - the panel model.
 * @param t - the translate function.
 * @param linkOf - the address of a route.
 */
export function registerRowMenu(ctx: Context, model: Pick<RecordsModel, 'navigate' | 'perform'>, t: Translate, linkOf: (route: Route) => string): void {
  ctx.slots.inject('contextMenu.icon', function* () {
    for (const [key, Icon] of Object.entries(ROW_MENU_ICONS)) yield ctx.slots.register({ name: 'contextMenu.icon', key }, Icon)
  })
  ctx.effect(() => ctx.contextMenus.register({
    id: ROW_MENU_TARGET,
    target: 'records.intake-row',
    order: 0,
    resolve: row => rowActions(model, t, row, linkOf),
  }), 'ui-flowleap-records: intake row menu')
}
