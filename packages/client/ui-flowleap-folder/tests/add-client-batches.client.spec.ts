import { describe, expect, it } from 'vitest'
import {
  knownParties, missingApplications, recordBatches, recordedCount, splitAgain, splitBatches, type BatchRun, type RecordBatch,
} from '../src/client/add-client/batches.ts'
import type { ApplicationDecision } from '../src/client/add-client/plan.ts'
import type { ClientDetail, PartyId, RecordCommand } from '../src/client/add-client/records.ts'
import { SCHUBERT_ID, SYNTEGON_ID, fakeRecord, firmClient } from './add-client-fakes.client.ts'

/** Applications `EP23000001`, `EP23000002`, … of the client, each with one applicant. */
function applications(count: number, applicants: readonly string[] = ['Syntegon Technology GmbH']): ApplicationDecision[] {
  return Array.from({ length: count }, (_, index) => ({
    fact: { applicationNumber: `EP23${String(index + 1).padStart(6, '0')}`, basis: 'register' as const }, applicants,
  }))
}

/** The application count of each batch. */
const sizes = (batches: readonly RecordBatch[]) => batches.map(batch => batch.applications.length)

/** The batch commands that the Firm Record got. */
const batchesOf = (sent: readonly RecordCommand[]) => sent.filter(command => command.kind === 'applications')

const syntegon = (applicationsOf: ClientDetail['applications'] = []): ClientDetail => ({
  client: firmClient(SYNTEGON_ID, 'Syntegon'), names: [], applications: applicationsOf, conflictChecks: [],
})

function run(batches: readonly RecordBatch[], parties: BatchRun['parties'] = {}): BatchRun {
  return { clientId: SYNTEGON_ID, batches, parties, error: null }
}

describe('the batches of a client', () => {
  it('splits the applications into batches of the batch size, the last one smaller', () => {
    expect(sizes(splitBatches(applications(1132), 100))).toEqual([...Array.from({ length: 11 }, () => 100), 32])
    expect(sizes(splitBatches(applications(3), 100))).toEqual([3])
    expect(splitBatches([], 100)).toEqual([])
    expect(splitBatches(applications(2), 1).map(batch => batch.state)).toEqual(['waiting', 'waiting'])
  })

  it('splits again only the batches that are not recorded', () => {
    const batches = splitBatches(applications(250), 100).map((batch, index) => index === 0 ? { ...batch, state: 'recorded' as const } : batch)
    const again = splitAgain(batches, 40)
    expect(sizes(again)).toEqual([100, 40, 40, 40, 30])
    expect(again.map(batch => batch.state)).toEqual(['recorded', 'waiting', 'waiting', 'waiting', 'waiting'])
    expect(recordedCount(again)).toBe(100)
  })

  it('leaves out each application that the Firm Record has with every applicant role, in normalized form', () => {
    const decided: ApplicationDecision[] = [
      { fact: { applicationNumber: 'EP23000001', basis: 'register' }, applicants: ['Syntegon Technology GmbH'] },
      { fact: { applicationNumber: 'EP23000002', basis: 'register' }, applicants: ['Syntegon Technology GmbH', 'Syntegon Pouch Systems AG'] },
      { fact: { applicationNumber: 'EP23000003', basis: 'register' }, applicants: ['Syntegon Technology GmbH'] },
    ]
    const existing = syntegon([
      { applicationNumber: 'EP23000001', roles: [{ partyId: 'party-1' as PartyId, party: 'SYNTEGON TECHNOLOGY GMBH', role: 'applicant' }] },
      { applicationNumber: 'EP23000002', roles: [{ partyId: 'party-1' as PartyId, party: 'Syntegon Technology GmbH', role: 'applicant' }, { partyId: 'party-2' as PartyId, party: 'Syntegon Pouch Systems AG', role: 'opponent' }] },
    ])
    expect(missingApplications(decided, existing).map(item => item.fact.applicationNumber)).toEqual(['EP23000002', 'EP23000003'])
    expect(missingApplications(decided, null)).toEqual(decided)
    expect(knownParties(existing)).toEqual({ 'syntegon technology gmbh': 'party-1', 'syntegon pouch systems ag': 'party-2' })
    expect(knownParties(null)).toEqual({})
  })
})

