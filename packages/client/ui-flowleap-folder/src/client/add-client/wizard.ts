/**
 * The steps of the Add client wizard as data: the state of one wizard, the steps of each role, why a step's primary act
 * waits, and the mark of each step in the stepper. Every value here is derived from the {@link WizardView}; the model
 * (`model.ts`) changes the view, and the pages only read it.
 * @module
 */

import {
  REGISTER_COUNT_CAP, clientFolderName,
  type ConflictCheckAnswer, type DocketMatter, type DocketState, type NameCount, type NameSource, type OthersAnswer,
} from '../../add-client/wire.ts'
import type { HostFailure } from './api.ts'
import { allHits, firmHits, type ApplicationDecision, type Decision, type OtherPartyRole } from './plan.ts'
import type { ClientDetail, ClientId, ClientRole, FirmClient, Hit, LinkedName, RecordError } from './records.ts'

/** One step of the wizard. `conflict` is the step of the role Client; `matter` is the step of the role Other party. */
export type StepId = 'company' | 'matters' | 'role' | 'conflict' | 'matter' | 'review'

/** The order of the steps: `conflict` and `matter` are the same place, for two roles. */
const RANK: Readonly<Record<StepId, number>> = { company: 0, matters: 1, role: 2, conflict: 3, matter: 3, review: 4 }

/** One applicant name that the find answer proposes, with whether the person keeps it ticked. */
export interface GroupName {
  readonly name: string
  /** The count of matching EP applications in the EP Register. */
  readonly matching: number
  readonly ticked: boolean
}

/** What the Company step shows below the name field. */
export type FindStatus =
  | { readonly status: 'empty' }
  /** `skeleton` turns true 150 ms after the request, and the skeleton then shows for at least 300 ms. */
  | { readonly status: 'loading'; readonly skeleton: boolean }
  | {
    readonly status: 'found'
    readonly source: NameSource
    readonly edition?: string
    readonly asOf: string
    readonly truncated: boolean
    readonly sampleRows: number
    readonly omitted: number
    readonly names: readonly GroupName[]
  }
  /** No patent data plugin: the client is added by its name only. */
  | { readonly status: 'no-plugin' }
  /** The search failed and the person chose Add by name only. */
  | { readonly status: 'by-name' }
  /** The runtime has no EPO key. */
  | { readonly status: 'no-key' }
  | { readonly status: 'error'; readonly error: HostFailure }

/** The firm docket rows of the found names. */
export type DocketStatus =
  /** No name to read the docket for: no search yet, or by name only. */
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: HostFailure }
  | { readonly status: 'no-plugin' }
  | { readonly status: 'read'; readonly docket: DocketState; readonly counts: readonly NameCount[]; readonly rows: readonly DocketMatter[] }

/** The count of the group's EP applications at other firms. */
export type OthersStatus =
  /** By name only, or no patent data plugin: there is no count. */
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: HostFailure }
  | { readonly status: 'counted'; readonly answer: Extract<OthersAnswer, { status: 'counted' }> }

/** The register half of the conflict check. */
export type CheckStatus =
  | { readonly status: 'loading' }
  | { readonly status: 'no-key' }
  | { readonly status: 'error'; readonly error: HostFailure }
  /** By name only: FlowLeap read no EP opposition, so the person checks conflicts and writes how. */
  | { readonly status: 'by-name' }
  | { readonly status: 'checked'; readonly answer: Extract<ConflictCheckAnswer, { status: 'checked' }> }

/** The clients with the role client as the Firm Record has them, for the conflict check and the matter picker. */
export type FirmStatus =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: RecordError }
  | { readonly status: 'ready'; readonly details: readonly ClientDetail[]; readonly asOf: string }

/** Sending the first records from the Review step. */
export type RecordingStatus =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly done: number; readonly total: number }
  | { readonly status: 'failed'; readonly error: RecordError }

/** The group that the steps after Company use: what the person confirmed when they left Company. */
export interface Group {
  /** The client's name; the client folder's name is `clientFolderName` of it. */
  readonly name: string
  /** The ticked applicant names; none when the client is added by name only. */
  readonly names: readonly LinkedName[]
  /** True when FlowLeap has no public data for the client: no search, no plugin, or Add by name only. */
  readonly byName: boolean
}

