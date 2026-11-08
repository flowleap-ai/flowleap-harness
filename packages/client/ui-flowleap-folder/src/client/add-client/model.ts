/**
 * The state of Add client: one view at a time (find the company, review its matters and decide, follow the build),
 * the builds that the Host runs, the companies on Watch, and the toast after an act. Each view is one phase of a
 * discriminated union, so a page renders exactly the parts of its phase. The model calls the Host routes for the public
 * data and the build, and the Firm Record with the person's cookie for every record.
 * @module
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { clientFolderName, type BuildRequest, type BuildStatus, type FindAnswer, type NameSource, type ReviewAnswer } from '../../add-client/wire.ts'
import type { AddClientApi, HostFailure } from './api.ts'
import { allHits, firmHits, knownClients, matchExisting, planRecords, runPlan, type Decision, type OtherPartyRole } from './plan.ts'
import {
  newClientId, type ClientDetail, type ClientId, type ClientRole, type FirmClient, type FirmRecord, type Hit, type LinkedName,
  type RecordError,
} from './records.ts'

/** One applicant name of the proposed group, with whether the person keeps it ticked. */
export interface GroupName {
  readonly name: string
  readonly applications: number
  readonly ticked: boolean
}

/** What the find page shows below the name field. */
export type FindStatus =
  | { readonly status: 'empty' }
  /** `skeleton` turns true 150 ms after the request, and the skeleton then shows for at least 300 ms. */
  | { readonly status: 'loading'; readonly skeleton: boolean }
  | {
    readonly status: 'group'
    readonly source: NameSource
    readonly edition?: string
    readonly asOf: string
    readonly truncated: boolean
    readonly names: readonly GroupName[]
  }
  /** No patent data plugin: add the client by name only. */
  | { readonly status: 'no-plugin' }
  /** The runtime has no EPO key: the patent data settings need one. */
  | { readonly status: 'no-key' }
  | { readonly status: 'error'; readonly error: HostFailure }

/** Page 1: the typed name, the proposed group, and the existing client of that name. */
export interface FindView {
  readonly page: 'find'
  readonly query: string
  readonly find: FindStatus
  readonly existing: FirmClient | null
}

/** The review answer with its data. */
export type Reviewed = Extract<ReviewAnswer, { status: 'reviewed' }>

/** What the review page knows of the public data. */
export type ReviewStatus =
  | { readonly status: 'loading' }
  | { readonly status: 'no-key' }
  | { readonly status: 'error'; readonly error: HostFailure }
  /** No public data: the client is added by its name only. */
  | { readonly status: 'by-name' }
  /** `claimed`: the applications at other firms that the person marked This is ours. */
  | { readonly status: 'reviewed'; readonly answer: Reviewed; readonly claimed: readonly string[] }

/** The clients with the role client as the Firm Record has them, for the conflict check and the matter picker. */
export type FirmStatus =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: RecordError }
  | { readonly status: 'ready'; readonly details: readonly ClientDetail[]; readonly asOf: string }

/** The company that Add client runs for. */
export interface Subject {
  /** The client's name; the client folder's name is `clientFolderName` of it. */
  readonly name: string
  /** The ticked applicant names; none when the client is added by name only. */
  readonly names: readonly LinkedName[]
  /** The client that the Firm Record has for this company already: Add client runs for it again. */
  readonly existing: FirmClient | null
}

/** Sending the records of the decision. */
export type RecordingStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly done: number; readonly total: number }
  | { readonly status: 'failed'; readonly error: RecordError }

/** Pages 2 and 3: the matters, the conflict check and the decision. */
export interface ReviewView {
  readonly page: 'review'
  readonly subject: Subject
  readonly review: ReviewStatus
  readonly firm: FirmStatus
  readonly role: ClientRole
  readonly conflict: { readonly checked: boolean; readonly reason: string }
  /** The matter and the role in it, for the role Other party. */
  readonly other: { readonly applicationNumber: string | null; readonly role: OtherPartyRole }
  /** The client id of a new client of this review; a second run with the same role uses the existing id. */
  readonly newId: ClientId
  readonly recording: RecordingStatus
}

/** What this session recorded before the build, for the done lines of page 4. */
export interface Recorded {
  readonly names: number
  readonly matters: number
  readonly hits: number
}

