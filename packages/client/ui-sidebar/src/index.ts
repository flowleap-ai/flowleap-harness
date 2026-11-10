/**
 * Host loader entry for the browser-side sidebar plugin. FlowLeap fork modification: it embeds the validated panel
 * groups in browser pages; upstream provides no host-side behavior.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SIDEBAR_PAGE_GLOBAL, type Config } from './config.ts'

export { Config } from './config.ts'

/**
 * Embed the sidebar layout in browser pages.
 * @param ctx - Host context serving browser pages.
 * @param config - Panel groups and foot panels adopted when the page loads.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: SIDEBAR_PAGE_GLOBAL, value: config })
  })
}