/** One Add client wizard: the open step, the choices of every step, and the data that the steps read. */
export interface WizardView {
  readonly page: 'wizard'
  /** The open step. */
  readonly at: StepId
  /** The furthest step that the person opened; the steps up to it keep their choices. */
  readonly reached: StepId
  /** True when Edit on the Review step opened `at`: its primary act goes back to Review. */
  readonly editing: boolean
  readonly query: string
  readonly find: FindStatus
  readonly docket: DocketStatus
  /** The client that the Firm Record has for this company already: Add client runs for it again. */
  readonly existing: FirmClient | null
  /** The confirmed group; null until the person leaves Company. */
  readonly group: Group | null
  /** The person's ticks of the matter rows, by application number; a row without a tick uses {@link tickedByDefault}. */
  readonly ticks: Readonly<Record<string, boolean>>
  readonly others: OthersStatus
  /** The chosen role; null until the person chooses one. */
  readonly role: ClientRole | null
  readonly check: CheckStatus
  readonly firm: FirmStatus
  readonly conflict: { readonly checked: boolean; readonly reason: string }
  /** The matter and the role in it, for the role Other party. */
  readonly other: { readonly applicationNumber: string | null; readonly role: OtherPartyRole }
  /** The client id of a new client of this wizard; a second run with the same role uses the existing id. */
  readonly newId: ClientId
  readonly recording: RecordingStatus
}

/**
 * Why a step's primary act waits. Company: `type` (no name), `search` (no answer yet), `find-failed` (the search
 * failed), `names` (no name ticked), `docket` (the firm docket is not read). Role: `role`. Conflict check:
 * `conflict-reading`, `conflict-failed`, `conflict-check` (a possible conflict, or by name only, without the check and
 * the reason). Matter: `firm`, `firm-failed`, `matter`. Review: `name` (no folder can have the name), `busy`.
 */
export type Wait =
  | 'type' | 'search' | 'find-failed' | 'names' | 'docket'
  | 'role'
  | 'conflict-reading' | 'conflict-failed' | 'conflict-check'
  | 'firm' | 'firm-failed' | 'matter'
  | 'name' | 'busy'

/** The mark of a step in the stepper. `blocked`: the conflict check has a possible conflict without its check. */
export type StepMark = 'done' | 'current' | 'todo' | 'blocked'

/**
 * The steps of a role. Before a role is chosen, the steps are those of Client.
 * @param role - the chosen role, or null.
 * @returns the steps in order.
 */
export function stepsOf(role: ClientRole | null): readonly StepId[] {
  if (role === 'watch') return ['company', 'matters', 'role', 'review']
  if (role === 'other-party') return ['company', 'matters', 'role', 'matter', 'review']
  return ['company', 'matters', 'role', 'conflict', 'review']
}

/**
 * Whether step `a` comes after step `b`.
 * @param a - one step.
 * @param b - another step.
 * @returns true when `a` is later.
 */
export function later(a: StepId, b: StepId): boolean {
  return RANK[a] > RANK[b]
}

/**
 * Whether the firm docket has rows to use: a complete read, or a partial read whose rows can be too few.
 * @param docket - the docket state.
 * @returns true for `ready`, `stale` and `partial`.
 */
export function docketUsable(docket: DocketState): boolean {
  return docket.state === 'ready' || docket.state === 'stale' || docket.state === 'partial'
}

/**
 * Whether a docket row is ticked when the person did not tick it: a row matched by address only is not.
 * @param row - the docket row.
 * @returns true when the row is ticked by default.
 */
export function tickedByDefault(row: DocketMatter): boolean {
  return !row.addressOnly
}

/**
 * The docket rows of the confirmed group.
 * @param view - the wizard.
 * @returns the rows; none before the group is confirmed or while the docket has no rows to use.
 */
export function matterRows(view: WizardView): readonly DocketMatter[] {
  const { group, docket } = view
  if (group === null || docket.status !== 'read' || !docketUsable(docket.docket)) return []
  const names = new Set(group.names.map(item => item.name))
  return docket.rows.filter(row => row.names.some(name => names.has(name)))
}

/**
 * Whether the person keeps a matter row.
 * @param view - the wizard.
 * @param row - the docket row.
 * @returns the person's tick, else the default.
 */
