import { describe, expect, it } from 'vitest'
import { allHits, firmHits, knownClients, matchExisting, planRecords, runPlan, type Decision } from '../src/client/add-client/plan.ts'
import { hitsHash, type ClientDetail, type ClientId, type Hit, type PartyId } from '../src/client/add-client/records.ts'
import { AS_OF, SCHUBERT_ID, SYNTEGON_ID, fakeRecord, firmClient, registerHit } from './add-client-fakes.client.ts'

const NEW_ID = '11111111-2222-4333-8444-555555555555' as ClientId

/** Syntegon with one application on which Gerhard Schubert is the opponent and a licensee. */
const syntegon: ClientDetail = {
  client: firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY']),
  names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat' }],
  applications: [
    {
      applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element',
      roles: [
        { partyId: 'party-1' as PartyId, party: 'Syntegon Technology GmbH', role: 'applicant' },
        { partyId: 'party-2' as PartyId, party: 'GERHARD SCHUBERT GMBH', role: 'opponent' },
        { partyId: 'party-3' as PartyId, party: 'Gerhard Schubert GmbH.', role: 'licensee' },
        { partyId: 'party-4' as PartyId, party: 'Someone Else AG', role: 'opponent' },
      ],
    },
    { applicationNumber: 'EP25712875', roles: [{ partyId: 'party-2' as PartyId, party: 'Gerhard Schubert GmbH', role: 'patent-owner' }] },
  ],
  conflictChecks: [],
}