/** Page 4: the build of a client folder. */
export interface BuildView {
  readonly page: 'build'
  readonly clientId: ClientId
  readonly name: string
  /** The request of the build; null for a build that the person opened from the Clients list. */
  readonly request: BuildRequest | null
  readonly recorded: Recorded | null
  /** The last status of this build; null before the Host answers. */
  readonly status: BuildStatus | null
  /** Why starting or following the build failed. */
  readonly error: HostFailure | RecordError | null
}

/** The open Add client page. */
export type AddClientView = FindView | ReviewView | BuildView

/** What the page says when an act ends. */
export type Toast =
  | { readonly kind: 'client'; readonly name: string; readonly matters: number; readonly families: number }
  | { readonly kind: 'watch'; readonly name: string }
  | { readonly kind: 'party'; readonly name: string; readonly applicationNumber: string }
  | { readonly kind: 'failed'; readonly error: RecordError }

/** The snapshot of Add client; the store's drafts change it. */
export interface AddClientSnapshot {
  view: AddClientView | null
  /** The builds of the Host's last `status` answer. */
  builds: readonly BuildStatus[]
  /** The companies on Watch. */
  watching: readonly FirmClient[]
  toast: Toast | null
}

/** What the model needs from the app. */
export interface AddClientDeps {
  readonly api: AddClientApi
  readonly record: FirmRecord
  /** Open a client folder on the client folder page. */
  readonly open: (workspaceId: WorkspaceId) => void
}

/** How long typing pauses before the name is searched. */
export const FIND_WAIT_MS = 500
/** How long a search runs before its skeleton shows. */
export const SKELETON_AFTER_MS = 150
/** How long the skeleton of a search shows at least. */
export const SKELETON_MIN_MS = 300
/** How often a running build is read. */
export const POLL_MS = 1000

const wait = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * The hits of a review: the Firm Record hits and the register hits, once each.
 * @param view - the review.
 * @returns the hits; none until both sources answered.
 */
export function hitsOf(view: ReviewView): Hit[] {
  if (view.firm.status !== 'ready') return []
  const exclude = view.subject.existing?.clientId ?? null
  const record = firmHits(view.firm.details, [view.subject.name, ...view.subject.names.map(item => item.name)], view.firm.asOf, exclude)
  return allHits(record, view.review.status === 'reviewed' ? view.review.answer.conflicts : [])
}

/**
 * The client id that a decision records under.
 * @param view - the review.
 * @returns the existing client's id when its role is the chosen role, else the new id.
 */
export function clientIdOf(view: ReviewView): ClientId {
  return view.subject.existing?.role === view.role ? view.subject.existing.clientId : view.newId
}

/**
 * Why the primary act of a review waits. `name`: no folder can have the client's name. `self-check`: by name only,
 * FlowLeap read no EP opposition, so the person checks conflicts and writes how.
 */
export type Blocker = 'busy' | 'review' | 'firm' | 'name' | 'conflict' | 'self-check' | 'matter'

/**
 * Whether the person ticked the conflict check and wrote a reason.
 * @param view - the review.
 * @returns true when both are there.
 */
function decided(view: ReviewView): boolean {
  return view.conflict.checked && view.conflict.reason.trim() !== ''
}

/**
 * Why the person cannot record the decision now.
 * @param view - the review.
 * @returns the first reason, or null when the primary act may run.
 */
export function blockerOf(view: ReviewView): Blocker | null {
  if (view.recording.status === 'running') return 'busy'
  if (view.role === 'watch') return null
  if (view.firm.status !== 'ready') return 'firm'
  if (view.role === 'other-party') return view.other.applicationNumber === null ? 'matter' : null
  // Checked before any record is sent: the build would refuse the name after the client is recorded.
  if (clientFolderName(view.subject.name) === undefined) return 'name'
  if (view.review.status === 'loading' || view.review.status === 'error' || view.review.status === 'no-key') return 'review'
  if (decided(view)) return null
  if (view.review.status === 'by-name') return 'self-check'
  return hitsOf(view).length > 0 ? 'conflict' : null
}

/**
 * The applications that a client decision records: those at your firm, then those claimed with This is ours.
 * @param review - the review status.
 * @returns each application with its applicants.
 */