export function isTicked(view: WizardView, row: DocketMatter): boolean {
  return view.ticks[row.applicationNumber] ?? tickedByDefault(row)
}

/**
 * The applications that a client decision records: the ticked docket rows of the group.
 * @param view - the wizard.
 * @returns each application with its applicants.
 */
export function applicationsOf(view: WizardView): ApplicationDecision[] {
  return matterRows(view).filter(row => isTicked(view, row)).map(row => ({
    fact: {
      applicationNumber: row.applicationNumber, basis: 'register',
      ...(row.publicationNumber === undefined ? {} : { publicationNumber: row.publicationNumber }),
      ...(row.title === undefined ? {} : { title: row.title }),
      ...(row.representativeSince === undefined ? {} : { representativeSince: row.representativeSince }),
    },
    applicants: row.applicants,
  }))
}

/**
 * The hits of the wizard: the Firm Record hits and the register hits, once each.
 * @param view - the wizard.
 * @returns the hits; none until the Firm Record answered or before the group is confirmed.
 */
export function hitsOf(view: WizardView): Hit[] {
  const { firm, group, check } = view
  if (firm.status !== 'ready' || group === null) return []
  const exclude = view.existing?.clientId ?? null
  const record = firmHits(firm.details, [group.name, ...group.names.map(item => item.name)], firm.asOf, exclude)
  return allHits(record, check.status === 'checked' ? check.answer.conflicts : [])
}

/**
 * The client id that a decision records under.
 * @param view - the wizard.
 * @returns the existing client's id when its role is the chosen role, else the new id.
 */
export function clientIdOf(view: WizardView): ClientId {
  return view.existing !== null && view.existing.role === view.role ? view.existing.clientId : view.newId
}

/** Why the Company step waits. */
function companyWait(view: WizardView): Wait | null {
  const { find, docket } = view
  if (view.query.trim() === '') return 'type'
  switch (find.status) {
    case 'empty':
    case 'loading':
      return 'search'
    case 'no-key':
    case 'error':
      return 'find-failed'
    case 'no-plugin':
    case 'by-name':
      return null
    case 'found':
      if (!find.names.some(item => item.ticked)) return 'names'
      // Step 2 shows the firm's matters, so the docket must be read; with no firm identity the person goes on.
      if (docket.status === 'read') return docketUsable(docket.docket) || docket.docket.state === 'no_identity' ? null : 'docket'
      return docket.status === 'no-plugin' ? null : 'docket'
  }
}

/** Why the Conflict check step waits. */
function conflictWait(view: WizardView): Wait | null {
  const { firm, check, conflict } = view
  if (firm.status === 'error' || check.status === 'error' || check.status === 'no-key') return 'conflict-failed'
  if (firm.status === 'loading' || check.status === 'loading') return 'conflict-reading'
  if (check.status === 'checked') {
    const halves = [check.answer.conflictCheck.groupOpposedClients, check.answer.conflictCheck.clientsOpposedGroup]
    if (halves.some(half => half.state === 'incomplete')) return 'conflict-failed'
    if (halves.some(half => half.state === 'reading')) return 'conflict-reading'
  }
  // By name only, the person checks conflicts too, also with no hit.
  const asked = check.status === 'by-name' || hitsOf(view).length > 0
  return asked && !(conflict.checked && conflict.reason.trim() !== '') ? 'conflict-check' : null
}

/** Why the Matter step of Other party waits. */
function matterWait(view: WizardView): Wait | null {
  if (view.firm.status === 'loading') return 'firm'
  if (view.firm.status === 'error') return 'firm-failed'
  return view.other.applicationNumber === null ? 'matter' : null
}

/**
 * Why a step's primary act waits. The primary act of Review waits for the first step that waits, then for the name of
 * the client folder and a recording that runs.
 * @param view - the wizard.
 * @param step - the step.
 * @returns the reason, or null when the primary act may run.
 */
