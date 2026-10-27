/**
 * Client-safe vocabulary of the `flowleapConnectors` Remote: the connector ids,
 * the presence view a settings card reads, and the connection-test outcome.
 * Types and constants only; nothing here reaches a Host-only symbol.
 * @module @deepseek-ai/dsh-flowleap-connectors/types
 */

/** The four connectors this plugin holds credentials for; `mistral` pays for OCR (`ocr`, `read_pdf`, file-wrapper documents). */
export const CONNECTOR_IDS = ['epo-ops', 'uspto-odp', 'semantic-scholar', 'mistral'] as const

/** One connector id. */
export type ConnectorId = (typeof CONNECTOR_IDS)[number]

/** The credential fields each connector stores, in display order. */
export const CONNECTOR_FIELDS: Readonly<Record<ConnectorId, readonly string[]>> = {
  'epo-ops': ['consumerKey', 'consumerSecret'],
  'uspto-odp': ['apiKey'],
  'semantic-scholar': ['apiKey'],
  mistral: ['apiKey'],
}

/**
 * Fields a stored record may also carry, which the settings card does not ask
 * for: a deployment writes them in its credential document. `baseUrl` sends
 * Mistral OCR and its connection test to that base (a model gateway); the
 * library validates the value on each read.
 */
export const CONNECTOR_OPTIONAL_FIELDS: Readonly<Record<ConnectorId, readonly string[]>> = {
  'epo-ops': [],
  'uspto-odp': [],
  'semantic-scholar': [],
  mistral: ['baseUrl'],
}

/**
 * Whether a raw string is a {@link ConnectorId}.
 * @param value - candidate id from a wire request.
 * @returns true for one of {@link CONNECTOR_IDS}.
 */
export function isConnectorId(value: string): value is ConnectorId {
  return (CONNECTOR_IDS as readonly string[]).includes(value)
}

/** Presence facts for one connector, safe for a settings card: never a value. */
export interface ConnectorPresence {
  /** Whether a complete credential record is stored. */
  configured: boolean
  /** Where the credential comes from; records have one source, the credential store. */
  source?: 'stored'
  /** Whether `set` and `unset` would currently succeed. */
  writable: boolean
  /** The fields `set` expects, in display order. */
  fields: string[]
}

/** The outcome of one connection test. */
export interface ConnectorTestResult {
  /** Whether the connector answered one cheap authenticated call. */
  ok: boolean
  /** Human-readable outcome, including the reason a test did not run. */
  message: string
}