export function applicationsOf(review: ReviewStatus): Extract<Decision, { role: 'client' }>['applications'] {
  if (review.status !== 'reviewed') return []
  const { atFirm, atOtherFirms } = review.answer
  return [
    ...atFirm.map(row => ({
      fact: {
        applicationNumber: row.applicationNumber, basis: 'register' as const,
        ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
        ...(row.title === undefined ? {} : { title: row.title }),
        ...(row.representativeSince === undefined ? {} : { representativeSince: row.representativeSince }),
      },
      applicants: row.applicants,
    })),
    ...atOtherFirms.filter(row => review.claimed.includes(row.applicationNumber)).map(row => ({
      fact: {
        applicationNumber: row.applicationNumber, basis: 'claimed' as const,
        ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
        ...(row.title === undefined ? {} : { title: row.title }),
      },
      applicants: row.applicants,
    })),
  ]
}

/**
 * The decision of a review.
 * @param view - the review; its blocker is null.
 * @returns the decision.
 */
export function decisionOf(view: ReviewView): Decision {
  const { subject, role } = view
  const base = { clientId: clientIdOf(view), name: subject.name, names: subject.names }
  if (role === 'watch') return { role, ...base }
  if (role === 'other-party') return { role, ...base, matter: { applicationNumber: view.other.applicationNumber ?? '', role: view.other.role } }
  const hits = hitsOf(view)
  // By name only, the reason says how the person checked conflicts, also with no hit.
  const reason = hits.length === 0 && view.review.status !== 'by-name' ? {} : { reason: view.conflict.reason.trim() }
  return { role, ...base, hits, ...reason, applications: applicationsOf(view.review) }
}

/** Whether a read failed because the Firm Record has no such client. */
const unknownClient = (error: RecordError): boolean => error.kind === 'refused' && (error.status === 404 || error.code === 'client-unknown')

const EMPTY: AddClientSnapshot = { view: null, builds: [], watching: [], toast: null }

/** Add client's state and acts. */
export class AddClientModel {
  /** The state; the pages read it through their snapshot hooks. */
  readonly store: SnapshotStore<AddClientSnapshot> = createSnapshotStore<AddClientSnapshot>(EMPTY, { flush: 'sync' })
  /** Counts the searches and the views, so an answer for an older one is dropped. */
  private generation = 0
  private findTimer: ReturnType<typeof setTimeout> | null = null
  private findAbort: AbortController | null = null
  private followers = 0
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  /** @param deps - the Host routes, the Firm Record and the folder page. */
  constructor(private readonly deps: AddClientDeps) {}

  /** The current snapshot. */
  get state(): AddClientSnapshot {
    return this.store.getSnapshot()
  }

  /** Open Add client on the empty find page. */
  start(): void {
    this.leave()
    this.store.update((draft) => {
      draft.view = { page: 'find', query: '', find: { status: 'empty' }, existing: null }
      draft.toast = null
    })
  }

  /** Close Add client; a running build goes on. */
  close(): void {
    this.leave()
    this.store.update((draft) => { draft.view = null })
  }

  /**
   * Change the typed name; the search runs when typing pauses.
   * @param query - the field's text.
   */
  type(query: string): void {
    const view = this.state.view
    if (view?.page !== 'find') return
    this.clearFind()
    const empty = query.trim() === ''
    // An emptied field drops the answer of the search that runs now.
    if (empty) this.generation += 1
    this.store.update((draft) => { draft.view = empty ? { ...view, query, find: { status: 'empty' }, existing: null } : { ...view, query } })
    if (!empty) this.findTimer = setTimeout(() => { void this.search() }, FIND_WAIT_MS)
  }

