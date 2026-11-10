import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FirmIdentityStore } from '../src/add-client/identity-store.ts'
import { normalizeIdentity } from '../src/add-client/identity.ts'
import type { FirmIdentity } from '../src/add-client/wire.ts'

const CONFIG: FirmIdentity = { names: ['Muster & Partner'], addresses: [], representatives: [] }
const NONE: FirmIdentity = { names: [], addresses: [], representatives: [] }

let base: string
let file: string
let logs: string[]

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'flowleap-identity-'))
  file = path.join(base, 'state', 'identity.json')
  logs = []
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

function open(initial: FirmIdentity = CONFIG): FirmIdentityStore {
  return new FirmIdentityStore({ file, initial, now: () => new Date('2026-11-09T10:00:00.000Z'), log: (message) => { logs.push(message) } })
}

describe('the firm identity store', () => {
  it('trims each entry and drops the entries with no word and the repeated entries', () => {
    expect(normalizeIdentity({
      names: ['  Muster & Partner ', '', 'Muster & Partner', '- / -'],
      addresses: ['Musterstraße 1, 40211 Düsseldorf'],
      representatives: ['Becker, Anna', '   '],
    })).toEqual({ names: ['Muster & Partner'], addresses: ['Musterstraße 1, 40211 Düsseldorf'], representatives: ['Becker, Anna'] })
  })

  it('gives the row config identity until a person saves one, and the saved identity after a restart', async () => {
    const store = open({ names: [' Muster & Partner '], addresses: [], representatives: [] })
    expect(await store.current()).toEqual(CONFIG)
    const saved = await store.save({ names: ['Muster & Partner', ''], addresses: [], representatives: ['Becker, Anna'] })
    expect(saved).toEqual({ names: ['Muster & Partner'], addresses: [], representatives: ['Becker, Anna'] })
    expect(await store.current()).toEqual(saved)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ version: 1, identity: saved, savedAt: '2026-11-09T10:00:00.000Z' })
    expect(await open().current()).toEqual(saved)
  })

  it('keeps an empty saved identity, so the row config identity does not come back', async () => {
    await open().save({ names: ['  '], addresses: [], representatives: [] })
    expect(await open().current()).toEqual(NONE)
  })

  it('ends with the last of two saves', async () => {
    const store = open()
    const second: FirmIdentity = { names: ['Beispiel IP'], addresses: [], representatives: [] }
    await Promise.all([store.save(NONE), store.save(second)])
    expect(await store.current()).toEqual(second)
    expect(await open().current()).toEqual(second)
  })

  it('uses the row config identity with a log line when the file is damaged or cannot be read', async () => {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, '{"version": 2}')
    expect(await open().current()).toEqual(CONFIG)
    const damaged = /^ui-flowleap-folder: firm identity: the saved identity is damaged, so the row config identity is used: /u
    expect(logs).toEqual([expect.stringMatching(damaged)])
    await rm(file)
    await mkdir(file)
    logs.length = 0
    expect(await open().current()).toEqual(CONFIG)
    expect(logs).toEqual([expect.stringMatching(/^ui-flowleap-folder: firm identity: /u)])
  })

  it('keeps the identity when a save fails, and saves again after it', async () => {
    await mkdir(file, { recursive: true })
    await writeFile(path.join(file, 'inside'), 'x')
    const store = open()
    await expect(store.save(NONE)).rejects.toThrow()
    expect(await store.current()).toEqual(CONFIG)
    await rm(file, { recursive: true })
    expect(await store.save(NONE)).toEqual(NONE)
    expect(await store.current()).toEqual(NONE)
  })
})
