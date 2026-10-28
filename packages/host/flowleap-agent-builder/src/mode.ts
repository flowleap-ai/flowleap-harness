/**
 * The agent mode and the prompt text of one agent revision.
 * @module
 */

import { fenceFileText, locationMarker } from './file-text.ts'
import type { LocationRow } from './index-db.ts'
import type { AgentMode } from './types.ts'

/** Characters counted as one token in the estimate. */
export const CHARS_PER_TOKEN = 4

/**
 * Estimate the tokens of a text from its length: `ceil(chars / 4)`. The estimate does not run a tokenizer, so it is
 * the same for every model; it is close for English prose and low for CJK text.
 * @param chars - characters of the text.
 * @returns the estimated tokens.
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

/**
 * Choose the mode from the indexed text size: `context` while the estimate is at or below the limit, else `search`.
 * @param chars - characters of all indexed text of the agent.
 * @param limitTokens - the configured `contextLimitTokens`.
 * @returns the mode.
 */
export function agentMode(chars: number, limitTokens: number): AgentMode {
  return estimateTokens(chars) <= limitTokens ? 'context' : 'search'
}

/** Heading of the instructions section. */
export const INSTRUCTIONS_HEADING = 'Agent instructions (written by the attorney who made this agent)'

/**
 * Render the instructions section.
 * @param name - the agent name.
 * @param instructions - the instructions text.
 * @returns the section text.
 */
export function renderInstructions(name: string, instructions: string): string {
  return `${INSTRUCTIONS_HEADING}:\nYou are "${name}". Follow these instructions in addition to the rules above.\n\n${instructions.trim()}`
}

/**
 * Render the files section of the context mode: every location, in the order of `rows` (file name, then page), each
 * after a marker line that names the file and the location, all inside the file-text fence.
 * @param rows - all indexed locations.
 * @returns the section text.
 */
export function renderContextFiles(rows: readonly LocationRow[]): string {
  return [
    'Agent files (full text):',
    'The attorney gave this agent the files below. They are not in the workspace, so do not open them with file tools: '
    + 'the text that follows is their full content. Each part starts with a line "=== <file> | page N ===" (or "paragraph N" for a Word file).',
    fenceFileText(rows.map(row => ({ marker: locationMarker(row.file, row.unit, row.at), text: row.text }))),
  ].join('\n')
}

/**
 * Render the files section of the search mode: the file names and how to reach them.
 * @param files - indexed file names, sorted.
 * @param searchTool - the search tool name.
 * @param readTool - the read tool name.
 * @returns the section text.
 */
export function renderSearchFiles(files: readonly string[], searchTool: string, readTool: string): string {
  return [
    'Agent files (search):',
    `This agent has ${String(files.length)} indexed ${files.length === 1 ? 'file' : 'files'}, too large to show in full: ${files.join(', ')}.`,
    `Find passages with ${searchTool} and read whole pages with ${readTool}. When you use a passage, cite the file name and the page or paragraph.`,
  ].join('\n')
}
