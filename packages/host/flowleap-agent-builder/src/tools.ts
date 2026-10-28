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
  /** Most characters of page text one read returns. */
  readonly maxReadChars: number
}

const searchArgs = z.strictObject({ query: z.string().trim().min(1).max(500) })
const readArgs = z.strictObject({
  file: z.string().min(1),
  page: z.number().int().min(1),
  to: z.number().int().min(1).optional(),
  start: z.number().int().min(0).optional(),
})

/** Both tools answer with model-facing text. */
const TEXT_OUTPUT: ToolDefinition['output'] = {
  schema: {},
  render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
}

function parse<T>(schema: z.ZodType<T>, tool: string, args: unknown): T {
  const parsed = schema.safeParse(args)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    /* v8 ignore next -- a failed zod parse reports at least one issue with a message */
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
 * Render read locations as model-facing text. The page text of the whole answer is at most `maxChars` characters; an
 * answer cut at the limit ends with the arguments of the call that reads on.
 * @param file - file name.
 * @param rows - the locations.
 * @param total - the file's location count.
 * @param maxChars - most characters of page text in the answer.
 * @param start - 0-based character of the first location where the answer starts.
 * @returns the text.
 */
export function renderRead(file: string, rows: readonly LocationRow[], total: number, maxChars: number, start = 0): string {
  const [first] = rows
  if (first === undefined) return `${file} has no text in that range; it has ${String(total)} indexed locations.`
  const parts: string[] = []
  let budget = maxChars
  let next: { readonly page: number; readonly start: number } | undefined
  for (const [index, row] of rows.entries()) {
    if (budget === 0) {
      next = { page: row.at, start: 0 }
      break
    }
    const offset = index === 0 ? start : 0
    const text = row.text.slice(offset, offset + budget)
    budget -= text.length
    const from = offset === 0 ? '' : `, from character ${String(offset)}`
    parts.push(`=== ${file} | ${locationLabel(row.unit, row.at)}${from} ===\n${text}`)
    if (offset + text.length < row.text.length) {
      next = { page: row.at, start: offset + text.length }
      break
    }
  }
  const head = `${file}: ${String(total)} ${first.unit}s with text.`
  const tail = next === undefined
    ? ''
    : `\n\n[This answer stops at the limit of ${String(maxChars)} characters. Read on with ${READ_AGENT_FILE_NAME} ${JSON.stringify({ file, page: next.page, ...next.start === 0 ? {} : { start: next.start } })}.]`
  return `${head}\n\n${parts.join('\n\n')}${tail}`
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
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic', kind: 'search',
      title: `Search agent files: ${typeof args === 'object' && args !== null && 'query' in args ? String(args.query) : ''}`,
    }),
    execute(args): Promise<JsonValue> {
      return Promise.resolve().then(() => {
        const { query } = parse(searchArgs, SEARCH_AGENT_FILES_NAME, args)
        return renderHits(query, reader.search(query))
      })
    },
  }
}

/**
 * Build the read tool over one agent's index.
 * @param reader - the index reads.
 * @param maxLocations - most locations one call returns.
 * @param maxChars - most characters of page text one call returns.
 * @returns the definition.
 */
export function readAgentFileTool(reader: AgentFileReader, maxLocations: number, maxChars: number): ToolDefinition {
  return {
    name: READ_AGENT_FILE_NAME,
    description: 'Read pages of one file the attorney gave this agent, by file name and page (a paragraph number for a Word file). '
      + `Returns at most ${String(maxLocations)} pages and ${String(maxChars)} characters per call, each page after a line with the file and the page to cite. `
      + 'An answer cut at the character limit ends with the arguments that read on.',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: `The file name exactly as ${SEARCH_AGENT_FILES_NAME} or the agent file list gives it.` },
        page: { type: 'integer', minimum: 1, description: 'First page (or paragraph) to read, 1-based.' },
        to: { type: 'integer', minimum: 1, description: 'Optional last page (or paragraph) to read, inclusive.' },
        start: { type: 'integer', minimum: 0, description: 'Optional 0-based character of the first page where reading starts, as a cut answer gives it.' },
      },
      required: ['file', 'page'],
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    presentCall: args => ({
      card: 'generic', kind: 'read',
      title: `Read agent file: ${typeof args === 'object' && args !== null && 'file' in args ? String(args.file) : ''}`,
    }),
    execute(args): Promise<JsonValue> {
      return Promise.resolve().then(() => {
        const { file, page, to, start } = parse(readArgs, READ_AGENT_FILE_NAME, args)
        const last = Math.min(Math.max(to ?? page, page), page + maxLocations - 1)
        const read = reader.read(file, page, last)
        if (read === undefined) throw new Error(`${READ_AGENT_FILE_NAME}: no indexed file is named "${file}"`)
        return renderRead(file, read.rows, read.total, maxChars, start)
      })
    },
  }
}
