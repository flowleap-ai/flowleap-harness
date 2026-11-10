import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PatentData, RegisterRow } from '@deepseek-ai/dsh-flowleap-connectors'
import { OpponentIndex } from '../src/add-client/opponent-index.ts'
import { parseIndexFile, type OpponentIndexFile } from '../src/add-client/opponent-index-model.ts'
import { registerConflicts } from '../src/add-client/conflict-check.ts'
import { ReadTurns, SAVE_INTERVAL_MS } from '../src/add-client/sliced-read.ts'
import type { OpponentIndexState } from '../src/add-client/wire.ts'
import { FakeClock } from './clock.host.ts'
import { FakePatentData, hold, row } from './patent-data.host.ts'

const WEEK = 7 * 86_400_000
const T0 = '2026-11-09T10:00:00.000Z'
const T1 = '2026-11-09T10:00:01.000Z'

let base: string
let file: string
let refreshFile: string
let clock: FakeClock
let logs: string[]
let opened: OpponentIndex[]

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-opponents-'))
  file = path.join(base, 'state', 'opponents.json')
  refreshFile = path.join(base, 'state', 'opponents.refresh.json')
  clock = new FakeClock()
  logs = []
  opened = []
})

afterEach(async () => {
  await Promise.all(opened.map(index => index.dispose()))
  await rm(base, { recursive: true, force: true })
})

/** A holder of the Service, so a test can take it away and give it back. */
class Service {
  constructor(public current: PatentData | undefined) {}
}

type Settings = { readonly sliceRows?: number; readonly refreshAge?: number; readonly turns?: ReadTurns }

function open(service: Service, settings: Settings = {}): OpponentIndex {
  const index = new OpponentIndex({
    file, refreshFile, sliceRows: settings.sliceRows ?? 2000, refreshAge: settings.refreshAge ?? WEEK, data: () => service.current, clock,
    log: (message) => { logs.push(message) }, turns: settings.turns ?? new ReadTurns(),
  })
  opened.push(index)
  return index
}

/** The state once no read runs. */
async function settled(index: OpponentIndex): Promise<OpponentIndexState> {
  let state: OpponentIndexState = { state: 'no_clients' }
  await vi.waitFor(async () => {
    state = await index.state()
    if (state.state === 'reading' || ('refresh' in state && state.refresh?.state === 'reading')) throw new Error('the read runs')
  }, { timeout: 4000, interval: 2 })
  return state
}

async function stored(): Promise<OpponentIndexFile> {
  return parseIndexFile(JSON.parse(await readFile(file, 'utf8')))
}

/** An application that an opponent opposed, published on a day. */
function opposed(number: number, opponent: string, published = '2020-05-05', applicants: readonly string[] = ['Gerhard Schubert GmbH']): RegisterRow {
  return row({
    applicationNumber: `EP${String(16_000_000 + number)}`, applicants, published, representatives: [{ name: 'Other, Otto', address: ['70173 Stuttgart'] }],
    opponents: [{ name: opponent, address: ['Somewhere 1'], filedOn: '2025-01-08' }],
  })
}

