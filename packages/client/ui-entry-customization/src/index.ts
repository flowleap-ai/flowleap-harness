/** Host companion for the browser entry-customization plugin: embeds the validated menu-row switches in browser pages. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ENTRY_CUSTOMIZATION_GLOBAL, type Config } from './config.ts'

export { Config } from './config.ts'

/**
 * Embed the menu-row switches in browser pages.
 * @param ctx - Host context serving browser pages.
 * @param config - Switches adopted when the page loads.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: ENTRY_CUSTOMIZATION_GLOBAL, value: config })
  })
}
