/** The Agents group of the FlowLeap dashboard search results: the agents whose name or description matches. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-flowleap-dashboard/client'
import { Button, IconAgentPresetOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentId, AgentSummary } from '@deepseek-ai/dsh-flowleap-agent-builder/types'
import css from './AgentBuilder.module.css'

/** Most agents the group lists. */
const SEARCH_ROWS = 5

/** Agent list and chat start supplied by the plugin. */
export interface AgentSearchInjected {
  hooks: {
    agents: SnapshotStore<readonly AgentSummary[]>
  }
  /**
   * Open a new chat that runs the agent.
   * @param id - the agent; also the id of its agent preset.
   */
  onStartAgent: (id: AgentId) => void
}

/** Full component props. */
export type AgentSearchProps = PropsRuntime<'dashboard.search'> & PropsLocale<'flowleapAgentBuilder'> & InjectFace<AgentSearchInjected>

/**
 * Render the agents whose name or description matches the query; each row opens a new chat with that agent.
 * @param props - the match rule, the pick report, the agents, the chat start, and copy.
 * @returns the group, or nothing when no agent matches.
 */
export function AgentSearch({ matches, onPicked, useAgents, onStartAgent, t }: AgentSearchProps) {
  const agents = useAgents(rows => rows)
  const found = agents.filter(agent => matches(`${agent.name} ${agent.description}`))
  if (found.length === 0) return null
  return (
    <section aria-label={t('search.heading')}>
      <h3 className={css.searchHeading}>{t('search.heading')}</h3>
      <ul className={css.searchRows}>
        {found.slice(0, SEARCH_ROWS).map(agent => (
          <li key={agent.id}>
            <Button className={css.searchRow} aria-label={t('search.open', { name: agent.name })} onClick={() => {
              onPicked()
              onStartAgent(agent.id)
            }}>
              <IconAgentPresetOutlineRegular size={16} className={css.searchGlyph} />
              <span className={css.menuCopy}>
                <span>{agent.name}</span>
                <span className={css.menuDescription}>{agent.readOnly ? t('search.firm') : agent.description}</span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
