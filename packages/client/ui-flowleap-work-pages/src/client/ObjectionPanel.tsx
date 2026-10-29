/** Side panel of one objection: the examiner's text, each claim feature beside its cited passage, and the response options. */

import { Button, IconCloseOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Objection } from './board.ts'
import type { NS } from './locales.ts'
import { basisLabel } from './ObjectionCard.tsx'
import css from './WorkPages.module.css'

/**
 * Render the side panel.
 * @param props.objection - the open objection.
 * @param props.onClose - close the panel.
 * @param props.t - copy.
 * @returns the panel.
 */
export function ObjectionPanel({ objection, onClose, t }: { objection: Objection; onClose: () => void; t: TranslateNS<typeof NS> }) {
  return (
    <aside className={css.side} aria-label={t('side.label')} data-testid="objection-panel">
      <div className={css.sideHeader}>
        <h2 className={css.sideTitle}>{basisLabel(t, objection)} · {t(`basis.${objection.basis}.name`)}</h2>
        <Button size="sm" aria-label={t('side.close')} icon={<IconCloseOutlineRegular size={14} />} onClick={onClose} />
      </div>
      <section className={css.sideSection}>
        <h3>{t('side.examiner')}</h3>
        <blockquote className={css.quote}>{objection.examinerText}</blockquote>
      </section>
      <section className={css.sideSection}>
        <h3>{t('side.comparison')}</h3>
        <ul className={css.compare}>
          {objection.comparison.map(row => (
            <li key={`${row.feature}-${row.source}`} className={css.compareRow}>
              <span className={css.compareCell}>
                <span className={css.compareRef}>{t('side.feature', { feature: row.feature })}</span>
                <span>{row.claimText}</span>
              </span>
              <span className={css.compareCell}>
                <span className={css.compareRef}>{row.source}</span>
                <span>{row.passage}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={css.sideSection}>
        <h3>{t('side.options')}</h3>
        <ul className={css.options}>
          {objection.options.map(option => (
            <li key={option.kind} className={css.option}>
              <Tag tone={option.kind === 'accept' ? 'neutral' : 'info'}>{t(`response.${option.kind}`)}</Tag>
              <span>{option.summary}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