  /**
   * Search the typed name now.
   * @returns once the answer shows.
   */
  async search(): Promise<void> {
    const view = this.state.view
    if (view?.page !== 'find' || view.query.trim() === '') return
    this.clearFind()
    const generation = ++this.generation
    const query = view.query.trim()
    const abort = new AbortController()
    this.findAbort = abort
    this.setFind(generation, { status: 'loading', skeleton: false }, null)
    let shownAt = null as number | null
    const skeleton = setTimeout(() => {
      shownAt = Date.now()
      this.setFind(generation, { status: 'loading', skeleton: true }, null)
    }, SKELETON_AFTER_MS)
    const [found, clients] = await Promise.all([this.deps.api.find(query, abort.signal), this.deps.record.clients(abort.signal)])
    clearTimeout(skeleton)
    if (shownAt !== null) await wait(Math.max(0, shownAt + SKELETON_MIN_MS - Date.now()))
    const status = findStatusOf(found)
    const names = status.status === 'group' ? status.names.map(item => item.name) : []
    this.setFind(generation, status, clients.ok ? matchExisting(clients.value, [query, ...names]) : null)
  }

  /**
   * Tick or untick an applicant name of the group.
   * @param name - the name.
   * @param ticked - whether it is part of the client.
   */
  tick(name: string, ticked: boolean): void {
    const view = this.state.view
    if (view?.page !== 'find' || view.find.status !== 'group') return
    const find = { ...view.find, names: view.find.names.map(item => item.name === name ? { ...item, ticked } : item) }
    this.store.update((draft) => { draft.view = { ...view, find } })
  }

  /**
   * Go on to the review: with the ticked names of the group, or by name only when no public data is available.
   * @returns once the review answered.
   */
  async continue(): Promise<void> {
    const view = this.state.view
    if (view?.page !== 'find' || view.query.trim() === '') return
    const { find, existing } = view
    if (find.status === 'empty' || find.status === 'loading') return
    if (find.status === 'group') {
      const names = find.names.filter(item => item.ticked).map((item): LinkedName => ({
        name: item.name, source: find.source, applications: item.applications,
        ...(find.edition === undefined ? {} : { edition: find.edition }),
      }))
      if (names.length === 0) return
      await this.review({ name: existing?.name ?? view.query.trim(), names, existing }, false)
      return
    }
    await this.review({ name: existing?.name ?? view.query.trim(), names: [], existing }, true)
  }

  /**
   * Run Add client again for a client of a client folder: read its names and go straight to the review.
   * @param clientId - the client, as the `status` route names it.
   * @returns once the review answered.
   */
  async checkForNew(clientId: string): Promise<void> {
    this.leave()
    const generation = this.generation
    const detail = await this.deps.record.client(clientId as ClientId)
    if (generation !== this.generation) return
    if (!detail.ok) {
      this.store.update((draft) => { draft.toast = { kind: 'failed', error: detail.error } })
      return
    }
    const { client, names } = detail.value
    await this.review({ name: client.name, names, existing: client }, names.length === 0)
  }

  /** Go on with the review by name only, after the public data failed. */
  byName(): void {
    this.updateReview(view => ({ ...view, review: { status: 'by-name' } }))
  }

  /**
   * Change the role of the decision.
   * @param role - Client, Watch or Other party.
   */
  setRole(role: ClientRole): void {
    this.updateReview(view => ({ ...view, role, recording: idleUnlessRunning(view.recording) }))
  }

  /**
   * Tick "I checked this conflict" (by name only: "I checked conflicts myself") or change its reason.
   * @param checked - whether the person checked the conflict.
   * @param reason - why the company can be a client, or by name only how the person checked, as typed.
   */
  setConflict(checked: boolean, reason: string): void {
    this.updateReview(view => ({ ...view, conflict: { checked, reason }, recording: idleUnlessRunning(view.recording) }))
  }

  /**
   * Mark an application at another firm as This is ours, or take the mark back.
   * @param applicationNumber - the application.
   * @param claimed - whether it is the firm's.
   */
  claim(applicationNumber: string, claimed: boolean): void {
    this.updateReview((view) => {
      if (view.review.status !== 'reviewed') return view
      const others = view.review.claimed.filter(item => item !== applicationNumber)
      return { ...view, review: { ...view.review, claimed: claimed ? [...others, applicationNumber] : others } }
    })
  }

  /**
   * Choose the matter of your firm and the role in it, for the role Other party.
   * @param applicationNumber - the application of the matter, or null for none.
   * @param role - the company's role in it.
   */
  setOther(applicationNumber: string | null, role: OtherPartyRole): void {
    this.updateReview(view => ({ ...view, other: { applicationNumber, role } }))
  }

