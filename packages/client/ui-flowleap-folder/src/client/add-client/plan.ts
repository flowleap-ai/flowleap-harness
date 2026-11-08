/**
 * The facts of an Add client decision and the Firm Record commands that record them. A decision is what the person
 * chose on the review page; `planRecords` turns it into the commands in the contract order (conflict check, client,
 * names, then for each application its parties, the application and the applicant roles) and leaves out each fact that
 * the Firm Record has already, so a second run and a Try again send only what is missing. `runPlan` sends the steps one
 * after another and stops at the first failure.
 * @module
 */

import type { ConflictHit, KnownClient } from '../../add-client/wire.ts'
import {
  hitKey, hitsHash, normalizeName,
  type ApplicationFact, type ClientDetail, type ClientId, type FirmClient, type FirmRecord, type Hit, type LinkedName, type PartyId,
  type PartyRole, type RecordCommand, type RecordError,
} from './records.ts'

/** The role of the company in a matter of your firm, for the role Other party. */
export type OtherPartyRole = 'opponent' | 'licensee' | 'other'

/** One application that the client decision records, with its applicants as the register writes them. */
export interface ApplicationDecision {
  readonly fact: ApplicationFact
  readonly applicants: readonly string[]
}

/** What the person decided, with the facts the decision records. */
export type Decision =
  | {
    readonly role: 'client'
    readonly clientId: ClientId
    readonly name: string
    readonly names: readonly LinkedName[]
    readonly hits: readonly Hit[]
    /** Why the person may add the client in spite of the hits; absent with no hit. */
    readonly reason?: string
    readonly applications: readonly ApplicationDecision[]
  }
  | { readonly role: 'watch'; readonly clientId: ClientId; readonly name: string; readonly names: readonly LinkedName[] }
  | {
    readonly role: 'other-party'
    readonly clientId: ClientId
    readonly name: string
    readonly names: readonly LinkedName[]
    /** The application of your firm in which the company is a party, and its role there. */
    readonly matter: { readonly applicationNumber: string; readonly role: OtherPartyRole }
  }

/** One step of a plan: a command, a party whose id later steps use, or a role of a party by its name. */
export type PlanStep =
  | { readonly kind: 'command'; readonly command: Exclude<RecordCommand, { kind: 'party' | 'role' }> }
  | { readonly kind: 'party'; readonly name: string }
  | { readonly kind: 'role'; readonly applicationNumber: string; readonly party: string; readonly role: PartyRole; readonly clientId: ClientId }

/** The steps of a plan, and the party ids that the Firm Record has already, by normalized name. */
export interface Plan {
  readonly steps: readonly PlanStep[]
  readonly parties: ReadonlyMap<string, PartyId>
}

/**
 * The existing client of a company: a client whose name or a linked name has the normalized form of one of the names.
 * @param clients - the clients of the Firm Record.
 * @param names - the typed name and the names of the group.
 * @returns the first match, or null.
 */
export function matchExisting(clients: readonly FirmClient[], names: readonly string[]): FirmClient | null {
  const wanted = new Set(names.map(normalizeName))
  return clients.find(client => [client.name, ...client.names.map(item => item.name)].some(name => wanted.has(normalizeName(name)))) ?? null
}

/**
 * The clients with the role client that `review` compares, without the client of a second run.
 * @param clients - the clients of the Firm Record.
 * @param exclude - the client that Add client runs for again.
 * @returns each client with its name and its linked names.
 */
export function knownClients(clients: readonly FirmClient[], exclude: ClientId | null): KnownClient[] {
  return clients
    .filter(client => client.role === 'client' && client.clientId !== exclude)
    .map(client => ({ clientId: client.clientId, names: [client.name, ...client.names.map(item => item.name)] }))
}

/**
 * The possible conflicts that the Firm Record shows: a ticked name that is a party with a role other than applicant on
 * an application of an existing client.
 * @param details - each client with the role client, read from `clients/<id>`.
 * @param ticked - the ticked applicant names.
 * @param asOf - ISO-8601 instant of the read.
 * @param exclude - the client of a second run, whose own record is no conflict.
 * @returns the hits.
 */
export function firmHits(details: readonly ClientDetail[], ticked: readonly string[], asOf: string, exclude: ClientId | null): Hit[] {
  const wanted = new Set(ticked.map(normalizeName))
  return details.filter(detail => detail.client.clientId !== exclude).flatMap(detail => detail.applications.flatMap((application) => {
    const own = application.roles.find(role => role.role === 'applicant')?.party ?? detail.client.name
    return application.roles
      .filter(role => role.role !== 'applicant' && wanted.has(normalizeName(role.party)))
      .map((role): Hit => ({
        applicationNumber: application.applicationNumber,
        ...(application.publicationNumber === undefined ? {} : { publicationNumber: application.publicationNumber }),
        ...(application.title === undefined ? {} : { title: application.title }),
        otherParty: role.party,
        otherPartyRole: role.role === 'opponent' || role.role === 'patent-owner' ? role.role : 'other',
        existingClientId: detail.client.clientId,
        existingClientParty: own,
        source: 'firm-record',
        asOf,
      }))
  }))
}

