/**
 * The office action board page: the header with the deadline and the review count, the analysis picker, the saved
 * analysis with its chat link, one card for each objection, the side panel of the open objection, the actions, and the
 * review footer. Without a saved analysis it shows how to start one.
 */

import { useState } from 'react'
import {
  Button, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconListPenOutlineRegular,
  IconPlusOutlineRegular, IconShareOutlineRegular, Menu, StateDot, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { NEW_REVIEW, type WorkPageId, type WorkPageSummary, type WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { brandString } from '@deepseek-ai/dsh-brand'
import { daysUntil, type Board } from './board.ts'
import type { NS } from './locales.ts'
import { AnalysisForm } from './AnalysisForm.tsx'
import { ObjectionCard } from './ObjectionCard.tsx'
import { ObjectionPanel } from './ObjectionPanel.tsx'
import css from './WorkPages.module.css'

type T = TranslateNS<typeof NS>

/** Injected share of the page: the board. */
export type OfficeActionBoardInjected = Board & {
  /**
   * The current time in milliseconds, for the days to the deadline.
   * @returns the time.
   */
  readonly now: () => number
}

/** Full props of the page. */
export type OfficeActionBoardProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<OfficeActionBoardInjected>

function dateFormat(t: T): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeZone: 'UTC' })
}

/**
 * Render the menu that chooses the analysis on show.
 * @param props.pages - the pages.
 * @param props.current - the page on show.
 * @param props.onChoose - the chosen page.
 * @param props.t - copy.
 * @returns the anchored menu.
 */
function PagePicker({ pages, current, onChoose, t }: {
  pages: readonly WorkPageSummary[]
  current: WorkPageSummary
  onChoose: (id: WorkPageId) => void
  t: T
}) {
  const [open, setOpen] = useState(false)
  const date = dateFormat(t)
  const label = (page: WorkPageSummary) => t('header.pageItem', { application: page.application, date: date.format(Date.parse(page.savedAt)) })
  return (
    <Menu
      open={open}
      portal
      dense
      onClose={() => { setOpen(false) }}
      selectedId={current.id}
      items={pages.map(page => ({ id: page.id, label: label(page) }))}
      onSelect={(id) => {
        setOpen(false)
        onChoose(brandString<WorkPageId>(id))
      }}
      anchor={(
        <Button variant="outline" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
          {t('header.pageLabel', { page: label(current) })}
          <IconChevronDownOutlineRegular size={12} />
        </Button>
      )}
    />
  )
}

/**
 * Render the header items about the time limit.
 * @param props.view - the page on show.
 * @param props.now - the current time in milliseconds.
 * @param props.t - copy.
 * @returns the list items.
 */
function Deadline({ view, now, t }: { view: WorkPageView; now: number; t: T }) {
  const { deadline, issued } = view.file.findings
  const date = dateFormat(t)
  const days = (limit: string) => daysUntil(limit, now)
  return (
    <>
      {deadline === null
        ? <li className={css.due}>{t('header.noDeadline')}</li>
        : (
          <>
            <li className={css.due}>{days(deadline) < 0 ? t('header.overdue', { days: -days(deadline) }) : t('header.due', { days: days(deadline) })}</li>
            <li>{t('header.dueDate', { date: date.format(Date.parse(deadline)) })}</li>
          </>
        )}
      {issued !== null && <li>{t('header.issued', { date: date.format(Date.parse(issued)) })}</li>}
    </>
  )
}

/**
 * Render the board.
 * @param props - the board, its actions, and copy.
 * @returns the page.
 */
