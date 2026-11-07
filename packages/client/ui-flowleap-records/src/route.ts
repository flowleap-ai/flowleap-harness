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
  /**
   * Where Sign out goes: an absolute path on the same origin, such as the firm proxy's `/oauth2/sign_out`; null when
   * the deployment has no sign-in, so the account menu has no Sign out.
   */
  readonly signOutHref: string | null
}
