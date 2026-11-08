/** The delivery ledger over the real filesystem: the claim states, the durable record, and the failures it reports. */
import * as fs from 'node:fs/promises'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { WebhookDeliveryId } from '@deepseek-ai/dsh-webhook'
import { DeliveryLedger } from '../src/ledger.ts'

vi.mock('node:fs/promises', { spy: true })

const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'flowleap-ticket-ledger-'))
  dirs.push(dir)
  return dir
}

const ID = WebhookDeliveryId('tk-1/1')

describe('the delivery ledger', () => {
  it('claims a delivery once, gives a claim back, and keeps the first record of a delivery', async () => {
    const dir = await tempDir()
    const ledger = new DeliveryLedger(join(dir, 'state'))
    expect(await ledger.claim(ID)).toBe('new')
    expect(await ledger.claim(ID)).toBe('in-flight')
    ledger.release(ID)
    expect(await ledger.claim(ID)).toBe('new')
    await ledger.record(ID, SessionId('webhook-a'), 1)
    await ledger.record(ID, SessionId('webhook-b'), 2)
    expect(await ledger.claim(ID)).toBe('started')
    expect(await new DeliveryLedger(join(dir, 'state')).claim(ID)).toBe('started')
    const [file] = await readdir(join(dir, 'state'))
    expect(JSON.parse(await readFile(join(dir, 'state', file!), 'utf8'))).toEqual({ deliveryId: 'tk-1/1', session: 'webhook-a', at: 1 })
  })

  it('rejects a claim when the state folder cannot be created or read, and a record when it cannot be written, and ends the claim', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'file'), '')
    await expect(new DeliveryLedger(join(dir, 'file')).claim(ID)).rejects.toThrow(/EEXIST/u)
    const ledger = new DeliveryLedger(dir)
    vi.mocked(fs.stat).mockRejectedValueOnce(Object.assign(new Error('access denied'), { code: 'EACCES' }))
    await expect(ledger.claim(ID)).rejects.toThrow(/access denied/u)
    expect(await ledger.claim(ID)).toBe('new')
    vi.mocked(fs.writeFile).mockRejectedValueOnce(Object.assign(new Error('disk full'), { code: 'ENOSPC' }))
    await expect(ledger.record(ID, SessionId('webhook-a'), 1)).rejects.toThrow(/disk full/u)
    expect(await ledger.claim(ID)).toBe('new')
  })
})
