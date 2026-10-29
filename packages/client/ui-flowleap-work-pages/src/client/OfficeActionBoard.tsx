/**
 * The office action board page: the sample banner, the header with the deadline and the review count, the run state,
 * one card for each objection, the side panel of the open objection, the actions, and the review footer.
 */

import {
  Button, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconListPenOutlineRegular, IconPlusOutlineRegular,
  IconShareOutlineRegular, StateDot, Tag, TextShimmer, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { attorneyFieldsOf, CITATION_ORDER, daysUntil, needsReviewCount, type Board } from './board.ts'
import type { NS } from './locales.ts'
import { AnalysisForm } from './AnalysisForm.tsx'
import { ObjectionCard } from './ObjectionCard.tsx'
import { ObjectionPanel } from './ObjectionPanel.tsx'
import css from './WorkPages.module.css'

/** Injected share of the page: the board of one analysis. */
export type OfficeActionBoardInjected = Board & {
  /**
   * The current time in milliseconds, for the days to the deadline.
   * @returns the time.
   */
  readonly now: () => number
}

/** Full props of the page. */
export type OfficeActionBoardProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<OfficeActionBoardInjected>

/**
 * Render the board.
 * @param props - the board, its actions, and copy.
 * @returns the page.
 */
export function OfficeActionBoard({ analysis, useBoard, setState, setOwner, select, setFormOpen, notify, now, t }: OfficeActionBoardProps) {
  const attorney = useBoard(state => state.attorney)
  const selected = useBoard(state => state.selected)
  const formOpen = useBoard(state => state.formOpen)
  const notice = useBoard(state => state.notice)
  const date = new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeZone: 'UTC' })
  const days = daysUntil(analysis.deadline, now())
  const open = analysis.objections.find(objection => objection.id === selected)
  return (
    <section className={css.page} aria-label={t('page.label')} data-testid="office-action-board">
      <div className={css.content}>
        <div className={css.sample} role="note">
          <Tag tone="warning">{t('sample.title')}</Tag>
          <span>{t('sample.body')}</span>
        </div>
        <header className={css.header}>
          <div className={css.headerCopy}>
            <p className={css.kicker}>{t('header.kicker')}</p>
            <h1 className={css.title}>{t('header.title', { application: analysis.application, communication: analysis.communication })}</h1>
            <ul className={css.meta}>
              <li className={css.due}>{days < 0 ? t('header.overdue', { days: -days }) : t('header.due', { days })}</li>
              <li>{t('header.dueDate', { date: date.format(Date.parse(analysis.deadline)) })}</li>
              <li>{t('header.issued', { date: date.format(Date.parse(analysis.issued)) })}</li>
              <li>{t('header.owner', { owner: analysis.owner })}</li>
              <li className={css.metaItem}>
                <Tag tone="warning">{t('header.needsReview', { count: needsReviewCount(attorney) })}</Tag>
              </li>
            </ul>
          </div>
          <div className={css.actions}>
            <Button variant="outline" size="sm" icon={<IconPlusOutlineRegular size={14} />} onClick={() => { setFormOpen(true) }}>{t('action.new')}</Button>
            <Button variant="primary" size="sm" icon={<IconListPenOutlineRegular size={14} />} onClick={() => { notify('plan') }}>{t('action.plan')}</Button>
            <Button variant="outline" size="sm" icon={<IconDownloadOutlineRegular size={14} />} onClick={() => { notify('export') }}>{t('action.export')}</Button>
            <Tooltip label={t('action.shareTooltip')} side="bottom" portal>
              <span tabIndex={0} data-testid="share-anchor">
                <Button variant="outline" size="sm" disabled icon={<IconShareOutlineRegular size={14} />}>{t('action.share')}</Button>
              </span>
            </Tooltip>
          </div>
        </header>
        {notice !== null && (
          <div className={css.notice} role="status">
            <span>{t(`notice.${notice}`)}</span>
            <Button size="sm" aria-label={t('notice.dismiss')} icon={<IconCloseOutlineRegular size={12} />} onClick={() => { notify(null) }} />
          </div>
        )}
        <div className={css.run} role="status" aria-label={t('run.label')}>
          <span className={css.runText}>
            <StateDot state="ongoing" />
            <TextShimmer>{t('run.reading')}</TextShimmer>
            <span className={css.runStep}>{t('run.step', { step: analysis.run.step, steps: analysis.run.steps })}</span>
          </span>
          <button type="button" className={css.link} onClick={() => { notify('chat') }}>{t('run.openChat')}</button>
        </div>
        <ul className={css.documents} aria-label={t('docs.label')}>
          {CITATION_ORDER.map(label => (
            <li key={label}>
              <span className={css.docLabel}>{label}</span>
              {analysis.documents[label].number} · {analysis.documents[label].title}
            </li>
          ))}
        </ul>
        <div className={css.layout} data-panel-open={open === undefined ? undefined : ''}>
          <div>
            <h2 className={css.listHeading}>
              {t('list.heading')}
              <span className={css.listCount}>{t('list.count', { count: analysis.objections.length })}</span>
            </h2>
            <ul className={css.cards} aria-label={t('list.label')}>
              {analysis.objections.map(objection => (
                <ObjectionCard
                  key={objection.id}
                  objection={objection}
                  fields={attorneyFieldsOf(attorney, objection.id)}
                  documents={analysis.documents}
                  selected={objection.id === selected}
                  onOpen={() => { select(objection.id === selected ? null : objection.id) }}
                  onState={(state) => { setState(objection.id, state) }}
                  onOwner={(owner) => { setOwner(objection.id, owner) }}
                  t={t}
                />
              ))}
            </ul>
          </div>
          {open !== undefined && <ObjectionPanel objection={open} onClose={() => { select(null) }} t={t} />}
        </div>
        <p className={css.footer}>{t('footer')}</p>
      </div>
      <AnalysisForm
        open={formOpen}
        analysis={analysis}
        onClose={() => { setFormOpen(false) }}
        onStart={() => { setFormOpen(false); notify('run') }}
        t={t}
      />
    </section>
  )
}
