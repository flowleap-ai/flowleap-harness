/**
 * Skills settings, browser half: the "Skills" settings section with one
 * read-only card per skill of the agent, its source, description, replace
 * note, and full text on request, and the skill files with faults. It reads
 * through the `skillInventory` Remote.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SkillsSection, type SkillsSectionInjected } from './SkillsSection.tsx'
import { SkillsStore } from './skills-store.ts'
import { de, en, es, fr, ja, pt, ru, zh, type SkillsLocaleKey } from './locales.ts'

export type { SkillsSectionController, SkillsSectionInjected, SkillsSectionProps } from './SkillsSection.tsx'
export type { SkillCardProps, Translate } from './SkillCard.tsx'
export type { SkillsInventoryState, SkillsState, SkillTextState } from './skills-store.ts'
export type { SkillsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills settings section copy. */
    'settings.skills': SkillsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skills'

/** Required services (cordis fiber inject); `remote.skillInventory` parks the plugin until the Host serves the namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.skillInventory']

/**
 * Register the dictionaries and the Skills settings section.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-settings-skills: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = new SkillsStore(ctx)
  const injected = (): SkillsSectionInjected => ({ controller, hooks: { skills: controller.store } })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'skills', order: 17, label: () => t('nav'), locale: NS, inject: injected,
  }, SkillsSection))
}
