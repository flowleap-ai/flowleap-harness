/**
 * The state of Add client: one view at a time (find the company, review its matters and decide, record the client), the
 * clients of the Firm Record, and the toast after an act. Each view is one phase of a discriminated union, so a page
 * renders exactly the parts of its phase. The model calls the Host routes for the public data and the client folder,
 * and the Firm Record with the person's cookie for every record.
 * @module
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { clientFolderName, type FindAnswer, type NameSource, type ReviewAnswer } from '../../add-client/wire.ts'
import type { AddClientApi, HostFailure } from './api.ts'
import { knownParties, missingApplications, recordBatches, splitBatches, type RecordBatch } from './batches.ts'
import {
  allHits, firmHits, indexNames, knownClients, matchExisting, planRecords, runPlan,
  type ApplicationDecision, type Decision, type OtherPartyRole,
} from './plan.ts'
import {
  newClientId, type ClientDetail, type ClientId, type ClientRole, type FirmClient, type FirmRecord, type Hit, type LinkedName, type PartyId,
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

/** The client folder of a Record run: not made yet, being made, or made with its workspace. */
export type FolderStep =
  | { readonly state: 'waiting' | 'making' }
  | { readonly state: 'made'; readonly workspace: WorkspaceId }

/**
 * Page 4: the Record run of a client. The review page recorded the conflict check, the client and its names; this page
 * records the applications in batches, then makes the client folder. The run is `failed` while `error` is set, `done`
 * once the folder is made, else `running` ({@link recordStatus}).
 */
export interface RecordView {
  readonly page: 'record'
  readonly clientId: ClientId
  readonly name: string
  /** The applicant names of the group, for the client line and the About file. */
  readonly names: readonly string[]
  /** The possible conflicts of the recorded conflict check. */
  readonly hits: number
  /** The applications that this run records; those that the Firm Record has with every applicant role are left out. */
  readonly applications: readonly ApplicationDecision[]
  /** The applications in batches; null until the Host says the batch size. */
  readonly batches: readonly RecordBatch[] | null
  /** The party id of each applicant name that the run knows, by normalized name. */
  readonly parties: Readonly<Record<string, PartyId>>
  readonly folder: FolderStep
  /** What stopped the run: the batch size read, a batch, or the client folder. Try again goes on from there. */
  readonly error: RecordError | HostFailure | null
}

/** The open Add client page. */
export type AddClientView = FindView | ReviewView | RecordView

/** What the page says when an act ends. */
export type Toast =
  | { readonly kind: 'watch'; readonly name: string }
  | { readonly kind: 'party'; readonly name: string; readonly applicationNumber: string }
  | { readonly kind: 'failed'; readonly error: RecordError }

/** The snapshot of Add client; the store's drafts change it. */
export interface AddClientSnapshot {
  view: AddClientView | null
  /** The clients of the Firm Record's last `clients` read, in every role. */
  clients: readonly FirmClient[]
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
  // Checked before any record is sent: the client folder route would refuse the name after the client is recorded.
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

/** The end of sending a plan: the client as the Firm Record had it before the plan, or the failure. */
type SendOutcome = { readonly ok: true; readonly existing: ClientDetail | null } | { readonly ok: false; readonly error: RecordError }

/** Whether a read failed because the Firm Record has no such client. */
const unknownClient = (error: RecordError): boolean => error.kind === 'refused' && (error.status === 404 || error.code === 'client-unknown')

const EMPTY: AddClientSnapshot = { view: null, clients: [], toast: null }

/** Add client's state and acts. */
export class AddClientModel {
  /** The state; the pages read it through their snapshot hooks. */
  readonly store: SnapshotStore<AddClientSnapshot> = createSnapshotStore<AddClientSnapshot>(EMPTY, { flush: 'sync' })
  /** Counts the searches and the views, so an answer for an older one is dropped. */
  private generation = 0
  private findTimer: ReturnType<typeof setTimeout> | null = null
  private findAbort: AbortController | null = null

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

