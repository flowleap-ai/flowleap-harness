/**
 * FlowLeap agent builder (ticket #55): an attorney builds an agent from instructions, files and the connectors that
 * are set up, and the agent shows in the agent picker. Each agent is a folder (`agent.yaml`, `instructions.md`,
 * `files/`, `index.sqlite`) below `$DSH_HOME/agents`, plus the read-only firm folder when it exists. The plugin
 * registers one agent preset per folder: the base preset's plugin list and one row that adds the instructions, the
 * agent's files (in the system prompt, or through two tools above the size limit) and a restriction to the chosen
 * connectors. The `flowleapAgents` Remote and an upload route serve the agent form.
 *
 * See packages/host/flowleap-agent-builder/README.md.
 * @module @deepseek-ai/dsh-flowleap-agent-builder
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-client-connection'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { AGENT_ROW_MODULE, AgentCatalog, type CatalogOptions } from './catalog.ts'
import { FlowleapAgentsController } from './controller.ts'
import { handleAgentUpload } from './upload.ts'
import { MAX_READ_CHARS } from './tools.ts'
import { AGENT_UPLOAD_PATH } from './types.ts'

export { AGENT_ROW_MODULE, AgentCatalog } from './catalog.ts'
export type { AgentRevision, CatalogOptions } from './catalog.ts'
export { FLOWLEAP_MCP_PREFIX, deniedTool, officeToolChoices, restrictConnectors } from './connectors.ts'
export { FlowleapAgentsController } from './controller.ts'
export type { FlowleapAgentsControllerOptions } from './controller.ts'
export {
  MAX_DESCRIPTION_LENGTH, MAX_FILE_NAME_BYTES, MAX_INSTRUCTIONS_LENGTH, MAX_NAME_LENGTH, fileNameProblem, isAgentId, newAgentId,
  parseAgentYaml,
  renderAgentYaml,
} from './definition.ts'
export type { AgentDefinition, FileNameProblem } from './definition.ts'
export { extractText } from './extract.ts'
export {
  FILE_TEXT_CLOSE, FILE_TEXT_NOTICE, FILE_TEXT_OPEN, fenceFileText, locationLabel, locationMarker, neutralizeFileText,
} from './file-text.ts'
export type { FencedLocation } from './file-text.ts'
export type { Extraction, ParseStep } from './extract.ts'
export { parseFile } from './parse.ts'
export type { FileFailure, LocationText, ParseRequest, ParseResult } from './parse.ts'
export { parseInWorker, workerLimits } from './parse-thread.ts'
export type { ParseLimits } from './parse-thread.ts'
export { AGENT_INDEX_SCHEMA_VERSION, AgentIndex, ftsExpression } from './index-db.ts'
export type { LocationRow, SearchHit } from './index-db.ts'
export {
  INSTRUCTIONS_HEADING, agentMode, estimateTokens, renderContextFiles, renderInstructions,
  renderSearchFiles,
} from './mode.ts'
export {
  AGENT_YAML, FILES_DIR, FileTooLargeError, INDEX_SQLITE, INSTRUCTIONS_MD, PART_SUFFIX, hashFile, listFiles, readAgentFolders,
  moveAgentFolderAside, storeUpload, writeAgentFolder,
} from './store.ts'
export type { AgentFolder, AgentFolderProblem, StoredFile } from './store.ts'
export {
  MAX_READ_CHARS, READ_AGENT_FILE_NAME, SEARCH_AGENT_FILES_NAME, readAgentFileTool, renderHits, renderRead, searchAgentFilesTool,
} from './tools.ts'
export type { AgentFileReader, AgentFileToolBounds } from './tools.ts'
export { handleAgentUpload } from './upload.ts'
export * from './types.ts'

/** Cordis plugin name. */
export const name = 'flowleap-agent-builder'

/** The preset registry the agent presets join, and the Connection the upload route joins. */
export const inject = ['agentPresets', 'connection']

