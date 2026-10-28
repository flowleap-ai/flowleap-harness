/**
 * Headless state of the agent builder: the agent list the Edit agent row reads, and the agent form, closed or open on
 * one draft for a new or an existing agent. The Host owns the agents through the `flowleapAgents` Remote; files the
 * attorney adds wait in the browser until Save, then go to the upload route one by one, and their rows follow the
 * Host's index state through `flowleap-agents/changed`.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  AgentFileView, AgentId, AgentInput, AgentMode, AgentSummary, AgentView, ConnectorChoice, ConnectorChoiceId,
} from '@deepseek-ai/dsh-flowleap-agent-builder/types'

/** State of one file row: `pending` until Save uploads it, then the Host's index state. */
export type AgentFileRowState = 'pending' | 'indexing' | 'indexed' | 'failed'

/** One file of an agent as the form lists it. */
export interface AgentFileRow {
  readonly name: string
  readonly bytes: number
  readonly state: AgentFileRowState
}

/** The editable fields of one agent and its file rows. */
export interface AgentDraft {
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly files: readonly AgentFileRow[]
  /** The selected connector rows. */
  readonly connectors: readonly ConnectorChoiceId[]
}

/**
 * Why an upload failed, as the attorney can act on it: `network` when the request did not reach the Host or was aborted,
 * `server` for an HTTP status other than 200 or an answer that is not the route's JSON, `too-large` and `type` for the
 * Host's size limit and file types, and `refused` for any other Host refusal.
 */
export type AgentUploadError = 'network' | 'server' | 'too-large' | 'type' | 'refused'

/** Outcome of one upload. */
export type AgentUploadResult = { readonly ok: true } | { readonly ok: false; readonly error: AgentUploadError }

/** Why the form shows an error line: a Host error text, or a failed upload with its file. */
export type AgentFormError =
  | { readonly kind: 'load' | 'save' | 'delete'; readonly detail: string }
  | { readonly kind: 'upload'; readonly file: string; readonly reason: AgentUploadError }

/** Form state: closed, or open on one draft. */
export type AgentFormState =
  | { readonly kind: 'closed' }
  | {
    readonly kind: 'open'
    /** `create` until the first Save, then `edit`. */
    readonly mode: 'create' | 'edit'
    /** The agent after its first Save. */
    readonly id?: AgentId
    readonly draft: AgentDraft
    /** The connector rows the Host offers; empty until read. */
    readonly connectors: readonly ConnectorChoice[]
    /** How the saved agent reaches its files; absent before the first Save. */
    readonly agentMode?: AgentMode
    /** True while a Save, an upload or a delete runs. */
    readonly busy: boolean
    /** True while the delete confirmation is open. */
    readonly confirmingDelete: boolean
    readonly error: AgentFormError | null
  }

type OpenState = Extract<AgentFormState, { kind: 'open' }>

/** The Remote calls, the upload and the change subscription the controller uses. */
export interface AgentBuilderDeps {
  readonly list: () => Promise<RemoteResult<AgentSummary[]>>
  readonly read: (id: AgentId) => Promise<RemoteResult<AgentView>>
  readonly connectors: () => Promise<RemoteResult<ConnectorChoice[]>>
  readonly save: (input: AgentInput) => Promise<RemoteResult<AgentView>>
  readonly delete: (id: AgentId) => Promise<RemoteResult<void>>
  readonly removeFile: (id: AgentId, name: string) => Promise<RemoteResult<void>>
  /** Send one file to the upload route; resolves, also on a network failure, to the outcome. */
  readonly upload: (id: AgentId, file: File) => Promise<AgentUploadResult>
}

const CLOSED: AgentFormState = { kind: 'closed' }

const EMPTY_DRAFT: AgentDraft = { name: '', description: '', instructions: '', files: [], connectors: [] }

function rowOf(file: AgentFileView): AgentFileRow {
  return { name: file.name, bytes: file.bytes, state: file.state.kind }
}

function failure(result: { readonly error: { readonly message: string } }): string {
  return result.error.message
}