  /**
   * Record the decision in the Firm Record, then start the build for the role client. The Firm Record is read first,
   * so only missing facts are sent.
   * @returns once the records are sent and, for a client, the build started.
   */
  async record(): Promise<void> {
    const view = this.state.view
    if (view?.page !== 'review' || blockerOf(view) !== null) return
    const generation = this.generation
    const decision = decisionOf(view)
    this.updateReview(current => ({ ...current, recording: { status: 'running', done: 0, total: 0 } }))
    const outcome = await this.send(decision, generation)
    if (generation !== this.generation) return
    if (outcome !== null) {
      // Another client id names a client of this name and role: Add client runs again for that client.
      if (outcome.kind === 'refused' && outcome.code === 'client-exists' && outcome.clientId !== undefined && view.subject.existing === null) {
        const adopted = await this.deps.record.client(outcome.clientId)
        if (generation !== this.generation) return
        if (adopted.ok) {
          this.updateReview(current => ({ ...current, subject: { ...current.subject, existing: adopted.value.client }, recording: { status: 'idle' } }))
          await this.record()
          return
        }
      }
      this.updateReview(current => ({ ...current, recording: { status: 'failed', error: outcome } }))
      return
    }
    void this.refreshWatching()
    if (decision.role === 'watch') {
      this.finish({ kind: 'watch', name: decision.name })
      return
    }
    if (decision.role === 'other-party') {
      this.finish({ kind: 'party', name: decision.name, applicationNumber: decision.matter.applicationNumber })
      return
    }
    const request: BuildRequest = {
      clientId: decision.clientId, name: decision.name, names: decision.names.map(item => item.name),
      applications: decision.applications.map(item => item.fact.applicationNumber),
    }
    const build: BuildView = {
      page: 'build', clientId: decision.clientId, name: decision.name, request, status: null, error: null,
      recorded: { names: decision.names.length, matters: decision.applications.length, hits: decision.hits.length },
    }
    this.store.update((draft) => { draft.view = build })
    await this.build(build)
  }

  /**
   * Open the build of a client from the Clients list.
   * @param clientId - the client of the build, as the `status` route names it.
   */
  openBuild(clientId: string): void {
    const status = this.state.builds.find(item => item.clientId === clientId)
    if (status === undefined) return
    this.leave()
    this.store.update((draft) => {
      draft.view = { page: 'build', clientId: status.clientId as ClientId, name: status.name, request: null, recorded: null, status, error: null }
      draft.toast = null
    })
    this.poll()
  }

  /**
   * Try again after a failure: search again, review again, send the missing records, or build again. Every key and
   * every build step is idempotent, so a retry adds only what is missing.
   * @returns once the act ran.
   */
  async retry(): Promise<void> {
    const view = this.state.view
    if (view?.page === 'find' && view.find.status === 'error') await this.search()
    else if (view?.page === 'review' && view.recording.status === 'failed') await this.record()
    else if (view?.page === 'review' && (view.review.status === 'error' || view.firm.status === 'error')) await this.review(view.subject, view.review.status === 'by-name')
    else if (view?.page === 'build' && buildFailed(view)) await this.build(view)
  }

  /**
   * Open the client folder of the build view.
   * @returns whether a folder opened.
   */
  openFolder(): boolean {
    const view = this.state.view
    const workspace = view?.page === 'build' ? view.status?.workspace : undefined
    if (workspace === undefined) return false
    this.close()
    this.deps.open(workspace as WorkspaceId)
    return true
  }

  /** Close the toast. */
  dismissToast(): void {
    this.store.update((draft) => { draft.toast = null })
  }

  /**
   * Follow the builds and the Watch list while a view shows them: read them now, then read the builds once a second
   * while one runs.
   * @returns the disposer.
   */
  follow(): () => void {
    this.followers += 1
    void this.refreshWatching()
    this.poll()
    let done = false
    return () => {
      if (done) return
      done = true
      this.followers -= 1
    }
  }

  /** Stop every timer; the page is gone. */
  dispose(): void {
    this.disposed = true
    this.leave()
    if (this.pollTimer !== null) clearTimeout(this.pollTimer)
    this.pollTimer = null
  }

  // Phases.