export function waitOf(view: WizardView, step: StepId): Wait | null {
  switch (step) {
    case 'company':
      return companyWait(view)
    case 'matters':
      return null
    case 'role':
      return view.role === null ? 'role' : null
    case 'conflict':
      return conflictWait(view)
    case 'matter':
      return matterWait(view)
    case 'review': {
      if (view.recording.status === 'running') return 'busy'
      for (const before of stepsOf(view.role).filter(item => item !== 'review')) {
        const wait = waitOf(view, before)
        if (wait !== null) return wait
      }
      // Checked before any record is sent: the client folder route would refuse the name after the client is recorded.
      return view.role === 'client' && view.group !== null && clientFolderName(view.group.name) === undefined ? 'name' : null
    }
  }
}

/**
 * The mark of a step in the stepper.
 * @param view - the wizard.
 * @param step - a step of {@link stepsOf} the role.
 * @returns `blocked` for a reached conflict check with an open conflict, `current` for the open step, `done` for a
 *   reached step that does not wait, else `todo`.
 */
export function markOf(view: WizardView, step: StepId): StepMark {
  const reached = !later(step, view.reached)
  if (step === 'conflict' && reached && waitOf(view, 'conflict') === 'conflict-check') return 'blocked'
  if (step === view.at) return 'current'
  return reached && waitOf(view, step) === null ? 'done' : 'todo'
}

/**
 * Whether the stepper opens a step: a reached step that is not open, after steps that do not wait. The conflict check
 * does not stop the way to Review, whose primary act waits for it.
 * @param view - the wizard.
 * @param step - the step.
 * @returns true when the stepper links to the step.
 */
export function canOpen(view: WizardView, step: StepId): boolean {
  if (step === view.at || later(step, view.reached)) return false
  const steps = stepsOf(view.role)
  return steps.slice(0, steps.indexOf(step)).every(before => RANK[before] === RANK.conflict || waitOf(view, before) === null)
}

/**
 * The step after a step.
 * @param view - the wizard.
 * @returns Review when Edit opened the step, else the next step of the role.
 */
export function nextOf(view: WizardView): Exclude<StepId, 'company'> {
  const steps = stepsOf(view.role)
  const next = steps[steps.indexOf(view.at) + 1]
  return view.editing || next === undefined || next === 'company' ? 'review' : next
}

/**
 * The step before the open step.
 * @param view - the wizard.
 * @returns the previous step of the role, or null on Company.
 */
export function previousOf(view: WizardView): StepId | null {
  const steps = stepsOf(view.role)
  return steps[steps.indexOf(view.at) - 1] ?? null
}

/**
 * The group of the Company step now: the ticked names of the found group, or none by name only.
 * @param view - the wizard.
 * @returns the group.
 */
export function groupOf(view: WizardView): Group {
  const { find, existing } = view
  const name = existing?.name ?? view.query.trim()
  if (find.status !== 'found') return { name, names: [], byName: true }
  const names = find.names.filter(item => item.ticked).map((item): LinkedName => ({
    name: item.name, source: find.source, applications: item.matching,
    ...(find.edition === undefined ? {} : { edition: find.edition }),
  }))
  return { name, names, byName: false }
}

/**
 * Whether two groups have the same name and names.
 * @param left - one group.
 * @param right - the other group.
 * @returns true when nothing that the later steps read differs.
 */
export function sameGroup(left: Group, right: Group): boolean {
  const key = (group: Group) => JSON.stringify([group.name, group.byName, group.names.map(item => item.name)])
  return key(left) === key(right)
}

/**
 * Whether a register count stopped at the EPO's cap.
 * @param count - the count.
 * @returns true at the cap.
 */
export function capped(count: number): boolean {
  return count >= REGISTER_COUNT_CAP
}

/**
 * The decision of the wizard.
 * @param view - the wizard; its Review step does not wait.
 * @param group - the confirmed group.
 * @param role - the chosen role.
 * @returns the decision.
 */
export function decisionOf(view: WizardView, group: Group, role: ClientRole): Decision {
  const base = { clientId: clientIdOf(view), name: group.name, names: group.names }
  if (role === 'watch') return { role, ...base }
  if (role === 'other-party') return { role, ...base, matter: { applicationNumber: view.other.applicationNumber ?? '', role: view.other.role } }
  const hits = hitsOf(view)
  // By name only, the reason says how the person checked conflicts, also with no hit.
  const reason = hits.length === 0 && view.check.status !== 'by-name' ? {} : { reason: view.conflict.reason.trim() }
  return { role, ...base, hits, ...reason, applications: applicationsOf(view) }
}
