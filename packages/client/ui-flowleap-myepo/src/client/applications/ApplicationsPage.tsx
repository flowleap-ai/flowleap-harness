/**
 * The Applications page: the mirror of the firm's MyEPO applications as a docket table with the open application in
 * a side panel. The table has the fields of the MyEPO list; the title, the applicant and the next due date of a row
 * show when the data of its application is read. The side panel shows the EPO due dates, the pending fees and the
 * bibliographic data. Below 900 px of page width the table keeps four columns, and below 620 px the table and the
 * open application are separate screens.
 */

import { useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular,
  IconInfoOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { MyEpoApplicationDetailView, MyEpoApplicationView, MyEpoDueDateView } from '@deepseek-ai/dsh-api-remotes/client'
import type { NS } from '../locales/applications.ts'
import { dateOf as dateIn } from '../shared/read.ts'
import { failureText, isUnread, readCopy, SearchField, StaleNotice, Summary, Unread, type ReadCopy } from '../shared/ReadParts.tsx'
import {
  applicantOf, applicationKey, nextDueOf, shownApplications, titleOf,
  type ApplicationData, type Docket, type DocketColumn, type DocketViewId,
} from './docket.ts'
import css from './Applications.module.css'

type T = TranslateNS<typeof NS>

/** Injected share of the page: the docket model and the clock. */
export type ApplicationsPageInjected = Docket & {
  /**
   * Today as an ISO calendar date, for the next due date and the past mark.
   * @returns the date.
   */
  readonly today: () => string
}

/** Full props of the page. */
export type ApplicationsPageProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<ApplicationsPageInjected>

/** How many entries of a party or class list show before "show all". */
const FEW = 4

/** A calendar date of MyEPO in the locale of the page. */
function dateOf(t: T, date: string): string {
  return dateIn(t('time.locale'), date)
}

/** The words of a due date's term in the language of the page, or the key of a term that the EPO's list does not have. */
function termOf(t: T, due: MyEpoDueDateView): string {
  if (due.description === null) return t('due.unknown', { key: due.termKey })
  const language = t('term.language')
  return language === 'de' ? due.description.de : language === 'fr' ? due.description.fr : due.description.en
}

/** A list that shows its first entries and all of them on request. */
function Few({ items, t }: { items: readonly string[]; t: T }) {
  const [all, setAll] = useState(false)
  if (items.length === 0) return <p className={css.none}>{t('cell.none')}</p>
  return (
    <>
      <ul className={css.few}>{(all ? items : items.slice(0, FEW)).map((item, at) => <li key={`${at}:${item}`} dir="auto">{item}</li>)}</ul>
      {items.length > FEW
        ? <button type="button" className={css.link} onClick={() => { setAll(!all) }}>{all ? t('few.less') : t('few.all', { count: items.length })}</button>
        : null}
    </>
  )
}

/** One titled section of the open application. */
function Section({ title, count, source, children }: { title: string; count?: number; source?: string; children: ReactNode }) {
  return (
    <section className={css.section}>
      <h2>
        <span>{title}</span>
        {count === undefined ? null : <span className={css.count}>{count}</span>}
        {source === undefined ? null : <span className={css.source}>{source}</span>}
      </h2>
      {children}
    </section>
  )
}

/** The data of the open application: the EPO due dates, the pending fees and the bibliographic data. */
function Detail({ detail, t, today }: { detail: Extract<MyEpoApplicationDetailView, { kind: 'read' }>; t: T; today: string }) {
  const amount = new Intl.NumberFormat(t('time.locale'), { minimumFractionDigits: 2 })
  // ISO dates sort as text.
  const dueDates = [...detail.dueDates].sort((left, right) => left.dueDate.localeCompare(right.dueDate))
  return (
    <>
      <Section title={t('sec.due')} count={dueDates.length} source={t('sec.due.source')}>
        {dueDates.length === 0
          ? <p className={css.none}>{t('sec.due.none')}</p>
          : (
            <table className={css.grid}>
              <thead><tr><th>{t('due.date')}</th><th>{t('due.term')}</th><th>{t('due.actor')}</th></tr></thead>
              <tbody>
                {dueDates.map((due, at) => (
                  <tr key={`${at}:${due.termKey}`} data-past={due.dueDate < today ? '' : undefined}>
                    <td className={css.nowrap}>{dateOf(t, due.dueDate)}{due.dueDate < today ? <span className={css.past}> {t('due.past')}</span> : null}</td>
                    <td>{termOf(t, due)}</td>
                    <td>{due.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>
      <Section title={t('sec.fees')} count={detail.fees.length} source={t('sec.fees.source')}>
        {detail.fees.length === 0
          ? <p className={css.none}>{t('sec.fees.none')}</p>
          : (
            <table className={css.grid}>
              <thead><tr><th>{t('due.date')}</th><th>{t('fee.code')}</th><th className={css.end}>{t('fee.amount')}</th></tr></thead>
              <tbody>
                {detail.fees.map((fee, at) => (
                  <tr key={`${at}:${fee.feeCode}`}>
                    <td className={css.nowrap}>{dateOf(t, fee.dueDate)}</td>
                    <td>{fee.feeCode}</td>
                    <td className={`${css.end} ${css.nowrap}`}>{fee.currency === null ? amount.format(fee.amount) : `${amount.format(fee.amount)} ${fee.currency}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Section>
      <Section title={t('sec.applicants')} count={detail.applicants.length}><Few items={detail.applicants} t={t} /></Section>
      <Section title={t('sec.representatives')}><Few items={detail.representatives} t={t} /></Section>
      <Section title={t('sec.inventors')} count={detail.inventors.length}><Few items={detail.inventors} t={t} /></Section>
      <Section title={t('sec.priorities')} count={detail.priorities.length}>
        <Few items={detail.priorities.map(priority => `${priority.office} ${priority.number} · ${dateOf(t, priority.filingDate)}`)} t={t} />
      </Section>
      <Section title={t('sec.publications')} count={detail.publications.length}>
        <Few items={detail.publications.map(publication => `${publication.office}${publication.number} ${publication.kind} · ${dateOf(t, publication.date)}`)} t={t} />
      </Section>
      <Section title={t('sec.classes')}>
        <h3>{t('class.ipc')}</h3>
        <Few items={detail.ipc} t={t} />
        <h3>{t('class.cpc')}</h3>
        <Few items={detail.cpc} t={t} />
      </Section>
    </>
  )
}

/** The state of the open application's data: on its way, why there is none, or the data. */
function OpenData({ data, t, copy, today, onRetry }: {
  data: ApplicationData | undefined
  t: T
  copy: ReadCopy
  today: string
  onRetry: () => void
}) {
  if (data === undefined || data.status === 'loading') return <p className={css.note} role="status">{t('detail.reading')}</p>
  const retry = <button type="button" className={css.button} onClick={onRetry}>{t('detail.retry')}</button>
  if (data.status === 'failed') return <div className={css.note} role="alert"><p>{t('detail.failed', { message: data.message })}</p>{retry}</div>
  const { detail } = data
  if (detail.kind === 'read') return <Detail detail={detail} t={t} today={today} />
  if (detail.kind === 'no-permission') {
    return <p className={css.notice}><IconInfoOutlineRegular size={16} /><span>{t('detail.noPermission')}</span></p>
  }
  return <div className={css.note} role="alert"><p>{failureText(copy, detail)}</p>{retry}</div>
}

/**
 * Render the Applications page.
 * @param props - the docket model, the clock and the copy.
 * @returns the page.
 */
export function ApplicationsPage(props: ApplicationsPageProps) {
  const { useDocket, refresh, select, step, retry, setView, setPortfolio, setQuery, sortBy, more, today: clock, t } = props
  const snapshot = useDocket(state => state)
  const today = clock()
  const { applications, data, selected, sort } = snapshot
  const copy = readCopy(t)
  const reread = (): void => { void refresh() }

  const keys = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); step(1) }
    else if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); step(-1) }
    else if (event.key === 'Escape') select(null)
  }

  if (isUnread(snapshot)) return <Unread read={snapshot} copy={copy} classes={css} onRefresh={reread} />

  const number = new Intl.NumberFormat(t('time.locale'))
  const count = (view: DocketViewId): string => number.format(applications.filter(application => view === 'all' || application.procedure === view).length)
  const portfolios = [...new Map(applications.map(application => [application.portfolioId, application.portfolioName])).entries()]
  const all = shownApplications(snapshot, today)
  const rows = all.slice(0, snapshot.limit)
  const open = applications.find(application => applicationKey(application) === selected)
  const type = (application: MyEpoApplicationView) => (
    <span className={css.type} data-procedure={application.procedure} title={application.procedure === 'UPP' ? t('type.upp') : t('type.epc')}>{application.procedure}</span>
  )
  const header = (column: DocketColumn, label: string, className?: string) => (
    <th className={className} aria-sort={sort.column === column ? sort.direction : undefined}>
      <button type="button" className={css.sort} onClick={() => { sortBy(column) }}>{label}</button>
    </th>
  )
  const lazy = (rowData: ApplicationData | undefined, value: string | null): ReactNode => {
    if (value !== null) return value
    if (rowData === undefined || rowData.status === 'loading') return <span className={css.none}>{rowData === undefined ? t('cell.notRead') : t('cell.reading')}</span>
    return <span className={css.none}>{t('cell.none')}</span>
  }

  return (
    // The page owns the J, K and Escape keys of its table and its open application.
    <section className={css.page} aria-label={copy.page} data-open={open === undefined ? undefined : ''} onKeyDown={keys}>
      <div className={css.docket}>
        <header className={css.bar}>
          <h1>{t('panel')}</h1>
          <SearchField value={snapshot.query} label={t('search.placeholder')} classes={css} onChange={setQuery} />
          <div className={css.views} role="group" aria-label={t('view.label')}>
            {([['all', t('view.all')], ['EPC', t('view.epc')], ['UPP', t('view.upp')]] as const).map(([view, label]) => (
              <button key={view} type="button" className={css.chip} aria-pressed={snapshot.view === view} onClick={() => { setView(view) }}>
                {label} <span className={css.count}>{count(view)}</span>
              </button>
            ))}
          </div>
          <select className={css.select} aria-label={t('portfolio.label')} value={snapshot.portfolio ?? ''} onChange={(event) => { setPortfolio(event.target.value === '' ? null : event.target.value) }}>
            <option value="">{t('portfolio.all')}</option>
            {portfolios.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </header>
        <Summary text={t('summary', { total: number.format(snapshot.total) })} read={snapshot} copy={copy} classes={css} onRefresh={reread} />
        <StaleNotice read={snapshot} copy={copy} classes={css} />
        {rows.length === 0
          ? <p className={css.empty}>{applications.length === 0 ? t('list.empty') : t('list.none')}</p>
          : (
            <table className={css.table} aria-label={t('table.label')}>
              <thead>
                <tr>
                  {header('reference', t('col.reference'))}
                  {header('number', t('col.number'))}
                  <th>{t('col.type')}</th>
                  <th className={css.wide}>{t('col.title')}</th>
                  <th className={css.wide}>{t('col.applicant')}</th>
                  {header('portfolio', t('col.portfolio'), css.wide)}
                  {header('filed', t('col.filed'))}
                  {header('due', t('col.due'))}
                </tr>
              </thead>
              <tbody>
                {rows.map((application) => {
                  const key = applicationKey(application)
                  const rowData = data[key]
                  const due = nextDueOf(rowData, today)
                  return (
                    <tr key={key} aria-selected={key === selected} onClick={() => { select(key) }}>
                      <td dir="auto" title={application.fileReference ?? undefined}>
                        <button type="button" className={css.open}>{application.fileReference ?? <span className={css.none}>{t('cell.none')}</span>}</button>
                      </td>
                      <td>{application.numberWithCheckDigit}</td>
                      <td>{type(application)}</td>
                      <td className={css.wide} dir="auto" title={titleOf(rowData) ?? undefined}>{lazy(rowData, titleOf(rowData))}</td>
                      <td className={css.wide} dir="auto" title={applicantOf(rowData) ?? undefined}>{lazy(rowData, applicantOf(rowData))}</td>
                      <td className={css.wide} dir="auto" title={application.portfolioName}>{application.portfolioName}</td>
                      <td>{dateOf(t, application.filingDate)}</td>
                      <td>{lazy(rowData, due === null ? null : dateOf(t, due))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        {all.length > rows.length
          ? <button type="button" className={css.more} onClick={more}>{t('list.more', { count: number.format(Math.min(100, all.length - rows.length)), total: number.format(all.length) })}</button>
          : null}
        {snapshot.total > applications.length
          ? <p className={css.cut}>{t('list.cut', { shown: number.format(applications.length), total: number.format(snapshot.total) })}</p>
          : null}
      </div>

      {open === undefined
        ? null
        : (
          <article className={css.side} aria-label={t('pane.label')}>
            <header className={css.top}>
              <button type="button" className={`${css.icon} ${css.back}`} title={t('act.back')} aria-label={t('act.back')} onClick={() => { select(null) }}><IconChevronLeftOutlineRegular size={16} /></button>
              <button type="button" className={css.icon} title={t('act.previous')} aria-label={t('act.previous')} onClick={() => { step(-1) }}><IconChevronUpOutlineRegular size={16} /></button>
              <button type="button" className={css.icon} title={t('act.next')} aria-label={t('act.next')} onClick={() => { step(1) }}><IconChevronDownOutlineRegular size={16} /></button>
              <span className={css.spacer} />
              <button type="button" className={css.icon} title={t('act.close')} aria-label={t('act.close')} onClick={() => { select(null) }}><IconCloseOutlineRegular size={16} /></button>
            </header>
            <div className={css.scroll}>
              <div className={css.tags}>{type(open)}<span className={css.tag} title={open.portfolioName}>{open.portfolioName}</span></div>
              <h1 className={css.title} dir="auto">{titleOf(data[selected as string]) ?? <span className={css.none}>{t('detail.noTitle')}</span>}</h1>
              <dl className={css.props}>
                <div><dt>{t('col.number')}</dt><dd>{open.numberWithCheckDigit}</dd></div>
                <div><dt>{t('col.reference')}</dt><dd dir="auto" className={open.fileReference === null ? css.none : undefined}>{open.fileReference ?? t('cell.none')}</dd></div>
                <div><dt>{t('col.filed')}</dt><dd>{dateOf(t, open.filingDate)}</dd></div>
              </dl>
              <OpenData data={data[selected as string]} t={t} copy={copy} today={today} onRetry={() => { retry(selected as string) }} />
            </div>
          </article>
        )}
    </section>
  )
}
