/**
 * Dashboard slot contract. The dashboard page declares two list slots, so each FlowLeap app adds its own surfaces:
 * `dashboard.metric` for a metric card and `dashboard.widget` for a panel. The page draws the frame and the
 * registration `label` as the heading; the occupant draws only the body and reads its own data.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One metric card on the dashboard: `label` is the card title, `order` its place. */
    'dashboard.metric': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
    /** One panel on the dashboard: `label` is the panel heading, `order` its place. */
    'dashboard.widget': { kind: 'list'; scope: 'root'; owner: DashboardWidgetOwnerProps }
  }
}

/** Empty owner share of a dashboard occupant. */
export interface DashboardWidgetOwnerProps {
  /** Marker field: the occupant owns its own content and data. */
  children?: never
}

/** Metadata of one registered metric card or panel. */
export interface DashboardEntry {
  readonly id: string
  readonly order: number
  readonly label: string
}

/** Registered entries of both dashboard slots, ordered by `order`. */
export type DashboardEntries = {
  readonly metrics: ObservableSnapshot<readonly DashboardEntry[]>
  readonly widgets: ObservableSnapshot<readonly DashboardEntry[]>
}
