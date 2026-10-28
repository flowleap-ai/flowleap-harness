/**
 * Host owner of the `flowleapAgents` Remote namespace: the agent list, one agent, the connector rows, and the create,
 * change and delete calls of the agent form. Each argument is validated here, at the wire.
 * @module
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { AgentCatalog } from './catalog.ts'
import { isAgentId, MAX_DESCRIPTION_LENGTH, MAX_INSTRUCTIONS_LENGTH, MAX_NAME_LENGTH } from './definition.ts'
import { CONNECTOR_CHOICE_IDS, type AgentId, type AgentSummary, type AgentView, type ConnectorChoice } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `flowleapAgents` Remote namespace. */
    flowleapAgents: FlowleapAgentsController
  }
}

/** What the controller needs from the plugin. */
export interface FlowleapAgentsControllerOptions {
  /** The agents. */
  readonly catalog: AgentCatalog
}

const inputSchema = z.strictObject({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH),
  instructions: z.string().trim().min(1).max(MAX_INSTRUCTIONS_LENGTH),
  connectors: z.array(z.enum(CONNECTOR_CHOICE_IDS)).refine(ids => new Set(ids).size === ids.length, 'connectors repeat an id'),
})

function agentIdOf(value: unknown): AgentId {
  if (typeof value !== 'string' || !isAgentId(value)) {
    throw new RemoteError('flowleap-agents/invalid', 'the agent id is not valid', { field: 'id', reason: 'not an agent id' })
  }
  return brandString<AgentId>(value)
}

/** Host service backing the generated `ctx.remote.flowleapAgents` namespace. */
export class FlowleapAgentsController extends TypertRemoteService {
  static inject = ['remoteAccess']

  private readonly catalog: AgentCatalog

  /**
   * @param ctx - Host context.
   * @param options - the agents.
   */
  constructor(ctx: Context, options: FlowleapAgentsControllerOptions) {
    super(ctx, 'flowleapAgents')
    this.catalog = options.catalog
  }

  /**
   * Every agent of this Host, the firm agents included.
   * @returns the summaries, by name.
   */
  @Remote
  async list(): Promise<AgentSummary[]> {
    await this.catalog.ready()
    return this.catalog.list()
  }

  /**
   * One agent with its fields, files and mode.
   * @param id - the agent.
   * @returns the view.
   * @throws RemoteError `flowleap-agents/not-found` for an unknown agent.
   */
  @Remote
  async read(id: AgentId): Promise<AgentView> {
    await this.catalog.ready()
    return this.catalog.read(agentIdOf(id))
  }

  /**
   * The connector rows the form offers, each with whether it can answer on this Host.
   * @returns one row per choice.
   */
  @Remote
  connectors(): Promise<ConnectorChoice[]> {
    return this.catalog.connectors()
  }

  /**
   * Create an agent (no `id`) or change one. The connectors must be ids that `connectors()` lists.
   * @param input - the form fields.
   * @returns the agent after the change.
   * @throws RemoteError `flowleap-agents/invalid` for a bad field, `flowleap-agents/not-found` or
   *   `flowleap-agents/read-only` for an id that cannot change.
   */
  @Remote
  async save(input: { id?: AgentId; name: string; description: string; instructions: string; connectors: string[] }): Promise<AgentView> {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path.join('.') || 'input'
      const reason = issue?.message ?? 'invalid'
      throw new RemoteError('flowleap-agents/invalid', `${field}: ${reason}`, { field, reason })
    }
    const { id, name, description, instructions, connectors } = parsed.data
    await this.catalog.ready()
    return await this.catalog.save(id === undefined ? undefined : agentIdOf(id), { name, description, connectors }, instructions)
  }

  /**
   * Delete one agent with its files.
   * @param id - the agent.
   * @throws RemoteError `flowleap-agents/not-found` or `flowleap-agents/read-only`.
   */
  @Remote
  async delete(id: AgentId): Promise<void> {
    await this.catalog.ready()
    await this.catalog.delete(agentIdOf(id))
  }

  /**
   * Remove one file of one agent.
   * @param id - the agent.
   * @param name - the file name.
   * @throws RemoteError `flowleap-agents/not-found` or `flowleap-agents/read-only`.
   */
  @Remote
  async removeFile(id: AgentId, name: string): Promise<void> {
    if (typeof name !== 'string') throw new RemoteError('flowleap-agents/invalid', 'the file name is not a string', { field: 'name', reason: 'not a string' })
    await this.catalog.ready()
    await this.catalog.removeFile(agentIdOf(id), name)
  }
}

export default FlowleapAgentsController