  private async review(subject: Subject, byName: boolean): Promise<void> {
    this.leave()
    const generation = this.generation
    const previous = this.state.view
    const kept = previous?.page === 'review' && previous.subject === subject ? previous : null
    this.store.update((draft) => {
      draft.view = {
        page: 'review', subject, review: byName ? { status: 'by-name' } : { status: 'loading' }, firm: { status: 'loading' },
        role: kept?.role ?? subject.existing?.role ?? 'client', conflict: kept?.conflict ?? { checked: false, reason: '' },
        other: kept?.other ?? { applicationNumber: null, role: 'opponent' }, newId: kept?.newId ?? newClientId(), recording: { status: 'idle' },
      }
      draft.toast = null
    })
    const clients = await this.deps.record.clients()
    if (generation !== this.generation) return
    const exclude = subject.existing?.clientId ?? null
    const known = clients.ok ? knownClients(clients.value, exclude) : []
    const [answer, firm] = await Promise.all([
      byName ? Promise.resolve(null) : this.deps.api.review({ names: subject.names.map(item => item.name), clients: known }),
      clients.ok ? this.readDetails(clients.value) : Promise.resolve<FirmStatus>({ status: 'error', error: clients.error }),
    ])
    if (generation !== this.generation) return
    this.updateReview(view => ({ ...view, firm, review: answer === null ? view.review : reviewStatusOf(answer) }))
  }

  private async readDetails(clients: readonly FirmClient[]): Promise<FirmStatus> {
    const asOf = new Date().toISOString()
    const read = await Promise.all(clients.filter(client => client.role === 'client').map(client => this.deps.record.client(client.clientId)))
    const details: ClientDetail[] = []
    for (const item of read) {
      if (!item.ok) return { status: 'error', error: item.error }
      details.push(item.value)
    }
    return { status: 'ready', details, asOf }
  }

  /** Send the plan of a decision; null when every record is in the Firm Record. */
  private async send(decision: Decision, generation: number): Promise<RecordError | null> {
    const existing = await this.deps.record.client(decision.clientId)
    if (!existing.ok && !unknownClient(existing.error)) return existing.error
    const plan = await planRecords(decision, existing.ok ? existing.value : null)
    const total = plan.steps.length
    this.updateReview(view => ({ ...view, recording: { status: 'running', done: 0, total } }))
    const outcome = await runPlan(plan, this.deps.record, (done) => {
      if (generation === this.generation) this.updateReview(view => ({ ...view, recording: { status: 'running', done, total } }))
    })
    return outcome.ok ? null : outcome.error
  }

  private async build(view: BuildView): Promise<void> {
    const generation = this.generation
    this.updateBuild(current => ({ ...current, error: null, status: current.status === null ? null : { ...current.status, state: 'running' } }))
    let request = view.request
    if (request === null) {
      const detail = await this.deps.record.client(view.clientId)
      if (generation !== this.generation) return
      if (!detail.ok) {
        this.updateBuild(current => ({ ...current, error: detail.error }))
        return
      }
      request = {
        clientId: view.clientId, name: detail.value.client.name, names: detail.value.names.map(item => item.name),
        applications: detail.value.applications.map(item => item.applicationNumber),
      }
    }
    const started = await this.deps.api.build(request)
    if (generation !== this.generation) return
    if (!started.ok) {
      this.updateBuild(current => ({ ...current, error: started.error }))
      return
    }
    this.track(started.value)
    this.poll()
  }

  // Following the builds.

