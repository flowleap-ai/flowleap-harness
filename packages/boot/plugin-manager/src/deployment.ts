/**
 * The deployment switches a Plugins page needs at its first render. The Host sends them as a page global, because they
 * are static configuration: the page then offers only the controls the Host accepts, with no read to wait for. This
 * module runs in the browser too, through the package's `./deployment` entry.
 * @module @deepseek-ai/dsh-plugin-manager/deployment
 */

import z from '@deepseek-ai/schemastery'
import type { PluginDeployment as Deployment } from './types.ts'

/** Page global that carries the deployment switches to the browser. */
export const PLUGIN_DEPLOYMENT_GLOBAL = '__DSH_PLUGIN_MANAGER_DEPLOYMENT__'

/** Validated deployment switches; an absent global reads as a writable deployment that installs packages. */
export const PluginDeployment: z<Partial<Deployment>, Deployment> = z.object({
  readOnly: z.boolean().default(false),
  installBundles: z.boolean().default(true),
})
