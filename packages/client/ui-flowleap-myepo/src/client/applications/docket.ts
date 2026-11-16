/**
 * The Applications page state over the `flowleapConnectors` Remote: the last answer of `myEpoApplications()`, the
 * data of each application from `myEpoApplication()`, the filters, the sort and the open application. The MyEPO list
 * has no title, applicant or due date, so the model reads the data of the shown applications one at a time, the
 * open one first. The state lives in the page only; nothing here writes to MyEPO.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { createPageStore, readList, type Answer, type EpoFailure, type ReadFailure, type ReadSnapshot } from '../shared/read.ts'
import type { MyEpoApplicationDetailView, MyEpoApplicationsView, MyEpoApplicationView } from '@deepseek-ai/dsh-api-remotes/client'

/** The procedure filter: every application, the European patents, or the unitary patents. */
export type DocketViewId = 'all' | 'EPC' | 'UPP'

/** A sortable column of the docket. */
export type DocketColumn = 'reference' | 'number' | 'portfolio' | 'filed' | 'due'

/** Why the last read gave no list: an outcome of the EPO, or a failed call to the Host. */
export type DocketFailure = ReadFailure

/** The data of one application: on its way, the answer of the EPO, or a failed call to the Host. */
export type ApplicationData =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly detail: MyEpoApplicationDetailView | EpoFailure }
  | { readonly status: 'failed'; readonly message: string }

/** What the page renders. */
export interface DocketSnapshot extends ReadSnapshot {
  /** The applications of the last read that answered. */
  readonly applications: readonly MyEpoApplicationView[]
  /** How many applications the MyEPO list holds. */
  readonly total: number
  /** The data read so far, by {@link applicationKey}. */
  readonly data: Readonly<Record<string, ApplicationData>>
  readonly view: DocketViewId
  /** The portfolio filter: a portfolio id, or `null` for every portfolio. */
  readonly portfolio: string | null
  readonly query: string
  readonly sort: { readonly column: DocketColumn; readonly direction: 'ascending' | 'descending' }
  /** How many rows of the filtered list the page shows. */
  readonly limit: number
  /** The {@link applicationKey} of the open application. */
  readonly selected: string | null
}

export type { Answer } from '../shared/read.ts'

/** What the model needs from the Host. */
export interface DocketDependencies {
  /** `flowleapConnectors.myEpoApplications()`. */
  readonly list: () => Promise<Answer<MyEpoApplicationsView | EpoFailure>>
  /** `flowleapConnectors.myEpoApplication(procedure, number)`. */
  readonly read: (procedure: string, number: string) => Promise<Answer<MyEpoApplicationDetailView | EpoFailure>>
  /** Today as an ISO calendar date, for the next due date. */
  readonly today: () => string
}

/** The page model: its observable state and its acts. */
export interface Docket {
  readonly hooks: { readonly docket: HostObservable<DocketSnapshot> }
  /** Read the list again and drop the data read so far. */
  readonly refresh: () => Promise<void>
  /** Open one application, or close the open one with `null`. */
  readonly select: (key: string | null) => void
  /** Open the application before (-1) or after (1) the open one in the shown list; the first one when none is open. */
  readonly step: (direction: -1 | 1) => void
  /** Read the data of one application again after a failed read. */
  readonly retry: (key: string) => void
  readonly setView: (view: DocketViewId) => void
  readonly setPortfolio: (portfolio: string | null) => void
  readonly setQuery: (query: string) => void
  /** Sort by a column: ascending first, descending on the second call for the same column. */
  readonly sortBy: (column: DocketColumn) => void
  /** Show one more page of rows. */
  readonly more: () => void
}

/** How many rows the table shows at first, and how many each "show more" adds. */
export const PAGE_SIZE = 100

/**
 * The key of one application: one number can have a European patent row and a unitary patent row.
 * @param application - the procedure and the number.
 * @returns `<procedure>:<number>`.
 */
export function applicationKey(application: Pick<MyEpoApplicationView, 'procedure' | 'number'>): string {
  return `${application.procedure}:${application.number}`
}

/**
 * The first title of the data of an application, in the order English, German, French, then any other language.
 * @param data - the data read for the application, if any.
 * @returns the title, or `null` when the data is not read or has no title.
 */
export function titleOf(data: ApplicationData | undefined): string | null {
  if (data?.status !== 'ready' || data.detail.kind !== 'read') return null
  const { titles } = data.detail
  return titles.EN ?? titles.DE ?? titles.FR ?? Object.values(titles)[0] ?? null
}

/**
 * The first applicant of an application, without its address.
 * @param data - the data read for the application, if any.
 * @returns the text before the first comma of the first applicant, or `null`.
 */
export function applicantOf(data: ApplicationData | undefined): string | null {
  if (data?.status !== 'ready' || data.detail.kind !== 'read') return null
  return data.detail.applicants[0]?.split(',')[0] ?? null
}

/**
 * The earliest EPO due date of an application that is today or later.
 * @param data - the data read for the application, if any.
 * @param today - today as an ISO calendar date.
 * @returns the ISO date, or `null` when the data is not read or lists no such date.
 */