/**
 * The hits of both sources once each: the Firm Record hits, then the register hits without the fields that the
 * contract `Hit` has not (`opposedOn`, `status`).
 * @param record - the Firm Record hits.
 * @param register - the conflicts of `review`.
 * @returns the hits, unique by hit key.
 */
export function allHits(record: readonly Hit[], register: readonly ConflictHit[]): Hit[] {
  const seen = new Set<string>()
  const out: Hit[] = []
  for (const hit of [...record, ...register.map(({ opposedOn: _opposedOn, status: _status, ...rest }) => rest)]) {
    if (seen.has(hitKey(hit))) continue
    seen.add(hitKey(hit))
    out.push(hit)
  }
  return out
}

/**
 * The commands that record a decision, without the facts that the Firm Record has already.
 * @param decision - the decision.
 * @param existing - the client as the Firm Record has it now, or null when it has no such client.
 * @returns the plan.
 */
export async function planRecords(decision: Decision, existing: ClientDetail | null): Promise<Plan> {
  const { clientId } = decision
  const parties = new Map<string, PartyId>()
  const roles = new Set<string>()
  for (const application of existing?.applications ?? []) {
    for (const role of application.roles) {
      parties.set(normalizeName(role.party), role.partyId)
      roles.add(`${application.applicationNumber}|${normalizeName(role.party)}|${role.role}`)
    }
  }
  const recorded = new Set(existing?.applications.map(application => application.applicationNumber))
  const linked = new Set(existing?.names.map(item => normalizeName(item.name)))
  const planned = new Set<string>()
  const party = (name: string): PlanStep[] => {
    const key = normalizeName(name)
    if (parties.has(key) || planned.has(key)) return []
    planned.add(key)
    return [{ kind: 'party', name }]
  }
  const role = (applicationNumber: string, name: string, partyRole: PartyRole): PlanStep[] =>
    roles.has(`${applicationNumber}|${normalizeName(name)}|${partyRole}`) ? [] : [{ kind: 'role', applicationNumber, party: name, role: partyRole, clientId }]
  const steps: PlanStep[] = []
  if (decision.role === 'client' && !existing?.conflictChecks.includes(await hitsHash(decision.hits))) {
    steps.push({ kind: 'command', command: { kind: 'conflict-check', clientId, hits: decision.hits, ...(decision.reason === undefined ? {} : { reason: decision.reason }) } })
  }
  if (existing === null) steps.push({ kind: 'command', command: { kind: 'client', clientId, name: decision.name, role: decision.role } })
  for (const name of decision.names) {
    if (!linked.has(normalizeName(name.name))) steps.push({ kind: 'command', command: { kind: 'name', clientId, name } })
  }
  if (decision.role === 'client') {
    for (const { fact, applicants } of decision.applications) {
      steps.push(...[...new Set(applicants)].flatMap(party))
      if (!recorded.has(fact.applicationNumber)) steps.push({ kind: 'command', command: { kind: 'application', clientId, application: fact } })
      steps.push(...[...new Set(applicants)].flatMap(name => role(fact.applicationNumber, name, 'applicant')))
    }
  }
  if (decision.role === 'other-party') steps.push(...party(decision.name), ...role(decision.matter.applicationNumber, decision.name, decision.matter.role))
  return { steps, parties }
}

/** The end of a plan run: done, or the step that failed with its failure. */
export type PlanOutcome = { readonly ok: true } | { readonly ok: false; readonly error: RecordError; readonly step: PlanStep }

/**
 * Send the steps one after another; the first failure stops the rest. A party step keeps the answered party id for the
 * role steps after it.
 * @param plan - the plan.
 * @param record - the Firm Record.
 * @param progress - called with the count of done steps after each step.
 * @returns the outcome.
 */
export async function runPlan(plan: Plan, record: FirmRecord, progress: (done: number) => void): Promise<PlanOutcome> {
  const parties = new Map(plan.parties)
  let done = 0
  for (const step of plan.steps) {
    const partyId = step.kind === 'role' ? parties.get(normalizeName(step.party)) : undefined
    const command: RecordCommand = step.kind === 'command'
      ? step.command
      : step.kind === 'party'
        ? { kind: 'party', name: step.name }
        // The plan puts each party step before the role steps of that party, so the id is known here.
        : { kind: 'role', applicationNumber: step.applicationNumber, partyId: partyId as PartyId, role: step.role, clientId: step.clientId }
    const result = await record.send(command)
    if (!result.ok) return { ok: false, error: result.error, step }
    if (step.kind === 'party' && result.value.kind === 'party') parties.set(normalizeName(step.name), result.value.partyId)
    done += 1
    progress(done)
  }
  return { ok: true }
}
