/**
 * The records-link route that both halves share: its path and its JSON answer.
 * @module
 */

/** Absolute Host path of the records-link route on the shared `/api` channel. */
export const RECORDS_LINK_PATH = '/api/flowleap/records-link'

/** JSON body of the records-link route. */
export interface RecordsLinkAnswer {
  /** The Records pages as a document-relative path, such as `records/`. */
  readonly href: string
}
