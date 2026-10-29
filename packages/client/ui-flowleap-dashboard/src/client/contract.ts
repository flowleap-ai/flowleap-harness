/**
 * Dashboard slot contract. The dashboard page declares four list slots, so each FlowLeap app adds its own surfaces:
 * `dashboard.metric` for a metric card, `dashboard.widget` for a panel, `dashboard.link` for a link to its page, and
 * `dashboard.search` for its group of search results. For a card and a panel the page draws the frame and the
 * registration `label` as the heading; the occupant draws only the body and reads its own data.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One metric card on the dashboard: `label` is the card title, `order` its place. */
    'dashboard.metric': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
    /** One panel on the dashboard: `label` is the panel heading, `order` its place. */
    'dashboard.widget': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
    /**
     * One link below the ask bar to an app page: `order` is its place. The occupant draws one button that opens its
     * page; the row shows only while an occupant is registered.
     */
    'dashboard.link': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
    /**
     * One group of search results below the ask bar while it holds text: `order` is its place. The occupant draws its
     * own group heading and result buttons, or nothing when no result matches.
     */
    'dashboard.search': { kind: 'list'; scope: 'root'; owner: DashboardSearchOwnerProps }
  }
}

/** Empty owner share of a dashboard occupant. */
export interface DashboardWidgetOwnerProps {
  /** Marker field: the occupant owns its own content and data. */
  children?: never
}

/** Owner share of a search group. */
export interface DashboardSearchOwnerProps {
  /** The trimmed text of the ask bar; never empty. */
  readonly query: string
  /**
   * The one match rule of every group: each word of the query is in the text, without regard to case.
   * @param text - the text of a result, for example a chat title.
   * @returns `true` when the result matches.
   */
  readonly matches: (text: string) => boolean
  /** Tell the page that the user opened a result, so the page clears the ask bar. */
  readonly onPicked: () => void
}

/** Metadata of one registered dashboard entry. */
export interface DashboardEntry {
  readonly id: string
  readonly order: number
  readonly label: string
}

/** Registered entries of the dashboard slots, ordered by `order`. */
export type DashboardEntries = {
  readonly metrics: ObservableSnapshot<readonly DashboardEntry[]>
  readonly widgets: ObservableSnapshot<readonly DashboardEntry[]>
  readonly links: ObservableSnapshot<readonly DashboardEntry[]>
  readonly searches: ObservableSnapshot<readonly DashboardEntry[]>
}

/**
 * Whether a text matches a search query: every word of the query is in the text, without regard to case.
 * @param text - the text of a result, for example a chat title.
 * @param query - the query.
 * @returns `true` when every word matches.
 */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = text.toLocaleLowerCase()
  return query.toLocaleLowerCase().split(/\s+/u).every(word => haystack.includes(word))
}
