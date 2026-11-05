/**
 * Item-scoped command menu behind the app's Search command (⌘K): a mounted view contributes its open item and the
 * item's acts; the menu shows them first and runs the chosen act. Without an item the Search command keeps its
 * search surface.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'

/** One act of the open item. */
export interface CommandMenuAct {
  /** Unique in its contribution. */
  readonly id: string
  readonly label: string
  /** Registry command whose current keycaps the row shows; the menu runs `run`, not the command. */
  readonly commandId?: ShortcutCommandId
  readonly disabled?: boolean
  /** Runs in a task after the menu closes and its modal layer gives focus back, so the act may move focus. */
  run(this: void): void
}
/** A titled group of acts, shown in contribution order. */
export interface CommandMenuGroup {
  readonly id: string
  readonly label: string
  readonly acts: readonly CommandMenuAct[]
}
/** The open item: the chip text and its groups. */
export interface CommandMenuItem {
  /** Chip text that names the open item. */
  readonly label: string
  readonly groups: readonly CommandMenuGroup[]
}
/** A mounted view's contribution, read each time the Search command opens the menu. */
export interface CommandMenuContribution {
  /** @returns the open item, or null when the view has no open item now. */
  item(this: void): CommandMenuItem | null
}
/** The `ctx.commandMenu` service face visible to feature packages. */
export interface CommandMenu {
  /**
   * Add a contribution; the latest one that returns an item wins.
   * @param contribution - item source read at each opening.
   * @returns idempotent disposer; an open menu that shows this contribution closes.
   */
  contribute(this: void, contribution: CommandMenuContribution): () => void
  /** Close the menu if it is open; its modal layer gives focus back to the element that had it. */
  close(this: void): void
  /**
   * Open the menu for the latest contribution with an item, as the Search command does, for a control such as a
   * top bar's Search button. An open menu stays open. The Application group's Search row runs the search surface of
   * the latest Search command; before the first Search command the menu has no Application group.
   * @returns false when no contribution has an item, so the menu stays closed.
   */
  open(this: void): boolean
}

/** One presented act; its callback stays in the menu. */
export interface CommandMenuRow {
  /** `<group id>/<act id>`. */
  readonly id: string
  readonly label: string
  readonly group: { readonly name: string; readonly label: string }
  readonly commandId?: ShortcutCommandId
  readonly disabled: boolean
}
/** Presentation state; each opening has a new occurrence. */
export interface CommandMenuState {
  readonly open: boolean
  readonly occurrence: number
  /** Chip text of the open item. */
  readonly item: string
  readonly rows: readonly CommandMenuRow[]
}
/** Localized copy of the application group that follows the item's groups. */
export interface CommandMenuLabels {
  readonly group: string
  readonly search: string
}

/** Menu service plus the controls that its overlay and the Search command use. */
export interface CommandMenuController extends CommandMenu {
  readonly state: ObservableSnapshot<CommandMenuState>
  /**
   * Open the menu for the latest contribution with an item, or close it when it is open.
   * @param search - the search surface the Search command opens without an item; the application group runs it.
   * @returns false when no contribution has an item, so the caller opens its search surface.
   */
  toggle(this: void, search: () => void): boolean
  /**
   * Close the menu, then run the row's act in a task, after the overlay unmounts and focus returns. A disabled or
   * unknown row does nothing.
   * @param id - presented row id.
   */
  select(this: void, id: string): void
}

const APPLICATION = 'application'

/**
 * Create the command menu for one client lifetime.
 * @param labels - localized application group copy, read at each opening.
 * @returns the service face plus overlay controls.
 */
export function createCommandMenu(labels: () => CommandMenuLabels): CommandMenuController {
  const contributions: CommandMenuContribution[] = []
  const state = createSnapshotStore<CommandMenuState>({ open: false, occurrence: 0, item: '', rows: [] })
  let runs = new Map<string, () => void>()
  let source: CommandMenuContribution | null = null
  let lastSearch: (() => void) | null = null
  const close = (): void => {
    if (!state.getSnapshot().open) return
    source = null
    runs = new Map()
    state.set({ ...state.getSnapshot(), open: false, rows: [] })
  }
  /**
   * Open the menu for the latest contribution with an item.
   * @param search - the search surface of the Application group; null leaves the group out.
   * @returns false when no contribution has an item.
   */
  const show = (search: (() => void) | null): boolean => {
    for (const contribution of contributions.toReversed()) {
      const item = contribution.item()
      if (item === null) continue
      const copy = labels()
      const application: CommandMenuGroup[] = search === null ? [] : [{ id: APPLICATION, label: copy.group,
        acts: [{ id: 'search', label: copy.search, commandId: 'session.search' as ShortcutCommandId, run: search }] }]
      const groups = [...item.groups, ...application]
      runs = new Map(groups.flatMap(group => group.acts.map(act => [`${group.id}/${act.id}`, act.run] as const)))
      source = contribution
      state.set({ open: true, occurrence: state.getSnapshot().occurrence + 1, item: item.label,
        rows: groups.flatMap(group => group.acts.map(act => ({ id: `${group.id}/${act.id}`, label: act.label,
          group: { name: group.id, label: group.label }, disabled: act.disabled === true,
          ...(act.commandId === undefined ? {} : { commandId: act.commandId }) }))) })
      return true
    }
    return false
  }
  return {
    state,
    close,
    contribute(contribution) {
      contributions.push(contribution)
      return () => {
        const index = contributions.indexOf(contribution)
        if (index === -1) return
        contributions.splice(index, 1)
        if (source === contribution) close()
      }
    },
    toggle(search) {
      lastSearch = search
      if (state.getSnapshot().open) { close(); return true }
      return show(search)
    },
    open() {
      return state.getSnapshot().open || show(lastSearch)
    },
    select(id) {
      const row = state.getSnapshot().rows.find(candidate => candidate.id === id)
      const run = runs.get(id)
      if (row === undefined || row.disabled || run === undefined) return
      close()
      setTimeout(run, 0)
    },
  }
}
