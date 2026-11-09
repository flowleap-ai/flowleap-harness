import { describe, expect, it } from 'vitest'
import type { PatentData } from '@deepseek-ai/dsh-flowleap-connectors'
import { companyKey, identitySet, isFirm, townOf, wordsOf, type FirmIdentity } from '../src/add-client/identity.ts'
import { withIndexSlice, withNames, type OpponentIndexFile } from '../src/add-client/opponent-index-model.ts'
import { matterRow, readGroup, referenceRow, registerConflicts, review, type ConflictInput } from '../src/add-client/review.ts'
import { readSlice, type SliceReadOptions } from '../src/add-client/sliced-read.ts'
import { nextUnread } from '../src/add-client/slices.ts'
import type { KnownClient } from '../src/add-client/wire.ts'
import { FakePatentData, pub, row } from './patent-data.host.ts'

const ASOF = '2026-11-08T14:02:00.000Z'
/** The time of the index read, before the review. */
const INDEXED = '2026-11-08T07:00:00.000Z'
const IDENTITY: FirmIdentity = { names: ['Muster Patentanwälte'], addresses: ['Hauptstraße 1, 10115 Berlin'], representatives: ['Anna Becker'] }
const OURS = { name: 'Becker, Anna', address: ['Muster Patentanwälte', 'Hauptstraße 1', '10115 Berlin'] }
const THEIRS = { name: 'Other, Otto', address: ['Königstraße 5', '70173 Stuttgart'] }

/** The slice settings of a read at a time. */
function slices(at: string, sliceRows = 2000): SliceReadOptions {
  return { sliceRows, clock: { now: () => Date.parse(at) }, label: 'test', log: () => {} }
}

/** The input of a review with an empty index. */
function input(names: readonly string[], clients: readonly KnownClient[], sliceRows = 2000): ConflictInput & { readonly maxRows: number } {
  return { names, clients, identity: IDENTITY, index: undefined, slices: slices(ASOF, sliceRows), maxRows: 1000 }
}

/** The opponent index of client names, read completely at {@link INDEXED}. */
async function readIndex(data: PatentData, names: readonly string[]): Promise<OpponentIndexFile | undefined> {
  let index = withNames(undefined, names, INDEXED)
  for (let unread = index && nextUnread(index.queries); index !== undefined && unread !== undefined; unread = nextUnread(index.queries)) {
    index = withIndexSlice(index, unread.at, await readSlice(data, unread, slices(INDEXED)))
  }
  return index
}

const SYNTEGON = [
  row({ applicationNumber: 'EP23171862', publicationNumber: pub('EP4292805'), title: 'Packaging element', applicants: ['Syntegon Technology GmbH'], representatives: [OURS], representativeSince: '2024-07-24', status: 'Examination is in progress', filed: '2023-05-05' }),
  row({ applicationNumber: 'EP19794879', title: 'Weighing', applicants: ['Syntegon Technology GmbH', 'Partner AG'], representatives: [THEIRS], filed: '2019-09-18' }),
  row({ applicationNumber: 'EP20000001', applicants: ['Syntegonix Ltd'] }),
]