  private poll(): void {
    if (this.pollTimer !== null || this.disposed) return
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      void this.readStatus()
    }, 0)
  }

  private async readStatus(): Promise<void> {
    const answer = await this.deps.api.status()
    if (this.disposed) return
    const view = this.state.view
    if (answer.ok) {
      this.store.update((draft) => { draft.builds = answer.value.builds })
      const own = view?.page === 'build' ? answer.value.builds.find(item => item.clientId === view.clientId) : undefined
      if (own !== undefined) this.track(own)
    } else if (view?.page === 'build') {
      this.updateBuild(current => ({ ...current, error: answer.error }))
    }
    const current = this.state.view
    const waiting = current?.page === 'build' && !buildFailed(current)
    if (this.followers === 0 || !(waiting || this.state.builds.some(item => item.state === 'running'))) return
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      void this.readStatus()
    }, POLL_MS)
  }

  /** Show the status of the open build; a done build opens its client folder with the toast. */
  private track(status: BuildStatus): void {
    if (status.state === 'done' && status.workspace !== undefined) {
      this.close()
      this.store.update((draft) => { draft.toast = { kind: 'client', name: status.name, matters: status.matters, families: status.families } })
      this.deps.open(status.workspace as WorkspaceId)
      return
    }
    this.updateBuild(current => ({ ...current, status }))
  }

  private async refreshWatching(): Promise<void> {
    const clients = await this.deps.record.clients()
    if (clients.ok) this.store.update((draft) => { draft.watching = clients.value.filter(client => client.role === 'watch') })
  }

  // Helpers.

  private finish(toast: Toast): void {
    this.close()
    this.store.update((draft) => { draft.toast = toast })
  }

  /** Drop the answers of the open view and stop its search. */
  private leave(): void {
    this.generation += 1
    this.clearFind()
  }

  private clearFind(): void {
    if (this.findTimer !== null) clearTimeout(this.findTimer)
    this.findTimer = null
    this.findAbort?.abort()
    this.findAbort = null
  }

  private setFind(generation: number, find: FindStatus, existing: FirmClient | null): void {
    const view = this.state.view
    if (generation !== this.generation || view?.page !== 'find') return
    this.store.update((draft) => { draft.view = { ...view, find, existing } })
  }

  /** Change the open view when it is a page of this kind. */
  private updateView<P extends AddClientView['page']>(page: P, change: (view: Extract<AddClientView, { page: P }>) => AddClientView): void {
    const view = this.state.view
    // The page check makes the view a member of the union with that page.
    if (view?.page === page) this.store.update((draft) => { draft.view = change(view as Extract<AddClientView, { page: P }>) })
  }

  private updateReview(change: (view: ReviewView) => ReviewView): void {
    this.updateView('review', change)
  }

  private updateBuild(change: (view: BuildView) => BuildView): void {
    this.updateView('build', change)
  }
}

/** A failed recording becomes idle when the person changes the decision; a running one goes on. */
function idleUnlessRunning(recording: RecordingStatus): RecordingStatus {
  return recording.status === 'running' ? recording : { status: 'idle' }
}

/** What stopped a build: its start or a read failed, or a step of the build stopped. */
export type BuildFailure =
  | { readonly kind: 'start'; readonly error: HostFailure | RecordError }
  | { readonly kind: 'build'; readonly status: BuildStatus }

/**
 * What stopped the build of a build view, which Try again repeats.
 * @param view - the build view.
 * @returns the failure, or null while the build runs or before it answers.
 */
export function buildFailure(view: BuildView): BuildFailure | null {
  if (view.error !== null) return { kind: 'start', error: view.error }
  const { status } = view
  return status !== null && (status.state === 'failed' || status.state === 'interrupted') ? { kind: 'build', status } : null
}

/**
 * Whether a build view shows a failure with Try again.
 * @param view - the build view.
 * @returns true for a failed or interrupted build, or a failed start or read.
 */
export function buildFailed(view: BuildView): boolean {
  return buildFailure(view) !== null
}

function findStatusOf(found: Awaited<ReturnType<AddClientApi['find']>>): FindStatus {
  if (!found.ok) return found.error === 'no-key' ? { status: 'no-key' } : { status: 'error', error: found.error }
  const answer: FindAnswer = found.value
  if (answer.status === 'no-plugin') return { status: 'no-plugin' }
  return {
    status: 'group', source: answer.source, asOf: answer.asOf, truncated: answer.truncated,
    ...(answer.edition === undefined ? {} : { edition: answer.edition }),
    names: answer.names.map(item => ({ name: item.name, applications: item.applications, ticked: true })),
  }
}

function reviewStatusOf(answer: Awaited<ReturnType<AddClientApi['review']>>): ReviewStatus {
  if (!answer.ok) return answer.error === 'no-key' ? { status: 'no-key' } : { status: 'error', error: answer.error }
  return answer.value.status === 'no-plugin' ? { status: 'by-name' } : { status: 'reviewed', answer: answer.value, claimed: [] }
}