describe('recording the batches', () => {
  it('records each party once, then each batch with the applicant roles of its applications', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    const items = applications(3, ['Syntegon Technology GmbH', 'SYNTEGON TECHNOLOGY GMBH', 'Syntegon Pouch Systems AG'])
    const reported: string[] = []
    const ended = await recordBatches(run(splitBatches(items, 2)), fake.record, (current) => {
      reported.push(current.batches.map(batch => batch.state).join(','))
      return true
    })
    expect(ended.error).toBeNull()
    expect(ended.batches.map(batch => batch.state)).toEqual(['recorded', 'recorded'])
    expect(ended.parties).toEqual({ 'syntegon technology gmbh': 'party-1', 'syntegon pouch systems ag': 'party-2' })
    expect(reported).toEqual(['recording,waiting', 'recorded,waiting', 'recorded,recording', 'recorded,recorded'])
    expect(fake.sent.filter(command => command.kind === 'party').map(command => command.kind === 'party' && command.name)).toEqual(['Syntegon Technology GmbH', 'Syntegon Pouch Systems AG'])
    const [first] = batchesOf(fake.sent)
    expect(first).toEqual({
      kind: 'applications', clientId: SYNTEGON_ID,
      applications: items.slice(0, 2).map(item => ({
        application: item.fact,
        roles: [{ partyId: 'party-1', role: 'applicant', clientId: SYNTEGON_ID }, { partyId: 'party-2', role: 'applicant', clientId: SYNTEGON_ID }],
      })),
    })
    expect(fake.details.get(SYNTEGON_ID)?.applications).toHaveLength(3)
  })

  it('stops at a failed batch, and Try again records only the batches that are not recorded', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    const known = { 'syntegon technology gmbh': 'party-1' as PartyId }
    let calls = 0
    const send = fake.mock.send.getMockImplementation()!
    fake.mock.send.mockImplementation(async (command) => {
      if (command.kind === 'applications' && (calls += 1) === 3) return { ok: false, error: { kind: 'service', status: 503 } }
      return send(command)
    })
    const failed = await recordBatches(run(splitBatches(applications(5), 1), known), fake.record, () => true)
    expect(failed.error).toEqual({ kind: 'service', status: 503 })
    expect(failed.batches.map(batch => batch.state)).toEqual(['recorded', 'recorded', 'failed', 'waiting', 'waiting'])
    expect(batchesOf(fake.sent)).toHaveLength(2)
    expect(fake.sent.some(command => command.kind === 'party')).toBe(false)
    const again = await recordBatches(failed, fake.record, () => true)
    expect(again.error).toBeNull()
    expect(again.batches.every(batch => batch.state === 'recorded')).toBe(true)
    // The two recorded batches were never sent again: the batches of the second run are the third to the fifth.
    expect(batchesOf(fake.sent).map(command => command.kind === 'applications' && command.applications[0]?.application.applicationNumber))
      .toEqual(['EP23000001', 'EP23000002', 'EP23000003', 'EP23000004', 'EP23000005'])
  })

  it('splits the batches by the maximum that the Firm Record names and goes on', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    fake.state.batchMax = 40
    const ended = await recordBatches(run(splitBatches(applications(130), 100)), fake.record, () => true)
    expect(ended.error).toBeNull()
    expect(sizes(ended.batches)).toEqual([40, 40, 40, 10])
    expect(batchesOf(fake.sent).map(command => command.kind === 'applications' && command.applications.length)).toEqual([100, 40, 40, 40, 10])
    expect(fake.details.get(SYNTEGON_ID)?.applications).toHaveLength(130)
  })

  it('fails a batch that the Firm Record refuses as too large without a smaller maximum', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    fake.state.failNext.set('applications', { kind: 'refused', status: 413, code: 'batch-too-large', max: 100 })
    const ended = await recordBatches(run(splitBatches(applications(100), 100)), fake.record, () => true)
    expect(ended.error).toEqual({ kind: 'refused', status: 413, code: 'batch-too-large', max: 100 })
    expect(ended.batches.map(batch => batch.state)).toEqual(['failed'])
  })

  it('refuses the whole batch when one application is of another client', async () => {
    const schubert: ClientDetail = { client: firmClient(SCHUBERT_ID, 'Gerhard Schubert'), names: [], conflictChecks: [], applications: [{ applicationNumber: 'EP23000002', roles: [] }] }
    const fake = fakeRecord({ details: [syntegon(), schubert] })
    const ended = await recordBatches(run(splitBatches(applications(3), 3)), fake.record, () => true)
    expect(ended.error).toEqual({ kind: 'refused', status: 409, code: 'application-other-client', clientId: SCHUBERT_ID, applicationNumber: 'EP23000002' })
    expect(ended.batches.map(batch => batch.state)).toEqual(['failed'])
    expect(fake.details.get(SYNTEGON_ID)?.applications).toEqual([])
  })

  it('fails the batch whose party cannot be recorded, and sends no batch', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    fake.state.failNext.set('party', { kind: 'network' })
    const ended = await recordBatches(run(splitBatches(applications(2), 1)), fake.record, () => true)
    expect(ended.error).toEqual({ kind: 'network' })
    expect(ended.batches.map(batch => batch.state)).toEqual(['failed', 'waiting'])
    expect(batchesOf(fake.sent)).toEqual([])
  })

  it('fails the batch when a party command answers no party id', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    fake.mock.send.mockResolvedValue({ ok: true, value: { kind: 'recorded' } })
    const ended = await recordBatches(run(splitBatches(applications(1), 1)), fake.record, () => true)
    expect(ended.error).toEqual({ kind: 'malformed', path: 'body.partyId' })
    expect(ended.batches.map(batch => batch.state)).toEqual(['failed'])
  })

  it('stops before its next command when the report says so', async () => {
    const fake = fakeRecord({ details: [syntegon()] })
    const known = { 'syntegon technology gmbh': 'party-1' as PartyId }
    const before = await recordBatches(run(splitBatches(applications(2), 1), known), fake.record, () => false)
    expect(before.batches.map(batch => batch.state)).toEqual(['recording', 'waiting'])
    expect(fake.sent).toEqual([])
    let reports = 0
    const after = await recordBatches(run(splitBatches(applications(2), 1), known), fake.record, () => (reports += 1) < 2)
    expect(after.batches.map(batch => batch.state)).toEqual(['recorded', 'waiting'])
    expect(batchesOf(fake.sent)).toHaveLength(1)
  })

  it('ends at once when every batch is recorded', async () => {
    const fake = fakeRecord()
    const recorded = splitBatches(applications(2), 2).map(batch => ({ ...batch, state: 'recorded' as const }))
    expect((await recordBatches(run(recorded), fake.record, () => true)).batches).toEqual(recorded)
    expect(fake.sent).toEqual([])
  })
})
