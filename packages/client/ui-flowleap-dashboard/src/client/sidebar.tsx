/**
 * The dashboard's layers of the OS sidebar: the Search action (`sidebar.actions`), the app launcher glyphs
 * (`sidebar.panellist`), and the Pinned section (`sidebar.sections`) over the pinned chats.
 */

import { useMemo } from 'react'
import {
  IconAgentPresetOutlineRegular, IconFlatListOutlineRegular, IconGaugeOutlineRegular, IconPinOutlineRegular,
  IconSearchOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRowOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NS } from './locales.ts'
import type { OpenSessionInjected } from './widgets.tsx'
import css from './Dashboard.module.css'

type Copy = PropsLocale<typeof NS>

/** Props of an app launcher glyph. */
export type AppIconProps = Pick<PropsRuntime<'sidebar.panellist'>, 'size'>

/** Dashboard launcher glyph. */
export function DashboardIcon({ size }: AppIconProps) {
  return <IconGaugeOutlineRegular size={size} />
}

/** Chats launcher glyph. */
export function ChatsIcon({ size }: AppIconProps) {
  return <IconFlatListOutlineRegular size={size} />
}

/** Agents launcher glyph. */
export function AgentsIcon({ size }: AppIconProps) {
  return <IconAgentPresetOutlineRegular size={size} />
}

/** Injected share of the Search action. */
export interface SearchActionInjected {
  /** Open the dashboard and focus its ask bar. */
  readonly onSearch: () => void
}

/** Props of the Search action. */
export type SearchActionProps = SidebarRowOwnerProps & Copy & InjectFace<SearchActionInjected>

/**
 * Render the Search row; on the rail it is the glyph with a tooltip.
 * @param props - the row classes, the column state, the search action, and copy.
 * @returns the row.
 */
export function SearchAction({ wide, rowClassName, glyphClassName, titleClassName, onSearch, t }: SearchActionProps) {
  return (
    <Tooltip label={t('sidebar.search')} delayMs={500} disabled={wide}>
      <button type="button" className={rowClassName} aria-label={t('sidebar.search')} onClick={onSearch}>
        <span className={glyphClassName} aria-hidden="true"><IconSearchOutlineRegular size={wide ? 16 : 18} /></span>
        {wide && <span className={titleClassName}>{t('sidebar.search')}</span>}
      </button>
    </Tooltip>
  )
}

/** Props of the Pinned section. */
export type PinnedSectionProps = SidebarRowOwnerProps & Pick<PropsRuntime<'sidebar.sections'>, 'useSessions' | 'useWorkspaces'>
  & Copy & InjectFace<OpenSessionInjected>

/**
 * Render the pinned chats, most recently pinned first; the rail shows no section.
 * @param props - the row classes, the column state, the Session and Workspace lists, the open action, and copy.
 * @returns the section, or nothing on the rail.
 */
export function PinnedSection({
  wide, rowClassName, glyphClassName, titleClassName, useSessions, useWorkspaces, onOpenSession, t,
}: PinnedSectionProps) {
  const pinnedIds = useWorkspaces(snapshot => snapshot.pinnedSessionIds)
  const byId = useSessions(list => list.byId)
  const pinned = useMemo(() => pinnedIds.flatMap((id: SessionId) => {
    const summary = byId[id]
    return summary === undefined ? [] : [{ id, title: summary.displayTitle }]
  }), [pinnedIds, byId])
  if (!wide) return null
  return (
    <section className={css.pinned} aria-label={t('sidebar.pinned')}>
      <h2 className={css.pinnedHeading}>{t('sidebar.pinned')}</h2>
      {pinned.length === 0 && <p className={css.pinnedEmpty}>{t('sidebar.pinned.empty')}</p>}
      {pinned.map(row => (
        <button key={row.id} type="button" className={rowClassName} onClick={() => { onOpenSession(row.id) }}>
          <span className={glyphClassName} aria-hidden="true"><IconPinOutlineRegular size={16} /></span>
          <span className={titleClassName}>{row.title}</span>
        </button>
      ))}
    </section>
  )
}
