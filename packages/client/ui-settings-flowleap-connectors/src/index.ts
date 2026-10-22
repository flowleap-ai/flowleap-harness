/**
 * Patent data connectors settings, node half: the durable wizard-dismissal
 * preference the browser half reads and writes through the settings form of
 * this row. The browser half owns the cards and the wizard through
 * `exports["./client"]`.
 * @module @deepseek-ai/dsh-client-ui-settings-flowleap-connectors
 */
import type {} from '@deepseek-ai/dsh-settings'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export { WIZARD_DISMISSED_FIELD, WIZARD_SETTINGS_NAMESPACE } from './wizard-settings.ts'

/** Durable wizard preference projected to the browser. */
export interface Config {
  /** Whether the first-run connector wizard was saved or skipped once; it never shows again. */
  wizardDismissed: Volatile<boolean>
}

/** Live wizard preference. */
export const Config = z.object({
  wizardDismissed: z.boolean().default(false).volatile(),
})

/**
 * Keep the row's own instance off the generated Settings pages; the browser half owns its surface.
 * @param ctx - plugin context used for the settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