  /** Close Add client; a Record run stops before its next command, and what it recorded stays. */
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
   * @param clientId - the client of the folder ({@link clientOfFolder}).
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
   * Record the decision in the Firm Record: the conflict check, the client and its names on the review page, then for the
   * role client its applications and its client folder on the Record page. The Firm Record is read first, so only
   * missing facts are sent.
   * @returns once the records are sent and, for a client, the Record run ended.
   */
  async record(): Promise<void> {
    const view = this.state.view
    if (view?.page !== 'review' || blockerOf(view) !== null) return
    const generation = this.generation
    const decision = decisionOf(view)
    this.updateReview(current => ({ ...current, recording: { status: 'running', done: 0, total: 0 } }))
    const outcome = await this.send(decision, generation)
    if (generation !== this.generation) return
    if (!outcome.ok) {
      const { error } = outcome
      // Another client id names a client of this name and role: Add client runs again for that client.
      if (error.kind === 'refused' && error.code === 'client-exists' && error.clientId !== undefined && view.subject.existing === null) {
        const adopted = await this.deps.record.client(error.clientId)
        if (generation !== this.generation) return
        if (adopted.ok) {
          this.updateReview(current => ({ ...current, subject: { ...current.subject, existing: adopted.value.client }, recording: { status: 'idle' } }))
          await this.record()
          return
        }
      }
      this.updateReview(current => ({ ...current, recording: { status: 'failed', error } }))
      return
    }
    void this.refresh()
    if (decision.role === 'watch') {
      this.finish({ kind: 'watch', name: decision.name })
      return
    }
    if (decision.role === 'other-party') {
      this.finish({ kind: 'party', name: decision.name, applicationNumber: decision.matter.applicationNumber })
      return
    }
    const run: RecordView = {
      page: 'record', clientId: decision.clientId, name: decision.name, names: decision.names.map(item => item.name), hits: decision.hits.length,
      applications: missingApplications(decision.applications, outcome.existing), batches: null, parties: knownParties(outcome.existing),
      folder: { state: 'waiting' }, error: null,
    }
    this.store.update((draft) => { draft.view = run })
    await this.run(run)
  }

  /**
   * Try again after a failure: search again, review again, send the missing records, or go on with the Record run.
   * Every key is idempotent and a recorded batch is never sent again, so a retry adds only what is missing.
   * @returns once the act ran.
   */
  async retry(): Promise<void> {
    const view = this.state.view
    if (view?.page === 'find' && view.find.status === 'error') await this.search()
    else if (view?.page === 'review' && view.recording.status === 'failed') await this.record()
    else if (view?.page === 'review' && (view.review.status === 'error' || view.firm.status === 'error')) await this.review(view.subject, view.review.status === 'by-name')
    else if (view?.page === 'record' && recordStatus(view) === 'failed') await this.run(view)
  }

  /**
   * Open Client page: the client folder of the Record run. After a failed run, the client folder is made first, so the
   * person can work with the client while some applications wait for Try again.
   * @returns whether the folder opened.
   */
  async openClientPage(): Promise<boolean> {
    const view = this.state.view
    if (view?.page !== 'record' || recordStatus(view) === 'running') return false
    const workspace = await this.makeFolder(this.generation)
    if (workspace === null) return false
    this.close()
    this.deps.open(workspace)
    return true
  }

  /** Close the toast. */
  dismissToast(): void {
    this.store.update((draft) => { draft.toast = null })
  }

  /**
   * Read the clients of the Firm Record for the Watching list and Check for new matters, and send the names of the
   * clients to the opponent index. A failed read changes nothing; the next read tries again.
   * @returns once the names are sent.
   */
  async refresh(): Promise<void> {
    const clients = await this.deps.record.clients()
    if (!clients.ok) return
    this.store.update((draft) => { draft.clients = clients.value })
    await this.deps.api.clientNames(indexNames(clients.value))
  }

