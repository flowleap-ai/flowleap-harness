/**
 * The admin-link route that both halves share: its path and its JSON answer.
 * @module
 */

/** Absolute Host path of the admin-link route on the shared `/api` channel. */
export const ADMIN_LINK_PATH = '/api/flowleap/admin-link'

/** JSON body of the admin-link route. */
export interface AdminLinkAnswer {
  /** The firm admin console as a document-relative path, or null when the request is not of a firm administrator. */
  readonly href: string | null
}
