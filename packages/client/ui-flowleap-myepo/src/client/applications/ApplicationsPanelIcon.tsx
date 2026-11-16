/** Sidebar launcher glyph of the Applications page. */

import { IconFolderOpenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Props of the launcher glyph. */
export type ApplicationsPanelIconProps = Pick<PropsRuntime<'sidebar.panellist'>, 'size'>

/**
 * Render the launcher glyph; the Sidebar owns the launcher's accessible name.
 * @param props - the requested glyph edge.
 * @returns the glyph.
 */
export function ApplicationsPanelIcon({ size }: ApplicationsPanelIconProps) {
  return <IconFolderOpenOutlineRegular size={size} />
}
