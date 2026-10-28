/**
 * The on-disk definition of one agent: the strict `agent.yaml` schema, the id rule, and the file-name rule. An
 * `agent.yaml` holds a name, a description and connector ids only, so an agent definition holds no key and no code.
 * @module
 */

import { randomBytes } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { AGENT_FILE_EXTENSIONS, CONNECTOR_CHOICE_IDS, type AgentId, type ConnectorChoiceId } from './types.ts'

/** The fields of `agent.yaml`. */
export interface AgentDefinition {
  /** Display name. */
  readonly name: string
  /** One sentence on what the agent does. */
  readonly description: string
  /** The chosen connector rows, without repeats. */
  readonly connectors: readonly ConnectorChoiceId[]
}

/** Longest name, in characters. */
export const MAX_NAME_LENGTH = 80
/** Longest description, in characters. */
export const MAX_DESCRIPTION_LENGTH = 300
/** Longest instructions, in characters. */
export const MAX_INSTRUCTIONS_LENGTH = 50_000

const definitionSchema = z.strictObject({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).default(''),
  connectors: z.array(z.enum(CONNECTOR_CHOICE_IDS)).default([])
    .refine(ids => new Set(ids).size === ids.length, 'connectors repeat an id'),
})

/**
 * Parse the text of one `agent.yaml`. Unknown keys and unknown connector ids fail.
 * @param text - the file text.
 * @returns the definition.
 * @throws Error naming the first problem.
 */
export function parseAgentYaml(text: string): AgentDefinition {
  const parsed = definitionSchema.safeParse(parse(text))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    /* v8 ignore next -- a failed zod parse reports at least one issue with a message */
    throw new Error(`agent.yaml: ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`)
  }
  return parsed.data
}

/**
 * Render one definition as `agent.yaml` text.
 * @param definition - the fields.
 * @returns the YAML text.
 */
export function renderAgentYaml(definition: AgentDefinition): string {
  return stringify({ name: definition.name, description: definition.description, connectors: [...definition.connectors] })
}

/** An agent id: lower-case letters, digits and single hyphens, from 1 to 64 characters. */
const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Whether a folder name is an agent id.
 * @param value - the folder name or a wire id.
 * @returns true when the value can name an agent folder.
 */
export function isAgentId(value: string): value is AgentId {
  return value.length <= 64 && AGENT_ID_PATTERN.test(value)
}

/**
 * Make a new agent id from a name: an ASCII slug of at most 40 characters and six random hex digits.
 * @param name - the first name of the agent.
 * @returns a new id.
 */
export function newAgentId(name: string): AgentId {
  const slug = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    .replace(/-+$/, '')
  const suffix = randomBytes(3).toString('hex')
  return brandString<AgentId>(slug === '' ? `agent-${suffix}` : `${slug}-${suffix}`)
}

/** Why a file name is refused. */
export type FileNameProblem = 'empty' | 'long' | 'path' | 'type'

/**
 * Longest file name, in UTF-8 bytes: the 255-byte name limit of the common file systems less the 15 bytes the
 * temporary upload name adds (a leading dot, a dot and 8 hex digits, and `.part`).
 */
export const MAX_FILE_NAME_BYTES = 240

/**
 * Check an uploaded file name: not too long in UTF-8 bytes, no path parts, no control characters, and one of the
 * accepted extensions.
 * @param name - the name the client sent.
 * @returns the problem, or undefined for a safe name.
 */
export function fileNameProblem(name: string): FileNameProblem | undefined {
  if (name.trim() === '') return 'empty'
  if (Buffer.byteLength(name, 'utf8') > MAX_FILE_NAME_BYTES) return 'long'
  if (/[/\\\0-\x1f]/.test(name) || name === '.' || name === '..' || name.startsWith('.')) return 'path'
  const lower = name.toLowerCase()
  if (!AGENT_FILE_EXTENSIONS.some(extension => lower.endsWith(extension))) return 'type'
  return undefined
}
