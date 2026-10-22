/**
 * The one registration seam between the connector library's office tools and
 * `ctx.tools`: each `ToolDefinition` of `@flowleap/connectors` (`officeTools()`)
 * becomes a dsh tool with Zod input validation, the connectors bound to the
 * caller's signal, and a missing-key answer that names the settings card
 * instead of throwing.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition as DshToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  DataKeysRequiredError, ProviderKeyInvalidError, ToolError, toolInputJsonSchema,
  type Connectors, type ToolAccess, type ToolContext, type ToolDefinition,
} from '@flowleap/connectors'
import { CONNECTOR_LABELS, CONNECTOR_OF_PROVIDER, PROVIDER_OF_CONNECTOR } from './credentials.ts'
import type { BoundConnectorHost } from './host.ts'
import type { ConnectorId } from './types.ts'

/** The canonical result of a call that could not run for want of a key (a type alias, so it is a `JsonValue`). */
export type MissingCredentialResult = {
  /** Discriminant. */
  error: 'missing_credentials'
  /** The connector whose key is missing or rejected. */
  connector: ConnectorId
  /** The text the model sees: what is missing and where to add it. */
  message: string
}

/** The connector a tool's `access` spends; `none` and an absent access spend nothing. */
const CONNECTOR_OF_ACCESS: Readonly<Record<ToolAccess, ConnectorId | undefined>> = {
  epoOps: 'epo-ops',
  usptoOdp: 'uspto-odp',
  semanticScholar: 'semantic-scholar',
  none: undefined,
}

/** Library error codes that mean "no usable key", by the connector they name. */
const MISSING_KEY_CODES: Readonly<Record<string, ConnectorId>> = {
  odp_api_key_missing: 'uspto-odp',
}

/**
 * The text answer for a connector without a usable key: names the key and the
 * settings card. Returned, never thrown, so the model reads a plain instruction.
 * @param connector - the connector.
 * @param rejected - true when a stored key was refused upstream rather than absent.
 * @returns the canonical result.
 */
export function missingCredential(connector: ConnectorId, rejected = false): MissingCredentialResult {
  const label = CONNECTOR_LABELS[connector]
  const message = rejected
    ? `${label} rejected the stored key. Replace it in Settings > Patent data connectors > ${label}.`
    : `${label} key not configured. Add it in Settings > Patent data connectors > ${label}, then call this tool again.`
  return { error: 'missing_credentials', connector, message }
}

/**
 * The JSON Schema the model sees for one tool: the library's own projection
 * (`toolInputJsonSchema`, the bytes the backend publishes) without the `$schema`
 * marker, which is not part of a tool declaration.
 * @param definition - the office tool.
 * @returns the JSON Schema object.
 */
export function modelInputSchema(definition: Pick<ToolDefinition, 'input'>): Record<string, unknown> {
  const { $schema: _dropped, ...schema } = toolInputJsonSchema(definition)
  return schema
}

/**
 * Whether a tool's key must be present before its handler runs. Semantic
 * Scholar is excluded: the academic search runs without a key, slower.
 * @param access - the tool's declared access.
 * @returns the connector to check, or `undefined` when the call may proceed without one.
 */
function gatedConnector(access: ToolAccess | undefined): ConnectorId | undefined {
  if (access === undefined || access === 'semanticScholar') return undefined
  return CONNECTOR_OF_ACCESS[access]
}

/** Map a library failure to the missing-credential answer, or `undefined` when it is another failure. */
function missingCredentialOf(error: unknown): MissingCredentialResult | undefined {
  if (error instanceof DataKeysRequiredError) return missingCredential(CONNECTOR_OF_PROVIDER[error.provider === 'epo' ? 'epoOps' : 'usptoOdp'])
  if (error instanceof ProviderKeyInvalidError) return missingCredential(CONNECTOR_OF_PROVIDER[error.provider === 'epo' ? 'epoOps' : 'usptoOdp'], true)
  if (error instanceof ToolError) {
    const connector = MISSING_KEY_CODES[error.code]
    if (connector !== undefined) return missingCredential(connector)
  }
  return undefined
}

/** Render a canonical value as model-facing text: the message of a key refusal, otherwise JSON. */
function renderText(value: JsonValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && !Array.isArray(value)
    && value['error'] === 'missing_credentials' && typeof value['message'] === 'string') {
    return value['message']
  }
  return JSON.stringify(value, null, 2)
}

/**
 * Adapt one office tool to the dsh tool registry.
 * @param definition - the office tool.
 * @param connectors - the shared library instance.
 * @param bound - the host's signal carrier.
 * @returns the unregistered dsh definition.
 */
export function toDshTool(definition: ToolDefinition, connectors: Connectors, bound: BoundConnectorHost): DshToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    parameters: modelInputSchema(definition),
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: renderText(value) }],
    },
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const parsed = definition.input.safeParse(args)
      if (!parsed.success) {
        throw new Error(`${definition.name}: invalid arguments: ${parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}`)
      }
      const gated = gatedConnector(definition.access)
      if (gated !== undefined && (await connectors.host.credentials(PROVIDER_OF_CONNECTOR[gated])).status !== 'available') {
        return missingCredential(gated)
      }
      const context: ToolContext = {
        connectors,
        signal: exec.signal,
        ...exec.agent === undefined ? {} : { caller: { userId: exec.agent.id } },
      }
      try {
        // The library's results carry `undefined` members; the registry
        // requires lossless JSON, so one JSON round trip drops them.
        return JSON.parse(JSON.stringify(await bound.withSignal(exec.signal, () => definition.handler(parsed.data, context)))) as JsonValue
      } catch (error) {
        const missing = missingCredentialOf(error)
        if (missing !== undefined) return missing
        if (error instanceof ToolError) throw new Error(`${definition.name}: ${error.code}: ${error.message}`, { cause: error })
        throw error
      }
    },
  }
}

/**
 * Register office tools on `ctx.tools`. All or nothing: a name conflict rolls
 * back the registrations made so far and rethrows.
 * @param ctx - the plugin context carrying `tools`.
 * @param connectors - the shared library instance.
 * @param bound - the host's signal carrier.
 * @param definitions - the office tools, `officeTools()` from the library.
 * @returns the disposer unregistering every tool.
 */
export function registerOfficeTools(
  ctx: Context,
  connectors: Connectors,
  bound: BoundConnectorHost,
  definitions: readonly ToolDefinition[],
): () => void {
  const disposers: (() => void)[] = []
  try {
    for (const definition of definitions) {
      disposers.push(ctx.tools.register(toDshTool(definition, connectors, bound)))
    }
  } catch (error) {
    for (const dispose of disposers) dispose()
    throw error
  }
  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