/** One controller backs the menu rows and the overlay entry. */
export class AgentFormController {
  /** Form state store (the overlay entry subscribes here). */
  readonly state: SnapshotStore<AgentFormState> = createSnapshotStore<AgentFormState>(CLOSED)
  /** The agents of this Host (the Edit agent row reads it). */
  readonly agents: SnapshotStore<readonly AgentSummary[]> = createSnapshotStore<readonly AgentSummary[]>([])
  /** Files added since the last Save, by name. */
  private readonly pending = new Map<string, File>()
  private epoch = 0

  /** @param deps - Remote calls and the upload. */
  constructor(private readonly deps: AgentBuilderDeps) {}

  private open(): OpenState | undefined {
    const current = this.state.getSnapshot()
    return current.kind === 'open' ? current : undefined
  }

  private patch(patch: Partial<OpenState>): void {
    const current = this.open()
    if (current !== undefined) this.state.set({ ...current, ...patch })
  }

  /**
   * Read the agent list again.
   * @returns resolution after the list is published; a failed read keeps the last list.
   */
  readonly loadAgents = async (): Promise<void> => {
    const result = await this.deps.list()
    if (result.ok) this.agents.set(result.value)
  }

  /** A Host change: read the list, and the open agent's files and mode. */
  readonly changed = (): void => {
    void this.loadAgents()
    const current = this.open()
    if (current?.id !== undefined) void this.refresh(current.id)
  }

  private async refresh(id: AgentId): Promise<void> {
    const epoch = this.epoch
    const result = await this.deps.read(id)
    const current = this.open()
    if (!result.ok || epoch !== this.epoch || current?.id !== id) return
    const waiting = current.draft.files.filter(file => file.state === 'pending' && this.pending.has(file.name))
    const files = [...result.value.files.map(rowOf), ...waiting.filter(file => !result.value.files.some(row => row.name === file.name))]
    this.state.set({ ...current, agentMode: result.value.mode, draft: { ...current.draft, files } })
  }

  private async loadConnectors(): Promise<void> {
    const epoch = this.epoch
    const result = await this.deps.connectors()
    if (epoch !== this.epoch) return
    if (result.ok) this.patch({ connectors: result.value })
    else this.patch({ error: { kind: 'load', detail: failure(result) } })
  }

  /** Open the form on a new, empty agent. */
  readonly openCreate = (): void => {
    this.epoch++
    this.pending.clear()
    this.state.set({ kind: 'open', mode: 'create', draft: EMPTY_DRAFT, connectors: [], busy: false, confirmingDelete: false, error: null })
    void this.loadConnectors()
  }

  /**
   * Open the form on one existing agent.
   * @param id - the agent.
   * @returns resolution after the agent is read.
   */
  readonly openEdit = async (id: AgentId): Promise<void> => {
    const epoch = ++this.epoch
    this.pending.clear()
    this.state.set({ kind: 'open', mode: 'edit', id, draft: EMPTY_DRAFT, connectors: [], busy: true, confirmingDelete: false, error: null })
    void this.loadConnectors()
    const result = await this.deps.read(id)
    if (epoch !== this.epoch) return
    if (!result.ok) {
      this.patch({ busy: false, error: { kind: 'load', detail: failure(result) } })
      return
    }
    const { name, description, instructions, connectors, files, mode } = result.value
    this.patch({ busy: false, agentMode: mode, draft: { name, description, instructions, connectors, files: files.map(rowOf) } })
  }

  /** Close the form and drop the draft and the files not yet uploaded. */
  readonly close = (): void => {
    this.epoch++
    this.pending.clear()
    this.state.set(CLOSED)
  }

  /**
   * Change text fields of the open draft.
   * @param patch - the changed fields.
   */
  readonly edit = (patch: Partial<Pick<AgentDraft, 'name' | 'description' | 'instructions'>>): void => {
    const current = this.open()
    if (current !== undefined) this.state.set({ ...current, draft: { ...current.draft, ...patch } })
  }

