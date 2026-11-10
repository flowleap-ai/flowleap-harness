/**
 * The state of Add client: the wizard (Company, Matters, Role, Conflict check or Matter, Review) or the Record run of a
 * client, the clients of the Firm Record, and the toast after an act. The steps and their reasons to wait are derived
 * in `wizard.ts`; this model changes the view. The model calls the Host routes for the public data and the client
 * folder, and the Firm Record with the person's cookie for every record.
 * @module
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { clientFolderName, type FindAnswer } from '../../add-client/wire.ts'
import type { AddClientApi, HostFailure } from './api.ts'
import { knownParties, missingApplications, recordBatches, splitBatches, type RecordBatch } from './batches.ts'
import { indexNames, knownClients, matchExisting, planRecords, runPlan, type ApplicationDecision, type Decision, type OtherPartyRole } from './plan.ts'
import { newClientId, type ClientDetail, type ClientId, type ClientRole, type FirmClient, type FirmRecord, type PartyId, type RecordError } from './records.ts'
import {
  canOpen, decisionOf, groupOf, later, nextOf, previousOf, sameGroup, waitOf,
  type CheckStatus, type DocketStatus, type FindStatus, type FirmStatus, type Group, type StepId, type WizardView,
} from './wizard.ts'

export type { WizardView } from './wizard.ts'

/** The client folder of a Record run: not made yet, being made, or made with its workspace. */
export type FolderStep =
  | { readonly state: 'waiting' | 'making' }
  | { readonly state: 'made'; readonly workspace: WorkspaceId }

/**
 * The Record run of a client, after Review. Review recorded the conflict check, the client and its names; this page
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
export type AddClientView = WizardView | RecordView

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
/** How often the Company step reads the docket rows again while the Host reads the firm docket. */
export const DOCKET_POLL_MS = 2000

const wait = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/** The end of sending a plan: the client as the Firm Record had it before the plan, or the failure. */
type SendOutcome = { readonly ok: true; readonly existing: ClientDetail | null } | { readonly ok: false; readonly error: RecordError }

/** Whether a read failed because the Firm Record has no such client. */
const unknownClient = (error: RecordError): boolean => error.kind === 'refused' && (error.status === 404 || error.code === 'client-unknown')

const EMPTY: AddClientSnapshot = { view: null, clients: [], toast: null }

/**
 * A new wizard on the Company step.
 * @param fields - the fields that differ from a new wizard.
 * @returns the wizard.
 */
function wizard(fields: Partial<WizardView> = {}): WizardView {
  return {
    page: 'wizard', at: 'company', reached: 'company', editing: false, query: '', find: { status: 'empty' }, docket: { status: 'idle' },
    existing: null, group: null, ticks: {}, others: { status: 'none' }, role: null, check: { status: 'loading' }, firm: { status: 'loading' },
    conflict: { checked: false, reason: '' }, other: { applicationNumber: null, role: 'opponent' }, newId: newClientId(), recording: { status: 'idle' },
    ...fields,
  }
}

/** Add client's state and acts. */
export class AddClientModel {
  /** The state; the pages read it through their snapshot hooks. */
  readonly store: SnapshotStore<AddClientSnapshot> = createSnapshotStore<AddClientSnapshot>(EMPTY, { flush: 'sync' })
  /** Counts the views, so an answer for an older view is dropped. */
  private generation = 0
  /** Counts the searches and the group confirmations of the open wizard, so an older answer is dropped. */
  private search = 0
  private group = 0
  private findTimer: ReturnType<typeof setTimeout> | null = null
  private findAbort: AbortController | null = null
  private pollTimer: ReturnType<typeof setTimeout> | null = null

  /** @param deps - the Host routes, the Firm Record and the folder page. */
  constructor(private readonly deps: AddClientDeps) {}

  /** The current snapshot. */
  get state(): AddClientSnapshot {
    return this.store.getSnapshot()
  }

