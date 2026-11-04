/**
 * The delivery ledger: which Ticket deliveries already started a run. One file per delivery in the state folder, created
 * with the exclusive flag after the Session admitted its prompt and the Firm Record accepted its `run-started`, so a
 * repeat of the delivery after a restart opens no second Session. A claim in memory covers the time between the
 * dispatch and that file; the rule gives the claim back when no Session opened or the Firm Record did not accept the
 * Session, so a repeat of the delivery can start the run.
 * @module
 */

import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WebhookDeliveryId } from '@deepseek-ai/dsh-webhook'

/** What the ledger knows about a delivery. */
export type DeliveryState = 'new' | 'in-flight' | 'started'

/** The durable record of one started delivery. */
interface StartedRecord {
  readonly deliveryId: WebhookDeliveryId
  readonly session: SessionId
  /** Unix epoch milliseconds. */
  readonly at: number
}

/** The ledger of one state folder; the plugin instance owns it. */
export class DeliveryLedger {
  private readonly inFlight = new Set<WebhookDeliveryId>()

  /**
   * @param dir - absolute state folder; created on the first record.
   */
  constructor(private readonly dir: string) {}

  private fileOf(deliveryId: WebhookDeliveryId): string {
    return join(this.dir, `${createHash('sha256').update(deliveryId).digest('hex')}.json`)
  }

  /**
   * Claim a delivery for one dispatch. The check of the durable file and the claim are one step for this process.
   * @param deliveryId - the delivery id.
   * @returns `new` when this call claimed it; otherwise what the ledger already knows.
   */
  async claim(deliveryId: WebhookDeliveryId): Promise<DeliveryState> {
    if (await this.started(deliveryId)) return 'started'
    if (this.inFlight.has(deliveryId)) return 'in-flight'
    this.inFlight.add(deliveryId)
    return 'new'
  }

  /**
   * Give back a claim: no Session opened, or the Firm Record did not accept the Session's `run-started`.
   * @param deliveryId - the delivery id.
   */
  release(deliveryId: WebhookDeliveryId): void {
    this.inFlight.delete(deliveryId)
  }

  /**
   * Record that the delivery started its run: the Session exists and the Firm Record accepted its `run-started`. A second
   * record of the same delivery keeps the first. The claim ends also when the write fails.
   * @param deliveryId - the delivery id.
   * @param session - the run Session.
   * @param at - Unix epoch milliseconds.
   */
  async record(deliveryId: WebhookDeliveryId, session: SessionId, at: number): Promise<void> {
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

  private async started(deliveryId: WebhookDeliveryId): Promise<boolean> {
    try {
      await stat(this.fileOf(deliveryId))
      return true
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
      throw error
    }
  }
}
