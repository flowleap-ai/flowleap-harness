/**
 * The Letters page: the mirror of the firm's MyEPO Mailbox in three panes. The first pane lists the views (all,
 * unread, not handled) and the Mailbox folders; the second lists the letters of the view; the third shows the open
 * letter with the fields of the MyEPO list and its PDF. Below 900 px of page width the views are a menu above the
 * list, and below 620 px the list and the letter are separate screens. The open letter can use the full width.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular,
  IconDownloadOutlineRegular, IconFolderOpenOutlineRegular, IconFullscreenOutlineRegular, IconInfoOutlineRegular,
  IconRightUpOutlineRegular, IconSearchOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MyEpoFolderView, MyEpoLetterView } from '@deepseek-ai/dsh-api-remotes/client'
import type { NS } from './locales.ts'
import { inView, shownLetters, type LetterPdf, type Mailbox, type MailboxFailure, type MailboxViewId } from './mailbox.ts'
import css from './Letters.module.css'

type T = TranslateNS<typeof NS>

/** Full props of the page. */
export type LettersPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<Mailbox>

/** A title longer than this many characters shows three lines until the person asks for all of it. */
const LONG_TITLE = 160

/** One line of text that fades at its end when it does not fit; the full text is then its tooltip. */
function Line({ text, className = '' }: { text: string; className?: string | undefined }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    // The span of this component is mounted when a layout effect runs.
    const element = ref.current as HTMLSpanElement
    setCut(element.scrollWidth > element.clientWidth + 1)
  }, [text])
  return (
    <span ref={ref} dir="auto" className={`${css.line} ${className}`} data-cut={cut ? '' : undefined} title={cut ? text : undefined}>
      {text}
    </span>
  )
}

/** A calendar date of the MyEPO list; the EPO writes it without a time zone. */
function dateOf(t: T, date: string): string {
  return new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(date))
}

/** The title of a letter, or the document code when the EPO gave no title. */
function titleOf(t: T, letter: MyEpoLetterView): string {
  return letter.title.trim() === '' ? t('row.noTitle', { code: letter.documentCode }) : letter.title
}

/** The name of the folder that holds a letter. */
function folderOf(t: T, folders: readonly MyEpoFolderView[], letter: MyEpoLetterView): string {
  return folders.find(folder => folder.id === letter.folderId)?.name ?? t('folder.unknown')
}

/** The sentence of a read that gave no list. */
function failureText(t: T, failure: MailboxFailure): string {
  switch (failure.kind) {
    case 'not-linked': return t('state.notLinked.body')
    case 'refused': return t('state.refused')
    case 'unreachable': return t('state.unreachable')
    case 'failed':
    case 'error': return t('state.failed', { message: failure.message })
  }
}

/** The PDF of the open letter: the download in progress, why there is none, or the frame. */
function Pdf({ pdf, t }: { pdf: LetterPdf; t: T }) {
  if (pdf.status === 'loading') return <p className={css.pdfNote} role="status">{t('pdf.loading')}</p>
  if (pdf.status === 'failed') return <p className={css.pdfNote} role="alert">{t('pdf.failed', { message: pdf.message })}</p>
  return <iframe className={css.pdf} src={pdf.url} title={t('pdf.title')} />
}

/**
 * Render the Letters page.
 * @param props - the Mailbox model and the copy.
 * @returns the page.
 */