describe('the facts of a decision', () => {
  it('finds the existing client by its name or a linked name, in normalized form', () => {
    const clients = [firmClient(SCHUBERT_ID, 'Gerhard Schubert', 'watch'), firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY'])]
    expect(matchExisting(clients, ['syntegon'])?.clientId).toBe(SYNTEGON_ID)
    expect(matchExisting(clients, ['Other', 'Syntegon Technology'])?.clientId).toBe(SYNTEGON_ID)
    expect(matchExisting(clients, ['Unknown AG'])).toBeNull()
  })

  it('compares only clients with the role client, without the client of a second run', () => {
    const clients = [firmClient(SCHUBERT_ID, 'Gerhard Schubert', 'watch'), firmClient(SYNTEGON_ID, 'Syntegon', 'client', ['SYNTEGON TECHNOLOGY'])]
    expect(knownClients(clients, null)).toEqual([{ clientId: SYNTEGON_ID, names: ['Syntegon', 'SYNTEGON TECHNOLOGY'] }])
    expect(knownClients(clients, SYNTEGON_ID)).toEqual([])
  })

  it('finds a ticked name that is a party other than applicant on an application of a client', () => {
    const hits = firmHits([syntegon], ['Gerhard Schubert GmbH'], AS_OF, null)
    expect(hits).toEqual([
      { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element', otherParty: 'GERHARD SCHUBERT GMBH', otherPartyRole: 'opponent', existingClientId: SYNTEGON_ID, existingClientParty: 'Syntegon Technology GmbH', source: 'firm-record', asOf: AS_OF },
      { applicationNumber: 'EP23171862', publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element', otherParty: 'Gerhard Schubert GmbH.', otherPartyRole: 'other', existingClientId: SYNTEGON_ID, existingClientParty: 'Syntegon Technology GmbH', source: 'firm-record', asOf: AS_OF },
      { applicationNumber: 'EP25712875', otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'patent-owner', existingClientId: SYNTEGON_ID, existingClientParty: 'Syntegon', source: 'firm-record', asOf: AS_OF },
    ])
    expect(firmHits([syntegon], ['Gerhard Schubert GmbH'], AS_OF, SYNTEGON_ID)).toEqual([])
  })

  it('joins the hits of both sources once each, without the register-only fields', () => {
    const record = firmHits([syntegon], ['Gerhard Schubert GmbH'], AS_OF, null)
    const register = registerHit(SYNTEGON_ID)
    const same = registerHit(SYNTEGON_ID, { applicationNumber: 'EP25712875', otherParty: 'GERHARD SCHUBERT GMBH', source: 'ep-register' })
    const hits = allHits(record, [register, same])
    expect(hits).toHaveLength(4)
    expect(hits[3]).toEqual({ applicationNumber: 'EP16188900', publicationNumber: 'EP3296081B1', title: 'Method and device for producing tubular bags', otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'patent-owner', existingClientId: SYNTEGON_ID, existingClientParty: 'Syntegon Packaging Systems AG', source: 'ep-register', asOf: AS_OF })
  })
})

const other: Decision = { role: 'other-party', clientId: NEW_ID, name: 'Gerhard Schubert', names: [], matter: { applicationNumber: 'EP23171862', role: 'licensee' } }

const clientDecision = (hits: readonly Hit[] = []): Decision => ({
  role: 'client', clientId: NEW_ID, name: 'Syntegon',
  names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', edition: '2026 Spring', applications: 600 }, { name: 'SYNTEGON POUCH SYSTEMS', source: 'patstat' }],
  hits, ...(hits.length === 0 ? {} : { reason: 'Closed.' }),
  applications: [
    { fact: { applicationNumber: 'EP23171862', basis: 'register' }, applicants: ['Syntegon Technology GmbH', 'Syntegon Technology GmbH'] },
    { fact: { applicationNumber: 'EP23215725', basis: 'claimed' }, applicants: ['Syntegon Technology GmbH', 'Syntegon Pouch Systems AG'] },
  ],
})

describe('the commands of a decision', () => {
  it('records a new client in the contract order, and leaves its applications to the batches', async () => {
    const plan = await planRecords(clientDecision(), null)
    expect(plan.steps.map(step => step.kind === 'command' ? step.command.kind : step.kind)).toEqual(['conflict-check', 'client', 'name', 'name'])
  })

  it('leaves out every fact that the Firm Record has already', async () => {
    const decision = clientDecision()
    const existing: ClientDetail = {
      client: firmClient(NEW_ID, 'Syntegon'),
      names: [{ name: 'Syntegon Technology', source: 'patstat' }],
      applications: [{ applicationNumber: 'EP23171862', roles: [{ partyId: 'party-1' as PartyId, party: 'SYNTEGON TECHNOLOGY GMBH', role: 'applicant' }] }],
      conflictChecks: [await hitsHash([])],
    }
    const plan = await planRecords(decision, existing)
    expect(plan.steps).toEqual([
      { kind: 'command', command: { kind: 'name', clientId: NEW_ID, name: { name: 'SYNTEGON POUCH SYSTEMS', source: 'patstat' } } },
    ])
    expect(plan.parties.get('syntegon technology gmbh')).toBe('party-1')
  })

  it('sends one name command for spellings with one name key, so no key goes out with two bodies', async () => {
    const decision: Decision = {
      role: 'watch', clientId: NEW_ID, name: 'Syntegon',
      names: [
        { name: 'Syntegon Technology GmbH', source: 'ep-register', applications: 164 },
        { name: 'SYNTEGON TECHNOLOGY GMBH', source: 'ep-register', applications: 38 },
        { name: 'Syntegon Technology, GmbH', source: 'ep-register', applications: 2 },
      ],
    }
    const plan = await planRecords(decision, null)
    expect(plan.steps).toEqual([
      { kind: 'command', command: { kind: 'client', clientId: NEW_ID, name: 'Syntegon', role: 'watch' } },
      { kind: 'command', command: { kind: 'name', clientId: NEW_ID, name: { name: 'Syntegon Technology GmbH', source: 'ep-register', applications: 164 } } },
    ])
  })

  it('records the reason of a checked conflict, and runs no conflict check for Watch', async () => {
    const hit = registerHit(SYNTEGON_ID)
    const plan = await planRecords(clientDecision([hit]), null)
    expect(plan.steps[0]).toEqual({ kind: 'command', command: { kind: 'conflict-check', clientId: NEW_ID, hits: [hit], reason: 'Closed.' } })
    const watch = await planRecords({ role: 'watch', clientId: NEW_ID, name: 'Gerhard Schubert', names: [] }, null)
    expect(watch.steps).toEqual([{ kind: 'command', command: { kind: 'client', clientId: NEW_ID, name: 'Gerhard Schubert', role: 'watch' } }])
  })

  it('links another party to a matter of your firm with its role, once', async () => {
    const plan = await planRecords(other, null)
    expect(plan.steps).toEqual([
      { kind: 'command', command: { kind: 'client', clientId: NEW_ID, name: 'Gerhard Schubert', role: 'other-party' } },
      { kind: 'party', name: 'Gerhard Schubert' },
      { kind: 'role', applicationNumber: 'EP23171862', party: 'Gerhard Schubert', role: 'licensee', clientId: NEW_ID },
    ])
    const existing: ClientDetail = {
      client: firmClient(NEW_ID, 'Gerhard Schubert', 'other-party'), names: [], conflictChecks: [],
      applications: [{ applicationNumber: 'EP23171862', roles: [{ partyId: 'party-9' as PartyId, party: 'GERHARD SCHUBERT', role: 'licensee' }] }],
    }
    expect((await planRecords(other, existing)).steps).toEqual([])
  })
})

describe('running a plan', () => {
  it('sends each step with the party id that its party step answered, and counts the done steps', async () => {
    const { record, sent } = fakeRecord()
    const done: number[] = []
    const outcome = await runPlan(await planRecords(other, null), record, (count) => { done.push(count) })
    expect(outcome).toEqual({ ok: true })
    expect(done).toEqual([1, 2, 3])
    expect(sent.at(-1)).toEqual({ kind: 'role', applicationNumber: 'EP23171862', partyId: 'party-1', role: 'licensee', clientId: NEW_ID })
  })

  it('stops at the first failure and names its step', async () => {
    const { record, sent, state } = fakeRecord()
    state.failNext.set('name', { kind: 'network' })
    const plan = await planRecords(clientDecision(), null)
    const outcome = await runPlan(plan, record, () => {})
    expect(outcome).toEqual({ ok: false, error: { kind: 'network' }, step: plan.steps[2] })
    expect(sent).toHaveLength(3)
  })
})
