/** The New agent row after the presets in the new-session preset menu. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import { IconPlusOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AgentBuilder.module.css'

/** Form entry supplied by the plugin. */
export interface NewAgentMenuItemInjected {
  /** Open the agent form on a new agent. */
  openCreate: () => void
}

type NewAgentMenuItemProps = PropsRuntime<'agentPreset.menu.actions'>
  & PropsLocale<'flowleapAgentBuilder'> & InjectFace<NewAgentMenuItemInjected>

/**
 * Close the preset menu, then open the agent form.
 * @param props - locale, dismissal, and the form entry.
 * @returns one menu row in its own group.
 */
export function NewAgentMenuItem({ t, onDismiss, openCreate }: NewAgentMenuItemProps) {
  return (
    <MenuItemButton separatorBefore icon={<IconPlusOutlineRegular size={14} />} onSelect={() => {
      onDismiss()
      openCreate()
    }}>
      <span className={css.menuCopy}>
        <span>{t('menu.new')}</span>
        <span className={css.menuDescription}>{t('menu.newDescription')}</span>
      </span>
    </MenuItemButton>
  )
}
