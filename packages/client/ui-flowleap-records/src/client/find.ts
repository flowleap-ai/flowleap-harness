/**
 * Find a matter (sheet 00 section 6, mockup `5-dossier` state `search`): the command menu with the matters inside the
 * person's walls as its rows, which the menu's input filters as the person types. `/`, the top bar's Find a matter and
 * ⌘K on a view with no open item open it; a row opens the matter's dossier in the Matters panel.
 */

import type { CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { MatterRow, RecordsApi } from './api.ts'
import type { FileNumber } from './api.ts'
import type { Route } from './model.ts'
import type { Translate } from './words.ts'

/** The matters that Find a matter shows, and the command menu item that shows them. */
export interface MatterFinder {
  /**
   * Read the matters again.
   * @param signal - stops the read.
   * @returns when the read settled.
   */
  refresh(signal: AbortSignal): Promise<void>
  /**
   * The command menu item of Find a matter.
   * @param always - true when the person asked for it; false (⌘K) shows it only while an IPMS panel is open.
   * @returns the item, or null before the first read or, for ⌘K, outside the IPMS panels.
   */
  item(always?: boolean): CommandMenuItem | null
}

/**
 * The command menu item of the matters: one row for each matter with its file number, title and client, and the wall
 * note as the group's heading (product rule 8). A failed read is one disabled row that says so.
 * @param t - the translate function.
 * @param found - the matters, or null when the read failed.
 * @param open - open a matter's dossier.
 * @returns the item.
 */
export function findItem(t: Translate, found: readonly MatterRow[] | null, open: (fileNumber: FileNumber) => void): CommandMenuItem {
  if (found === null) return { label: t('find.label'), groups: [{ id: 'matters', label: t('find.group'), acts: [{ id: 'failed', label: t('find.failed'), disabled: true, run: () => {} }] }] }
  return {
    label: t('find.label'),
    groups: [{
      id: 'matters',
      label: t('find.group'),
      acts: found.map(row => ({ id: row.fileNumber, label: t('find.row', { fileNumber: row.fileNumber, title: row.title, client: row.client }), run: () => { open(row.fileNumber) } })),
    }],
  }
}

/**
 * Create the finder over the matters list.
 * @param api - the Records API.
 * @param t - the translate function.
 * @param openInMatters - open a route in the Matters panel.
 * @param recordsOpen - whether an IPMS panel is the open main panel.
 * @returns the finder.
 */
export function createMatterFinder(
  api: Pick<RecordsApi, 'searchMatters'>, t: Translate, openInMatters: (route: Route) => void, recordsOpen: () => boolean,
): MatterFinder {
  let found: readonly MatterRow[] | null | undefined
  const open = (fileNumber: FileNumber) => { openInMatters({ view: 'matter', fileNumber }) }
  return {
    async refresh(signal) {
      const result = await api.searchMatters('', signal)
      if (result.ok) found = result.value
      else if (result.error.kind !== 'aborted') found = null
    },
    item(always = false) {
      if (found === undefined || (!always && !recordsOpen())) return null
      return findItem(t, found, open)
    },
  }
}
