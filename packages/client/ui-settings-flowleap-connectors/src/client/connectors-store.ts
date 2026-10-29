/**
 * The connectors page state over the `flowleapConnectors` Remote: presence per
 * connector from `describe()`, the write-only drafts, and the save, remove and
 * test outcomes. Secret values flow in one direction: a draft is sent through
 * `set` and dropped; nothing stored is ever read into the page.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectorPresence, ConnectorTestResult } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { CONNECTOR_FIELDS, CONNECTOR_IDS, type ConnectorId } from '@deepseek-ai/dsh-flowleap-connectors/types'

/** The Host package's client-safe connector ids and fields; the Remote's `describe()` keys are checked against them. */
export { CONNECTOR_FIELDS, CONNECTOR_IDS, type ConnectorId }

/** What one card renders. */
export interface ConnectorCardState {
  /** The connector. */
  id: ConnectorId
  /** Whether the Host holds a complete record. */
  configured: boolean
  /** Whether the credential store accepts writes. */
  writable: boolean
  /** Fields the card edits, in display order. */
  fields: readonly string[]
  /** Unsaved input per field; starts blank on every load. */
  draft: Record<string, string>
  /** The operation crossing the wire, if any. */
  busy: 'idle' | 'saving' | 'removing' | 'testing'
  /** Last connection-test outcome, kept until the next save, remove, or test. */
  test?: ConnectorTestResult
  /** Last refused write, verbatim from the Host. */
  error?: string
}

/** What the section and the wizard render. */
export interface ConnectorsState {
  /** `idle` before the first load; `error` when `describe()` failed. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The `describe()` failure, when status is `error`. */
  error?: string
  /** One card per connector. */
  cards: Record<ConnectorId, ConnectorCardState>
  /** Whether at least one connector is configured. */
  anyConfigured: boolean
}

function blankCard(id: ConnectorId): ConnectorCardState {
  return { id, configured: false, writable: true, fields: CONNECTOR_FIELDS[id], draft: {}, busy: 'idle' }
}

function initialState(): ConnectorsState {
  return {
    status: 'idle',
    cards: Object.fromEntries(CONNECTOR_IDS.map(id => [id, blankCard(id)])) as Record<ConnectorId, ConnectorCardState>,
    anyConfigured: false,
  }
}

/**
 * Whether a draft fills every field of its connector.
 * @param card - the card.
 * @returns true when `save` can run.
 */
export function draftComplete(card: ConnectorCardState): boolean {
  return card.fields.every(field => (card.draft[field] ?? '').trim().length > 0)
}

/** Coordinates the page state with the Host. */
export class ConnectorsStore {
  /** uSES-safe state source shared by the section and the wizard. */
  readonly store: SnapshotStore<ConnectorsState> = createSnapshotStore<ConnectorsState>(initialState())

  private loading: Promise<void> | undefined

  /** @param ctx - the page plugin's context, whose `remote.flowleapConnectors` namespace this store calls. */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Read presence for every connector and publish it. Concurrent callers share one read.
   * @returns settlement after the snapshot is published.
   */
  load(): Promise<void> {
    this.loading ??= this.read().finally(() => { this.loading = undefined })
    return this.loading
  }

  /** Re-read presence, but only once the page has loaded: an unopened page does not fetch on invalidations. */
  refresh(): void {
    if (this.store.getSnapshot().status === 'idle') return
    void this.load()
  }

  /**
   * Stage one field of one connector.
   * @param id - the connector.
   * @param field - one of its fields.
   * @param text - the typed value.
   */
  edit(id: ConnectorId, field: string, text: string): void {
    this.store.update((state) => {
      state.cards[id].draft[field] = text
      delete state.cards[id].error
    })
  }

  /**
   * Drop one connector's draft and outcomes.
   * @param id - the connector.
   */
  discard(id: ConnectorId): void {
    this.store.update((state) => {
      state.cards[id].draft = {}
      delete state.cards[id].error
      delete state.cards[id].test
    })
  }