  /**
   * Select or clear one configured connector.
   * @param id - connector row id.
   * @param selected - the requested state.
   */
  readonly toggleConnector = (id: ConnectorChoiceId, selected: boolean): void => {
    const current = this.open()
    if (current === undefined) return
    if (!current.connectors.some(row => row.id === id && row.configured)) return
    const rest = current.draft.connectors.filter(value => value !== id)
    this.state.set({ ...current, draft: { ...current.draft, connectors: selected ? [...rest, id] : rest } })
  }

  /**
   * Add dropped or chosen files to the open draft; Save uploads them. A file with the name of a listed file replaces it.
   * @param files - the browser files.
   */
  readonly addFiles = (files: readonly File[]): void => {
    const current = this.open()
    if (current === undefined) return
    for (const file of files) this.pending.set(file.name, file)
    const names = new Set(files.map(file => file.name))
    const kept = current.draft.files.filter(file => !names.has(file.name))
    const added = files.map((file): AgentFileRow => ({ name: file.name, bytes: file.size, state: 'pending' }))
    this.state.set({ ...current, draft: { ...current.draft, files: [...kept, ...added] } })
  }

  /**
   * Remove one file: a file not yet uploaded leaves the draft; an uploaded file is removed on the Host.
   * @param name - file name.
   * @returns resolution after the Host answered.
   */
  readonly removeFile = async (name: string): Promise<void> => {
    const current = this.open()
    if (current === undefined) return
    const drop = () => {
      const now = this.open()
      if (now !== undefined) this.state.set({ ...now, draft: { ...now.draft, files: now.draft.files.filter(file => file.name !== name) } })
    }
    if (this.pending.delete(name) || current.id === undefined) {
      drop()
      return
    }
    const result = await this.deps.removeFile(current.id, name)
    if (result.ok) drop()
    else this.patch({ error: { kind: 'save', detail: failure(result) } })
  }

  /**
   * Save the draft: create or change the agent, then upload each file added since the last Save. A create, or a Save
   * with uploads, leaves the form open on the saved agent, so the file rows show their index state; any other successful
   * Save closes the form. The form is never left busy, also when a dependency rejects.
   * @returns resolution after the uploads.
   */
  readonly save = async (): Promise<void> => {
    const current = this.open()
    if (current === undefined || current.busy) return
    const epoch = this.epoch
    this.patch({ busy: true, error: null })
    try {
      await this.store(current, epoch)
    } finally {
      if (epoch === this.epoch) this.patch({ busy: false })
    }
  }

  private async store(current: OpenState, epoch: number): Promise<void> {
    const { name, description, instructions, connectors } = current.draft
    const input = { ...current.id === undefined ? {} : { id: current.id }, name, description, instructions, connectors }
    const result = await this.deps.save(input)
    if (epoch !== this.epoch) return
    if (!result.ok) {
      this.patch({ error: { kind: 'save', detail: failure(result) } })
      return
    }
    const saved = result.value
    const uploads = [...this.pending]
    this.patch({ mode: 'edit', id: saved.id, agentMode: saved.mode })
    for (const [fileName, file] of uploads) {
      const upload = await this.deps.upload(saved.id, file)
      if (epoch !== this.epoch) return
      if (!upload.ok) {
        this.patch({ error: { kind: 'upload', file: fileName, reason: upload.error } })
        return
      }
      this.pending.delete(fileName)
    }
    void this.loadAgents()
    if (current.mode === 'edit' && uploads.length === 0) this.close()
    else await this.refresh(saved.id)
  }

  /** Open the delete confirmation. */
  readonly requestDelete = (): void => {
    this.patch({ confirmingDelete: true })
  }

  /** Close the delete confirmation. */
  readonly cancelDelete = (): void => {
    this.patch({ confirmingDelete: false })
  }

  /**
   * Delete the open agent and close the form.
   * @returns resolution after the Host answered.
   */
  readonly confirmDelete = async (): Promise<void> => {
    const current = this.open()
    if (current?.id === undefined) return
    this.patch({ busy: true, confirmingDelete: false })
    const result = await this.deps.delete(current.id)
    if (!result.ok) {
      this.patch({ busy: false, error: { kind: 'delete', detail: failure(result) } })
      return
    }
    this.close()
    void this.loadAgents()
  }
}