/** Plugin config. */
export interface Config {
  /** The agents root; absent for `$DSH_HOME/agents`. */
  root?: string
  /** The read-only firm agents folder; its agents load when it exists, and this Host never writes there. */
  firmRoot?: string
  /**
   * Largest indexed text of one agent, in estimated tokens (`ceil(chars / charsPerToken)`), that goes into the system
   * prompt in full; above it the agent searches its files.
   */
  contextLimitTokens: number
  /**
   * Characters counted as one token in the mode estimate. The default 4 is close for English, French and German prose;
   * a deployment whose agent files are mostly Chinese, Japanese or Korean sets 1, because those scripts take about one
   * token per character, and 4 would put four times the limit into the prompt.
   */
  charsPerToken: number
  /** Largest file one upload stores, in bytes. */
  maxFileBytes: number
  /** The preset whose plugin list each agent preset copies. */
  basePreset: string
  /** Roster order of the agent presets; the shipped presets use 0 to 3. */
  presetOrder: number
  /** Most hits one `search_agent_files` call returns. */
  maxSearchResults: number
  /** Most pages one `read_agent_file` call returns. */
  maxReadLocations: number
  /**
   * Most characters of page text one `read_agent_file` call returns; a TXT or MD file is one page, so one page can be
   * the whole file. The default 40000 (about 10000 tokens by the `ceil(chars / 4)` estimate) holds the default 10 pages
   * of a typical 3000-character PDF page. At most {@link MAX_READ_CHARS}.
   */
  maxReadChars: number
  /**
   * Wall-clock limit of reading one file in the extraction Worker, Worker start included, in milliseconds; over it the
   * Worker ends and the file fails with `timeout`. The default 120000 leaves room for a `maxPages` PDF on a slow disk.
   */
  extractTimeoutMs: number
  /**
   * Most pages one PDF may have; a PDF with more fails with `too-large` before its pages are read. The default 2000
   * holds a long prosecution history while it bounds the page loop.
   */
  maxPages: number
  /**
   * V8 heap limit of the extraction Worker, in MB (the old generation; the young generation gets one eighth of it); a
   * file that needs more fails with `too-large`. The default 512 is about ten times the default `maxFileBytes`, room for
   * pdfjs and mammoth to hold a 50 MB file and its decoded structures, while a DOCX zip bomb cannot reach the Host heap.
   */
  extractMemoryMb: number
  /**
   * The host's "disk low" flag file, as an absolute path inside this runtime; a relative path fails at load. While the
   * file exists, an upload is refused with a `storage low` reason; reads, chats and other agent edits go on. The firm
   * host writes the file and removes it.
   */
  storageLowFlagPath: string
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  root: z.string(),
  firmRoot: z.string(),
  contextLimitTokens: z.number().step(1).min(0).default(50_000),
  charsPerToken: z.number().min(0.5).max(16).default(4),
  maxFileBytes: z.number().step(1).min(1).default(50 * 1024 * 1024),
  basePreset: z.string().default('patent'),
  presetOrder: z.number().default(100),
  maxSearchResults: z.number().step(1).min(1).max(50).default(8),
  maxReadLocations: z.number().step(1).min(1).max(100).default(10),
  maxReadChars: z.number().step(1).min(1).max(MAX_READ_CHARS).default(40_000),
  extractTimeoutMs: z.number().step(1).min(1).default(120_000),
  maxPages: z.number().step(1).min(1).default(2000),
  extractMemoryMb: z.number().step(1).min(16).default(512),
  storageLowFlagPath: z.string().pattern(/^(?:\/|[A-Za-z]:[\\/]|\\\\)/).default('/run/flowleap/host/disk-low'),
})

/**
 * Resolve the config into the catalog settings: the default root is `$DSH_HOME/agents`.
 * @param config - the validated config.
 * @param env - the environment `DSH_HOME` is read from.
 * @returns the catalog settings.
 */
export function resolveOptions(config: Config, env: Record<string, string | undefined> = process.env): CatalogOptions {
  return {
    root: config.root ?? join(resolveDshHome(undefined, env), 'agents'),
    ...config.firmRoot === undefined ? {} : { firmRoot: config.firmRoot },
    contextLimitTokens: config.contextLimitTokens,
    charsPerToken: config.charsPerToken,
    maxFileBytes: config.maxFileBytes,
    basePreset: config.basePreset,
    presetOrder: config.presetOrder,
    maxSearchResults: config.maxSearchResults,
    maxReadLocations: config.maxReadLocations,
    maxReadChars: config.maxReadChars,
    extractTimeoutMs: config.extractTimeoutMs,
    maxPages: config.maxPages,
    extractMemoryMb: config.extractMemoryMb,
    agentRow: AGENT_ROW_MODULE,
    storageLowFlagPath: config.storageLowFlagPath,
  }
}

/**
 * Load the agents, register their presets, and serve the `flowleapAgents` Remote and the upload route.
 * @param ctx - the mounting context, carrying `agentPresets` and `connection`.
 * @param config - roots, limits, base preset and roster order.
 */
export function apply(ctx: Context, config: Config): void {
  serve(ctx, resolveOptions(config))
}

/**
 * Mount the catalog, the Remote and the upload route over resolved settings.
 * @param ctx - the mounting context, carrying `agentPresets` and `connection`.
 * @param options - the resolved settings.
 */
export function serve(ctx: Context, options: CatalogOptions): void {
  ctx.plugin(AgentCatalog, options)
  ctx.inject(['flowleapAgentCatalog'], (scope) => {
    const catalog = scope.flowleapAgentCatalog
    scope.plugin(FlowleapAgentsController, { catalog })
    scope.effect(() => scope.connection.fetch.register({
      path: AGENT_UPLOAD_PATH, methods: ['POST'], requestBody: 'streaming', fetch: request => handleAgentUpload(catalog, request),
    }), 'flowleap-agent-builder: upload route')
  })
}
