/**
 * The office action board page: the header with the deadline and the review count, the analysis picker, the saved
 * analysis with its chat link, one card for each objection, the side panel of the open objection, the actions, and the
 * review footer. Without a saved analysis it shows how to start one. The page root and each picker row carry the work
 * page id in `data-work-page-id`; the notice of a newer save carries the id of that save.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Button, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconListPenOutlineRegular,
  IconPlusOutlineRegular, IconShareOutlineRegular, Menu, StateDot, Tag, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { NEW_REVIEW, type WorkPageId, type WorkPageSummary, type WorkPageView } from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { brandString } from '@deepseek-ai/dsh-brand'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
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

/** A calendar date of the analysis, such as the time limit; the analysis writes it without a time zone. */
function dateFormat(t: T): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeZone: 'UTC' })
}

/**
 * The date and time of a save in the time zone of the browser.
 * @param t - copy.
 * @param savedAt - RFC 3339 time of the save.
 * @returns the formatted time.
 */
function savedTime(t: T, savedAt: string): string {
  return new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(savedAt))
}

/**
 * The first line of a page in the picker: the application and the save time.
 * @param page - the page.
 * @param t - copy.
 * @returns the line.
 */
function pageLabel(page: WorkPageSummary, t: T): string {
  return t('header.pageItem', { application: page.application, date: savedTime(t, page.savedAt) })
}

/** Title and working directory of a chat, as the Session list has them. */
interface ChatName {
  readonly title?: string
  readonly displayTitle: string
  readonly cwd?: string
}

/**
 * The chat that saved a page and its workspace folder, so that two saves of one application on one day differ.
 * @param chat - the chat, or `undefined` when the Session list does not have it.
 * @param t - copy.
 * @returns the line, or `undefined` without the chat.
 */
function chatLine(chat: ChatName | undefined, t: T): string | undefined {
  if (chat === undefined) return undefined
  const folder = chat.cwd === undefined ? '' : workspaceTitleOf(chat.cwd)
  // Without a title, the display title is the folder name already.
  return chat.title === undefined || folder === '' ? chat.displayTitle : t('header.pageChat', { chat: chat.title, folder })
}

/**
 * Whether two chat lists hold the same chats in the same order.
 * @param left - one list.
 * @param right - the other list.
 * @returns the comparison.
 */
function sameChats(left: readonly (ChatName | undefined)[], right: readonly (ChatName | undefined)[]): boolean {
  return left.length === right.length && left.every((chat, index) => chat === right[index])
}

/**
 * Render the menu that chooses the analysis on show.
 * @param props.pages - the pages.
 * @param props.current - the page on show.
 * @param props.chats - the chat of each page, in the order of the pages.
 * @param props.onChoose - the chosen page.
 * @param props.t - copy.
 * @returns the anchored menu.
 */
