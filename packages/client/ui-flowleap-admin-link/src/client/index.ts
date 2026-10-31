/**
 * Browser half of the FlowLeap admin link: asks the Host route once at start and, when the answer names the firm
 * admin console, registers the Firm admin row in `sidebar.actions`. A failed request, an aborted request, or any
 * other answer registers nothing and shows no error.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ADMIN_LINK_PATH } from '../route.ts'
import { AdminLinkAction } from './AdminLink.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapAdminLinkKey } from './locales.ts'

export type { AdminLinkActionProps, AdminLinkInjected } from './AdminLink.tsx'
export type { FlowleapAdminLinkKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Firm admin row copy. */
    'flowleapAdminLink': FlowleapAdminLinkKey
  }
}

/** The Host route relative to the document, like the other app routes. */
export const ADMIN_LINK_ROUTE = ADMIN_LINK_PATH.slice(1)

/** Required services: slots and copy. */
export const inject = ['slots', 'locale']

/**
 * Ask the Host whether this request belongs to a firm administrator.
 * @param signal - aborts the request when the plugin is disposed.
 * @returns the console path, or null for `{ href: null }`, a failed or aborted request, or any other answer.
 */
export async function readAdminLink(signal: AbortSignal): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(ADMIN_LINK_ROUTE, { credentials: 'include', cache: 'no-store', signal })
  } catch {
    // A network failure or an abort: no link, and no error for the attorney.
    return null
  }
  if (response.status !== 200) return null
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // A body that is not JSON: no link, and no error for the attorney.
    return null
  }
  if (typeof body !== 'object' || body === null || !('href' in body)) return null
  return typeof body.href === 'string' && body.href !== '' ? body.href : null
}

/**
 * Register the dictionaries, then the Firm admin row when the Host answers a console path.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-admin-link: dictionaries')
  const controller = new AbortController()
  ctx.effect(() => () => { controller.abort() }, 'ui-flowleap-admin-link: request')
  void readAdminLink(controller.signal).then((href) => {
    if (href === null || controller.signal.aborted) return
    ctx.slots.inject('sidebar.actions', () => ctx.slots.register({
      name: 'sidebar.actions', id: 'flowleap-admin-link', order: 90, locale: NS, inject: () => ({ href }),
    }, AdminLinkAction))
  })
}