  /** Stop the search timer; the page is gone. */
  dispose(): void {
    this.leave()
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
    // The opponent index takes the clients' names before the review reads it; after a failed send, a name that the
    // index does not have leaves the second half of the conflict check `reading`, which the review answer says.
    const reviewed = async () => {
      if (clients.ok) await this.deps.api.clientNames(indexNames(clients.value))
      return this.deps.api.review({ names: subject.names.map(item => item.name), clients: known })
    }
    const [answer, firm] = await Promise.all([
      byName ? Promise.resolve(null) : reviewed(),
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

  /**
   * Send the plan of a decision.
   * @returns the client as the Firm Record had it before the plan, or the failure.
   */
  private async send(decision: Decision, generation: number): Promise<SendOutcome> {
    const read = await this.deps.record.client(decision.clientId)
    if (!read.ok && !unknownClient(read.error)) return { ok: false, error: read.error }
    const existing = read.ok ? read.value : null
    const plan = await planRecords(decision, existing)
    const total = plan.steps.length
    this.updateReview(view => ({ ...view, recording: { status: 'running', done: 0, total } }))
    const outcome = await runPlan(plan, this.deps.record, (done) => {
      if (generation === this.generation) this.updateReview(view => ({ ...view, recording: { status: 'running', done, total } }))
    })
    return outcome.ok ? { ok: true, existing } : { ok: false, error: outcome.error }
  }

  /**
   * Run the Record view on from where it is: read the batch size, record the missing batches, make the client folder.
   * @param view - the Record view now.
   */
  private async run(view: RecordView): Promise<void> {
    const generation = this.generation
    this.updateRecord(current => ({ ...current, error: null }))
    let batches = view.batches
    if (batches === null) {
      const settings = await this.deps.api.settings()
      if (generation !== this.generation) return
      if (!settings.ok) {
        this.updateRecord(current => ({ ...current, error: settings.error }))
        return
      }
      const split = splitBatches(view.applications, settings.value.recordBatchSize)
      this.updateRecord(current => ({ ...current, batches: split }))
      batches = split
    }
    const ended = await recordBatches({ clientId: view.clientId, batches, parties: view.parties, error: null }, this.deps.record, (run) => {
      if (generation !== this.generation) return false
      this.updateRecord(current => ({ ...current, batches: run.batches, parties: run.parties }))
      return true
    })
    if (generation !== this.generation) return
    if (ended.error !== null) {
      const { error } = ended
      this.updateRecord(current => ({ ...current, error }))
      return
    }
    await this.makeFolder(generation)
  }

  /**
   * Make the client folder of the Record view, or give the workspace of the folder that it made.
   * @returns the workspace, or null when the folder failed, is being made now, or the view is gone.
   */
  private async makeFolder(generation: number): Promise<WorkspaceId | null> {
    const view = this.state.view
    if (view?.page !== 'record' || view.folder.state === 'making') return null
    if (view.folder.state === 'made') return view.folder.workspace
    this.updateRecord(current => ({ ...current, folder: { state: 'making' } }))
    const made = await this.deps.api.clientFolder({ clientId: view.clientId, name: view.name, names: view.names })
    if (generation !== this.generation) return null
    if (!made.ok) {
      this.updateRecord(current => ({ ...current, folder: { state: 'waiting' }, error: made.error }))
      return null
    }
    const workspace = made.value.workspace as WorkspaceId
    this.updateRecord(current => ({ ...current, folder: { state: 'made', workspace } }))
    return workspace
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

  private updateRecord(change: (view: RecordView) => RecordView): void {
    this.updateView('record', change)
  }
}

/** A failed recording becomes idle when the person changes the decision; a running one goes on. */
function idleUnlessRunning(recording: RecordingStatus): RecordingStatus {
  return recording.status === 'running' ? recording : { status: 'idle' }
}

/** Where a Record run is: it runs, a failure stopped it, or the client folder is made. */
export type RecordStatus = 'running' | 'failed' | 'done'

/**
 * Where the Record run of a Record view is.
 * @param view - the Record view.
 * @returns `failed` while a failure is set, `done` once the client folder is made, else `running`.
 */
export function recordStatus(view: RecordView): RecordStatus {
  if (view.error !== null) return 'failed'
  return view.folder.state === 'made' ? 'done' : 'running'
}

/**
 * The client of a client folder: the one client with the role client whose folder name is the folder's name. The
 * client folder route names each folder by {@link clientFolderName} of the client name.
 * @param clients - the clients of the Firm Record.
 * @param folderPath - the client folder's path on the Host.
 * @returns the client, or null when no client or more than one client has the folder's name.
 */
export function clientOfFolder(clients: readonly FirmClient[], folderPath: string): FirmClient | null {
  const folder = folderPath.split(/[\\/]/u).pop()
  const [match, ...others] = clients.filter(client => client.role === 'client' && clientFolderName(client.name) === folder)
  return others.length === 0 && match !== undefined ? match : null
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
