/** Host configuration and page bootstrap for Models credential onboarding. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { type Config, ONBOARDING_CONFIG_GLOBAL } from './onboarding-config.ts'

export { Config } from './onboarding-config.ts'

/** The package whose Loader rows `managed: true` requires to set `fixedRoutes: true`. */
const PI_AI_PACKAGE = '@deepseek-ai/dsh-llm-pi-ai'

/**
 * Refuse `managed: true` while an enabled `llm-pi-ai` row does not fix its routes: the page would hide controls that
 * the Host still accepts. A composition without a Loader has no rows to check.
 * @param ctx - Host context.
 * @throws Error naming the row that does not set `fixedRoutes: true`.
 */
function assertFixedRoutes(ctx: Context): void {
  for (const entry of ctx.get('loader')?.entries() ?? []) {
    const { name, disabled, id } = entry.options
    const config: unknown = entry.options.config
    if (name !== PI_AI_PACKAGE || disabled === true) continue
    if (typeof config === 'object' && config !== null && 'fixedRoutes' in config && config.fixedRoutes === true) continue
    throw new Error(`ui-settings-models: managed: true requires the ${PI_AI_PACKAGE} row "${id}" to set fixedRoutes: true`)
  }
}

/**
 * Publish the credential-onboarding choice before browser plugins activate.
 * @param ctx - Host context collecting the page's initialization data.
 * @param config - plugin options with schema defaults applied by the Loader.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.managed) assertFixedRoutes(ctx)
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: ONBOARDING_CONFIG_GLOBAL,
      value: { credentialOnboarding: config.credentialOnboarding, managed: config.managed },
    })
  })
}
