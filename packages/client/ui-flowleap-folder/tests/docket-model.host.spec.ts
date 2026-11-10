import { describe, expect, it } from 'vitest'
import { docketQueries, docketRow, docketState, freshDocket, parseDocketFile } from '../src/add-client/docket-model.ts'
import { splitRange } from '../src/add-client/slices.ts'
import { firmMatch } from '../src/add-client/identity.ts'
import { row } from './patent-data.host.ts'

const TODAY = new Date('2026-11-09T10:00:00.000Z')

describe('the firm docket queries', () => {
  it('sends each firm name and address as its words without & and punctuation, and each representative surname first', () => {
    const queries = docketQueries({
      names: ['Muster & Partner', 'MUSTER & PARTNER', '  ', 'Beispiel-IP mbB'],
      addresses: ['Hauptstraße 1, 80331 München'],
      representatives: ['Anna Becker', 'Becker, Anna', 'Dr. Paul Schmidt', ', Clara', 'Meier,'],
    })
    expect(queries.map(query => [query.kind, query.query])).toEqual([
      ['name', 're="Muster Partner"'],
      ['name', 're="Beispiel IP mbB"'],
      ['address', 're="Hauptstraße 1 80331 München"'],
      ['representative', 're="Becker, Anna"'],
      ['representative', 're="Schmidt, Dr Paul"'],
      ['representative', 're="Clara"'],
      ['representative', 're="Meier"'],
    ])
    expect(queries.every(query => query.slices.length === 1 && query.slices[0]?.state === 'unread')).toBe(true)
  })

  it('matches the firm name also in the address lines of a person, and a firm address only as the weakest match', () => {
    const identity = { names: ['Muster & Partner'], addresses: ['Hauptstraße 1, 80331 München'], representatives: ['Anna Becker'] }
    expect(firmMatch({ name: 'Becker, Anna', address: ['c/o Muster & Partner'] }, identity)).toBe('name')
    expect(firmMatch({ name: 'Becker, Anna', address: [] }, identity)).toBe('representative')
    expect(firmMatch({ name: 'Schmidt, Paul', address: ['Hauptstraße 1', '80331 München'] }, identity)).toBe('address')
    expect(firmMatch({ name: 'Schmidt, Paul', address: ['Ringstraße 9'] }, identity)).toBeUndefined()
  })

  it('keeps the strongest match over the representatives of a row', () => {
    const identity = { names: ['Muster & Partner'], addresses: ['Hauptstraße 1, 80331 München'], representatives: [] }
    const shared = { name: 'Schmidt, Paul', address: ['Hauptstraße 1', '80331 München'] }
    const firm = { name: 'Muster & Partner mbB', address: [] }
    expect(docketRow(row({ applicationNumber: 'EP23000001', representatives: [shared, firm] }), identity)?.match).toBe('name')
    expect(docketRow(row({ applicationNumber: 'EP23000001', representatives: [firm, shared] }), identity)?.match).toBe('name')
    expect(docketRow(row({ applicationNumber: 'EP23000001', representatives: [shared] }), identity)?.match).toBe('address')
  })
})

describe('the date slices', () => {
  it('splits every date into the years up to this year, this year into the months up to now, and a month into halves', () => {
    const years = splitRange({ kind: 'all' }, TODAY)
    expect(years?.[0]).toEqual({ kind: 'year', year: 1978 })
    expect(years?.at(-1)).toEqual({ kind: 'year', year: 2026 })
    expect(splitRange({ kind: 'year', year: 2026 }, TODAY)).toHaveLength(11)
    expect(splitRange({ kind: 'year', year: 2025 }, TODAY)).toHaveLength(12)
    expect(splitRange({ kind: 'month', year: 2024, month: 2 }, TODAY)).toEqual([
      { kind: 'days', from: '2024-02-01', to: '2024-02-15' },
      { kind: 'days', from: '2024-02-16', to: '2024-02-29' },
    ])
    expect(splitRange({ kind: 'days', from: '2025-03-05', to: '2025-03-06' }, TODAY)).toEqual([
      { kind: 'days', from: '2025-03-05', to: '2025-03-05' },
      { kind: 'days', from: '2025-03-06', to: '2025-03-06' },
    ])
    expect(splitRange({ kind: 'days', from: '2025-03-05', to: '2025-03-05' }, TODAY)).toBeUndefined()
  })
})

describe('the docket state and file', () => {
  it('is ready at once for a docket of no query', () => {
    const identity = { names: ['Muster'], addresses: [], representatives: [] }
    const docket = { ...freshDocket(identity, '2026-11-09T10:00:00.000Z'), queries: [] }
    expect(docketState({ served: docket }, { reading: undefined, now: TODAY.getTime(), refreshAge: 1000 }))
      .toEqual({ state: 'ready', rows: 0, asOf: '2026-11-09T10:00:00.000Z' })
  })

  it('reads a stored docket only with every field, and refuses another version', () => {
    const docket = freshDocket({ names: ['Muster'], addresses: [], representatives: [] }, '2026-11-09T10:00:00.000Z')
    expect(parseDocketFile(JSON.parse(JSON.stringify(docket)))).toEqual(docket)
    expect(() => parseDocketFile({ ...docket, version: 2 })).toThrow()
    expect(() => parseDocketFile({ ...docket, queries: [{ kind: 'name', query: 're=Muster', slices: [{ range: { kind: 'days', from: '2025-3-5', to: '2025-03-05' }, state: 'unread' }] }] })).toThrow()
  })
})