describe('Add client firm identity', () => {
  it('compares company names without legal forms, punctuation or case', () => {
    expect(wordsOf('  ')).toEqual([])
    expect(companyKey('Syntegon Packaging Systems AG')).toBe(companyKey('SYNTEGON PACKAGING SYSTEMS'))
    expect(companyKey('SYNTEGON PACKAGING SOLUTIONS B.V.')).toBe('syntegon packaging solutions')
    expect(companyKey('GmbH')).toBe('')
  })

  it('knows when the identity names nothing', () => {
    expect(identitySet({ names: [' '], addresses: [], representatives: [] })).toBe(false)
    expect(identitySet(IDENTITY)).toBe(true)
  })

  it('matches the firm by its name, a representative in any order, or its address', () => {
    expect(isFirm({ name: 'Muster Patentanwälte PartG mbB', address: [] }, IDENTITY)).toBe(true)
    expect(isFirm({ name: 'Becker, Anna', address: [] }, IDENTITY)).toBe(true)
    expect(isFirm({ name: 'Becker, Anna Maria', address: [] }, IDENTITY)).toBe(false)
    expect(isFirm({ name: 'Someone', address: ['Hauptstrasse 1', '10115 Berlin'] }, IDENTITY)).toBe(false)
    expect(isFirm({ name: 'Someone', address: ['Hauptstraße 1', '10115 Berlin', 'DE'] }, IDENTITY)).toBe(true)
    expect(isFirm(THEIRS, IDENTITY)).toBe(false)
  })

  it('names the town of a representative, never the firm', () => {
    expect(townOf(THEIRS)).toBe('Stuttgart')
    expect(townOf({ name: 'x', address: ['Route de Chancy 1', 'CH-1213 Onex'] })).toBe('Onex')
    expect(townOf({ name: 'x', address: ['Tokyo '] })).toBe('Tokyo')
    expect(townOf({ name: 'x', address: [] })).toBeUndefined()
    expect(townOf({ name: 'x', address: [' '] })).toBeUndefined()
  })
})

describe('Add client review', () => {
  it('reads the group by its names only, page by page, and keeps the rows of the group', async () => {
    const data = new FakePatentData(SYNTEGON)
    const group = await readGroup(data, ['Syntegon Technology'], 1000)
    expect(group.rows.map(item => item.applicationNumber)).toEqual(['EP23171862', 'EP19794879'])
    expect(group.truncated).toBe(false)
    expect(data.queries).toEqual(['pa="Syntegon Technology"|1-100'])
  })

  it('stops at the row cap and says so, with a few names for each query', async () => {
    const many = Array.from({ length: 250 }, (_, index) => row({ applicationNumber: `EP${String(30000000 + index)}`, applicants: ['Acme GmbH'] }))
    const data = new FakePatentData(many)
    const names = ['Acme', ...Array.from({ length: 8 }, (_, index) => `Name ${index} "quoted"`)]
    const group = await readGroup(data, names, 150)
    expect(group.rows).toHaveLength(150)
    expect(group.truncated).toBe(true)
    expect(data.queries[0]).toMatch(/^pa="Acme" or pa="Name 0 quoted" or pa="Name 1 quoted" or pa="Name 2 quoted"\|/u)
    expect(data.queries.map(query => query.split('|')[1])).toEqual(['1-100', '101-150', '1-100', '1-100'])
    const empty = await readGroup(new FakePatentData([]), ['Nobody'], 1000)
    expect(empty).toEqual({ rows: [], truncated: false })
  })

  it('splits the group by the firm identity and lists the others by town', async () => {
    const data = new FakePatentData(SYNTEGON)
    const answer = await review(data, input(['Syntegon Technology'], []), ASOF)
    expect(answer).toEqual({
      status: 'reviewed', asOf: ASOF, total: 2, truncated: false, identity: 'set', conflicts: [], conflictsTruncated: false,
      conflictCheck: { groupOpposedClients: { state: 'complete', asOf: ASOF }, clientsOpposedGroup: { state: 'complete', asOf: ASOF } },
      atFirm: [{ applicationNumber: 'EP23171862', publicationNumber: 'EP4292805', title: 'Packaging element', applicants: ['Syntegon Technology GmbH'], filed: '2023-05-05', representativeSince: '2024-07-24', status: 'Examination is in progress' }],
      atOtherFirms: [{ applicationNumber: 'EP19794879', title: 'Weighing', applicants: ['Syntegon Technology GmbH', 'Partner AG'], filed: '2019-09-18', town: 'Stuttgart' }],
    })
    expect(referenceRow(row({ applicationNumber: 'EP20000001' }))).toEqual({ applicationNumber: 'EP20000001', applicants: [] })
    expect(data.queries.join(' ')).not.toMatch(/Muster|Becker|Hauptstra/u)
  })

  it('finds no matter at your firm while the identity is empty', async () => {
    const answer = await review(new FakePatentData(SYNTEGON), { ...input(['Syntegon Technology GmbH'], []), identity: { names: [], addresses: [], representatives: [] } }, ASOF)
    expect(answer).toMatchObject({ identity: 'missing', atFirm: [], total: 2 })
  })
})

