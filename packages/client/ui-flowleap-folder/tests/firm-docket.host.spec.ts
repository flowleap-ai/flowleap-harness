import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PatentDataError, type PatentData, type RegisterParty, type RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { SAVE_INTERVAL_MS, FirmDocket } from '../src/add-client/docket.ts'
import { parseDocketFile, type DocketFile } from '../src/add-client/docket-model.ts'
import type { FirmIdentity } from '../src/add-client/identity.ts'
import type { DocketState } from '../src/add-client/wire.ts'
import { FakeClock } from './clock.host.ts'
import { FakePatentData, row } from './patent-data.host.ts'

const WEEK = 7 * 86_400_000
const FIRM: RegisterParty = { name: 'Muster & Partner mbB', address: ['Hauptstraße 1', '80331 München'] }
const MUSTER: FirmIdentity = { names: ['Muster & Partner'], addresses: [], representatives: [] }

let base: string
let file: string
let clock: FakeClock
let logs: string[]
let opened: FirmDocket[]

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-docket-'))
  file = path.join(base, 'state', 'docket.json')
  clock = new FakeClock()
  logs = []
  opened = []
})

afterEach(async () => {
  await Promise.all(opened.map(docket => docket.dispose()))
  await rm(base, { recursive: true, force: true })
})

/** A holder of the Service, so a test can take it away and give it back. */
class Service {
  constructor(public current: PatentData | undefined) {}
}

type Settings = { readonly sliceRows?: number; readonly refreshAge?: number }

function open(service: Service, identity: FirmIdentity, settings: Settings = {}): FirmDocket {
  const docket = new FirmDocket({
    file, identity, sliceRows: settings.sliceRows ?? 2000, refreshAge: settings.refreshAge ?? WEEK,
    data: () => service.current, clock, log: (message) => { logs.push(message) },
  })
  opened.push(docket)
  return docket
}

/** The state once no read runs. */
async function settled(docket: FirmDocket): Promise<DocketState> {
  let state: DocketState = { state: 'no_identity' }
  await vi.waitFor(async () => {
    state = await docket.state()
    if (state.state === 'reading') throw new Error('the read runs')
  }, { timeout: 4000, interval: 2 })
  return state
}

async function stored(): Promise<DocketFile> {
  return parseDocketFile(JSON.parse(await readFile(file, 'utf8')))
}

/** An application of the firm with an EP publication on a day. */
function matter(number: number, published: string | undefined, representatives: readonly RegisterParty[] = [FIRM]): RegisterRow {
  return row({ applicationNumber: `EP${String(23_000_000 + number)}`, applicants: ['Syntegon Technology GmbH'], representatives, ...(published === undefined ? {} : { published }) })
}

/** Applications of the firm, one for each day of a list. */
function matters(days: readonly (string | undefined)[], first = 0): RegisterRow[] {
  return days.map((day, index) => matter(first + index, day))
}

