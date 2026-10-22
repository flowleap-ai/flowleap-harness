/**
 * In-process FlowLeap patent-data connectors (ADR 0019, slice C2). One row mounts
 * the `@flowleap/connectors` library over the dsh seams: `ctx.credentials`
 * records hold the firm's EPO OPS, USPTO ODP, Semantic Scholar and Mistral keys,
 * the office tools register on `ctx.tools` under their backend names, and the
 * `flowleapConnectors` Remote serves the settings cards and the first-run wizard.
 *
 * See packages/host/flowleap-connectors/README.md.
 * @module @deepseek-ai/dsh-flowleap-connectors
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-tools'
import { createConnectors } from '@flowleap/connectors'
import { FlowleapConnectorsController } from './controller.ts'
import { createCredentialStore } from './credentials.ts'
import { createConnectorHost } from './host.ts'
import { interimOfficeTools } from './interim-tools.ts'
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
export { interimOfficeTools } from './interim-tools.ts'
export { missingCredential, registerOfficeTools, toDshTool, toolInputJsonSchema } from './tools.ts'
export type { MissingCredentialResult, OfficeToolAnnotations, OfficeToolDefinition, OfficeToolContext } from './tools.ts'
export * from './types.ts'

/** Cordis plugin name; also the credential record scope. */
export const name = 'flowleap-connectors'

/** The tool registry the office tools join and the credential seam the records live in. */
export const inject = ['tools', 'credentials']

/** Plugin config. */
export interface Config {
  /** Entries the in-memory result cache holds before evicting the least recently used one. */
  cacheEntries: number
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  cacheEntries: z.number().step(1).min(1).default(500),
})

/**
 * Mount the library, register the office tools, and expose the Remote.
 * @param ctx - the mounting context, carrying `tools` and `credentials`.
 * @param config - cache size.
 */
export function apply(ctx: Context, config: Config): void {
  const store = createCredentialStore(ctx.credentials)
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: config.cacheEntries })
  const connectors = createConnectors(bound.host)
  // INTERIM: `interimOfficeTools()` stands in for `officeTools()` from
  // `@flowleap/connectors` until slice C2a lands; the seam does not change.
  ctx.effect(() => registerOfficeTools(ctx, connectors, bound, interimOfficeTools()), 'flowleap-connectors: office tools')
  ctx.plugin(FlowleapConnectorsController, { store, connectors, bound })
}
