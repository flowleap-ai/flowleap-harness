/**
 * Side panel of one objection: the ground, the legal basis, the examiner's reasoning, the cited documents, the
 * assessment, the claim tables of the claims that the objection hits, the response options, what a reply must address,
 * the confidence and the sources, as the analysis gave them.
 */

import type { ReactNode } from 'react'
import { Button, IconCloseOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaimTable, Objection } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

/**
 * Render one titled section; an empty text renders nothing.
 * @param props.title - the section title.
 * @param props.text - the text, or empty for children only.
 * @param props.children - content below the text.
 * @returns the section, or nothing.
 */
function Section({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  if ((text === undefined || text === '') && children === undefined) return null
  return (
    <section className={css.sideSection}>
      <h3>{title}</h3>
      {text !== undefined && text !== '' && <p className={css.sideText}>{text}</p>}
      {children}
    </section>
  )
}

/** Props of the side panel. */
export interface ObjectionPanelProps {
  readonly objection: Objection
  /** The claim tables of the analysis; the panel shows those of the claims that the objection hits. */
  readonly comparison: readonly ClaimTable[]
  readonly onClose: () => void
  readonly t: TranslateNS<typeof NS>
}

/**
 * Render the side panel.
 * @param props - the open objection, the claim tables, the close action, and copy.
 * @returns the panel.
 */
export function ObjectionPanel({ objection, comparison, onClose, t }: ObjectionPanelProps) {
  const tables = comparison.filter(table => objection.claims.includes(table.claim))
  return (
    <aside className={css.side} aria-label={t('side.label')} data-testid="objection-panel">
      <div className={css.sideHeader}>
        <h2 className={css.sideTitle}>{t('card.objection', { id: objection.id })} · {objection.title}</h2>
        <Button size="sm" aria-label={t('side.close')} icon={<IconCloseOutlineRegular size={14} />} onClick={onClose} />
      </div>
      <Section title={t('side.ground')} text={objection.ground} />
      <Section title={t('side.legalBasis')} text={objection.legalBasis} />
      <Section title={t('side.examiner')} text={objection.reasoning} />
      <Section title={t('side.source')} text={objection.source} />
      {objection.citations.length > 0 && (
        <Section title={t('side.citations')}>
          <ul className={css.compare}>
            {objection.citations.map((citation, index) => (
              <li key={`${index}-${citation.document}`} className={css.compareRow}>
                <span className={css.compareCell}>
                  <span className={css.compareRef}>{citation.document}</span>
                  <span>{[citation.role, citation.passage].filter(part => part !== '').join(' · ')}</span>
                </span>
                <span className={css.compareCell}>
                  <span>{citation.says}</span>
                  {citation.anchor !== '' && <span className={css.compareRef}>{citation.anchor}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t('side.assessment')} text={objection.assessment} />
      {tables.length > 0 && (
        <Section title={t('side.comparison')}>
          {tables.map((table, tableIndex) => (
            <div key={`${tableIndex}-${table.heading}`}>
              <p className={css.compareHeading}>{table.heading}</p>
              {table.interpretation !== '' && <p className={css.sideText}>{table.interpretation}</p>}
              <ul className={css.compare}>
                {table.rows.map((row, index) => (
                  <li key={`${index}-${row.element}`} className={css.compareRow}>
                    <span className={css.compareCell}>
                      <span>{row.element}</span>
                      <span className={css.compareRef}>{row.examiner}</span>
                    </span>
                    <span className={css.compareCell}>
                      <span>{row.cited}</span>
                      <Tag tone="neutral">{row.assessment}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
              {table.arrangement !== '' && <p className={css.sideText}>{table.arrangement}</p>}
            </div>
          ))}
        </Section>
      )}
      {objection.options.length > 0 && (
        <Section title={t('side.options')}>
          <ul className={css.options}>
            {objection.options.map((option, index) => (
              <li key={`${index}-${option.label}`} className={css.option}>
                <Tag tone="info">{option.label}</Tag>
                <span>{option.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t('side.reply')} text={objection.replyMustAddress} />
      <Section title={t('side.confidence')} text={objection.confidence} />
      <Section title={t('side.sources')} text={objection.sources} />
    </aside>
  )
}