describe('the firm docket', () => {
  it('reads one re= query for each identity entry, and keeps only the rows whose representative is the firm', async () => {
    const fake = new FakePatentData([
      matter(1, '2025-01-10'),
      matter(2, '2025-01-11', [{ name: 'Becker, Anna', address: ['c/o Muster & Partner', 'Hauptstraße 1', '80331 München'] }]),
      matter(3, '2025-01-12', [{ name: 'Schmidt, Paul', address: ['Hauptstraße 1', '80331 München'] }]),
      matter(4, '2025-01-13', [{ name: 'Becker, Anna Maria', address: ['Beispiel IP', 'Ringstraße 9', '10115 Berlin'] }]),
      matter(5, '2025-01-14', [{ name: 'Becker, Anna', address: ['Ringstraße 9', '10115 Berlin'] }]),
    ])
    const docket = open(new Service(fake), { names: ['Muster & Partner'], addresses: ['Hauptstraße 1, 80331 München'], representatives: ['Anna Becker'] })
    await docket.wake()
    expect(await settled(docket)).toEqual({ state: 'ready', rows: 4, asOf: '2026-11-09T10:00:00.000Z' })
    expect(fake.queries).toEqual(['re="Muster Partner"|1-100', 're="Hauptstraße 1 80331 München"|1-100', 're="Becker, Anna"|1-100'])
    const { rows } = await stored()
    expect(Object.fromEntries(Object.values(rows).map(item => [item.applicationNumber, item.match]))).toEqual({
      EP23000001: 'name', EP23000002: 'name', EP23000003: 'address', EP23000005: 'representative',
    })
    expect(rows['EP23000001']).toEqual({ applicationNumber: 'EP23000001', applicants: ['Syntegon Technology GmbH'], match: 'name' })
  })

  it('keeps the fields that later pages need', async () => {
    const fake = new FakePatentData([row({
      applicationNumber: 'EP23171862', publicationNumber: 'EP4292805' as never, title: 'Packaging machine', applicants: ['Syntegon Technology GmbH'],
      status: 'Examination is in progress', representativeSince: '2024-02-01', representatives: [FIRM],
    })])
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    await settled(docket)
    expect((await stored()).rows['EP23171862']).toEqual({
      applicationNumber: 'EP23171862', publicationNumber: 'EP4292805', title: 'Packaging machine', applicants: ['Syntegon Technology GmbH'],
      status: 'Examination is in progress', representativeSince: '2024-02-01', match: 'name',
    })
  })

  it('reads a slice in pages of 100 rows', async () => {
    const fake = new FakePatentData(matters(Array.from({ length: 250 }, () => '2025-01-10')))
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 250 })
    expect(fake.queries).toEqual(['re="Muster Partner"|1-100', 're="Muster Partner"|101-200', 're="Muster Partner"|201-250'])
  })

  it('splits a query over registerSliceRows by year, a year by month and a month by days, and the slices sum to its count', async () => {
    const fake = new FakePatentData(matters(['2024-06-01', '2025-03-02', '2025-03-04', '2025-03-10', '2025-03-20', '2025-03-28', '2025-07-15']))
    const docket = open(new Service(fake), MUSTER, { sliceRows: 3 })
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 7 })
    expect(fake.queries).toEqual(expect.arrayContaining([
      're="Muster Partner"|1-3',
      're="Muster Partner" and pd within "1978"|1-3',
      're="Muster Partner" and pd within "2025"|1-3',
      're="Muster Partner" and pd within "202503"|1-3',
      're="Muster Partner" and pd>=20250301 and pd<=20250316|1-3',
      're="Muster Partner" and pd>=20250317 and pd<=20250331|1-3',
      're="Muster Partner" and pd within "202511"|1-3',
    ]))
    expect(fake.queries).not.toContain('re="Muster Partner" and pd within "2027"|1-3')
    expect(fake.queries.filter(query => query.includes('pd within "2026'))).toEqual(['re="Muster Partner" and pd within "2026"|1-3'])
    const [query] = (await stored()).queries
    expect(query?.total).toBe(7)
    expect(query?.slices).toHaveLength(49 - 1 + 12 - 1 + 2)
  })

  it('fails a slice that is still over registerSliceRows on one day, loudly with its query', async () => {
    const fake = new FakePatentData(matters(['2024-06-01', '2025-03-05', '2025-03-05', '2025-03-05', '2025-03-05']))
    const docket = open(new Service(fake), MUSTER, { sliceRows: 3 })
    await docket.wake()
    const query = 're="Muster Partner" and pd>=20250305 and pd<=20250305'
    expect(await settled(docket)).toEqual({
      state: 'partial', rows: 1, asOf: '2026-11-09T10:00:00.000Z', failed: [{ query, reason: 'day-over-limit' }], mismatches: [],
    })
    expect(logs).toEqual([`ui-flowleap-folder: firm docket: ${query} has 4 rows on one day; one query reads at most 3`])
  })

  it('is partial with the missing count when the slices do not sum to the count, such as rows with no EP publication', async () => {
    const fake = new FakePatentData(matters(['2025-01-10', '2025-01-11', undefined]))
    const docket = open(new Service(fake), MUSTER, { sliceRows: 2 })
    await docket.wake()
    expect(await settled(docket)).toEqual({
      state: 'partial', rows: 2, asOf: '2026-11-09T10:00:00.000Z', failed: [],
      mismatches: [{ query: 're="Muster Partner"', total: 3, counted: 2, missing: 1 }],
    })
  })

  it('is partial when the register ends a slice before its count', async () => {
    const fake = new FakePatentData(matters(Array.from({ length: 150 }, () => '2025-01-10')))
    const read = fake.searchRegister.bind(fake)
    fake.searchRegister = async (query, range) => {
      const page = await read(query, range)
      return range.begin > 100 ? { ...page, rows: [] } : page
    }
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'partial', rows: 100, mismatches: [{ total: 150, counted: 100, missing: 50 }] })
  })

  it('reads every slice of a query at the 10,000 cap, and is partial with at least the missing count when the slices read less', async () => {
    const months = Array.from({ length: 10_050 }, (_unused, index) => `2025-${String(index % 12 + 1).padStart(2, '0')}-10`)
    const full = new FakePatentData(matters(months))
    const docket = open(new Service(full), MUSTER)
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 10_050 })
    expect(full.queries.every(query => Number(query.split('-').at(-1)) <= 2000)).toBe(true)
    await docket.dispose()
    await rm(file)
    const short = new FakePatentData(matters([...months.slice(0, 1050), ...Array.from({ length: 9000 }, () => undefined)]))
    const again = open(new Service(short), MUSTER)
    await again.wake()
    expect(await settled(again)).toMatchObject({
      state: 'partial', rows: 1050, failed: [], mismatches: [{ query: 're="Muster Partner"', total: 10_000, counted: 1050, missing: 8950 }],
    })
  })

  it('fails with the reason when no slice could be read, and never says that the firm has no matters', async () => {
    const fake = new FakePatentData(matters(['2025-01-10']))
    fake.failing.add('re="Muster Partner"')
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    expect(await settled(docket)).toEqual({ state: 'failed', reason: 'unreachable', failed: [{ query: 're="Muster Partner"', reason: 'unreachable' }] })
    fake.searchRegister = async () => { throw new PatentDataError('no-key', 'no EPO OPS key') }
    expect(await docket.readAgain('failed')).toMatchObject({ state: 'reading' })
    expect(await settled(docket)).toMatchObject({ state: 'failed', reason: 'no-key' })
    fake.searchRegister = async () => { throw new Error('a bug') }
    await docket.readAgain('all')
    expect(await settled(docket)).toMatchObject({ state: 'failed', reason: 'internal' })
    expect(logs.at(-1)).toBe('ui-flowleap-folder: firm docket: re="Muster Partner": a bug')
  })

  it('is partial with the failed slices, and Try again reads only them', async () => {
    const fake = new FakePatentData([
      ...matters(['2025-01-10']),
      matter(7, '2025-02-10', [{ name: 'Becker, Anna', address: [] }]),
    ])
    fake.failing.add('re="Becker, Anna"')
    const docket = open(new Service(fake), { names: ['Muster & Partner'], addresses: [], representatives: ['Becker, Anna'] })
    await docket.wake()
    expect(await settled(docket)).toEqual({
      state: 'partial', rows: 1, asOf: '2026-11-09T10:00:00.000Z', failed: [{ query: 're="Becker, Anna"', reason: 'unreachable' }], mismatches: [],
    })
    fake.failing.clear()
    fake.queries.length = 0
    await clock.advance(1000)
    await docket.readAgain('failed')
    expect(await settled(docket)).toEqual({ state: 'ready', rows: 2, asOf: '2026-11-09T10:00:00.000Z' })
    expect(fake.queries).toEqual(['re="Becker, Anna"|1-100'])
  })

  it('reads a query whose sum was wrong again from its count on Try again', async () => {
    const rows = matters(['2025-01-10', '2025-01-11', undefined])
    const fake = new FakePatentData(rows)
    const docket = open(new Service(fake), MUSTER, { sliceRows: 2 })
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'partial' })
    fake.rows = rows.slice(0, 2)
    fake.queries.length = 0
    await docket.readAgain('failed')
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 2 })
    expect(fake.queries).toEqual(['re="Muster Partner"|1-2'])
  })

  it('shows its progress while it reads, stops on dispose with the read aborted, and reads only the unread slices at the next start', async () => {
    const fake = new FakePatentData(matters(['2025-01-10']))
    const read = fake.searchRegister.bind(fake)
    let aborted: AbortSignal | undefined
    fake.searchRegister = async (query, range, signal) => {
      if (query.startsWith('re="Muster Patentanwälte"')) {
        aborted = signal
        return new Promise((_resolve, reject) => { signal?.addEventListener('abort', () => { reject(signal.reason as Error) }) })
      }
      // The first slice takes a while, so the docket saves its progress before the next one.
      clock.time += SAVE_INTERVAL_MS
      return read(query, range)
    }
    const identity: FirmIdentity = { names: ['Muster & Partner', 'Muster Patentanwälte'], addresses: [], representatives: [] }
    const first = open(new Service(fake), identity)
    await first.wake()
    await vi.waitFor(() => { expect(aborted).toBeDefined() })
    expect(await first.state()).toEqual({ state: 'reading', progress: { slicesDone: 1, slices: 2, rows: 1 } })
    expect((await stored()).queries.map(query => query.slices[0]?.state)).toEqual(['read', 'unread'])
    await first.dispose()
    expect(aborted?.aborted).toBe(true)
    expect(await first.state()).toEqual({ state: 'interrupted', progress: { slicesDone: 1, slices: 2, rows: 1 } })
    const next = new FakePatentData(matters(['2025-01-10']))
    const second = open(new Service(next), identity)
    expect(await second.state()).toMatchObject({ state: 'interrupted' })
    await second.wake()
    expect(await settled(second)).toMatchObject({ state: 'ready', rows: 1 })
    expect(next.queries).toEqual(['re="Muster Patentanwälte"|1-100'])
  })

  it('stops the read when the Service goes, and reads on when it is back', async () => {
    const fake = new FakePatentData(matters(['2025-01-10']))
    const read = fake.searchRegister.bind(fake)
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    fake.searchRegister = async (query, range, signal) => {
      await new Promise<void>((resolve, reject) => {
        void held.then(resolve)
        signal?.addEventListener('abort', () => { reject(signal.reason as Error) })
      })
      return read(query, range)
    }
    const service = new Service(fake)
    const docket = open(service, MUSTER)
    await docket.wake()
    service.current = undefined
    await docket.pause()
    expect(await docket.state()).toMatchObject({ state: 'interrupted' })
    expect(await docket.readAgain('all')).toMatchObject({ state: 'interrupted' })
    service.current = fake
    release()
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 1 })
  })

  it('changes nothing on Read again while a read runs', async () => {
    const fake = new FakePatentData(matters(['2025-01-10']))
    const read = fake.searchRegister.bind(fake)
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    fake.searchRegister = async (query, range) => { await held; return read(query, range) }
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    expect(await docket.readAgain('all')).toMatchObject({ state: 'reading', progress: { slicesDone: 0, slices: 1 } })
    release()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 1 })
    expect(fake.queries).toEqual(['re="Muster Partner"|1-100'])
  })

  it('drops the rows of another identity at once and reads the new one; with no identity it removes the docket', async () => {
    const fake = new FakePatentData([...matters(['2025-01-10']), matter(9, '2025-01-11', [{ name: 'Beispiel IP', address: [] }])])
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 1 })
    await docket.dispose()
    const changed = open(new Service(undefined), { names: ['Beispiel IP'], addresses: [], representatives: [] })
    expect(await changed.state()).toEqual({ state: 'interrupted', progress: { slicesDone: 0, slices: 1, rows: 0 } })
    expect(await stored()).toMatchObject({ identity: { names: ['Beispiel IP'] }, rows: {} })
    await changed.dispose()
    const cleared = open(new Service(fake), { names: [], addresses: [], representatives: [] })
    await cleared.wake()
    expect(await cleared.state()).toEqual({ state: 'no_identity' })
    expect(await cleared.readAgain('all')).toEqual({ state: 'no_identity' })
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('is stale after docketRefreshAge, and the scheduled refresh reads it again', async () => {
    const fake = new FakePatentData(matters(['2025-01-10']))
    const service = new Service(fake)
    const docket = open(service, MUSTER, { refreshAge: 1000 })
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', asOf: '2026-11-09T10:00:00.000Z' })
    await clock.advance(999)
    expect(fake.queries).toHaveLength(1)
    await clock.advance(1)
    expect(await settled(docket)).toEqual({ state: 'ready', rows: 1, asOf: '2026-11-09T10:00:01.000Z' })
    expect(fake.queries).toHaveLength(2)
    service.current = undefined
    await clock.advance(1000)
    expect(await docket.state()).toEqual({ state: 'stale', rows: 1, asOf: '2026-11-09T10:00:01.000Z' })
    service.current = fake
    await docket.wake()
    expect(await settled(docket)).toEqual({ state: 'ready', rows: 1, asOf: '2026-11-09T10:00:02.000Z' })
    await docket.readAgain('all')
    expect(await settled(docket)).toMatchObject({ state: 'ready' })
    expect(fake.queries).toHaveLength(4)
  })

  it('reads a damaged docket file again, and logs a docket file that it cannot read or write', async () => {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, '{"version": 2}')
    const fake = new FakePatentData(matters(['2025-01-10']))
    const docket = open(new Service(fake), MUSTER)
    await docket.wake()
    expect(await settled(docket)).toMatchObject({ state: 'ready', rows: 1 })
    expect(logs[0]).toMatch(/^ui-flowleap-folder: firm docket: the stored docket is damaged, so it is read again: /u)
    await docket.dispose()
    await rm(file)
    await mkdir(file)
    logs.length = 0
    const blocked = open(new Service(fake), MUSTER)
    await blocked.wake()
    expect(await settled(blocked)).toMatchObject({ state: 'ready', rows: 1 })
    expect(logs.length).toBeGreaterThan(1)
    expect(logs.every(line => line.startsWith('ui-flowleap-folder: firm docket: '))).toBe(true)
    await blocked.dispose()
    await writeFile(path.join(file, 'inside'), 'x')
    logs.length = 0
    const cleared = open(new Service(fake), { names: [], addresses: [], representatives: [] })
    expect(await cleared.state()).toEqual({ state: 'no_identity' })
    expect(logs).toHaveLength(1)
  })
})
