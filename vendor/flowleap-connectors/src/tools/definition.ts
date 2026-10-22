/*---------------------------------------------------------------------------------------------
 *  The tool definition contract (ADR 0019, slice C2a).
 *
 *  An office tool is defined ONCE, here in the package, and registered by both
 *  hosts under the same name (ADR 0019 decisions 1 and 5): the backend wraps
 *  each definition in its own registry entry (access tier, rate limit, the
 *  tool gate) and the harness plugin registers it as a native tool. The
 *  definition carries what both hosts publish — the name, the description
 *  text, the zod input schema (defaults included) and the MCP annotations —
 *  and the handler, which reaches the office clients through a
 *  {@link ToolContext}.
 *
 *  What a host decides stays out of the definition: who may call the tool,
 *  how often, what it costs, which transport carries the result. The one
 *  host-facing fact a definition states is {@link ToolAccess}: the credential
 *  the tool spends, so a host can show the right settings card or key-gate
 *  the call before the handler runs.
 *--------------------------------------------------------------------------------------------*/

import { z, type ZodType } from 'zod';
import type { Connectors } from '../index.js';

/**
 * The credential a tool needs: the office key its primary read spends.
 * `search_patents` is `epoOps` (its default provider); its `provider=uspto`
 * arm spends the ODP key instead, and the opt-in EPO enrichment of the ODP
 * tools (`enrich[]`) spends the OPS key beside it. `none`: no key at all
 * (OpenAlex, the query grammar reference).
 */
export type ToolAccess = 'epoOps' | 'usptoOdp' | 'semanticScholar' | 'none';

/**
 * MCP tool annotations. Every FlowLeap tool is read-only, so the two hints are
 * fixed; the title is the human name a connector directory shows.
 */
export interface ToolAnnotations {
	readonly title: string;
	readonly readOnlyHint: true;
	readonly destructiveHint: false;
}

/**
 * Who called the tool, in host-neutral terms: the identity facts a host has
 * and a tool may need for its text. The backend passes the signed-in user id
 * and the request id; the harness may pass nothing. No office tool reads it
 * today — the compound tools pass it through unchanged.
 */
export interface ToolCaller {
	/** The host's id of the signed-in user (the backend: the Clerk user id). */
	readonly userId?: string;
	/** The caller's request id, for logs and audit rows. */
	readonly requestId?: string;
}

/** What a handler runs with: the office clients of its host, and the call's scope. */
export interface ToolContext {
	/** The clients, from `createConnectors(host)`; `connectors.host` is the host itself. */
	readonly connectors: Connectors;
	/** Aborted when the caller is gone (the HTTP client hung up, the user cancelled). */
	readonly signal?: AbortSignal;
	readonly caller?: ToolCaller;
}

/** One tool, as both hosts register it. */
export interface ToolDefinition<I = unknown, O = unknown> {
	/** The backend's tool name, unchanged in every host (ADR 0019 decision 5), e.g. `search_patents`. */
	readonly name: string;
	/** The exact description text the backend serves. */
	readonly description: string;
	/** The zod input schema, defaults included; the source of the JSON schema every host publishes. */
	readonly input: ZodType<I>;
	readonly annotations?: ToolAnnotations;
	/** The credential the tool needs. */
	readonly access?: ToolAccess;
	handler(input: I, ctx: ToolContext): Promise<O>;
}

/** The JSON Schema of a tool input, as `z.toJSONSchema` writes it. */
export type JsonSchema = z.core.JSONSchema.BaseSchema;

/**
 * The JSON Schema a host publishes for a tool's input — what `GET /v1/tools`
 * lists, what MCP `tools/list` carries as `inputSchema`, and what the harness
 * registers. One call, so the two hosts publish the same bytes. Takes any
 * definition with a zod `input` (the backend's registry entries too).
 */
export function toolInputJsonSchema(definition: Pick<ToolDefinition, 'input'>): JsonSchema {
	return z.toJSONSchema(definition.input);
}