  /**
   * Write one connector's complete draft, then drop it.
   * @param id - the connector.
   * @returns true when the Host stored it.
   */
  async save(id: ConnectorId): Promise<boolean> {
    const card = this.store.getSnapshot().cards[id]
    if (!draftComplete(card) || card.busy !== 'idle') return false
    const values = Object.fromEntries(card.fields.map(field => [field, (card.draft[field] ?? '').trim()]))
    this.busy(id, 'saving')
    const result = await this.ctx.remote.flowleapConnectors.set(id, values)
    this.store.update((state) => {
      const target = state.cards[id]
      target.busy = 'idle'
      delete target.test
      if (result.ok) {
        target.draft = {}
        target.configured = true
        delete target.error
      } else {
        target.error = result.error.message
      }
      state.anyConfigured = CONNECTOR_IDS.some(each => state.cards[each].configured)
    })
    return result.ok
  }

  /**
   * Save every connector whose draft is complete, in display order.
   * @returns true when every attempted save succeeded (none attempted counts as success).
   */
  async saveFilled(): Promise<boolean> {
    let ok = true
    for (const id of CONNECTOR_IDS) {
      if (draftComplete(this.store.getSnapshot().cards[id])) ok = (await this.save(id)) && ok
    }
    return ok
  }

  /**
   * Remove one connector's stored record.
   * @param id - the connector.
   * @returns true when the Host removed it.
   */
  async remove(id: ConnectorId): Promise<boolean> {
    if (this.store.getSnapshot().cards[id].busy !== 'idle') return false
    this.busy(id, 'removing')
    const result = await this.ctx.remote.flowleapConnectors.unset(id)
    this.store.update((state) => {
      const target = state.cards[id]
      target.busy = 'idle'
      delete target.test
      if (result.ok) {
        target.configured = false
        delete target.error
      } else {
        target.error = result.error.message
      }
      state.anyConfigured = CONNECTOR_IDS.some(each => state.cards[each].configured)
    })
    return result.ok
  }

  /**
   * Run the Host's connection test for one stored connector and publish the outcome on its card.
   * @param id - the connector.
   * @returns the outcome, or `undefined` when the call itself failed.
   */
  async test(id: ConnectorId): Promise<ConnectorTestResult | undefined> {
    if (this.store.getSnapshot().cards[id].busy !== 'idle') return undefined
    this.busy(id, 'testing')
    const result = await this.ctx.remote.flowleapConnectors.test(id)
    const outcome: ConnectorTestResult | undefined = result.ok ? result.value : undefined
    this.store.update((state) => {
      const target = state.cards[id]
      target.busy = 'idle'
      if (outcome === undefined) {
        if (!result.ok) target.error = result.error.message
        delete target.test
      } else {
        target.test = outcome
        delete target.error
      }
    })
    return outcome
  }

  /**
   * Test every configured connector, in display order.
   */
  async testConfigured(): Promise<void> {
    for (const id of CONNECTOR_IDS) {
      if (this.store.getSnapshot().cards[id].configured) await this.test(id)
    }
  }

  private busy(id: ConnectorId, busy: ConnectorCardState['busy']): void {
    this.store.update((state) => {
      state.cards[id].busy = busy
      delete state.cards[id].error
    })
  }

  private async read(): Promise<void> {
    this.store.update((state) => { state.status = 'loading'; delete state.error })
    const result = await this.ctx.remote.flowleapConnectors.describe()
    this.store.update((state) => {
      if (!result.ok) {
        state.status = 'error'
        state.error = result.error.message
        return
      }
      state.status = 'ready'
      delete state.error
      for (const id of CONNECTOR_IDS) {
        const presence: ConnectorPresence | undefined = result.value[id]
        const card = state.cards[id]
        if (presence === undefined) continue
        card.configured = presence.configured
        card.writable = presence.writable
        card.fields = presence.fields.length > 0 ? presence.fields : CONNECTOR_FIELDS[id]
      }
      state.anyConfigured = CONNECTOR_IDS.some(id => state.cards[id].configured)
    })
  }
}