describe('the opponent index', () => {
  it('reads one op= query for each client name, and keeps only the rows that the name opposed', async () => {
    const fake = new FakePatentData([
      opposed(1, 'Syntegon Packaging Systems AG'),
      opposed(2, 'Syntegon Packaging Systems Holding AG'),
      opposed(3, 'Robert Bosch GmbH'),
    ])
    const index = open(new Service(fake))
    await index.wake()
    expect(await index.state()).toEqual({ state: 'no_clients' })
    expect(await index.setNames(['Syntegon Packaging Systems', 'SYNTEGON PACKAGING SYSTEMS AG', 'Bosch & Co', 'GmbH', '&'])).toMatchObject({ state: 'reading' })
    expect(await settled(index)).toEqual({ state: 'ready', rows: 1, asOf: '2026-11-09T10:00:00.000Z' })
    expect(fake.queries).toEqual(['op="Syntegon Packaging Systems"|1-100', 'op="Bosch Co"|1-100'])
    const file = await stored()
    expect(file.queries.map(query => [query.key, Object.keys(query.rows)])).toEqual([['syntegon packaging systems', ['EP16000001']], ['bosch', []]])
    expect(file.queries[0]?.rows.EP16000001).toEqual({
      applicationNumber: 'EP16000001', applicants: ['Gerhard Schubert GmbH'], representatives: [{ name: 'Other, Otto', address: ['70173 Stuttgart'] }],
      opponents: [{ name: 'Syntegon Packaging Systems AG', filedOn: '2025-01-08' }],
    })
    expect(await index.current()).toEqual(file)
  })

  it('splits a name over registerSliceRows by date, and is partial when a slice fails', async () => {
    const many = Array.from({ length: 30 }, (_, number) => opposed(number, 'Syntegon Packaging Systems AG', number < 20 ? '2020-05-05' : '2021-05-05'))
    const fake = new FakePatentData(many)
    fake.failing.add('op="Syntegon Packaging Systems" and pd within "2021"')
    const index = open(new Service(fake), { sliceRows: 20 })
    await index.setNames(['Syntegon Packaging Systems'])
    expect(await settled(index)).toMatchObject({
      state: 'partial', rows: 20, failed: [{ query: 'op="Syntegon Packaging Systems" and pd within "2021"', reason: 'unreachable' }], mismatches: [],
    })
    expect(logs).toEqual(['ui-flowleap-folder: opponent index: op="Syntegon Packaging Systems" and pd within "2021": no answer for op="Syntegon Packaging Systems" and pd within "2021"'])
    fake.failing.clear()
    expect(await index.setNames(['SYNTEGON PACKAGING SYSTEMS'])).toMatchObject({ state: 'reading' })
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 30 })
    const reads = fake.queries.length
    await index.setNames(['Syntegon Packaging Systems'])
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 30 })
    expect(fake.queries).toHaveLength(reads)
  })

  it('reads only the new names of a changed list, and drops the removed names with their rows', async () => {
    const fake = new FakePatentData([opposed(1, 'Syntegon Packaging Systems AG'), opposed(2, 'Robert Bosch GmbH')])
    const index = open(new Service(fake))
    await index.setNames(['Syntegon Packaging Systems'])
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 1 })
    await index.setNames(['Robert Bosch', 'Syntegon Packaging Systems'])
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 2 })
    expect(fake.queries).toEqual(['op="Syntegon Packaging Systems"|1-100', 'op="Robert Bosch"|1-100'])
    await index.setNames(['Robert Bosch'])
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 1 })
    expect((await stored()).queries.map(query => query.key)).toEqual(['robert bosch'])
    expect(fake.queries).toHaveLength(2)
    expect(await index.setNames([])).toEqual({ state: 'no_clients' })
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('stops on dispose with the read aborted, and reads only the unread slices at the next start', async () => {
    const fake = new FakePatentData([opposed(1, 'Syntegon Packaging Systems AG')])
    const read = fake.searchRegister.bind(fake)
    let aborted: AbortSignal | undefined
    fake.searchRegister = async (query, range, signal) => {
      if (query.startsWith('op="Robert Bosch"')) {
        aborted = signal
        return new Promise((_resolve, reject) => { signal?.addEventListener('abort', () => { reject(signal.reason as Error) }) })
      }
      clock.time += SAVE_INTERVAL_MS
      return read(query, range)
    }
    const first = open(new Service(fake))
    await first.setNames(['Syntegon Packaging Systems', 'Robert Bosch'])
    await vi.waitFor(() => { expect(aborted).toBeDefined() })
    expect(await first.state()).toEqual({ state: 'reading', progress: { slicesDone: 1, slices: 2, rows: 1 } })
    await first.dispose()
    expect(aborted?.aborted).toBe(true)
    const next = new FakePatentData([opposed(1, 'Syntegon Packaging Systems AG')])
    const second = open(new Service(next))
    expect(await second.state()).toEqual({ state: 'interrupted', progress: { slicesDone: 1, slices: 2, rows: 1 } })
    await second.wake()
    expect(await settled(second)).toMatchObject({ state: 'ready', rows: 1 })
    expect(next.queries).toEqual(['op="Robert Bosch"|1-100'])
  })

  it('keeps the names without the Service, and reads them when the Service comes', async () => {
    const fake = new FakePatentData([opposed(1, 'Syntegon Packaging Systems AG')])
    const service = new Service(undefined)
    const index = open(service)
    expect(await index.setNames(['Syntegon Packaging Systems'])).toEqual({ state: 'interrupted', progress: { slicesDone: 0, slices: 1, rows: 0 } })
    service.current = fake
    await index.wake()
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 1 })
    await index.pause()
  })

  it('is stale after the refresh age, and the scheduled refresh reads every name again', async () => {
    const fake = new FakePatentData([opposed(1, 'Syntegon Packaging Systems AG')])
    const index = open(new Service(fake), { refreshAge: 1000 })
    await index.setNames(['Syntegon Packaging Systems'])
    expect(await settled(index)).toEqual({ state: 'ready', rows: 1, asOf: '2026-11-09T10:00:00.000Z' })
    await clock.advance(1000)
    expect(await settled(index)).toEqual({ state: 'ready', rows: 1, asOf: '2026-11-09T10:00:01.000Z' })
    expect(fake.queries).toHaveLength(2)
  })

  it('serves the complete index during the scheduled refresh, so the second half of the conflict check stays complete', async () => {
    const fake = new FakePatentData([opposed(1, 'Beispiel Verpackung AG', '2020-05-05', ['Muster Anlagen GmbH'])])
    const index = open(new Service(fake), { refreshAge: 1000 })
    await index.setNames(['Beispiel Verpackung AG'])
    expect(await settled(index)).toEqual({ state: 'ready', rows: 1, asOf: T0 })
    const release = hold(fake, 'op=')
    await clock.advance(1000)
    expect(await index.state()).toEqual({
      state: 'stale', rows: 1, asOf: T0, refresh: { state: 'reading', progress: { slicesDone: 0, slices: 1, rows: 0 } },
    })
    const check = async () => registerConflicts(new FakePatentData([]), {
      names: ['Muster Anlagen GmbH'], clients: [{ clientId: 'c-1', names: ['Beispiel Verpackung AG'] }],
      identity: { names: [], addresses: [], representatives: [] }, index: await index.current(),
      slices: { sliceRows: 2000, clock, label: 'test', log: () => {} },
    }, T1)
    const during = await check()
    expect(during.clientsOpposedGroup).toEqual({ state: 'complete', asOf: T0 })
    expect(during.hits.map(hit => hit.existingClientParty)).toEqual(['Beispiel Verpackung AG'])
    release()
    expect(await settled(index)).toEqual({ state: 'ready', rows: 1, asOf: T1 })
    expect((await check()).clientsOpposedGroup).toEqual({ state: 'complete', asOf: T1 })
  })

  it('keeps the complete index when its read again fails, and the same names read the failed slices of the read again', async () => {
    const fake = new FakePatentData([opposed(1, 'Beispiel Verpackung AG'), opposed(2, 'Muster Werke AG')])
    const index = open(new Service(fake), { refreshAge: 1000 })
    await index.setNames(['Beispiel Verpackung AG', 'Muster Werke AG'])
    expect(await settled(index)).toEqual({ state: 'ready', rows: 2, asOf: T0 })
    fake.failing.add('op="Muster Werke AG"')
    await clock.advance(1000)
    expect(await settled(index)).toEqual({
      state: 'stale', rows: 2, asOf: T0, refresh: { state: 'failed', failed: [{ query: 'op="Muster Werke AG"', reason: 'unreachable' }], mismatches: [] },
    })
    expect((await index.current())?.queries.map(query => Object.keys(query.rows))).toEqual([['EP16000001'], ['EP16000002']])
    fake.failing.clear()
    fake.queries.length = 0
    expect(await index.setNames(['Muster Werke AG', 'Beispiel Verpackung AG'])).toMatchObject({ state: 'stale', refresh: { state: 'reading' } })
    expect(await settled(index)).toEqual({ state: 'ready', rows: 2, asOf: T1 })
    expect(fake.queries).toEqual(['op="Muster Werke AG"|1-100'])
  })

  it('takes changed names in the complete index and in its read again: a removed name leaves both at once, and a new name is read first', async () => {
    const fake = new FakePatentData([opposed(1, 'Beispiel Verpackung AG'), opposed(2, 'Muster Werke AG'), opposed(3, 'Probe Technik GmbH')])
    const index = open(new Service(fake), { refreshAge: 1000 })
    await index.setNames(['Beispiel Verpackung AG', 'Muster Werke AG'])
    expect(await settled(index)).toEqual({ state: 'ready', rows: 2, asOf: T0 })
    hold(fake, 'Beispiel')
    await clock.advance(1000)
    expect(await index.state()).toMatchObject({ state: 'stale', refresh: { state: 'reading' } })
    fake.queries.length = 0
    expect(await index.setNames(['Muster Werke AG', 'Probe Technik GmbH'])).toEqual({ state: 'reading', progress: { slicesDone: 1, slices: 2, rows: 1 } })
    expect((await index.current())?.queries.map(query => query.query)).toEqual(['op="Muster Werke AG"', 'op="Probe Technik GmbH"'])
    expect(await settled(index)).toEqual({ state: 'ready', rows: 2, asOf: T1 })
    expect(fake.queries).toEqual(['op="Probe Technik GmbH"|1-100', 'op="Muster Werke AG"|1-100', 'op="Probe Technik GmbH"|1-100'])
    await expect(stat(refreshFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reads a damaged index file again only after the names come, and logs a file that it cannot read', async () => {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, '{"version": 2}')
    const fake = new FakePatentData([opposed(1, 'Syntegon Packaging Systems AG')])
    const index = open(new Service(fake))
    await index.wake()
    expect(await index.state()).toEqual({ state: 'no_clients' })
    expect(logs[0]).toMatch(/^ui-flowleap-folder: opponent index: the stored file is damaged, so it is read again: /u)
    await index.setNames(['Syntegon Packaging Systems'])
    expect(await settled(index)).toMatchObject({ state: 'ready', rows: 1 })
    await index.dispose()
    await rm(file)
    await mkdir(file)
    logs.length = 0
    const blocked = open(new Service(fake))
    expect(await blocked.state()).toEqual({ state: 'no_clients' })
    expect(logs).toEqual([expect.stringMatching(/^ui-flowleap-folder: opponent index: EISDIR/u)])
    await mkdir(path.join(file, 'inside'))
    expect(await blocked.setNames([])).toEqual({ state: 'no_clients' })
    expect(await blocked.setNames(['Robert Bosch'])).toMatchObject({ state: 'reading' })
    await settled(blocked)
    expect(logs.length).toBeGreaterThan(1)
    expect(logs.every(line => line.startsWith('ui-flowleap-folder: opponent index: '))).toBe(true)
  })
})