export function LettersPage(props: LettersPageProps) {
  const { useMailbox, refresh, select, step, setView, setQuery, more, setWide, t } = props
  const snapshot = useMailbox(state => state)
  const [fullTitle, setFullTitle] = useState(false)
  const { letters, folders, selected, wide, pdf, failure } = snapshot
  useEffect(() => { setFullTitle(false) }, [selected])

  const views: { id: MailboxViewId; label: string; folder: boolean }[] = [
    { id: 'all', label: t('view.all'), folder: false },
    { id: 'unread', label: t('view.unread'), folder: false },
    { id: 'open', label: t('view.open'), folder: false },
    ...folders.map(folder => ({ id: `folder:${folder.id}` as const, label: folder.name, folder: true })),
  ]
  const number = new Intl.NumberFormat(t('time.locale'))
  const count = (view: MailboxViewId): string => number.format(letters.filter(letter => inView(letter, view)).length)
  const all = shownLetters(snapshot)
  const rows = all.slice(0, snapshot.limit)
  const open = letters.find(letter => letter.id === selected)

  const keys = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); void step(1) }
    else if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); void step(-1) }
    else if (event.key === 'f' && open !== undefined) setWide(!wide)
    else if (event.key === 'Escape') {
      if (wide) setWide(false)
      else void select(null)
    }
  }

  if (snapshot.phase === 'loading') {
    return <section className={css.page} aria-label={t('page.label')}><p className={css.state} role="status">{t('state.loading')}</p></section>
  }
  if (failure !== null && snapshot.readAt === null) {
    return (
      <section className={css.page} aria-label={t('page.label')}>
        <div className={css.state} role="alert">
          {failure.kind === 'not-linked' ? <h2>{t('state.notLinked.title')}</h2> : null}
          <p>{failureText(t, failure)}</p>
          <button type="button" className={css.button} disabled={snapshot.reading} onClick={() => { void refresh() }}>{t('act.refresh')}</button>
        </div>
      </section>
    )
  }

  const viewButton = (view: (typeof views)[number]) => (
    <button key={view.id} type="button" className={css.view} aria-current={snapshot.view === view.id ? 'true' : undefined} onClick={() => { setView(view.id) }}>
      {view.folder ? <IconFolderOpenOutlineRegular size={16} /> : null}
      <Line text={view.label} />
      <span className={css.count}>{count(view.id)}</span>
    </button>
  )

  return (
    <section className={css.page} aria-label={t('page.label')} data-open={open === undefined ? undefined : ''} data-wide={open !== undefined && wide ? '' : undefined} onKeyDown={keys}>
      <nav className={css.views} aria-label={t('views.label')}>
        <div className={css.viewsHead}>{t('source')}</div>
        {views.filter(view => !view.folder).map(viewButton)}
        {folders.length > 0 ? <div className={css.viewsHead}>{t('views.folders')}</div> : null}
        {views.filter(view => view.folder).map(viewButton)}
      </nav>

      <div className={css.list}>
        <div className={css.bar}>
          <select className={css.viewSelect} aria-label={t('views.label')} value={snapshot.view} onChange={(event) => { setView(event.target.value as MailboxViewId) }}>
            {views.map(view => <option key={view.id} value={view.id}>{`${view.label} (${count(view.id)})`}</option>)}
          </select>
          <label className={css.search}>
            <IconSearchOutlineRegular size={16} />
            <input type="search" value={snapshot.query} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} onChange={(event) => { setQuery(event.target.value) }} />
          </label>
        </div>
        <div className={css.summary}>
          <span>{t('summary', { total: number.format(snapshot.total), unread: count('unread') })}</span>
          <button type="button" className={css.link} disabled={snapshot.reading} onClick={() => { void refresh() }}>{t('act.refresh')}</button>
        </div>
        {failure !== null && snapshot.readAt !== null
          ? <p className={css.notice} role="alert">{failureText(t, failure)} {t('state.stale', { time: new Intl.DateTimeFormat(t('time.locale'), { dateStyle: 'medium', timeStyle: 'short' }).format(Date.parse(snapshot.readAt)) })}</p>
          : null}
        <ul className={css.rows} aria-label={t('list.label')}>
          {rows.map(letter => (
            <li key={letter.id}>
              <button type="button" className={css.row} data-unread={letter.read ? undefined : ''} aria-current={letter.id === selected ? 'true' : undefined} onClick={() => { void select(letter.id) }}>
                <span className={css.dot} role="img" aria-label={letter.read ? undefined : t('row.unread')} aria-hidden={letter.read ? true : undefined} />
                <span className={css.rowText}>
                  <span className={css.rowTop}>
                    <Line text={letter.applicantName ?? t('row.noApplicant')} className={letter.applicantName === null ? css.muted : css.who} />
                    <span className={css.date}>{dateOf(t, letter.dispatchDate)}</span>
                  </span>
                  <span className={css.rowTitle} dir="auto" title={titleOf(t, letter)}>{titleOf(t, letter)}</span>
                  <Line className={css.muted} text={[letter.userReference, letter.applicationNumber].filter(part => part !== null).join(' · ') || t('row.noApplication')} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {rows.length === 0 ? <p className={css.empty}>{letters.length === 0 ? t('list.empty') : t('list.none')}</p> : null}
        {all.length > rows.length
          ? <button type="button" className={css.more} onClick={more}>{t('list.more', { count: number.format(Math.min(100, all.length - rows.length)), total: number.format(all.length) })}</button>
          : null}
        {snapshot.total > letters.length
          ? <p className={css.cut}>{t('list.cut', { shown: number.format(letters.length), total: number.format(snapshot.total) })}</p>
          : null}
      </div>

      <article className={css.letter} aria-label={t('pane.label')}>
        {open === undefined
          ? <p className={css.empty}>{t('pane.select')}</p>
          : (
            <>
              <header className={css.top}>
                <button type="button" className={`${css.icon} ${css.back}`} title={t('act.back')} aria-label={t('act.back')} onClick={() => { if (wide) setWide(false); else void select(null) }}><IconChevronLeftOutlineRegular size={16} /></button>
                <button type="button" className={css.icon} title={t('act.previous')} aria-label={t('act.previous')} onClick={() => { void step(-1) }}><IconChevronUpOutlineRegular size={16} /></button>
                <button type="button" className={css.icon} title={t('act.next')} aria-label={t('act.next')} onClick={() => { void step(1) }}><IconChevronDownOutlineRegular size={16} /></button>
                <span className={css.spacer} />
                {open.digitalFile === null ? null : <a className={css.button} href={open.digitalFile} target="_blank" rel="noreferrer" title={t('act.myepo')}><IconRightUpOutlineRegular size={16} /><span className={css.label}>{t('act.myepo')}</span></a>}
                {pdf?.status === 'ready'
                  ? <a className={css.button} href={pdf.url} download={pdf.fileName} title={t('act.download')}><IconDownloadOutlineRegular size={16} /><span className={css.label}>{t('act.download')}</span></a>
                  : null}
                <button type="button" className={css.button} aria-pressed={wide} title={wide ? t('act.panes') : t('act.wide')} onClick={() => { setWide(!wide) }}><IconFullscreenOutlineRegular size={16} /><span className={css.label}>{wide ? t('act.panes') : t('act.wide')}</span></button>
                <button type="button" className={css.icon} title={t('act.close')} aria-label={t('act.close')} onClick={() => { void select(null) }}><IconCloseOutlineRegular size={16} /></button>
              </header>
              <div className={css.head}>
                <div className={css.tags}>
                  <span className={css.tag} data-tone={open.handled ? 'done' : 'open'}>{open.handled ? t('tag.handled') : t('tag.open')}</span>
                  <span className={css.tag} title={folderOf(t, folders, open)}>{folderOf(t, folders, open)}</span>
                  <span className={css.tag} title={open.documentCode}>{open.documentCode}</span>
                </div>
                <h1 className={css.title} dir="auto" data-clamp={open.title.length > LONG_TITLE && !fullTitle ? '' : undefined}>{titleOf(t, open)}</h1>
                {open.title.length > LONG_TITLE
                  ? <button type="button" className={`${css.link} ${css.titleMore}`} onClick={() => { setFullTitle(!fullTitle) }}>{fullTitle ? t('act.lessTitle') : t('act.fullTitle')}</button>
                  : null}
                <dl className={css.props}>
                  {([
                    ['prop.application', open.applicationNumber], ['prop.reference', open.userReference], ['prop.applicant', open.applicantName],
                    ['prop.recipient', open.recipientName], ['prop.dispatched', dateOf(t, open.dispatchDate)],
                  ] as const).map(([key, value]) => (
                    <div key={key}><dt>{t(key)}</dt><dd dir="auto" className={value === null ? css.muted : undefined}>{value ?? t('prop.none')}</dd></div>
                  ))}
                </dl>
                {snapshot.opened.includes(open.id) ? <p className={css.notice}><IconInfoOutlineRegular size={16} /><span>{t('pdf.read')}</span></p> : null}
              </div>
              {pdf !== null ? <Pdf pdf={pdf} t={t} /> : null}
            </>
          )}
      </article>
    </section>
  )
}
