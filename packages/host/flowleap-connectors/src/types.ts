/**
 * Client-safe vocabulary of the `flowleapConnectors` Remote: the connector ids,
 * the presence view a settings card reads, the connection-test outcome, and the
 * MyEPO link view and test outcome of the MyEPO card.
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

/** The kind of a MyEPO portfolio, as the EPO names it; a kind the EPO adds later reads as `other`. */
export type MyEpoPortfolioType = 'applicant' | 'representative' | 'association' | 'other'

/** One MyEPO portfolio that the firm's API account may read. */
export interface MyEpoPortfolioView {
  /** The portfolio name the firm gave it in MyEPO. */
  name: string
  /** The portfolio kind. */
  type: MyEpoPortfolioType
  /** Whether the account may read every application of the portfolio (`hasFullAccess`). */
  fullAccess: boolean
}

/**
 * The MyEPO link as the settings card reads it: never a credential value. A
 * firm is linked only after a test passed with its stored credentials; the
 * facts of that test are stored with them.
 */
export type MyEpoLinkView =
  | {
    /** No credentials are stored. */
    state: 'not-linked'
    /** Whether a link would currently be stored. */
    writable: boolean
  }
  | {
    /** Credentials are stored and their last test passed. */
    state: 'linked'
    /** Whether a replacement or an unlink would currently be stored. */
    writable: boolean
    /** When the last test passed, ISO 8601. */
    testedAt: string
    /** How many portfolios the account could read at that test. */
    portfolios: number
    /** Whether the Mailbox answered at that test. */
    mailbox: boolean
  }

/** The outcome of a MyEPO link or test. */
export type MyEpoTestOutcome =
  | {
    /** The EPO issued a token and FlowLeap read the portfolios; the link is stored. */
    kind: 'passed'
    /** When the test passed, ISO 8601. */
    testedAt: string
    /** The portfolios the account may read; empty when the administrator gave no portfolio permission. */
    portfolios: MyEpoPortfolioView[]
    /** Whether the Mailbox answered. */
    mailbox: boolean
  }
  | {
    /** The EPO refused the client ID or the client secret; nothing was stored. */
    kind: 'refused'
  }
  | {
    /** The EPO did not answer, or answered with a server error; the stored link did not change. */
    kind: 'unreachable'
  }
  | {
    /** The EPO answered with an error other than a refusal; the stored link did not change. */
    kind: 'failed'
    /** The EPO's error code and message, for the person who reads the card. */
    message: string
  }
  | {
    /** No credentials are stored, so there is nothing to test. */
    kind: 'not-linked'
  }

/** One letter of the MyEPO Mailbox as the Letters page reads it: the fields of the MyEPO list, with `null` for a field the EPO left out. */
export interface MyEpoLetterView {
  /** The EPO communication id. */
  id: string
  /** The title as the EPO writes it, in the language of the letter. */
  title: string
  /** The EPO document code, for example `2006A`. */
  documentCode: string
  /** The dispatch date, ISO calendar date. */
  dispatchDate: string
  /** Whether MyEPO shows the letter as read. */
  read: boolean
  /** Whether MyEPO shows the letter as handled. */
  handled: boolean
  /** The id of the Mailbox folder that holds the letter. */
  folderId: string
  /** The application number as MyEPO writes it (`EP12345678.2`, `PCT/SE2023/123456`). */
  applicationNumber: string | null
  /** The firm's reference on the letter. */
  userReference: string | null
  /** The applicant name. */
  applicantName: string | null
  /** The recipient name. */
  recipientName: string | null
  /** The address of the application's digital file on the MyEPO website. */
  digitalFile: string | null
}

/** The PDF of one letter of the MyEPO Mailbox. */
export interface MyEpoLetterPdf {
  /** The file name that the EPO gave the PDF. */
  fileName: string
  /** The PDF bytes. */
  pdf: Uint8Array
}

/** One folder of the MyEPO Mailbox. */
export interface MyEpoFolderView {
  /** The folder id that a letter names. */
  id: string
  /** The folder name the firm gave it in MyEPO. */
  name: string
}

/** The MyEPO Mailbox as the Letters page reads it, or why it could not be read. */
export type MyEpoMailboxView =
  | {
    /** The EPO answered. */
    kind: 'read'
    /** When the read ended, ISO 8601. */
    readAt: string
    /** The letters, in the order of the MyEPO list; at most the first 500. */
    letters: MyEpoLetterView[]
    /** The folders of the Mailbox. */
    folders: MyEpoFolderView[]
    /** How many letters the Mailbox holds; more than `letters.length` when the list was cut. */
    total: number
  }
  | {
    /** No credentials are stored. */
    kind: 'not-linked'
  }
  | {
    /** The EPO refused the stored credentials. */
    kind: 'refused'
  }
  | {
    /** The EPO did not answer, or answered with a server error. */
    kind: 'unreachable'
  }
  | {
    /** The EPO answered with another error. */
    kind: 'failed'
    /** The EPO's error code and message, for the person who reads the page. */
    message: string
  }
