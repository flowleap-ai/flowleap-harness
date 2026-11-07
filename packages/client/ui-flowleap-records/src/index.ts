/**
 * FlowLeap records, Host half: the authenticated route `GET /api/flowleap/records-link` answers where the Records
 * service of the Firm Record is, as a path relative to the document; the browser half (`exports["./client"]`) asks
 * once and shows the Matters launcher and panel, which call the Records API under that path. The service comes from
 * the firm proxy, never from this Host.
 *
 * See packages/client/ui-flowleap-records/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-records
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import { RECORDS_LINK_PATH, type RecordsLinkAnswer } from './route.ts'

export { RECORDS_LINK_PATH } from './route.ts'
export type { RecordsLinkAnswer } from './route.ts'

/** Cordis plugin name. */
export const name = 'ui-flowleap-records'

/** The connection service that authenticates the route. */
export const inject = ['connection']

/** Plugin config: where the Records pages are, and where Sign out goes. */
export interface Config {
  /** The Records pages as a document-relative path, such as `records/`; the firm proxy serves them at the same origin. */
  recordsHref: string
  /**
   * Where the account menu's Sign out goes: an absolute path on the same origin, with an optional query, such as the
   * firm proxy's `/oauth2/sign_out`. Empty (the default) means no sign-in in front of the app, and no Sign out.
   */
  signOutHref: string
}

/** Runtime schema for the records row. */
export const Config: z<Config> = z.object({
  recordsHref: z.string().default('records/'),
  signOutHref: z.string().default(''),
})

/** A path relative to the document: no scheme, no host, no leading slash, no query or fragment. */
const DOCUMENT_RELATIVE_PATH = /^[A-Za-z0-9._~-][A-Za-z0-9._~/-]*$/u

/** An absolute path on the same origin with an optional query: a leading slash, no second slash after it, no fragment. */
const SAME_ORIGIN_PATH = /^\/(?!\/)[A-Za-z0-9._~/%-]*(?:\?[A-Za-z0-9._~/%=&+-]*)?$/u

/**
 * Check the row's config.
 * @param config - the row's config.
 * @throws when `recordsHref` is not a document-relative path, or `signOutHref` is neither empty nor a same-origin path.
 */
export function checkConfig(config: Config): void {
  if (!DOCUMENT_RELATIVE_PATH.test(config.recordsHref)) {
    throw new Error(`ui-flowleap-records: recordsHref must be a document-relative path such as records/, got ${JSON.stringify(config.recordsHref)}`)
  }
  if (config.signOutHref !== '' && !SAME_ORIGIN_PATH.test(config.signOutHref)) {
    throw new Error(`ui-flowleap-records: signOutHref must be empty or an absolute path on the same origin such as /oauth2/sign_out, got ${JSON.stringify(config.signOutHref)}`)
  }
}

/**
 * Answer one records-link request.
 * @param config - the checked row config.
 * @returns `{ href: recordsHref, signOutHref }`, with `signOutHref` null when it is empty; never cached.
 */
export function answerRecordsLink(config: Config): Response {
  const body: RecordsLinkAnswer = { href: config.recordsHref, signOutHref: config.signOutHref === '' ? null : config.signOutHref }
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

/**
 * Register the records-link route.
 * @param ctx - the mounting context, carrying `connection`.
 * @param config - where the Records pages are.
 * @throws when the config is invalid; the row fails to load.
 */
export function apply(ctx: Context, config: Config): void {
  checkConfig(config)
  ctx.effect(() => ctx.connection.fetch.register({
    path: RECORDS_LINK_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: () => Promise.resolve(answerRecordsLink(config)),
  }), 'ui-flowleap-records: records-link route')
}
