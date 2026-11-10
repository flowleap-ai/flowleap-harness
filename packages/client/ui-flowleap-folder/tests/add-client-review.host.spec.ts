import { describe, expect, it } from 'vitest'
import { companyKey, identitySet, isFirm, townOf, wordsOf, type FirmIdentity } from '../src/add-client/identity.ts'
import { matterRow, readGroup, referenceRow, registerConflicts, review } from '../src/add-client/review.ts'
import { FakePatentData, pub, row } from './patent-data.host.ts'

const ASOF = '2026-11-08T14:02:00.000Z'
const IDENTITY: FirmIdentity = { names: ['Muster Patentanwälte'], addresses: ['Hauptstraße 1, 10115 Berlin'], representatives: ['Anna Becker'] }
const OURS = { name: 'Becker, Anna', address: ['Muster Patentanwälte', 'Hauptstraße 1', '10115 Berlin'] }
const THEIRS = { name: 'Other, Otto', address: ['Königstraße 5', '70173 Stuttgart'] }

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
    const answer = await review(data, { names: ['Syntegon Technology'], clients: [], identity: IDENTITY, maxRows: 1000 }, ASOF)
    expect(answer).toEqual({
      status: 'reviewed', asOf: ASOF, total: 2, truncated: false, identity: 'set', conflicts: [], conflictsTruncated: false,
      atFirm: [{ applicationNumber: 'EP23171862', publicationNumber: 'EP4292805', title: 'Packaging element', applicants: ['Syntegon Technology GmbH'], filed: '2023-05-05', representativeSince: '2024-07-24', status: 'Examination is in progress' }],
      atOtherFirms: [{ applicationNumber: 'EP19794879', title: 'Weighing', applicants: ['Syntegon Technology GmbH', 'Partner AG'], filed: '2019-09-18', town: 'Stuttgart' }],
    })
    expect(referenceRow(row({ applicationNumber: 'EP20000001' }))).toEqual({ applicationNumber: 'EP20000001', applicants: [] })
    expect(data.queries.join(' ')).not.toMatch(/Muster|Becker|Hauptstra/u)
  })

  it('finds no matter at your firm while the identity is empty', async () => {
    const answer = await review(new FakePatentData(SYNTEGON), { names: ['Syntegon Technology GmbH'], clients: [], identity: { names: [], addresses: [], representatives: [] }, maxRows: 1000 }, ASOF)
    expect(answer).toMatchObject({ identity: 'missing', atFirm: [], total: 2 })
  })

  it('finds a client that opposed the group, and the group opposing a client, each once', async () => {
    const schubert = row({
      applicationNumber: 'EP16188888', publicationNumber: pub('EP3296081'), title: 'Tubular bags', status: 'Patent revoked', applicants: ['Gerhard Schubert GmbH'],
      opponents: [{ name: 'Syntegon Packaging Systems AG', address: [], filedOn: '2025-01-08' }, { name: 'Stranger AG', address: [] }],
    })
    const reverse = row({
      applicationNumber: 'EP17000001', applicants: ['Unrelated GmbH', 'Syntegon Technology GmbH'],
      opponents: [{ name: 'Gerhard Schubert GmbH', address: [] }, { name: 'Someone Else', address: [] }],
    })
    const noClient = row({ applicationNumber: 'EP17000002', applicants: ['Unrelated GmbH'], opponents: [{ name: 'Gerhard Schubert GmbH', address: [] }] })
    const data = new FakePatentData([schubert, reverse, noClient])
    const clients = [{ clientId: 'c-1', names: ['Syntegon', 'SYNTEGON PACKAGING SYSTEMS', 'Syntegon Technology'] }]
    const answer = await review(data, { names: ['Gerhard Schubert'], clients, identity: IDENTITY, maxRows: 1000 }, ASOF)
    expect(answer.status === 'reviewed' && answer.conflicts).toEqual([
      {
        applicationNumber: 'EP16188888', publicationNumber: 'EP3296081', title: 'Tubular bags', status: 'Patent revoked', otherParty: 'Gerhard Schubert GmbH',
        otherPartyRole: 'patent-owner', existingClientId: 'c-1', existingClientParty: 'Syntegon Packaging Systems AG', source: 'ep-register', asOf: ASOF, opposedOn: '2025-01-08',
      },
      {
        applicationNumber: 'EP17000001', otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'opponent', existingClientId: 'c-1',
        existingClientParty: 'Syntegon Technology GmbH', source: 'ep-register', asOf: ASOF,
      },
    ])
    const withDate = row({ applicationNumber: 'EP17000003', applicants: ['Syntegon Technology GmbH'], opponents: [{ name: 'Gerhard Schubert GmbH', address: [], filedOn: '2020-01-01' }] })
    const hits = await registerConflicts(new FakePatentData([withDate]), ['Gerhard Schubert'], [row({ applicationNumber: 'EP17000004', opponents: [{ name: 'Syntegon AG', address: [] }] })], clients, 1000, ASOF)
    expect(hits).toEqual({ hits: [expect.objectContaining({ applicationNumber: 'EP17000003', opposedOn: '2020-01-01' })], truncated: false })
  })

  it('keeps each application once over several queries, and leaves out what the register does not give', async () => {
    const names = Array.from({ length: 9 }, (_, index) => `Firm ${'abcdefghi'[index] ?? ''}`)
    const shared = row({ applicationNumber: 'EP21000001', applicants: ['Firm a', 'Firm i'], opponents: [{ name: 'Client Co', address: [] }] })
    const group = await readGroup(new FakePatentData([shared]), names, 1000)
    expect(group.rows).toHaveLength(1)
    expect(matterRow(shared)).toEqual({ applicationNumber: 'EP21000001', applicants: ['Firm a', 'Firm i'] })
    const hits = await registerConflicts(new FakePatentData([]), names, [shared], [{ clientId: 'c-2', names: ['Client Co'] }], 1000, ASOF)
    expect(hits.hits).toEqual([{ applicationNumber: 'EP21000001', otherParty: 'Firm a', otherPartyRole: 'patent-owner', existingClientId: 'c-2', existingClientParty: 'Client Co', source: 'ep-register', asOf: ASOF }])
  })

  it('reads no opposition when your firm has no client', async () => {
    const data = new FakePatentData(SYNTEGON)
    expect(await registerConflicts(data, ['Syntegon'], SYNTEGON, [{ clientId: 'c-1', names: ['GmbH'] }], 1000, ASOF)).toEqual({ hits: [], truncated: false })
    expect(data.queries).toEqual([])
  })

  it('says when the read of the oppositions stopped at the row cap, so that conflicts can be missing', async () => {
    const opposed = Array.from({ length: 150 }, (_, index) => row({
      applicationNumber: `EP${String(31000000 + index)}`, applicants: ['Client Co'], opponents: [{ name: 'Acme GmbH', address: [] }],
    }))
    const clients = [{ clientId: 'c-1', names: ['Client Co'] }]
    const answer = await review(new FakePatentData(opposed), { names: ['Acme'], clients, identity: IDENTITY, maxRows: 100 }, ASOF)
    expect(answer).toMatchObject({ conflictsTruncated: true })
    expect(answer.status === 'reviewed' && answer.conflicts).toHaveLength(100)
  })
})
