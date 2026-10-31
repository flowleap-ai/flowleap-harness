/**
 * FlowLeap admin link, Host half: the authenticated route `GET /api/flowleap/admin-link`. It answers the firm admin
 * console's path only when the request carries an `X-Flowleap-Admin` header that the starter signed; the browser half
 * (`exports["./client"]`) asks once and shows the Firm admin row. The Host holds only the public key.
 *
 * See packages/client/ui-flowleap-admin-link/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-admin-link
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import { ADMIN_HEADER, readAdminKey, verifyAdminHeader, type AdminKeyRead } from './admin-header.ts'
import { ADMIN_LINK_PATH, type AdminLinkAnswer } from './route.ts'

export {
  ADMIN_HEADER, AdminLinkKeyError, MAX_HEADER_LIFETIME_SECONDS, readAdminKey, verifyAdminHeader,
} from './admin-header.ts'
export type { AdminHeaderCheck, AdminHeaderRefusal, AdminKeyProblem, AdminKeyRead } from './admin-header.ts'
export { ADMIN_LINK_PATH } from './route.ts'
export type { AdminLinkAnswer } from './route.ts'

/** Cordis plugin name. */
export const name = 'ui-flowleap-admin-link'

/** The connection service that authenticates the route. */
export const inject = ['connection']

/** Plugin config: where the starter's public key is, and where the link goes. */
export interface Config {
  /** Absolute path of the starter's SPKI PEM Ed25519 public key; `''` means that no request shows the link. */
  publicKeyFile: string
  /** The firm admin console as a document-relative path, such as `admin/`. */
  consoleHref: string
}

/** Runtime schema for the admin-link row. */
export const Config: z<Config> = z.object({
  publicKeyFile: z.string().required(),
  consoleHref: z.string().required(),
})

/** A path relative to the document: no scheme, no host, no leading slash, no query or fragment. */
const DOCUMENT_RELATIVE_PATH = /^[A-Za-z0-9._~-][A-Za-z0-9._~/-]*$/u

/**
 * Check the row's config.
 * @param config - the row's config.
 * @throws when `publicKeyFile` is neither `''` nor absolute, or `consoleHref` is not a document-relative path.
 */
export function checkConfig(config: Config): void {
  if (config.publicKeyFile !== '' && !isAbsolute(config.publicKeyFile)) {
    throw new Error(`ui-flowleap-admin-link: publicKeyFile must be '' or an absolute path, got ${JSON.stringify(config.publicKeyFile)}`)
  }
  if (!DOCUMENT_RELATIVE_PATH.test(config.consoleHref)) {
    throw new Error(`ui-flowleap-admin-link: consoleHref must be a document-relative path such as admin/, got ${JSON.stringify(config.consoleHref)}`)
  }
}

/** Where {@link answerAdminLink} reports a problem that an operator must see. */
export type AdminLinkLog = (message: string) => void

function answer(body: AdminLinkAnswer): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

/**
 * Answer one admin-link request.
 * @param request - the authenticated request.
 * @param config - the checked row config.
 * @param log - receives an unusable key file (error) and a header that is present but refused (warning).
 * @param nowSeconds - the current Unix time in seconds.
 * @returns `{ href: consoleHref }` for a valid header, else `{ href: null }`; never cached.
 */
export async function answerAdminLink(
  request: Request, config: Config, log: { readonly error: AdminLinkLog; readonly warn: AdminLinkLog }, nowSeconds: number,
): Promise<Response> {
  if (config.publicKeyFile === '') return answer({ href: null })
  let read: AdminKeyRead
  try {
    read = await readAdminKey(config.publicKeyFile)
  } catch (error) {
    log.error(`${String(error)}; no request shows the Firm admin link until the file holds the starter's public key`)
    return answer({ href: null })
  }
  if (read.state === 'absent') return answer({ href: null })
  const check = verifyAdminHeader(request.headers.get(ADMIN_HEADER) ?? undefined, read.key, nowSeconds)
  if (check.admin) return answer({ href: config.consoleHref })
  if (check.reason !== 'missing') log.warn(`ui-flowleap-admin-link: ${ADMIN_HEADER} refused (${check.reason}); the Firm admin link is not shown`)
  return answer({ href: null })
}

/**
 * Register the admin-link route.
 * @param ctx - the mounting context, carrying `connection`.
 * @param config - the key file and the link target.
 * @throws when the config is invalid; the row fails to load.
 */
export function apply(ctx: Context, config: Config): void {
  checkConfig(config)
  ctx.effect(() => ctx.connection.fetch.register({
    path: ADMIN_LINK_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: request => answerAdminLink(request, config, ctx.logger, Math.floor(Date.now() / 1000)),
  }), 'ui-flowleap-admin-link: admin-link route')
}
