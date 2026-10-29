/** Sidebar launcher glyph of the Office actions page, with a dot while an objection needs review. */

import { IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { needsReviewCount, type Board } from './board.ts'
import css from './WorkPages.module.css'

/** Props of the launcher glyph. */
export type WorkPagesPanelIconProps = Pick<PropsRuntime<'sidebar.panellist'>, 'size'> & InjectFace<Pick<Board, 'hooks'>>

/**
 * Render the launcher glyph; the Sidebar owns the launcher's accessible name.
 * @param props - the requested glyph edge and the board.
 * @returns the glyph, with the dot when the count is above zero; the count is in `data-work-pages-count`.
 */
export function WorkPagesPanelIcon({ size, useBoard }: WorkPagesPanelIconProps) {
  const count = useBoard(snapshot => needsReviewCount(snapshot.pages))
  if (count === 0) return <IconListPenOutlineRegular size={size} />
  return (
    <span className={css.panelIcon}>
      <IconListPenOutlineRegular size={size} />
      <span className={css.count} data-work-pages-count={count} />
    </span>
  )
}
