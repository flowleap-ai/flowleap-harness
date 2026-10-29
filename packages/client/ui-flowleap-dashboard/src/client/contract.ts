/**
 * Dashboard contract. The dashboard page declares two list slots, so each FlowLeap app adds its own surfaces:
 * `dashboard.metric` for a metric card and `dashboard.widget` for a panel. The page draws the frame and the
 * registration `label` as the heading; the occupant draws only the body and reads its own data. The search of the ask
 * bar is data: each app registers a {@link DashboardSearchGroup} with the `dashboardSearch` service, and the page draws
 * every group the same way.
 */

import type { ComponentType } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One metric card on the dashboard: `label` is the card title, `order` its place. */
    'dashboard.metric': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
    /** One panel on the dashboard: `label` is the panel heading, `order` its place. */
    'dashboard.widget': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The search groups of the dashboard ask bar. */
    dashboardSearch: DashboardSearch
  }
}

/** Empty owner share of a dashboard occupant. */
export interface DashboardWidgetOwnerProps {
  /** Marker field: the occupant owns its own content and data. */
  children?: never
}

/** Metadata of one registered dashboard card or panel. */
export interface DashboardEntry {
  readonly id: string
  readonly order: number
  readonly label: string
}

/** Registered entries of the dashboard slots, ordered by `order`. */
export type DashboardEntries = {
  readonly metrics: ObservableSnapshot<readonly DashboardEntry[]>
  readonly widgets: ObservableSnapshot<readonly DashboardEntry[]>
}

/** The text of the ask bar and the one match rule of every search group. */
export interface DashboardSearchQuery {
  /** The trimmed text of the ask bar; never empty. */
  readonly text: string
  /**
   * Whether a text matches: each word of the query is in the text, without regard to case.
   * @param value - the text of a result, for example a chat title.
   * @returns `true` when the result matches.
   */
  matches(value: string): boolean
}

/** Props the page gives the glyph of a result. */
export interface SearchResultIconProps {
  readonly size: number
  readonly className?: string | undefined
}

/** One search result. */
export interface SearchResult {
  /** Unique in its group. */
  readonly id: string
  readonly title: string
  /** A second line, for example "Running" or the description of an agent. */
  readonly detail?: string
  readonly icon: ComponentType<SearchResultIconProps>
  /** Open the result; the page clears the ask bar first. */
  readonly open: () => void
}

/** One group of search results, for example the Chats of the dashboard or the Agents of the agent builder. */
export interface DashboardSearchGroup {
  /** Unique among the groups. */
  readonly id: string
  /** Place of the group; lower first. */
  readonly order: number
  /** @returns the group heading in the current locale. */
  readonly label: () => string
  /**
   * The results for a query, best first; the page shows the first five.
   * @param query - the text and the match rule.
   * @returns the matching results; empty hides the group.
   */
  readonly results: (query: DashboardSearchQuery) => readonly SearchResult[]
  /**
   * Observe the data behind `results`; the page subscribes only while the ask bar holds text.
   * @param listener - called after the data changed.
   * @returns the disposer.
   */
  readonly subscribe: (listener: () => void) => () => void
}

/** The registry of search groups. */
export interface DashboardSearch {
  /**
   * Add a search group; register it as an effect.
   * @param group - the group.
   * @returns the disposer.
   */
  register(group: DashboardSearchGroup): () => void
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
