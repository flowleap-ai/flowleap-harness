/**
 * Schedule catalog plugin, node half: embeds the validated Automation tasks page switches in browser pages. Schedule
 * catalog behavior exists only in the browser entry.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SCHEDULE_PAGE_GLOBAL, type Config } from './config.ts'

export { Config } from './config.ts'

/**
 * Embed the Automation tasks page switches in browser pages.
 * @param ctx - Host context serving browser pages.
 * @param config - Switches adopted when the page loads.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: SCHEDULE_PAGE_GLOBAL, value: config })
  })
}