export function OfficeActionBoard(props: OfficeActionBoardProps) {
  const { useBoard, select, setReview, setFormOpen, dismiss, writePlan, openChat, startAnalysis, choose, retry, now, t } = props
  const status = useBoard(snapshot => snapshot.status)
  const pages = useBoard(snapshot => snapshot.pages)
  const view = useBoard(snapshot => snapshot.page)
  const selected = useBoard(snapshot => snapshot.selected)
  const formOpen = useBoard(snapshot => snapshot.formOpen)
  const sending = useBoard(snapshot => snapshot.sending)
  const notice = useBoard(snapshot => snapshot.notice)
  const open = view?.file.findings.objections.find(objection => objection.id === selected)
  return (
    <section className={css.page} aria-label={t('page.label')} data-testid="office-action-board">
      <div className={css.content}>
        <header className={css.header}>
          <div className={css.headerCopy}>
            <p className={css.kicker}>{t('header.kicker')}</p>
            {view !== null && (
              <>
                <h1 className={css.title}>{t('header.title', { application: view.file.findings.application, communication: view.file.findings.communication })}</h1>
                <ul className={css.meta}>
                  <Deadline view={view} now={now()} t={t} />
                  <li className={css.metaItem}>
                    <Tag tone="warning">{t('header.needsReview', { count: view.summary.needsReview })}</Tag>
                  </li>
                </ul>
              </>
            )}
          </div>
          <div className={css.actions}>
            <Button variant="outline" size="sm" icon={<IconPlusOutlineRegular size={14} />} onClick={() => { setFormOpen(true) }}>{t('action.new')}</Button>
            {view !== null && (
              <>
                <Button variant="primary" size="sm" disabled={sending} icon={<IconListPenOutlineRegular size={14} />} onClick={() => { void writePlan() }}>{t('action.plan')}</Button>
                <Tooltip label={t('action.exportTooltip')} side="bottom" portal>
                  <span tabIndex={0} data-testid="export-anchor">
                    <Button variant="outline" size="sm" disabled icon={<IconDownloadOutlineRegular size={14} />}>{t('action.export')}</Button>
                  </span>
                </Tooltip>
                <Tooltip label={t('action.shareTooltip')} side="bottom" portal>
                  <span tabIndex={0} data-testid="share-anchor">
                    <Button variant="outline" size="sm" disabled icon={<IconShareOutlineRegular size={14} />}>{t('action.share')}</Button>
                  </span>
                </Tooltip>
              </>
            )}
          </div>
        </header>
        {notice !== null && (
          <div className={css.notice} role="status">
            <span>{t(`notice.${notice}`)}</span>
            <Button size="sm" aria-label={t('notice.dismiss')} icon={<IconCloseOutlineRegular size={12} />} onClick={dismiss} />
          </div>
        )}
        {view === null && status === 'loading' && <p className={css.muted} role="status">{t('status.loading')}</p>}
        {status === 'error' && (
          <div className={css.notice} role="alert">
            <span>{t('status.error')}</span>
            <Button size="sm" variant="outline" onClick={() => { void retry() }}>{t('status.retry')}</Button>
          </div>
        )}
        {view === null && status === 'ready' && (
          <div className={css.empty} data-testid="office-action-empty">
            <h2>{t('empty.title')}</h2>
            <p>{t('empty.body')}</p>
          </div>
        )}
        {view !== null && (
          <>
            <div className={css.run} role="status" aria-label={t('run.label')}>
              <span className={css.runText}>
                <StateDot state="done" />
                <span>{t('run.saved', { date: dateFormat(t).format(Date.parse(view.summary.savedAt)) })}</span>
              </span>
              {pages.length > 1 && <PagePicker pages={pages} current={view.summary} onChoose={(id) => { void choose(id) }} t={t} />}
              <button type="button" className={css.link} onClick={openChat}>{t('run.openChat')}</button>
            </div>
            {view.file.findings.documents.length > 0 && (
              <ul className={css.documents} aria-label={t('docs.label')}>
                {view.file.findings.documents.map((document, index) => (
                  <li key={`${index}-${document.label}`}>
                    {document.label !== '' && <span className={css.docLabel}>{document.label}</span>}
                    {document.text}
                  </li>
                ))}
              </ul>
            )}
            <div className={css.layout} data-panel-open={open === undefined ? undefined : ''}>
              <div>
                <h2 className={css.listHeading}>
                  {t('list.heading')}
                  <span className={css.listCount}>{t('list.count', { count: view.file.findings.objections.length })}</span>
                </h2>
                <ul className={css.cards} aria-label={t('list.label')}>
                  {view.file.findings.objections.map(objection => (
                    <ObjectionCard
                      key={objection.id}
                      objection={objection}
                      // The Host refuses a file whose review keys differ from the objection ids; the index type allows a miss.
                      review={view.file.review[objection.id] ?? NEW_REVIEW}
                      selected={objection.id === selected}
                      onOpen={() => { select(objection.id === selected ? null : objection.id) }}
                      onReview={(fields) => { void setReview(objection.id, fields) }}
                      t={t}
                    />
                  ))}
                </ul>
              </div>
              {open !== undefined && (
                <ObjectionPanel objection={open} comparison={view.file.findings.comparison} onClose={() => { select(null) }} t={t} />
              )}
            </div>
            <p className={css.footer}>{t('footer')}</p>
          </>
        )}
      </div>
      <AnalysisForm open={formOpen} onClose={() => { setFormOpen(false) }} onStart={startAnalysis} t={t} />
    </section>
  )
}
