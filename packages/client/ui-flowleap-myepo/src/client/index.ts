/**
 * FlowLeap MyEPO pages, browser half: the mirrors of what MyEPO has for the firm. Each page has a launcher in
 * `sidebar.panellist` and a page in the keyed `main` slot. Letters mirrors the Mailbox and Applications mirrors the
 * applications. On a firm installation the pages read the firm's copy in the Firm Record; else they read MyEPO through
 * the `flowleapConnectors` Remote (`shared/sources.ts`).
 *
 * See packages/client/ui-flowleap-myepo/README.md.
 * @module @deepseek-ai/dsh-client-ui-flowleap-myepo/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { ApplicationsPage } from './applications/ApplicationsPage.tsx'
import { ApplicationsPanelIcon } from './applications/ApplicationsPanelIcon.tsx'
import { createDocket } from './applications/docket.ts'
import { LettersPage } from './letters/LettersPage.tsx'
import { LettersPanelIcon } from './letters/LettersPanelIcon.tsx'
import { createMailbox } from './letters/mailbox.ts'
import * as applications from './locales/applications.ts'
import * as letters from './locales/letters.ts'
import { installationSource } from './shared/sources.ts'

export type { FlowleapApplicationsKey } from './locales/applications.ts'
export type { FlowleapLettersKey } from './locales/letters.ts'
export type {
  ApplicationData, Docket, DocketColumn, DocketDependencies, DocketFailure, DocketSnapshot, DocketViewId,
} from './applications/docket.ts'
export type { LetterPdf, Mailbox, MailboxDependencies, MailboxFailure, MailboxSnapshot, MailboxViewId } from './letters/mailbox.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Letters launcher and page copy. */
    'flowleapLetters': letters.FlowleapLettersKey
    /** Applications launcher and page copy. */
    'flowleapApplications': applications.FlowleapApplicationsKey
  }
}

/** The id of the Letters launcher and the key of its page. */
export const LETTERS_PANEL_ID = 'flowleap-letters' as MainPanelId

/** The id of the Applications launcher and the key of its page. */
export const APPLICATIONS_PANEL_ID = 'flowleap-applications' as MainPanelId

/** Required services (cordis fiber inject); `remote.flowleapConnectors` parks the plugin until the Host serves the namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapConnectors']

/** The time between two automatic reads of an open page, in milliseconds. */
export const AUTO_READ_MS = 60_000

/** Today as an ISO calendar date in UTC. */
const today = (): string => new Date().toISOString().slice(0, 10)

/**
 * Register the dictionaries, the two launchers and the two pages.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const connectors = ctx.remote.flowleapConnectors
  ctx.effect(() => ctx.locale.register(letters.NS, {
    zh: letters.zh, en: letters.en, ja: letters.ja, es: letters.es, fr: letters.fr, de: letters.de, ru: letters.ru, pt: letters.pt,
  }), 'ui-flowleap-myepo: Letters dictionaries')
  ctx.effect(() => ctx.locale.register(applications.NS, {
    zh: applications.zh, en: applications.en, ja: applications.ja, es: applications.es,
    fr: applications.fr, de: applications.de, ru: applications.ru, pt: applications.pt,
  }), 'ui-flowleap-myepo: Applications dictionaries')
  const lettersCopy = ctx.locale.bind(letters.NS)
  const applicationsCopy = ctx.locale.bind(applications.NS)

  const source = installationSource(connectors, (input, init) => globalThis.fetch(input, init))
  const mailbox = createMailbox({
    read: source.mailbox,
    download: source.letterPdf,
    createUrl: pdf => URL.createObjectURL(new Blob([pdf.slice()], { type: 'application/pdf' })),
    revokeUrl: (url) => { URL.revokeObjectURL(url) },
  })
  ctx.effect(() => () => { mailbox.dispose() }, 'ui-flowleap-myepo: PDF address')
  const docket = createDocket({
    list: source.applications,
    read: source.application,
    today,
  })

  // An open page follows its source: it reads again every minute while the window shows, and when the window shows again.
  ctx.effect(() => {
    const read = (): void => {
      if (document.visibilityState !== 'visible') return
      void mailbox.update()
      void docket.update()
    }
    const timer = setInterval(read, AUTO_READ_MS)
    document.addEventListener('visibilitychange', read)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', read)
    }
  }, 'ui-flowleap-myepo: automatic read')

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: LETTERS_PANEL_ID, order: -115, locale: letters.NS, label: () => lettersCopy('panel'),
  }, LettersPanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: LETTERS_PANEL_ID, locale: letters.NS, inject: () => mailbox,
  }, LettersPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: APPLICATIONS_PANEL_ID, order: -114, locale: applications.NS, label: () => applicationsCopy('panel'),
  }, ApplicationsPanelIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: APPLICATIONS_PANEL_ID, locale: applications.NS, inject: () => ({ ...docket, today }),
  }, ApplicationsPage))
}
