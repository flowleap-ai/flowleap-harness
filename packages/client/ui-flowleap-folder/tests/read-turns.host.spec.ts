import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FirmDocket } from '../src/add-client/docket.ts'
import { OpponentIndex } from '../src/add-client/opponent-index.ts'
import { ReadTurns } from '../src/add-client/sliced-read.ts'
import { FakeClock } from './clock.host.ts'
import { FakePatentData, hold, row } from './patent-data.host.ts'

const WEEK = 7 * 86_400_000

let base: string
let clock: FakeClock
let fake: FakePatentData
let docket: FirmDocket
let index: OpponentIndex

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-turns-'))
  clock = new FakeClock()
  fake = new FakePatentData([
    row({ applicationNumber: 'EP23000001', published: '2025-01-10', representatives: [{ name: 'Muster & Partner mbB', address: [] }] }),
    row({ applicationNumber: 'EP16000001', published: '2020-05-05', opponents: [{ name: 'Beispiel Verpackung AG', address: [] }] }),
  ])
  const turns = new ReadTurns()
  const settings = { sliceRows: 2000, refreshAge: WEEK, data: () => fake, clock, log: () => {}, turns }
  docket = new FirmDocket({
    ...settings, file: path.join(base, 'docket.json'), refreshFile: path.join(base, 'docket.refresh.json'),
    identity: Promise.resolve({ names: ['Muster & Partner'], addresses: [], representatives: [] }),
  })
  index = new OpponentIndex({ ...settings, file: path.join(base, 'opponents.json'), refreshFile: path.join(base, 'opponents.refresh.json') })
})

afterEach(async () => {
  await docket.dispose()
  await index.dispose()
  await rm(base, { recursive: true, force: true })
})

/** Wait until the docket and the index are complete, with no read again. */
async function bothRead(): Promise<void> {
  await vi.waitFor(async () => {
    for (const state of [await docket.state(), await index.state()]) {
      expect(state).toMatchObject({ state: 'ready', rows: 1 })
      expect(state).not.toHaveProperty('refresh')
    }
  }, { timeout: 4000, interval: 2 })
}

/** The queries that left, without their row ranges. */
function sent(): string[] {
  return fake.queries.map(query => query.split('|')[0] ?? '')
}

describe('the order of the docket and index reads', () => {
  it('lets the opponent index wait while the firm docket reads', async () => {
    const release = hold(fake, 're=')
    await docket.wake()
    expect(await index.setNames(['Beispiel Verpackung AG'])).toMatchObject({ state: 'reading' })
    await clock.advance(0)
    expect(sent()).toEqual([])
    release()
    await bothRead()
    expect(sent()).toEqual(['re="Muster Partner"', 'op="Beispiel Verpackung AG"'])
  })

  it('lets the firm docket wait while the opponent index reads, also for a read again', async () => {
    await docket.wake()
    await index.setNames(['Beispiel Verpackung AG'])
    await bothRead()
    fake.queries.length = 0
    const release = hold(fake, 'op=')
    await index.setNames(['Beispiel Verpackung AG', 'Muster Werke AG'])
    expect(await docket.readAgain('all')).toMatchObject({ state: 'ready', refresh: { state: 'reading' } })
    await clock.advance(0)
    expect(sent()).toEqual([])
    release()
    await bothRead()
    expect(sent()).toEqual(['op="Muster Werke AG"', 're="Muster Partner"'])
  })

  it('stops a read that waits for its turn at once, so a new identity does not wait for the index', async () => {
    const release = hold(fake, 'op=')
    await index.setNames(['Beispiel Verpackung AG'])
    await docket.wake()
    expect(await docket.setIdentity({ names: ['Beispiel IP'], addresses: [], representatives: [] })).toMatchObject({ state: 'reading' })
    expect(sent()).toEqual([])
    release()
    await vi.waitFor(async () => { expect(await index.state()).toMatchObject({ state: 'ready' }) }, { timeout: 4000, interval: 2 })
    await vi.waitFor(async () => { expect(await docket.state()).toMatchObject({ state: 'ready', rows: 0 }) }, { timeout: 4000, interval: 2 })
    expect(sent()).toEqual(['op="Beispiel Verpackung AG"', 're="Beispiel IP"'])
  })
})
