/**
 * The Install FlowLeap card: the browser's own app install now; the desktop app (#75), the phone (#76), and the MCP
 * door (#77) as "Coming later".
 */

import { useEffect, useState } from 'react'
import {
  Button, IconDownloadOutlineRegular, IconGlobeOutlineRegular, IconLinkOutlineRegular, IconUserOutlineRegular, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './Dashboard.module.css'

/** The `beforeinstallprompt` event of Chromium browsers; not in the DOM library types. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

/**
 * Keep the deferred browser install prompt while the browser offers one.
 * @returns the prompt event, or `undefined` while the browser offers none.
 */
function useInstallPrompt(): InstallPromptEvent | undefined {
  const [prompt, setPrompt] = useState<InstallPromptEvent>()
  useEffect(() => {
    const offer = (event: Event): void => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const installed = (): void => { setPrompt(undefined) }
    window.addEventListener('beforeinstallprompt', offer)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', offer)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])
  return prompt
}

/**
 * Render the card.
 * @param props - copy.
 * @returns the card.
 */
export function InstallCard({ t }: PropsLocale<typeof NS>) {
  const prompt = useInstallPrompt()
  const later = [
    { id: 'desktop', icon: <IconDownloadOutlineRegular size={16} /> },
    { id: 'phone', icon: <IconUserOutlineRegular size={16} /> },
    { id: 'mcp', icon: <IconLinkOutlineRegular size={16} /> },
  ] as const
  return (
    <section className={css.panel} role="listitem" aria-label={t('install.title')} data-testid="flowleap-install">
      <h2 className={css.panelHeading}>{t('install.title')}</h2>
      <p className={css.panelSummary}>{t('install.summary')}</p>
      <ul className={css.installRows}>
        <li className={css.installRow}>
          <span className={css.installGlyph} aria-hidden="true"><IconGlobeOutlineRegular size={16} /></span>
          <span className={css.rowText}>
            <span className={css.rowTitle}>{t('install.browser.title')}</span>
            <span className={css.rowMeta}>{prompt === undefined ? t('install.browser.manual') : t('install.browser.description')}</span>
          </span>
          {prompt !== undefined && (
            <Button variant="outline" size="sm" onClick={() => { void prompt.prompt() }}>{t('install.browser.action')}</Button>
          )}
        </li>
        {later.map(row => (
          <li key={row.id} className={css.installRow}>
            <span className={css.installGlyph} aria-hidden="true">{row.icon}</span>
            <span className={css.rowText}>
              <span className={css.rowTitle}>{t(`install.${row.id}.title`)}</span>
              <span className={css.rowMeta}>{t(`install.${row.id}.description`)}</span>
            </span>
            <Tag tone="neutral">{t('install.later')}</Tag>
          </li>
        ))}
      </ul>
    </section>
  )
}
