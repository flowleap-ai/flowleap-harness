/**
 * The two file tools of an agent in the search mode: `search_agent_files` finds passages in the agent's indexed files,
 * and `read_agent_file` reads whole pages. Both answer with the file name and the page (or paragraph) so the model can
 * cite them.
 * @module
 */

import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { z } from 'zod'
import type { LocationRow, SearchHit } from './index-db.ts'
import { locationLabel } from './mode.ts'

/** Name of the search tool. */
export const SEARCH_AGENT_FILES_NAME = 'search_agent_files'
/** Name of the read tool. */
export const READ_AGENT_FILE_NAME = 'read_agent_file'

/** What the tools read from the agent's index. */
export interface AgentFileReader {
  /**
   * Search the indexed pages.
   * @param query - the model's words.
   * @returns hits, best first.
   */
  search(query: string): SearchHit[]
  /**
   * Read locations of one file.
   * @param file - file name.
   * @param from - first location.
   * @param to - last location, inclusive.
   * @returns the locations and the file's location count, or undefined for an unknown file.
   */
  read(file: string, from: number, to: number): { readonly rows: LocationRow[]; readonly total: number } | undefined
}

/** Bounds the tools apply. */
export interface AgentFileToolBounds {
  /** Most hits one search returns. */
  readonly maxSearchResults: number
  /** Most locations one read returns. */
  readonly maxReadLocations: number
}

const searchArgs = z.strictObject({ query: z.string().trim().min(1).max(500) })
const readArgs = z.strictObject({
  file: z.string().min(1),
  page: z.number().int().min(1),
  to: z.number().int().min(1).optional(),
})

function parse<T>(schema: z.ZodType<T>, tool: string, args: unknown): T {
  const parsed = schema.safeParse(args)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(`${tool}: invalid arguments: ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`)
  }
  return parsed.data
}

/**
 * Render search hits as model-facing text: one numbered passage per hit after a line with the file and the location.
 * @param query - the query.
 * @param hits - the hits.
 * @returns the text.
 */
export function renderHits(query: string, hits: readonly SearchHit[]): string {
  if (hits.length === 0) return `No passage in the agent files matches "${query}". Try other words, or read a file with ${READ_AGENT_FILE_NAME}.`
  const lines = hits.map((hit, index) => `[${String(index + 1)}] ${hit.file}, ${locationLabel(hit.unit, hit.at)}\n${hit.passage}`)
  return `${String(hits.length)} ${hits.length === 1 ? 'passage' : 'passages'} for "${query}" (cite the file and the page or paragraph):\n\n${lines.join('\n\n')}`
}

/**
 * Render read locations as model-facing text.
 * @param file - file name.
 * @param rows - the locations.
 * @param total - the file's location count.
 * @returns the text.
 */
export function renderRead(file: string, rows: readonly LocationRow[], total: number): string {
  if (rows.length === 0) return `${file} has no text in that range; it has ${String(total)} indexed locations.`
  const body = rows.map(row => `=== ${file} | ${locationLabel(row.unit, row.at)} ===\n${row.text}`).join('\n\n')
  return `${file}: ${String(total)} ${rows[0]?.unit ?? 'page'}s with text.\n\n${body}`
}

/**
 * Build the search tool over one agent's index.
 * @param reader - the index reads.
 * @returns the definition.
 */
export function searchAgentFilesTool(reader: AgentFileReader): ToolDefinition {
  return {
    name: SEARCH_AGENT_FILES_NAME,
    description: 'Search the files the attorney gave this agent (playbooks, style guides, prior responses) by words. '
      + 'Returns the best passages, each with its file name and page (or paragraph for a Word file). '
      + `Cite the file and the page of each passage you use. Read the whole page with ${READ_AGENT_FILE_NAME} when a passage is cut.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to find, for example "inventive step objection" or "claim amendment style".' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic', kind: 'search',
      title: `Search agent files: ${typeof args === 'object' && args !== null && 'query' in args ? String(args.query) : ''}`,
    }),
    execute(args): Promise<JsonValue> {
      const { query } = parse(searchArgs, SEARCH_AGENT_FILES_NAME, args)
      return Promise.resolve(renderHits(query, reader.search(query)))
    },
  }
}

/**
 * Build the read tool over one agent's index.
 * @param reader - the index reads.
 * @param maxLocations - most locations one call returns.
 * @returns the definition.
 */
export function readAgentFileTool(reader: AgentFileReader, maxLocations: number): ToolDefinition {
  return {
    name: READ_AGENT_FILE_NAME,
    description: 'Read pages of one file the attorney gave this agent, by file name and page (a paragraph number for a Word file). '
      + `Returns at most ${String(maxLocations)} pages per call, each after a line with the file and the page to cite.`,
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: `The file name exactly as ${SEARCH_AGENT_FILES_NAME} or the agent file list gives it.` },
        page: { type: 'integer', minimum: 1, description: 'First page (or paragraph) to read, 1-based.' },
        to: { type: 'integer', minimum: 1, description: 'Optional last page (or paragraph) to read, inclusive.' },
      },
      required: ['file', 'page'],
      additionalProperties: false,
    },
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic', kind: 'read',
      title: `Read agent file: ${typeof args === 'object' && args !== null && 'file' in args ? String(args.file) : ''}`,
    }),
    execute(args): Promise<JsonValue> {
      const { file, page, to } = parse(readArgs, READ_AGENT_FILE_NAME, args)
      const last = Math.min(Math.max(to ?? page, page), page + maxLocations - 1)
      const read = reader.read(file, page, last)
      if (read === undefined) return Promise.reject(new Error(`${READ_AGENT_FILE_NAME}: no indexed file is named "${file}"`))
      return Promise.resolve(renderRead(file, read.rows, read.total))
    },
  }
}
