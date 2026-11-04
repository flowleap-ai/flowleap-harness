/**
 * The delivery ledger: which Ticket deliveries already opened a run Session. One file per delivery in the state folder,
 * created with the exclusive flag after the Session admitted its prompt, so a repeat of the delivery after a restart
 * opens no second Session. A claim in memory covers the time between the dispatch and that file.
 * @module
 */

import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** What the ledger knows about a delivery. */
export type DeliveryState = 'new' | 'in-flight' | 'started'

/** The durable record of one started delivery. */
interface StartedRecord {
  readonly deliveryId: string
  readonly session: SessionId
  /** Unix epoch milliseconds. */
  readonly at: number
}

/** The ledger of one state folder; the plugin instance owns it. */
export class DeliveryLedger {
  private readonly inFlight = new Set<string>()

  /**
   * @param dir - absolute state folder; created on the first record.
   */
  constructor(private readonly dir: string) {}

  private fileOf(deliveryId: string): string {
    return join(this.dir, `${createHash('sha256').update(deliveryId).digest('hex')}.json`)
  }

  /**
   * Claim a delivery for one dispatch. The check of the durable file and the claim are one step for this process.
   * @param deliveryId - the delivery id.
   * @returns `new` when this call claimed it; otherwise what the ledger already knows.
   */
  async claim(deliveryId: string): Promise<DeliveryState> {
    if (await this.started(deliveryId)) return 'started'
    if (this.inFlight.has(deliveryId)) return 'in-flight'
    this.inFlight.add(deliveryId)
    return 'new'
  }

  /**
   * Give back a claim whose dispatch failed before any Session existed.
   * @param deliveryId - the delivery id.
   */
  release(deliveryId: string): void {
    this.inFlight.delete(deliveryId)
  }

  /**
   * Record that the delivery opened a Session. A second record of the same delivery keeps the first.
   * @param deliveryId - the delivery id.
   * @param session - the run Session.
   * @param at - Unix epoch milliseconds.
   */
  async record(deliveryId: string, session: SessionId, at: number): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const value: StartedRecord = { deliveryId, session, at }
    try {
      await writeFile(this.fileOf(deliveryId), `${JSON.stringify(value)}\n`, { flag: 'wx' })
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    } finally {
      this.inFlight.delete(deliveryId)
    }
  }

  private async started(deliveryId: string): Promise<boolean> {
    try {
      await stat(this.fileOf(deliveryId))
      return true
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
      throw error
    }
  }
}
