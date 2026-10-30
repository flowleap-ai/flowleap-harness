/**
 * Side panel of one objection: the ground, the legal basis, the examiner's reasoning, the cited documents, the
 * assessment, the claim tables of the claims that the objection hits, the response options, what a reply must address,
 * the confidence and the sources, as the analysis gave them.
 */

import type { ReactNode } from 'react'
import { Button, IconCloseOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClaimTable, Objection } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { AnalysisText } from './AnalysisText.tsx'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

type T = TranslateNS<typeof NS>

/**
 * Render one titled section; an empty text renders nothing.
 * @param props.title - the section title.
 * @param props.text - the Markdown text, or empty for children only.
 * @param props.plain - the text is a short label that renders as plain text.
 * @param props.children - content below the text.
 * @param props.t - copy.
 * @returns the section, or nothing.
 */
function Section({ title, text, plain = false, children, t }: {
  title: string
  text?: string
  plain?: boolean
  children?: ReactNode
  t: T
}) {
  if ((text === undefined || text === '') && children === undefined) return null
  return (
    <section className={css.sideSection}>
      <h3>{title}</h3>
      {text !== undefined && text !== '' && (plain ? <p className={css.sideText}>{text}</p> : <AnalysisText className={css.sideText} text={text} t={t} />)}
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
  readonly t: T
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
      <Section title={t('side.ground')} text={objection.ground} plain t={t} />
      <Section title={t('side.legalBasis')} text={objection.legalBasis} t={t} />
      <Section title={t('side.examiner')} text={objection.reasoning} t={t} />
      <Section title={t('side.source')} text={objection.source} t={t} />
      {objection.citations.length > 0 && (
        <Section title={t('side.citations')} t={t}>
          <ul className={css.compare}>
            {objection.citations.map((citation, index) => (
              <li key={`${index}-${citation.document}`} className={css.compareRow}>
                <div className={css.compareCell}>
                  <span className={css.compareRef}>{citation.document}</span>
                  <span>{[citation.role, citation.passage].filter(part => part !== '').join(' · ')}</span>
                </div>
                <div className={css.compareCell}>
                  <AnalysisText text={citation.says} t={t} />
                  {citation.anchor !== '' && <span className={css.compareRef}>{citation.anchor}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t('side.assessment')} text={objection.assessment} t={t} />
      {tables.length > 0 && (
        <Section title={t('side.comparison')} t={t}>
          {tables.map((table, tableIndex) => (
            <div key={`${tableIndex}-${table.heading}`}>
              <p className={css.compareHeading}>{table.heading}</p>
              {table.interpretation !== '' && <AnalysisText className={css.sideText} text={table.interpretation} t={t} />}
              <ul className={css.compare}>
                {table.rows.map((row, index) => (
                  <li key={`${index}-${row.element}`} className={css.compareRow}>
                    <div className={css.compareCell}>
                      <AnalysisText text={row.element} t={t} />
                      <AnalysisText className={css.compareRef} text={row.examiner} t={t} />
                    </div>
                    <div className={css.compareCell}>
                      <AnalysisText text={row.cited} t={t} />
                      <Tag tone="neutral">{row.assessment}</Tag>
                    </div>
                  </li>
                ))}
              </ul>
              {table.arrangement !== '' && <AnalysisText className={css.sideText} text={table.arrangement} t={t} />}
            </div>
          ))}
        </Section>
      )}
      {objection.options.length > 0 && (
        <Section title={t('side.options')} t={t}>
          <ul className={css.options}>
            {objection.options.map((option, index) => (
              <li key={`${index}-${option.label}`} className={css.option}>
                <Tag tone="info">{option.label}</Tag>
                <AnalysisText text={option.text} t={t} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t('side.reply')} text={objection.replyMustAddress} t={t} />
      <Section title={t('side.confidence')} text={objection.confidence} t={t} />
      <Section title={t('side.sources')} text={objection.sources} t={t} />
    </aside>
  )
}
