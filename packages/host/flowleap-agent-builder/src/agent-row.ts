/**
 * The per-agent row of an agent preset: the instructions and, in the context mode, the full file text as system-prompt
 * sections; in the search mode, the search and read tools; and a restriction that hides the tools of the connectors
 * the agent did not choose. The row reads its agent's revision once, at activation; a later change registers a new
 * preset revision.
 * @module @deepseek-ai/dsh-flowleap-agent-builder/agent
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from './catalog.ts'
import { deniedTool, restrictConnectors } from './connectors.ts'
import { readAgentFileTool, searchAgentFilesTool } from './tools.ts'
import type { AgentId } from './types.ts'

/** Cordis plugin name. */
export const name = 'flowleap-agent'

/** The catalog, the prompt sections and the tool registry. */
export const inject = ['flowleapAgentCatalog', 'systemPrompt', 'tools']

/** Name of the instructions section. */
export const INSTRUCTIONS_SECTION_NAME = 'flowleap:agent-instructions'
/** Order of the instructions section: after the Patent Agent persona (0) and the key-state section (1). */
export const INSTRUCTIONS_SECTION_ORDER = 2
/** Name of the files section. */
export const FILES_SECTION_NAME = 'flowleap:agent-files'
/** Order of the files section: right after the instructions. */
export const FILES_SECTION_ORDER = 3

/** Row config; the agent builder plugin writes it from its own config. */
export interface Config {
  /** The agent this preset composes. */
  agent: string
  /** Most hits one `search_agent_files` call returns. */
  maxSearchResults: number
  /** Most pages one `read_agent_file` call returns. */
  maxReadLocations: number
  /** Most characters of page text one `read_agent_file` call returns. */
  maxReadChars: number
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  agent: z.string().required(),
  maxSearchResults: z.number().step(1).min(1).max(50).required(),
  maxReadLocations: z.number().step(1).min(1).max(100).required(),
  maxReadChars: z.number().step(1).min(1).required(),
})

/**
 * Compose one agent revision into the preset scope.
 * @param ctx - the preset row context, scoped to the preset revision.
 * @param config - the agent id and the tool bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const id = brandString<AgentId>(config.agent)
  const revision = ctx.flowleapAgentCatalog.revision(id)
  ctx.effect(() => ctx.systemPrompt.section({
    name: INSTRUCTIONS_SECTION_NAME, order: INSTRUCTIONS_SECTION_ORDER, text: () => revision.instructionsText, interpolate: false,
  }), 'flowleap-agent: instructions section')
  const filesText = revision.filesText
  if (filesText !== undefined) {
    ctx.effect(() => ctx.systemPrompt.section({
      name: FILES_SECTION_NAME, order: FILES_SECTION_ORDER, text: () => filesText, interpolate: false,
    }), 'flowleap-agent: files section')
  }
  if (revision.mode === 'search' && filesText !== undefined) {
    const reader = {
      search: (query: string) => ctx.flowleapAgentCatalog.search(id, query, config.maxSearchResults),
      read: (file: string, from: number, to: number) => ctx.flowleapAgentCatalog.readFile(id, file, from, to),
    }
    ctx.effect(() => ctx.tools.register(searchAgentFilesTool(reader)), 'flowleap-agent: search_agent_files')
    ctx.effect(() => ctx.tools.register(readAgentFileTool(reader, config.maxReadLocations, config.maxReadChars)), 'flowleap-agent: read_agent_file')
  }
  restrictConnectors(ctx, deniedTool(revision.connectors))
}
