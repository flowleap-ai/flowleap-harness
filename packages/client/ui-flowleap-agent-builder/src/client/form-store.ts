/**
 * Headless state of the agent form: closed, or open on one draft for a new or an existing agent. The New agent menu
 * row opens it; the `shell.overlay` entry renders it, because the menu row unmounts when the menu closes.
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Index state of one file of an agent. */
export type AgentFileState = 'indexed' | 'indexing' | 'failed'

/** One file of an agent as the form lists it. */
export interface AgentFileRow {
  readonly name: string
  readonly bytes: number
  readonly state: AgentFileState
}

/** One connector row the form offers; only a configured row can be selected. */
export interface ConnectorChoice {
  readonly id: string
  readonly configured: boolean
}

/** The editable fields of one agent. */
export interface AgentDraft {
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly files: readonly AgentFileRow[]
  /** Ids of the selected connector rows. */
  readonly connectors: readonly string[]
}

/** Form state: closed, or open on one draft. */
export type AgentFormState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'open'; readonly mode: 'create' | 'edit'; readonly draft: AgentDraft }

const CLOSED: AgentFormState = { kind: 'closed' }

/** One form instance backs the menu row and the overlay entry. */
export class AgentFormController {
  /** Form state store (the overlay entry subscribes here). */
  readonly state: SnapshotStore<AgentFormState> = createSnapshotStore<AgentFormState>(CLOSED)

  /**
   * @param connectors - the connector rows the form offers.
   * @param initialDraft - the draft a new agent starts from.
   */
  constructor(readonly connectors: readonly ConnectorChoice[], private readonly initialDraft: () => AgentDraft) {}

  /** Open the form on a new agent. */
  readonly openCreate = (): void => {
    this.state.set({ kind: 'open', mode: 'create', draft: this.initialDraft() })
  }

  /** Close the form and drop the draft. */
  readonly close = (): void => {
    this.state.set(CLOSED)
  }

  /**
   * Change fields of the open draft.
   * @param patch - the changed fields.
   */
  readonly edit = (patch: Partial<AgentDraft>): void => {
    const current = this.state.getSnapshot()
    if (current.kind !== 'open') return
    this.state.set({ ...current, draft: { ...current.draft, ...patch } })
  }

  /**
   * Select or clear one configured connector.
   * @param id - connector row id.
   * @param selected - the requested state.
   */
  readonly toggleConnector = (id: string, selected: boolean): void => {
    const current = this.state.getSnapshot()
    if (current.kind !== 'open') return
    if (!this.connectors.some(row => row.id === id && row.configured)) return
    const rest = current.draft.connectors.filter(value => value !== id)
    this.edit({ connectors: selected ? [...rest, id] : rest })
  }

  /**
   * Add dropped or chosen files to the open draft.
   * @param files - the browser files.
   */
  readonly addFiles = (files: readonly File[]): void => {
    const current = this.state.getSnapshot()
    if (current.kind !== 'open') return
    const known = new Set(current.draft.files.map(file => file.name))
    const added = files.filter(file => !known.has(file.name))
      .map((file): AgentFileRow => ({ name: file.name, bytes: file.size, state: 'indexing' }))
    this.edit({ files: [...current.draft.files, ...added] })
  }

  /**
   * Remove one file from the open draft.
   * @param name - file name.
   */
  readonly removeFile = (name: string): void => {
    const current = this.state.getSnapshot()
    if (current.kind !== 'open') return
    this.edit({ files: current.draft.files.filter(file => file.name !== name) })
  }
}
