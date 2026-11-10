/**
 * The applications of a client in batches of the Firm Record's batch command. A run records the batches one after
 * another: before a batch, it records each applicant of the batch as a party that the run does not know, then it sends
 * the batch with one `Idempotency-Key`. A batch is atomic, so it is recorded or not. A run that stopped at a failed batch
 * goes on with the first batch that is not recorded, so a batch that was recorded is never sent twice. When the Firm
 * Record refuses a batch as larger than its own maximum, the run splits the batches that are not recorded by that
 * maximum and goes on.
 * @module
 */

import type { ApplicationDecision } from './plan.ts'
import { normalizeName, type BatchRole, type ClientDetail, type ClientId, type FirmRecord, type PartyId, type RecordError } from './records.ts'

/** Where one batch is: not sent yet, sent now, recorded, or refused or not answered. */
export type BatchState = 'waiting' | 'recording' | 'recorded' | 'failed'

/** One batch of applications. */
export interface RecordBatch {
  readonly applications: readonly ApplicationDecision[]
  readonly state: BatchState
}

/** The state of a run over the batches of one client. */
export interface BatchRun {
  readonly clientId: ClientId
  readonly batches: readonly RecordBatch[]
  /** The party id of each applicant name that the run knows, by normalized name. */
  readonly parties: Readonly<Record<string, PartyId>>
  /** Why the failed batch was not recorded; null while no batch failed. */
  readonly error: RecordError | null
}

/**
 * The applications of a decision that the Firm Record does not have with every applicant role.
 * @param applications - the applications of the decision.
 * @param existing - the client as the Firm Record has it, or null for a new client.
 * @returns the applications to record, in their order.
 */
export function missingApplications(applications: readonly ApplicationDecision[], existing: ClientDetail | null): ApplicationDecision[] {
  const recorded = new Map(existing?.applications.map(application => [
    application.applicationNumber,
    new Set(application.roles.filter(role => role.role === 'applicant').map(role => normalizeName(role.party))),
  ]))
  return applications.filter((item) => {
    const roles = recorded.get(item.fact.applicationNumber)
    return roles === undefined || item.applicants.some(name => !roles.has(normalizeName(name)))
  })
}

/**
 * The party ids that the Firm Record has for the parties of a client's applications.
 * @param existing - the client as the Firm Record has it, or null for a new client.
 * @returns each party id by normalized name.
 */
export function knownParties(existing: ClientDetail | null): Record<string, PartyId> {
  const roles = (existing?.applications ?? []).flatMap(application => application.roles)
  return Object.fromEntries(roles.map(role => [normalizeName(role.party), role.partyId]))
}

/**
 * Split applications into batches.
 * @param applications - the applications, in their order.
 * @param size - the most applications of one batch, at least 1.
 * @returns the batches, each `waiting`.
 */
export function splitBatches(applications: readonly ApplicationDecision[], size: number): RecordBatch[] {
  const batches: RecordBatch[] = []
  for (let start = 0; start < applications.length; start += size) batches.push({ applications: applications.slice(start, start + size), state: 'waiting' })
  return batches
}

/**
 * Split the batches that are not recorded again by a smaller maximum.
 * @param batches - the batches; the recorded batches come first.
 * @param max - the most applications of one batch that the Firm Record takes.
 * @returns the recorded batches, then the other applications in batches of at most `max`.
 */
export function splitAgain(batches: readonly RecordBatch[], max: number): RecordBatch[] {
  const recorded = batches.filter(batch => batch.state === 'recorded')
  return [...recorded, ...splitBatches(batches.filter(batch => batch.state !== 'recorded').flatMap(batch => batch.applications), max)]
}

/**
 * The count of the applications in recorded batches.
 * @param batches - the batches.
 * @returns the count.
 */
export function recordedCount(batches: readonly RecordBatch[]): number {
  return batches.reduce((count, batch) => count + (batch.state === 'recorded' ? batch.applications.length : 0), 0)
}

/** The applicant roles of one application, each party once. */
function rolesOf(applicants: readonly string[], parties: Readonly<Record<string, PartyId>>, clientId: ClientId): BatchRole[] {
  const ids = new Set(applicants.map(name => parties[normalizeName(name)]).filter((id): id is PartyId => id !== undefined))
  return [...ids].map(partyId => ({ partyId, role: 'applicant', clientId }))
}

/**
 * Send one batch: first each applicant of the batch as a party that `parties` does not have, then the batch.
 * @param batch - the batch.
 * @param parties - the known party ids by normalized name; the answered ids are added to it.
 * @param record - the Firm Record.
 * @param clientId - the client.
 * @returns null when the batch is recorded, else why not.
 */
async function sendBatch(
  batch: RecordBatch, parties: Record<string, PartyId>, record: FirmRecord, clientId: ClientId,
): Promise<RecordError | null> {
  for (const name of new Set(batch.applications.flatMap(item => item.applicants))) {
    const key = normalizeName(name)
    if (parties[key] !== undefined) continue
    const party = await record.send({ kind: 'party', name })
    if (!party.ok) return party.error
    // A party command answers its party id; any other answer leaves the roles of the batch unknown.
    if (party.value.kind !== 'party') return { kind: 'malformed', path: 'body.partyId' }
    parties[key] = party.value.partyId
  }
  const applications = batch.applications.map(item => ({ application: item.fact, roles: rolesOf(item.applicants, parties, clientId) }))
  const sent = await record.send({ kind: 'applications', clientId, applications })
  return sent.ok ? null : sent.error
}

/**
 * Record the batches that are not recorded, one after another; the first failure stops the run.
 * @param start - the run; a failed batch and its error are sent again.
 * @param record - the Firm Record.
 * @param report - called with the run after each change; false stops the run before its next command.
 * @returns the run when it ended: every batch recorded, a batch failed with its error, or `report` stopped it.
 */
export async function recordBatches(start: BatchRun, record: FirmRecord, report: (run: BatchRun) => boolean): Promise<BatchRun> {
  let run: BatchRun = { ...start, error: null }
  const at = (index: number, state: BatchState): readonly RecordBatch[] =>
    run.batches.map((batch, item) => item === index ? { ...batch, state } : batch)
  for (;;) {
    const index = run.batches.findIndex(batch => batch.state !== 'recorded')
    const batch = run.batches[index]
    if (batch === undefined) return run
    run = { ...run, batches: at(index, 'recording') }
    if (!report(run)) return run
    const parties = { ...run.parties }
    const error = await sendBatch(batch, parties, record, run.clientId)
    if (error?.kind === 'refused' && error.code === 'batch-too-large' && error.max !== undefined && error.max < batch.applications.length) {
      run = { ...run, parties, batches: splitAgain(run.batches, error.max) }
      continue
    }
    run = error === null ? { ...run, parties, batches: at(index, 'recorded') } : { ...run, parties, batches: at(index, 'failed'), error }
    if (!report(run) || error !== null) return run
  }
}