describe('the conflict check', () => {
  const schubert = row({
    applicationNumber: 'EP16188888', publicationNumber: pub('EP3296081'), title: 'Tubular bags', status: 'Patent revoked', applicants: ['Gerhard Schubert GmbH'],
    representatives: [THEIRS], published: '2017-03-22',
    opponents: [{ name: 'Syntegon Packaging Systems AG', address: [], filedOn: '2025-01-08' }, { name: 'Stranger AG', address: [] }],
  })
  const reverse = row({
    applicationNumber: 'EP17000001', applicants: ['Unrelated GmbH', 'Syntegon Technology GmbH'], representatives: [OURS], published: '2018-01-10',
    opponents: [{ name: 'Gerhard Schubert GmbH', address: [] }, { name: 'Someone Else', address: [] }],
  })
  const noClient = row({ applicationNumber: 'EP17000002', applicants: ['Unrelated GmbH'], published: '2018-01-11', opponents: [{ name: 'Gerhard Schubert GmbH', address: [] }] })
  const SYNTEGON_CLIENT = { clientId: 'c-1', names: ['Syntegon', 'SYNTEGON PACKAGING SYSTEMS', 'Syntegon Technology'] }

  it('finds both halves with the facts of each hit, each once, and is complete', async () => {
    const data = new FakePatentData([schubert, reverse, noClient])
    const index = await readIndex(data, SYNTEGON_CLIENT.names)
    data.queries.length = 0
    const answer = await review(data, { ...input(['Gerhard Schubert'], [SYNTEGON_CLIENT]), index }, ASOF)
    expect(answer.status === 'reviewed' && answer.conflicts).toEqual([
      {
        applicationNumber: 'EP17000001', otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'opponent', existingClientId: 'c-1',
        existingClientParty: 'Syntegon Technology GmbH', source: 'ep-register', asOf: ASOF, yourFirm: 'named',
      },
      {
        applicationNumber: 'EP16188888', publicationNumber: 'EP3296081', title: 'Tubular bags', status: 'Patent revoked', otherParty: 'Gerhard Schubert GmbH',
        otherPartyRole: 'patent-owner', existingClientId: 'c-1', existingClientParty: 'Syntegon Packaging Systems AG', source: 'ep-register', asOf: INDEXED,
        opposedOn: '2025-01-08', yourFirm: 'not-named',
      },
    ])
    expect(answer).toMatchObject({
      conflictsTruncated: false,
      conflictCheck: { groupOpposedClients: { state: 'complete', asOf: ASOF }, clientsOpposedGroup: { state: 'complete', asOf: INDEXED } },
    })
    // The review sends the group's names only; the index holds the clients' names.
    expect(data.queries).toEqual(['pa="Gerhard Schubert"|1-100', 'op="Gerhard Schubert"|1-100'])
    const unknown = await registerConflicts(data, { ...input(['Gerhard Schubert'], [SYNTEGON_CLIENT]), index, identity: { names: [], addresses: [], representatives: [] } }, ASOF)
    expect(unknown.hits.map(hit => hit.yourFirm)).toEqual(['unknown', 'unknown'])
  })

  it('reads the group\'s oppositions in date slices, so the first half is complete for a large group', async () => {
    const opposed = Array.from({ length: 150 }, (_, index) => row({
      applicationNumber: `EP${String(31000000 + index)}`, applicants: ['Client Co'], published: index < 100 ? '2020-05-05' : '2021-05-05',
      opponents: [{ name: 'Acme GmbH', address: [], filedOn: '2022-01-01' }],
    }))
    const data = new FakePatentData(opposed)
    const clients = [{ clientId: 'c-1', names: ['Client Co'] }]
    const index = await readIndex(new FakePatentData([]), ['Client Co'])
    const answer = await registerConflicts(data, { ...input(['Acme & Co', 'Acme Holding'], clients, 100), index }, ASOF)
    expect(answer.hits).toHaveLength(150)
    expect(answer.groupOpposedClients).toEqual({ state: 'complete', asOf: ASOF })
    expect(data.queries).toContain('(op="Acme Co" or op="Acme Holding") and pd within "2021"|1-100')
    expect(data.queries.every(query => !query.includes('&'))).toBe(true)
    const none = await registerConflicts(data, { ...input([], clients), index }, ASOF)
    expect(none).toEqual({ hits: [], groupOpposedClients: { state: 'complete', asOf: ASOF }, clientsOpposedGroup: { state: 'complete', asOf: INDEXED } })
  })

  it('says which half is not complete: a failed slice of the group, and names that the index has not read', async () => {
    const data = new FakePatentData([schubert])
    data.failing.add('op="Gerhard Schubert"')
    const index = await readIndex(new FakePatentData([schubert]), ['Syntegon'])
    const answer = await review(data, { ...input(['Gerhard Schubert'], [SYNTEGON_CLIENT]), index }, ASOF)
    expect(answer).toMatchObject({
      conflictsTruncated: true,
      conflictCheck: {
        groupOpposedClients: { state: 'incomplete', failed: [{ query: 'op="Gerhard Schubert"', reason: 'unreachable' }], mismatches: [] },
        clientsOpposedGroup: { state: 'reading' },
      },
    })
    expect(answer.status === 'reviewed' && answer.conflicts).toEqual([])
    const unread = withNames(undefined, SYNTEGON_CLIENT.names, ASOF)
    const reading = await registerConflicts(new FakePatentData([]), { ...input(['Gerhard Schubert'], [SYNTEGON_CLIENT]), index: unread }, ASOF)
    expect(reading.clientsOpposedGroup).toEqual({ state: 'reading' })
    const broken = new FakePatentData([schubert])
    broken.failing.add('op="SYNTEGON PACKAGING SYSTEMS"')
    const failed = await registerConflicts(new FakePatentData([]), { ...input(['Gerhard Schubert'], [SYNTEGON_CLIENT]), index: await readIndex(broken, SYNTEGON_CLIENT.names) }, ASOF)
    expect(failed.clientsOpposedGroup).toEqual({ state: 'incomplete', failed: [{ query: 'op="SYNTEGON PACKAGING SYSTEMS"', reason: 'unreachable' }], mismatches: [] })
  })

  it('reads no opposition when your firm has no client, and both halves are complete', async () => {
    const data = new FakePatentData(SYNTEGON)
    expect(await registerConflicts(data, input(['Syntegon'], [{ clientId: 'c-1', names: ['GmbH'] }]), ASOF)).toEqual({
      hits: [], groupOpposedClients: { state: 'complete', asOf: ASOF }, clientsOpposedGroup: { state: 'complete', asOf: ASOF },
    })
    expect(data.queries).toEqual([])
  })

  it('keeps each application once over several queries', async () => {
    const names = Array.from({ length: 9 }, (_, index) => `Firm ${'abcdefghi'[index] ?? ''}`)
    const shared = row({ applicationNumber: 'EP21000001', applicants: ['Firm a', 'Firm i'], opponents: [{ name: 'Client Co', address: [] }] })
    const group = await readGroup(new FakePatentData([shared]), names, 1000)
    expect(group.rows).toHaveLength(1)
    expect(matterRow(shared)).toEqual({ applicationNumber: 'EP21000001', applicants: ['Firm a', 'Firm i'] })
    const clients = [{ clientId: 'c-2', names: ['Client Co', 'CLIENT CO'] }]
    const elsewhere = row({ applicationNumber: 'EP21000002', applicants: ['Elsewhere AG'], opponents: [{ name: 'Client Co', address: [] }] })
    const data = new FakePatentData([shared, elsewhere])
    const hits = await registerConflicts(data, { ...input(names, clients), index: await readIndex(data, ['Client Co']) }, ASOF)
    expect(hits.hits).toEqual([{ applicationNumber: 'EP21000001', otherParty: 'Firm a', otherPartyRole: 'patent-owner', existingClientId: 'c-2', existingClientParty: 'Client Co', source: 'ep-register', asOf: INDEXED, yourFirm: 'not-named' }])
  })
})
