/** The Edit agent row in the new-session preset menu, shown while the chosen preset is one of the user's agents. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import { IconEditOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentId, AgentSummary } from '@deepseek-ai/dsh-flowleap-agent-builder/types'
import css from './AgentBuilder.module.css'

/** Agent list and form entry supplied by the plugin. */
export interface EditAgentMenuItemInjected {
  hooks: {
    agents: SnapshotStore<readonly AgentSummary[]>
  }
  /** Open the agent form on one agent. */
  openEdit: (id: AgentId) => Promise<void>
}

/** Full component props. */
export type EditAgentMenuItemProps = PropsRuntime<'agentPreset.menu.actions'>
  & PropsLocale<'flowleapAgentBuilder'> & InjectFace<EditAgentMenuItemInjected>

/**
 * Close the preset menu, then open the agent form on the chosen agent. A firm agent is read only and has no row.
 * @param props - locale, dismissal, the chosen preset, the agents, and the form entry.
 * @returns one menu row, or null when the chosen preset is not an agent the user can change.
 */
export function EditAgentMenuItem({ t, onDismiss, currentId, useAgents, openEdit }: EditAgentMenuItemProps) {
  const agent = useAgents(agents => agents.find(row => row.id === currentId && !row.readOnly))
  if (agent === undefined) return null
  return (
    <MenuItemButton icon={<IconEditOutlineRegular size={14} />} onSelect={() => {
      onDismiss()
      void openEdit(agent.id)
    }}>
      <span className={css.menuCopy}>
        <span>{t('menu.edit', { name: agent.name })}</span>
        <span className={css.menuDescription}>{t('menu.editDescription')}</span>
      </span>
    </MenuItemButton>
  )
}