  /** Open Add client on an empty Company step. */
  start(): void {
    this.leave()
    this.store.update((draft) => {
      draft.view = wizard()
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
    const view = this.wizardView()
    if (view === null) return
    this.clearFind()
    const empty = query.trim() === ''
    // An emptied field drops the answer of the search that runs now.
    if (empty) this.search += 1
    this.setWizard(empty ? { query, find: { status: 'empty' }, docket: { status: 'idle' }, existing: null } : { query })
    if (!empty) this.findTimer = setTimeout(() => { void this.find() }, FIND_WAIT_MS)
  }

  /**
   * Search the typed name now: its applicant names with their register counts, the existing client of that name, then
   * the firm's matters of the names.
   * @returns once the answer shows.
   */
  async find(): Promise<void> {
    const view = this.wizardView()
    if (view === null || view.query.trim() === '') return
    this.clearFind()
    const search = ++this.search
    const generation = this.generation
    const query = view.query.trim()
    const abort = new AbortController()
    this.findAbort = abort
    const current = () => generation === this.generation && search === this.search
    this.setWizard({ find: { status: 'loading', skeleton: false }, docket: { status: 'idle' } })
    let shownAt = null as number | null
    const skeleton = setTimeout(() => {
      shownAt = Date.now()
      if (current()) this.setWizard({ find: { status: 'loading', skeleton: true } })
    }, SKELETON_AFTER_MS)
    const [found, clients] = await Promise.all([this.deps.api.find(query, abort.signal), this.deps.record.clients(abort.signal)])
    clearTimeout(skeleton)
    if (shownAt !== null) await wait(Math.max(0, shownAt + SKELETON_MIN_MS - Date.now()))
    if (!current()) return
    const find = findStatusOf(found)
    const names = find.status === 'found' ? find.names.map(item => item.name) : []
    const existing = clients.ok ? matchExisting(clients.value, [query, ...names]) : null
    this.setWizard({ find, existing, ...view.group === null && existing !== null ? { role: existing.role } : {} })
    if (find.status === 'found') await this.readDocket(names)
    else if (find.status === 'no-plugin') this.setWizard({ docket: { status: 'no-plugin' } })
  }

  /**
   * Tick or untick an applicant name of the found group.
   * @param name - the name.
   * @param ticked - whether it is part of the client.
   */
  tick(name: string, ticked: boolean): void {
    const view = this.wizardView()
    if (view?.find.status !== 'found') return
    this.setWizard({ find: { ...view.find, names: view.find.names.map(item => item.name === name ? { ...item, ticked } : item) } })
  }

  /** Go on by name only after the search failed. */
  byName(): void {
    const view = this.wizardView()
    if (view?.find.status === 'error' || view?.find.status === 'no-key') this.setWizard({ find: { status: 'by-name' }, docket: { status: 'idle' } })
  }

  /**
   * Tick or untick a matter row of the Matters step.
   * @param applicationNumber - the row's application.
   * @param ticked - whether the client's applications include it.
   */
  tickMatter(applicationNumber: string, ticked: boolean): void {
    const view = this.wizardView()
    if (view !== null) this.setWizard({ ticks: { ...view.ticks, [applicationNumber]: ticked } })
  }

  /**
   * Choose the role.
   * @param role - Client, Watch or Other party.
   */
  setRole(role: ClientRole): void {
    const view = this.wizardView()
    if (view !== null && view.recording.status !== 'running') this.setWizard({ role, recording: { status: 'idle' } })
  }

  /**
   * Tick "I checked this conflict" (by name only: "I checked conflicts myself") or change its reason.
   * @param checked - whether the person checked the conflict.
   * @param reason - why the company can be a client, or by name only how the person checked, as typed.
   */
  setConflict(checked: boolean, reason: string): void {
    const view = this.wizardView()
    if (view !== null && view.recording.status !== 'running') this.setWizard({ conflict: { checked, reason }, recording: { status: 'idle' } })
  }

  /**
   * Choose the matter of your firm and the role in it, for the role Other party.
   * @param applicationNumber - the application of the matter, or null for none.
   * @param role - the company's role in it.
   */
  setOther(applicationNumber: string | null, role: OtherPartyRole): void {
    if (this.wizardView() !== null) this.setWizard({ other: { applicationNumber, role } })
  }

  /**
   * The primary act of a step other than Review: Next, or Back to review after Edit. Leaving Company confirms the group.
   * @returns once the step is open.
   */
  async next(): Promise<void> {
    const view = this.wizardView()
    if (view === null || view.at === 'review' || waitOf(view, view.at) !== null) return
    await this.go(nextOf(view), false)
  }

  /** Open the step before the open step. */
  back(): void {
    const view = this.wizardView()
    const previous = view === null ? null : previousOf(view)
    if (previous !== null) this.setWizard({ at: previous })
  }

  /**
   * Open a step from the stepper.
   * @param step - a step that {@link canOpen} allows.
   * @returns once the step is open.
   */
  async open(step: StepId): Promise<void> {
    const view = this.wizardView()
    if (view !== null && canOpen(view, step)) await this.go(step, view.editing)
  }

  /**
   * Edit on the Review step: open a step; its primary act then goes back to Review, and every later choice stays.
   * @param step - the step.
   */
  edit(step: StepId): void {
    const view = this.wizardView()
    if (view?.at === 'review' && view.recording.status !== 'running') this.setWizard({ at: step, editing: true })
  }

  /**
   * Run Add client again for a client of a client folder: its names as the group, on the Matters step.
   * @param clientId - the client of the folder ({@link clientOfFolder}).
   * @returns once the steps' data is read.
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
    const [first] = names
    const find: FindStatus = first === undefined
      ? { status: 'by-name' }
      : {
        status: 'found', source: first.source, asOf: new Date().toISOString(), truncated: false, sampleRows: 0, omitted: 0,
        ...(first.edition === undefined ? {} : { edition: first.edition }),
        names: names.map(item => ({ name: item.name, matching: item.applications ?? 0, ticked: true })),
      }
    this.store.update((draft) => {
      draft.view = wizard({ query: client.name, find, existing: client, role: client.role })
      draft.toast = null
    })
    if (find.status === 'found') await this.readDocket(find.names.map(item => item.name))
    await this.go('matters', false)
  }

  /** Read the firm docket again after a partial or failed read, or go on with an interrupted read. */
  async retryDocket(): Promise<void> {
    const view = this.wizardView()
    if (view?.docket.status !== 'read') return
    const read = await this.deps.api.readDocket()
    const names = this.foundNames()
    if (read.ok && names !== null) await this.readDocket(names)
  }

  /**
   * Record the decision in the Firm Record: the conflict check, the client and its names from the Review step, then
   * for the role client its applications and its client folder on the Record page. The Firm Record is read first, so
   * only missing facts are sent.
   * @returns once the records are sent and, for a client, the Record run ended.
   */
  async record(): Promise<void> {
    const view = this.wizardView()
    if (view?.at !== 'review' || view.group === null || view.role === null || waitOf(view, 'review') !== null) return
    const generation = this.generation
    const decision = decisionOf(view, view.group, view.role)
    this.setWizard({ recording: { status: 'running', done: 0, total: 0 } })
    const outcome = await this.send(decision, generation)
    if (generation !== this.generation) return
    if (!outcome.ok) {
      const { error } = outcome
      // Another client id names a client of this name and role: Add client runs again for that client.
      if (error.kind === 'refused' && error.code === 'client-exists' && error.clientId !== undefined && view.existing === null) {
        const adopted = await this.deps.record.client(error.clientId)
        if (generation !== this.generation) return
        if (adopted.ok) {
          this.setWizard({ existing: adopted.value.client, recording: { status: 'idle' } })
          await this.record()
          return
        }
      }
      this.setWizard({ recording: { status: 'failed', error } })
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
   * Try again after a failure of the open step: the search, the docket rows, the count at other firms, the conflict
   * check, the records of Review, or the Record run. Every key is idempotent and a recorded batch is never sent again,
   * so a retry adds only what is missing.
   * @returns once the act ran.
   */
  async retry(): Promise<void> {
    const view = this.state.view
    if (view === null) return
    if (view.page === 'record') {
      if (recordStatus(view) === 'failed') await this.run(view)
      return
    }
    const names = this.foundNames()
    switch (view.at) {
      case 'company':
        if (view.find.status === 'error') await this.find()
        else if (view.docket.status === 'error' && names !== null) await this.readDocket(names)
        else await this.retryDocket()
        return
      case 'matters':
        if (view.others.status === 'error' && view.group !== null) await this.readOthers(view.group, this.group)
        return
      case 'conflict':
      case 'matter':
        if (view.group !== null) await this.readCheck(view.group, this.group)
        return
      case 'role':
        return
      case 'review':
        if (view.recording.status === 'failed') await this.record()
    }
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

  /** Stop the timers; the page is gone. */
  dispose(): void {
    this.leave()
  }

  // Steps.

  /**
   * Open a step. Leaving Company confirms the group; a new group drops the matter ticks and the conflict tick, and
   * reads the count at other firms and the conflict check again.
   */
  private async go(step: StepId, editing: boolean): Promise<void> {
    const view = this.wizardView()
    if (view === null) return
    const furthest = later(step, view.reached) ? step : view.reached
    const group = groupOf(view)
    const changed = view.group === null || !sameGroup(view.group, group)
    if (!changed) {
      this.setWizard({ at: step, reached: furthest, editing: step === 'review' ? false : editing })
      return
    }
    const id = ++this.group
    this.setWizard({
      at: step, reached: furthest, editing: step === 'review' ? false : editing, group, ticks: {},
      conflict: { checked: false, reason: view.conflict.reason }, others: group.byName ? { status: 'none' } : { status: 'loading' },
    })
    await Promise.all([group.byName ? Promise.resolve() : this.readOthers(group, id), this.readCheck(group, id)])
  }

  /** Read the firm docket rows of the found names, and read them again while the Host reads the docket. */
  private async readDocket(names: readonly string[]): Promise<void> {
    const generation = this.generation
    const search = this.search
    this.clearPoll()
    const view = this.wizardView()
    if (view?.docket.status !== 'read') this.setWizard({ docket: { status: 'loading' } })
    const answer = await this.deps.api.matters(names)
    if (generation !== this.generation || search !== this.search) return
    const docket: DocketStatus = !answer.ok
      ? { status: 'error', error: answer.error }
      : answer.value.status === 'no-plugin' ? { status: 'no-plugin' } : { status: 'read', docket: answer.value.docket, counts: answer.value.counts, rows: answer.value.rows }
    this.setWizard({ docket })
    if (docket.status === 'read' && docket.docket.state === 'reading') this.pollTimer = setTimeout(() => { void this.readDocket(names) }, DOCKET_POLL_MS)
  }

  /** Read the count of the group's EP applications at other firms. */
  private async readOthers(group: Group, id: number): Promise<void> {
    const generation = this.generation
    this.setWizard({ others: { status: 'loading' } })
    const answer = await this.deps.api.others(group.names.map(item => item.name))
    if (generation !== this.generation || id !== this.group) return
    this.setWizard({
      others: !answer.ok ? { status: 'error', error: answer.error } : answer.value.status === 'no-plugin' ? { status: 'none' } : { status: 'counted', answer: answer.value },
    })
  }

  /**
   * Read the conflict check: the clients of the Firm Record with their details, then the two register halves. The
   * opponent index takes the clients' names first; after a failed send, a name that the index does not have leaves the
   * second half `reading`.
   */
  private async readCheck(group: Group, id: number): Promise<void> {
    const generation = this.generation
    const current = () => generation === this.generation && id === this.group
    this.setWizard({ check: group.byName ? { status: 'by-name' } : { status: 'loading' }, firm: { status: 'loading' } })
    const clients = await this.deps.record.clients()
    if (!current()) return
    const exclude = this.wizardView()?.existing?.clientId ?? null
    const known = clients.ok ? knownClients(clients.value, exclude) : []
    const checked = async (): Promise<CheckStatus> => {
      if (clients.ok) await this.deps.api.clientNames(indexNames(clients.value))
      return checkStatusOf(await this.deps.api.conflictCheck({ names: group.names.map(item => item.name), clients: known }))
    }
    const [check, firm] = await Promise.all([
      group.byName ? Promise.resolve<CheckStatus>({ status: 'by-name' }) : checked(),
      clients.ok ? this.readDetails(clients.value) : Promise.resolve<FirmStatus>({ status: 'error', error: clients.error }),
    ])
    if (current()) this.setWizard({ check, firm })
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
    const progress = (done: number) => {
      if (generation === this.generation) this.setWizard({ recording: { status: 'running', done, total } })
    }
    progress(0)
    const outcome = await runPlan(plan, this.deps.record, progress)
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

  /** Drop the answers of the open view and stop its timers. */
  private leave(): void {
    this.generation += 1
    this.clearFind()
    this.clearPoll()
  }

  private clearFind(): void {
    if (this.findTimer !== null) clearTimeout(this.findTimer)
    this.findTimer = null
    this.findAbort?.abort()
    this.findAbort = null
  }

  private clearPoll(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer)
    this.pollTimer = null
  }

  /** The names of the found group, or null when the Company step found none. */
  private foundNames(): readonly string[] | null {
    const view = this.wizardView()
    return view?.find.status === 'found' ? view.find.names.map(item => item.name) : null
  }

  private wizardView(): WizardView | null {
    const view = this.state.view
    return view?.page === 'wizard' ? view : null
  }

  /** Change fields of the open wizard. */
  private setWizard(fields: Partial<WizardView>): void {
    const view = this.wizardView()
    if (view !== null) this.store.update((draft) => { draft.view = { ...view, ...fields } })
  }

  private updateRecord(change: (view: RecordView) => RecordView): void {
    const view = this.state.view
    if (view?.page === 'record') this.store.update((draft) => { draft.view = change(view) })
  }
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
    status: 'found', source: answer.source, asOf: answer.asOf, truncated: answer.truncated, sampleRows: answer.sampleRows, omitted: answer.omitted,
    ...(answer.edition === undefined ? {} : { edition: answer.edition }),
    names: answer.names.map(item => ({ name: item.name, matching: item.matching, ticked: true })),
  }
}

function checkStatusOf(answer: Awaited<ReturnType<AddClientApi['conflictCheck']>>): CheckStatus {
  if (!answer.ok) return answer.error === 'no-key' ? { status: 'no-key' } : { status: 'error', error: answer.error }
  return answer.value.status === 'no-plugin' ? { status: 'by-name' } : { status: 'checked', answer: answer.value }
}