export function nextDueOf(data: ApplicationData | undefined, today: string): string | null {
  if (data?.status !== 'ready' || data.detail.kind !== 'read') return null
  return data.detail.dueDates.map(due => due.dueDate).filter(date => date >= today).sort()[0] ?? null
}

/**
 * The applications that pass the filters, sorted. An application with no value in the sort column is last.
 * @param snapshot - the page state.
 * @param today - today as an ISO calendar date.
 * @returns the matching applications, not cut to `limit`.
 */
export function shownApplications(
  snapshot: Pick<DocketSnapshot, 'applications' | 'data' | 'view' | 'portfolio' | 'query' | 'sort'>, today: string,
): MyEpoApplicationView[] {
  const query = snapshot.query.trim().toLowerCase()
  const value = (application: MyEpoApplicationView): string | null => {
    switch (snapshot.sort.column) {
      case 'reference': return application.fileReference
      case 'number': return application.number
      case 'portfolio': return application.portfolioName
      case 'filed': return application.filingDate
      case 'due': return nextDueOf(snapshot.data[applicationKey(application)], today)
    }
  }
  const sign = snapshot.sort.direction === 'ascending' ? 1 : -1
  return snapshot.applications
    .filter((application) => {
      if (snapshot.view !== 'all' && application.procedure !== snapshot.view) return false
      if (snapshot.portfolio !== null && application.portfolioId !== snapshot.portfolio) return false
      if (query === '') return true
      const data = snapshot.data[applicationKey(application)]
      const { numberWithCheckDigit, fileReference, portfolioName } = application
      return [numberWithCheckDigit, fileReference, portfolioName, titleOf(data), applicantOf(data)].join(' ').toLowerCase().includes(query)
    })
    .sort((left, right) => {
      const a = value(left)
      const b = value(right)
      if (a === b) return 0
      if (a === null) return 1
      if (b === null) return -1
      return (a < b ? -1 : 1) * sign
    })
}

const START: DocketSnapshot = {
  phase: 'loading', reading: false, failure: null, applications: [], total: 0, readAt: null, data: {},
  view: 'all', portfolio: null, query: '', sort: { column: 'filed', direction: 'descending' }, limit: PAGE_SIZE, selected: null,
}

/**
 * Create the page model. The first observer starts the first read.
 * @param deps - the Remote calls and the clock.
 * @returns the model.
 */
export function createDocket(deps: DocketDependencies): Docket {
  const store = createPageStore(START, () => { void refresh() })
  const { publish } = store
  // A new list read starts a new epoch; an answer for an older list is dropped.
  let epoch = 0
  let reading = false
  const byKey = (key: string): MyEpoApplicationView | undefined =>
    store.get().applications.find(application => applicationKey(application) === key)

  /** The applications whose data the page shows: the open one, then the shown rows. */
  const wanted = (): MyEpoApplicationView[] => {
    const { selected, limit } = store.get()
    const shown = shownApplications(store.get(), deps.today()).slice(0, limit)
    const open = selected === null ? undefined : byKey(selected)
    return open === undefined ? shown : [open, ...shown]
  }

  /** Read the data of the wanted applications that have none, one at a time. */
  const pump = async (): Promise<void> => {
    if (reading) return
    reading = true
    for (;;) {
      const next = wanted().find(application => store.get().data[applicationKey(application)] === undefined)
      if (next === undefined) break
      const key = applicationKey(next)
      const at = epoch
      publish({ data: { ...store.get().data, [key]: { status: 'loading' } } })
      const answer = await deps.read(next.procedure, next.number)
      if (at !== epoch) continue
      publish({
        data: {
          ...store.get().data,
          [key]: answer.ok ? { status: 'ready', detail: answer.value } : { status: 'failed', message: answer.error.message },
        },
      })
    }
    reading = false
  }
  const change = (next: Partial<DocketSnapshot>): void => {
    publish(next)
    void pump()
  }

  const refresh = (): Promise<void> => readList<Extract<MyEpoApplicationsView, { kind: 'read' }>, DocketSnapshot>(store, deps.list, (view) => {
    epoch += 1
    change({ applications: view.applications, total: view.total, readAt: view.readAt, data: {} })
  })

  return {
    hooks: { docket: store.observable },
    refresh,
    select: (key) => { change({ selected: key }) },
    step: (direction) => {
      const list = shownApplications(store.get(), deps.today())
      const first = list[0]
      if (first === undefined) return
      const at = list.findIndex(application => applicationKey(application) === store.get().selected)
      const next = at === -1 ? first : list[Math.max(0, Math.min(list.length - 1, at + direction))] as MyEpoApplicationView
      change({ selected: applicationKey(next) })
    },
    retry: (key) => {
      const { [key]: _dropped, ...data } = store.get().data
      change({ data })
    },
    setView: (view) => { change({ view, limit: PAGE_SIZE }) },
    setPortfolio: (portfolio) => { change({ portfolio, limit: PAGE_SIZE }) },
    setQuery: (query) => { change({ query, limit: PAGE_SIZE }) },
    sortBy: (column) => {
      const direction = store.get().sort.column === column && store.get().sort.direction === 'ascending' ? 'descending' : 'ascending'
      change({ sort: { column, direction } })
    },
    more: () => { change({ limit: store.get().limit + PAGE_SIZE }) },
  }
}