function PagePicker({ pages, current, chats, onChoose, t }: {
  pages: readonly WorkPageSummary[]
  current: WorkPageSummary
  chats: readonly (ChatName | undefined)[]
  onChoose: (id: WorkPageId) => void
  t: T
}) {
  const [open, setOpen] = useState(false)
  const item = (page: WorkPageSummary, index: number) => {
    const where = chatLine(chats[index], t)
    return (
      <span className={css.pageItem} data-work-page-id={page.id}>
        <span>{pageLabel(page, t)}</span>
        {where !== undefined && <span className={css.pageItemChat}>{where}</span>}
      </span>
    )
  }
  return (
    <Menu
      open={open}
      portal
      dense
      listClassName={css.pageMenu}
      onClose={() => { setOpen(false) }}
      selectedId={current.id}
      items={pages.map((page, index) => ({ id: page.id, label: item(page, index) }))}
      onSelect={(id) => {
        setOpen(false)
        onChoose(brandString<WorkPageId>(id))
      }}
      anchor={(
        <Button variant="outline" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
          {t('header.pageLabel', { page: pageLabel(current, t) })}
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
  const {
    useBoard, useSessions, select, setReview, setFormOpen, dismiss, dismissNewer, writePlan, openChat, startAnalysis, choose, retry, now, t,
  } = props
  const status = useBoard(snapshot => snapshot.status)
  const pages = useBoard(snapshot => snapshot.pages)
  const view = useBoard(snapshot => snapshot.page)
  const opening = useBoard(snapshot => snapshot.opening)
  const newer = useBoard(snapshot => snapshot.newer)
  // Only the chats of the listed pages: a change of another chat, such as a streaming answer, does not render the board.
  const chats = useSessions(list => pages.map(page => list.byId[page.sessionId]), sameChats)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusShown = useRef(false)
  useEffect(() => {
    // "Show it" leaves the page with its notice, so the heading of the analysis it opens takes the focus.
    if (!focusShown.current || opening !== null) return
    focusShown.current = false
    heading.current?.focus()
  }, [opening])
  const selected = useBoard(snapshot => snapshot.selected)
  const formOpen = useBoard(snapshot => snapshot.formOpen)
  const sending = useBoard(snapshot => snapshot.sending)
  const notice = useBoard(snapshot => snapshot.notice)
  const open = view?.file.findings.objections.find(objection => objection.id === selected)
  const chosen = pages.find(page => page.id === opening)
  return (
    <section className={css.page} aria-label={t('page.label')} data-testid="office-action-board" data-work-page-id={view?.summary.id}>
      <div className={css.content}>
        <header className={css.header}>
          <div className={css.headerCopy}>
            <p className={css.kicker}>{t('header.kicker')}</p>
            {view !== null && (
              <>
                <h1 className={css.title} ref={heading} tabIndex={-1}>{t('header.title', { application: view.file.findings.application, communication: view.file.findings.communication })}</h1>
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
                <Button variant="primary" size="sm" disabled={sending || opening !== null} icon={<IconListPenOutlineRegular size={14} />} onClick={() => { void writePlan() }}>{t('action.plan')}</Button>
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
        {/* A live region stays mounted and changes only its content, so that a screen reader announces the notice. */}
        <div role="status">
          {newer !== null && (
            <div className={css.notice} data-testid="office-action-newer" data-work-page-id={newer.id}>
              <span>{t('newer.text', { application: newer.application, date: savedTime(t, newer.savedAt) })}</span>
              <span className={css.noticeActions}>
                <Button size="sm" variant="outline" onClick={() => { focusShown.current = true; void choose(newer.id) }}>{t('newer.show')}</Button>
                <Button size="sm" aria-label={t('newer.dismiss')} icon={<IconCloseOutlineRegular size={12} />} onClick={dismissNewer} />
              </span>
            </div>
          )}
        </div>
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
                <span>{t('run.saved', { date: savedTime(t, view.summary.savedAt) })}</span>
              </span>
              {pages.length > 1 && (
                <PagePicker pages={pages} current={view.summary} chats={chats} onChoose={(id) => { void choose(id) }} t={t} />
              )}
              <button type="button" className={css.link} disabled={opening !== null} onClick={openChat}>{t('run.openChat')}</button>
            </div>
            <div role="status">
              {opening !== null && (
                <p className={css.opening} data-testid="office-action-opening" data-work-page-id={opening}>
                  <StateDot state="ongoing" />
                  {chosen === undefined ? t('status.openingUnknown') : t('status.opening', { page: pageLabel(chosen, t) })}
                </p>
              )}
            </div>
            {/* The page on show takes no change while the chosen page is read; `inert` also keeps focus and clicks out. */}
            <div
              className={css.shown}
              aria-busy={opening !== null}
              ref={(element) => { if (element !== null) element.inert = opening !== null }}
            >
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
                        // Two pages share objection ids; a draft of one page never moves to the other.
                        key={`${view.summary.id}:${objection.id}`}
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
            </div>
          </>
        )}
      </div>
      <AnalysisForm open={formOpen} onClose={() => { setFormOpen(false) }} onStart={startAnalysis} t={t} />
    </section>
  )
}
