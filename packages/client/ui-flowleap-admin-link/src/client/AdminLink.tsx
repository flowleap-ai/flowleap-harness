/**
 * The Firm admin row of the sidebar actions: a plain link to the firm admin console.
 */

import { IconShieldOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRowOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { NS } from './locales.ts'
import css from './AdminLink.module.css'

/** Injected share of the Firm admin row. */
export interface AdminLinkInjected {
  /** The firm admin console as the Host answered it, relative to the document. */
  readonly href: string
}

/** Props of the Firm admin row. */
export type AdminLinkActionProps = SidebarRowOwnerProps & PropsLocale<typeof NS> & InjectFace<AdminLinkInjected>

/**
 * Render the Firm admin row; on the rail it is the glyph with a tooltip. The link opens in the same tab.
 * @param props - the row classes, the column state, the link target, and copy.
 * @returns the row.
 */
export function AdminLinkAction({ wide, rowClassName, glyphClassName, titleClassName, href, t }: AdminLinkActionProps) {
  return (
    <Tooltip label={t('link')} delayMs={500} disabled={wide}>
      <a className={[rowClassName, css.link].filter(Boolean).join(' ')} href={href} aria-label={t('link')}>
        <span className={glyphClassName} aria-hidden="true"><IconShieldOutlineRegular size={wide ? 16 : 18} /></span>
        {wide && <span className={titleClassName}>{t('link')}</span>}
      </a>
    </Tooltip>
  )
}
