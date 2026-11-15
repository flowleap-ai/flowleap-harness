/**
 * FlowLeap Letters, browser half: the Letters launcher in `sidebar.panellist` and the Letters page in the keyed `main`
 * slot. The page is a mirror of the MyEPO Mailbox: it reads the letters and the folders with
 * `flowleapConnectors.myEpoMailbox()` and the PDF of the open letter with `flowleapConnectors.myEpoLetterPdf()`.
 *
 * See packages/client/ui-flowleap-letters/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-letters/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { LettersPage } from './LettersPage.tsx'
import { LettersPanelIcon } from './LettersPanelIcon.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FlowleapLettersKey } from './locales.ts'
import { createMailbox } from './mailbox.ts'

export type { FlowleapLettersKey } from './locales.ts'
export type { LetterPdf, Mailbox, MailboxDependencies, MailboxFailure, MailboxSnapshot, MailboxViewId } from './mailbox.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Letters launcher and page copy. */
    'flowleapLetters': FlowleapLettersKey
  }
}

/** The id of the Letters launcher and the key of its page. */
export const PANEL_ID = 'flowleap-letters' as MainPanelId

/** Required services (cordis fiber inject); `remote.flowleapConnectors` parks the plugin until the Host serves the namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapConnectors']

/**
 * Register the dictionaries, the launcher and the page.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-flowleap-letters: dictionaries')
  const t = ctx.locale.bind(NS)
  const mailbox = createMailbox({
    read: () => ctx.remote.flowleapConnectors.myEpoMailbox(),
    download: id => ctx.remote.flowleapConnectors.myEpoLetterPdf(id),
    createUrl: pdf => URL.createObjectURL(new Blob([pdf.slice()], { type: 'application/pdf' })),
    revokeUrl: (url) => { URL.revokeObjectURL(url) },
  })
  ctx.effect(() => () => { mailbox.dispose() }, 'ui-flowleap-letters: PDF address')
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: -115, locale: NS, label: () => t('panel'),
  }, LettersPanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS, inject: () => mailbox,
  }, LettersPage))
}
