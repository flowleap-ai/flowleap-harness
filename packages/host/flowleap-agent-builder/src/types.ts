/**
 * Client-safe vocabulary of the `flowleapAgents` Remote: the agent id, the connector choices, the file and mode states,
 * the views a client reads, and the change event the Host forwards. Types and constants only; nothing here reaches a
 * Host-only symbol.
 * @module @deepseek-ai/dsh-flowleap-agent-builder/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable id of one agent: a slug of its first name and a random suffix. A rename keeps it. */
export type AgentId = Branded<'FlowleapAgentId'>

/**
 * The connector rows an agent can choose. `epo-ops`, `uspto-odp` and `semantic-scholar` are the office connectors of
 * `dsh-flowleap-connectors`; `flowleap` is the paid FlowLeap tools row (`mcp-flowleap`). Mistral is not a choice: it is
 * the OCR key, which every agent may use.
 */
export const CONNECTOR_CHOICE_IDS = ['epo-ops', 'uspto-odp', 'flowleap', 'semantic-scholar'] as const

/** One connector choice id. */
export type ConnectorChoiceId = (typeof CONNECTOR_CHOICE_IDS)[number]

/**
 * Whether a raw string is a {@link ConnectorChoiceId}.
 * @param value - candidate id from a file or a wire request.
 * @returns true for one of {@link CONNECTOR_CHOICE_IDS}.
 */
export function isConnectorChoiceId(value: string): value is ConnectorChoiceId {
  return (CONNECTOR_CHOICE_IDS as readonly string[]).includes(value)
}

/** One connector row as the form shows it. */
export interface ConnectorChoice {
  /** The row. */
  readonly id: ConnectorChoiceId
  /** Whether the row can answer on this Host: its key is stored, or (for `flowleap`) its tools are registered. */
  readonly configured: boolean
}

/** Why a file has no index. */
export type AgentFileFailure =
  /** The file holds no text: a PDF without a text layer and no OCR text, or an empty file. */
  | 'no-text'
  /** Some pages have no text layer and no Mistral key is stored for OCR. */
  | 'ocr-unavailable'
  /** The OCR call failed. */
  | 'ocr-failed'
  /** The file cannot be parsed as its type. */
  | 'unreadable'

/** Index state of one file: one lifecycle from `indexing` to `indexed` or `failed`. */
export type AgentFileState =
  | { readonly kind: 'indexing' }
  | { readonly kind: 'indexed' }
  | { readonly kind: 'failed'; readonly reason: AgentFileFailure; readonly message: string }

/** What one location of a file is: a PDF page, a Word paragraph, or the one page of a text file. */
export type LocationUnit = 'page' | 'paragraph'

/** One file of an agent. */
export interface AgentFileView {
  /** File name; unique in the agent. */
  readonly name: string
  /** Size in bytes. */
  readonly bytes: number
  /** Index state. */
  readonly state: AgentFileState
  /** Indexed locations (pages or paragraphs); 0 until indexed. */
  readonly locations: number
  /** What a location is. */
  readonly unit: LocationUnit
}

/**
 * How the agent reaches its files: `context` puts the full text into the system prompt; `search` gives the search and
 * read tools. Derived from the indexed text size and the configured limit; never stored.
 */
export type AgentMode = 'context' | 'search'

/** One agent in the list. */
export interface AgentSummary {
  /** Agent id; also the id of its agent preset. */
  readonly id: AgentId
  /** Display name. */
  readonly name: string
  /** One sentence on what the agent does. */
  readonly description: string
  /** True for an agent of the firm folder, which this Host never writes. */
  readonly readOnly: boolean
}

/** One agent with its form fields, files and mode. */
export interface AgentView extends AgentSummary {
  /** The instructions the agent follows. */
  readonly instructions: string
  /** The chosen connector rows. */
  readonly connectors: readonly ConnectorChoiceId[]
  /** The files and their index states, by name. */
  readonly files: readonly AgentFileView[]
  /** How the agent reaches its files now. */
  readonly mode: AgentMode
}

/** The editable fields of one agent, as a client sends them to `save`. */
export interface AgentInput {
  /** The agent to update; absent to create one. */
  readonly id?: AgentId
  /** Display name; not empty. */
  readonly name: string
  /** One sentence on what the agent does. */
  readonly description: string
  /** The instructions; not empty. */
  readonly instructions: string
  /** The chosen connector rows; each must be one of `connectors()`. */
  readonly connectors: readonly ConnectorChoiceId[]
}

/** File types the upload route accepts, by lower-case extension. */
export const AGENT_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const

/** Upload route of the Host plugin, below the Connection origin. */
export const AGENT_UPLOAD_PATH = '/api/flowleap-agents/upload'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No agent has the id. */
    'flowleap-agents/not-found': { readonly id: string }
    /** The agent is in the read-only firm folder. */
    'flowleap-agents/read-only': { readonly id: string }
    /** The input fails validation; `field` names the first bad field. */
    'flowleap-agents/invalid': { readonly field: string; readonly reason: string }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * An agent was created, changed or deleted, or one of its files changed index state; clients refetch
     * `flowleapAgents.list()` and the agent they show.
     * @mode emit
     */
    'flowleap-agents/changed'(): void
  }
}
