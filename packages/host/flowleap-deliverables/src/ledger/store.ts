/**
 * The patent execution ledger of this harness: one append-only list of
 * executions per Session, read by the writer as a {@link PatentExecutionSnapshot}.
 * Records live in memory for the process and, when `ctx.storageDomain` is
 * mounted, in the `flowleap_deliverables_ledger` domain so a Session reopened
 * after a restart keeps its evidence. No Session event is declared: the ledger
 * is host state, invisible to the model until a save renders it.
 * @module
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defineDomain, domainTable, type Domain, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import {
  capRecordedText, LIMITATION, readPatentExecution,
  type PatentExecution, type PatentExecutionSnapshot,
} from './types.ts'

/** One Session's stored records; the values are read back through the untrusted-storage reader. */
const sessionRecordSchema = z.object({ executions: z.array(z.unknown()) })

/** The stored shape of one Session's ledger. */
export type LedgerSessionRecord = z.infer<typeof sessionRecordSchema>

/** The storage domain the ledger persists in: one record per Session id, each an append-only list. */
export const ledgerDomainSpec = defineDomain({
  name: 'flowleap_deliverables_ledger',
  version: 1,
  tables: { sessions: domainTable<string, LedgerSessionRecord>(sessionRecordSchema) },
})

/** What a recorder hands the ledger: everything but the id and the time the ledger stamps. */
export type NewPatentExecution = Omit<PatentExecution, 'id' | 'recordedAt'>

/** The durable half of the ledger, when storage is mounted. */
export interface LedgerPersistence {
  /** The table keyed by Session id. */
  readonly table: KvTable<string, LedgerSessionRecord>
}

/**
 * Durable, append-only outcome records keyed by Session id. Reads come from
 * memory; a Session first seen after a restart is hydrated from storage once.
 */
export class PatentLedger {
  private readonly memory = new Map<string, PatentExecution[]>()
  private readonly hydrated = new Set<string>()
  private readonly unreadable = new Set<string>()
  private readonly partial = new Set<string>()
  private persistence: LedgerPersistence | undefined
  private tail: Promise<void> = Promise.resolve()

  /**
   * @param now - the clock the records are stamped with; a test passes its own.
   */
  constructor(private readonly now: () => Date = () => new Date()) {}

  /**
   * Attach the storage table. Sessions already in memory keep their records;
   * later records of every Session are appended to the table as well.
   * @param persistence - the opened domain's table.
   */
  attach(persistence: LedgerPersistence | undefined): void {
    this.persistence = persistence
  }

  /**
   * Append one execution to a Session's ledger.
   * @param sessionId - the owning Session.
   * @param execution - the outcome; free text is capped before storage.
   * @returns the recorded execution, with its id and time.
   */
  async record(sessionId: string, execution: NewPatentExecution): Promise<PatentExecution> {
    await this.hydrate(sessionId)
    const recorded: PatentExecution = { ...capRecordedText(execution), id: randomUUID(), recordedAt: this.now().toISOString() }
    this.list(sessionId).push(recorded)
    const persistence = this.persistence
    if (persistence !== undefined) {
      // Writes of one Session are serialized so two concurrent tool results cannot lose each other.
      this.tail = this.tail.then(async () => {
        const current = persistence.table.get(sessionId)?.executions ?? []
        await persistence.table.put(sessionId, { executions: [...current, recorded] })
      }).catch(() => { this.unreadable.add(sessionId) })
      await this.tail
    }
    return recorded
  }

  /**
   * The Session's snapshot: every recorded execution in time order plus the limitation sentence.
   * @param sessionId - the owning Session.
   * @returns the snapshot the writer validates against.
   */
  async read(sessionId: string): Promise<PatentExecutionSnapshot> {
    await this.hydrate(sessionId)
    // Time order; records stamped in the same millisecond keep their append order (the sort is stable).
    const executions = [...this.list(sessionId)].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    const disclosure = (this.unreadable.has(sessionId) ? 'Some audit records are unreadable or incomplete. ' : '')
      + (this.partial.has(sessionId) ? 'Some audit records were recovered with unreadable fields dropped; those fields are unknown, not zero. ' : '')
    return { executions, limitation: disclosure + LIMITATION }
  }

  /**
   * Forget a Session's records in memory (storage keeps them).
   * @param sessionId - the Session that was disposed.
   */
  forget(sessionId: string): void {
    this.memory.delete(sessionId)
    this.hydrated.delete(sessionId)
  }

  private list(sessionId: string): PatentExecution[] {
    let list = this.memory.get(sessionId)
    if (list === undefined) {
      list = []
      this.memory.set(sessionId, list)
    }
    return list
  }

  /** Load a Session's stored records once; storage is untrusted, so each record is recovered on its own. */
  private async hydrate(sessionId: string): Promise<void> {
    if (this.hydrated.has(sessionId)) return
    this.hydrated.add(sessionId)
    const persistence = this.persistence
    if (persistence === undefined) return
    await this.tail
    const stored = persistence.table.get(sessionId)
    if (stored === undefined) return
    // A record that lands while this load waits is stored after the load reads the table, so no stored record is in memory yet.
    for (const raw of stored.executions) {
      const recovered = readPatentExecution(raw)
      if (recovered === undefined) { this.unreadable.add(sessionId); continue }
      if (recovered.dropped) this.partial.add(sessionId)
      this.list(sessionId).push(recovered.execution)
    }
  }
}

/**
 * Open the ledger domain and bind its table to a ledger.
 * @param domain - the opened `flowleap_deliverables_ledger` domain.
 * @returns the persistence handle.
 */
export function ledgerPersistence(domain: Domain<typeof ledgerDomainSpec>): LedgerPersistence {
  return { table: domain.table('sessions') }
}
