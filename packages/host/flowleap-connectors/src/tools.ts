/**
 * The office-tool contract (`OfficeToolDefinition`, the shape `@flowleap/connectors`
 * is adopting in slice C2a) and the one registration seam that turns such
 * definitions into dsh tools: Zod input validation, the connectors bound to the
 * caller's signal, and a missing-key answer that names the settings card
 * instead of throwing.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition as DshToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { DataKeysRequiredError, ProviderKeyInvalidError, type Connectors } from '@flowleap/connectors'
import { z } from 'zod'
import { CONNECTOR_LABELS, CONNECTOR_OF_PROVIDER } from './credentials.ts'
import type { BoundConnectorHost } from './host.ts'
import type { ConnectorId } from './types.ts'

/** What a tool handler receives beside its validated input. */
export interface OfficeToolContext {
  /** The bound library clients. */
  connectors: Connectors
  /** The caller's cancellation, when the caller supplies one. */
  signal?: AbortSignal
  /** Opaque caller identity (an agent id); absent for an anonymous call. */
  caller?: string
}

/** Model-facing hints a definition may carry (the MCP tool-annotation vocabulary). */
export interface OfficeToolAnnotations {
  /** The tool reads and never writes. */
  readOnlyHint?: boolean
  /** The tool reaches outside the process. */
  openWorldHint?: boolean
}

/**
 * One office tool as the connector library defines it (slice C2a: `officeTools()`
 * returns these). The harness owns registration only; name, description, input
 * schema, and the data knowledge in both stay with the library.
 */
export interface OfficeToolDefinition<Input = unknown> {
  /** Model-facing name: the backend tool name, no prefix. */
  readonly name: string
  /** Model-facing description. */
  readonly description: string
  /** Input schema; the registry validates every call against it. */
  readonly input: z.ZodType<Input>
  /** Optional model-facing hints. */
  readonly annotations?: OfficeToolAnnotations
  /** Backend-owned access class (a plan gate); recorded, not interpreted, by the harness. */
  readonly access?: string
  /**
   * Run one validated call.
   * @param input - the validated input.
   * @param ctx - the connectors, the caller's signal, and the caller identity.
   * @returns the canonical JSON result.
   */
  handler(input: Input, ctx: OfficeToolContext): Promise<JsonValue>
}

/** The canonical result of a call that could not run for want of a key (a type alias, so it is a `JsonValue`). */
export type MissingCredentialResult = {
  /** Discriminant. */
  error: 'missing_credentials'
  /** The connector whose key is missing or rejected. */
  connector: ConnectorId
  /** The text the model sees: what is missing and where to add it. */
  message: string
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
 * Derive the JSON Schema the model sees from a definition's Zod input.
 * @param definition - the office tool.
 * @returns a JSON Schema object (draft 2020-12 vocabulary, `$schema` removed).
 */
export function toolInputJsonSchema(definition: OfficeToolDefinition): Record<string, unknown> {
  const { $schema: _dropped, ...schema } = z.toJSONSchema(definition.input, { io: 'input' })
  return schema
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
export function toDshTool(definition: OfficeToolDefinition, connectors: Connectors, bound: BoundConnectorHost): DshToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    parameters: toolInputJsonSchema(definition),
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: renderText(value) }],
    },
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const parsed = definition.input.safeParse(args)
      if (!parsed.success) {
        throw new Error(`${definition.name}: invalid arguments: ${parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'} ${issue.message}`).join('; ')}`)
      }
      const context: OfficeToolContext = {
        connectors,
        signal: exec.signal,
        ...exec.agent === undefined ? {} : { caller: exec.agent.id },
      }
      try {
        // The library's results carry `undefined` members; the registry
        // requires lossless JSON, so one JSON round trip drops them.
        return JSON.parse(JSON.stringify(await bound.withSignal(exec.signal, () => definition.handler(parsed.data, context)))) as JsonValue
      } catch (error) {
        if (error instanceof DataKeysRequiredError) return missingCredential(CONNECTOR_OF_PROVIDER[error.provider === 'epo' ? 'epoOps' : 'usptoOdp'])
        if (error instanceof ProviderKeyInvalidError) return missingCredential(CONNECTOR_OF_PROVIDER[error.provider === 'epo' ? 'epoOps' : 'usptoOdp'], true)
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
 * @param definitions - the office tools; `officeTools()` from the library once C2a lands.
 * @returns the disposer unregistering every tool.
 */
export function registerOfficeTools(
  ctx: Context,
  connectors: Connectors,
  bound: BoundConnectorHost,
  definitions: readonly OfficeToolDefinition[],
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
