/**
 * The Records page: a frame of the Firm Record's pages at the same origin, or the empty state while the firm has
 * no Records. The page asks the pages' address once when it mounts; a `200` shows the frame, anything else the
 * empty state. The frame's address carries `embedded=1`, so the pages render without their own top bar, the
 * client's color scheme as `theme`, so the pages match it, and the client's UI language as `lang`, so the pages
 * read in it.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import { IconArchiveOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { NS } from './locales.ts'
import css from './Records.module.css'

/** The client's color scheme, as the Records pages accept it in `?theme=`. */
export type ColorScheme = 'light' | 'dark'

/** Injected share of the Records page. */
export interface RecordsPageInjected {
  /** The Records pages as the Host answered them, relative to the document. */
  readonly href: string
  /** Whether the pages answer at the address; `false` for an error status, a failed request, or an abort. */
  readonly probe: (signal: AbortSignal) => Promise<boolean>
  /** The client's color scheme, observed for changes. */
  readonly colorScheme: ObservableSnapshot<ColorScheme>
  /** The client's UI language, observed for changes; the Records pages fall back to English for one they lack. */
  readonly language: ObservableSnapshot<LocaleId>
}

/** Props of the Records page. */
export type RecordsPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<RecordsPageInjected>

/** What the page knows about the pages' address. */
type Presence = 'asking' | 'present' | 'absent'

/**
 * The address the frame loads: the pages with the embedded flag, the client's color scheme, and the client's UI
 * language.
 * @param href - the Records pages, relative to the document.
 * @param scheme - the client's color scheme.
 * @param language - the client's UI language.
 * @returns the frame address.
 */
export function frameSrc(href: string, scheme: ColorScheme, language: LocaleId): string {
  return `${href}?embedded=1&theme=${scheme}&lang=${encodeURIComponent(language)}`
}

/**
 * Render the Records page.
 * @param props - the pages' address, the probe, the color scheme, the UI language, and copy.
 * @returns the frame, the empty state, or nothing while the probe runs.
 */
export function RecordsPage({ href, probe, colorScheme, language, t }: RecordsPageProps) {
  const [presence, setPresence] = useState<Presence>('asking')
  const scheme = useSyncExternalStore(listener => colorScheme.subscribe(listener), () => colorScheme.getSnapshot())
  const lang = useSyncExternalStore(listener => language.subscribe(listener), () => language.getSnapshot())
  useEffect(() => {
    const controller = new AbortController()
    void probe(controller.signal).then((present) => {
      if (!controller.signal.aborted) setPresence(present ? 'present' : 'absent')
    })
    return () => { controller.abort() }
  }, [href, probe])
  return (
    <div className={css.page} data-testid="flowleap-records">
      {presence === 'present' && <iframe className={css.frame} src={frameSrc(href, scheme, lang)} title={t('frame')} />}
      {presence === 'absent' && (
        <div className={css.empty} role="status">
          <h2>{t('empty.title')}</h2>
          <p>{t('empty.body')}</p>
        </div>
      )}
    </div>
  )
}

/** Props of the Records launcher glyph. */
export type RecordsIconProps = Pick<SidebarPanelIconOwnerProps, 'size'>

/**
 * Render the Records launcher glyph.
 * @param props - the requested size.
 * @returns the glyph.
 */
export function RecordsIcon({ size }: RecordsIconProps) {
  return <IconArchiveOutlineRegular size={size} />
}
