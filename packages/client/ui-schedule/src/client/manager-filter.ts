/** Extra filter tabs of the Automation tasks page: the `schedule.manager.filter` list slot. */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleId } from '@deepseek-ai/dsh-schedule/client'

/** Name of the list slot whose entries add filter tabs to the Automation tasks page. */
export const MANAGER_FILTER_SLOT = 'schedule.manager.filter'

/** Owner share of one extra filter tab; the page renders each entry alone with its own share. */
export interface ScheduleManagerFilterOwnerProps {
  /** Whether this entry is the page's current filter. */
  readonly selected: boolean
  /**
   * Make this entry the page's current filter over the given tasks. Call it on click, and again while `selected`
   * whenever the set changes; the page then lists only the catalog records whose id is in the set, and search still
   * applies. Choosing a built-in status tab clears the selection.
   * @param taskIds - the tasks this filter shows.
   */
  readonly select: (taskIds: ReadonlySet<ScheduleId>) => void
  /** Class name of every filter tab on the page. */
  readonly className: string
  /** Class name the page adds to the selected filter tab. */
  readonly selectedClassName: string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Extra filter tabs after the Enabled, Paused, Ended, and All status tabs of the Automation tasks page, in ascending
     * `order`. Declared by this package's `main` entry for the `schedules` panel. Each entry renders one
     * `<button type="button">` with `aria-pressed={selected}` and its own label, styled with the owner's class names,
     * and supplies the task ids it filters by through `select`.
     */
    'schedule.manager.filter': { kind: 'list'; scope: 'root'; inline: true; owner: ScheduleManagerFilterOwnerProps }
  }
}

/** The registry reads the filter-entry projection needs. */
export interface FilterEntrySource {
  /**
   * The live entries of one slot.
   * @param key - slot name.
   * @returns the winning entry per list id.
   */
  entriesOfSlot(key: string): readonly { readonly options: { readonly id?: string | undefined; readonly order?: number | undefined } }[]
  /**
   * Observe one slot's entries.
   * @param key - slot name.
   * @param listener - called after each change.
   * @returns the disposer.
   */
  subscribe(key: string, listener: () => void): () => void
}

/**
 * Project the registered filter entries to their list ids in ascending `order`.
 * @param slots - the slot registry.
 * @returns an observable whose snapshot keeps its identity until the id list changes.
 */
export function filterEntryIds(slots: FilterEntrySource): HostObservable<readonly string[]> {
  let ids: readonly string[] = []
  return {
    getSnapshot: () => {
      const next = slots.entriesOfSlot(MANAGER_FILTER_SLOT)
        .flatMap(({ options }) => options.id === undefined ? [] : [{ id: options.id, order: options.order ?? 0 }])
        .sort((left, right) => left.order - right.order)
        .map(entry => entry.id)
      if (next.length !== ids.length || next.some((id, index) => id !== ids[index])) ids = next
      return ids
    },
    subscribe: listener => slots.subscribe(MANAGER_FILTER_SLOT, listener),
  }
}
