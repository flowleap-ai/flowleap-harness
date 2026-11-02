/** Display switches shared by the Host configuration and the browser page. */
import z from '@deepseek-ai/schemastery'

/** Page global that carries the validated display switches to the browser. */
export const PLUGIN_MANAGER_PAGE_GLOBAL = '__DSH_PLUGIN_MANAGER_PAGE_CONFIG__'

/** What the Plugins page shows of a plugin's technical identity. */
export interface PageConfig {
  /**
   * Show package names (`@deepseek-ai/dsh-…`), row ids, and install specs on the cards and plugin pages. False shows only
   * the product name, from the package's display title or, without one, its unscoped name in words.
   */
  packageNames: boolean
}

/** Validated display switches. */
export const PageConfig: z<Partial<PageConfig>, PageConfig> = z.object({
  packageNames: z.boolean().default(true),
})
