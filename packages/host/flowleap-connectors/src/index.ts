/**
 * In-process FlowLeap patent-data connectors (ADR 0019, slice C2). One row mounts
 * the `@flowleap/connectors` library over the dsh seams: `ctx.credentials`
 * records hold the firm's EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys,
 * the library's 33 office tools register on `ctx.tools` under their backend names, and the
 * `flowleapConnectors` Remote serves the settings cards and the first-run wizard.
 *
 * See packages/host/flowleap-connectors/README.md.
 * @module @deepseek-ai/dsh-flowleap-connectors
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-tools'
import { createConnectors, officeTools } from '@flowleap/connectors'
import { FlowleapConnectorsController } from './controller.ts'
import { createCredentialStore } from './credentials.ts'
import { createConnectorHost } from './host.ts'
import { registerOfficeTools } from './tools.ts'

export { FlowleapConnectorsController } from './controller.ts'
export type { FlowleapConnectorsControllerOptions } from './controller.ts'
export {
  CONNECTOR_LABELS, CONNECTOR_OF_PROVIDER, CREDENTIAL_SCOPE, PROVIDER_OF_CONNECTOR,
  createCredentialStore, lookupCredentials, validateConnectorFields,
} from './credentials.ts'
export type { ConnectorCredentialStore } from './credentials.ts'
export { LruCache, createConnectorHost } from './host.ts'
export type { BoundConnectorHost, ConnectorHostOptions } from './host.ts'
export { missingCredential, modelInputSchema, registerOfficeTools, toDshTool } from './tools.ts'
export type { MissingCredentialResult } from './tools.ts'
export * from './types.ts'

/** Cordis plugin name; also the credential record scope. */
export const name = 'flowleap-connectors'

/** The tool registry the office tools join and the credential seam the records live in. */
export const inject = ['tools', 'credentials']

/** Plugin config. */
export interface Config {
  /** Entries the in-memory result cache holds before evicting the least recently used one. */
  cacheEntries: number
  /** Office tools from the library that this host does not register, by backend name. */
  excludeTools: string[]
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  cacheEntries: z.number().step(1).min(1).default(500),
  excludeTools: z.array(String).default([]),
})

/**
 * Mount the library, register the office tools, and expose the Remote.
 * @param ctx - the mounting context, carrying `tools` and `credentials`.
 * @param config - cache size and the office tools to leave out.
 */
export function apply(ctx: Context, config: Config): void {
  const store = createCredentialStore(ctx.credentials)
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: config.cacheEntries })
  const connectors = createConnectors(bound.host)
  ctx.effect(() => registerOfficeTools(ctx, connectors, bound, officeTools().filter(definition => !config.excludeTools.includes(definition.name))), 'flowleap-connectors: office tools')
  ctx.plugin(FlowleapConnectorsController, { store, connectors, bound })
}
