/**
 * The agents of this Host: the folders loaded in memory, the agent preset each one registers, and the index lifecycle
 * of each file. Every change re-registers the agent's preset, so the next Session composes the new revision while live
 * Agents keep theirs.
 * @module
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-flowleap-connectors'
import type {} from '@deepseek-ai/dsh-tools'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { FLOWLEAP_MCP_PREFIX } from './connectors.ts'
import { fileNameProblem, newAgentId, type AgentDefinition } from './definition.ts'
import { extractText } from './extract.ts'
import { AgentIndex, type LocationRow, type SearchHit } from './index-db.ts'
import { agentMode, renderContextFiles, renderInstructions, renderSearchFiles } from './mode.ts'
import {
  FILES_DIR, FileTooLargeError, INDEX_SQLITE, hashFile, listFiles, readAgentFolders, removeAgentFolder, storeUpload, writeAgentFolder,
  type AgentFolder, type StoredFile,
} from './store.ts'
import { READ_AGENT_FILE_NAME, SEARCH_AGENT_FILES_NAME } from './tools.ts'
import {
  CONNECTOR_CHOICE_IDS, type AgentFileView, type AgentId, type AgentMode, type AgentSummary, type AgentView,
  type ConnectorChoice, type ConnectorChoiceId,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The agents of this Host and the agent preset of each. */
    flowleapAgentCatalog: AgentCatalog
  }
}

/** Package subpath of the per-agent preset row. */
export const AGENT_ROW_MODULE = '@deepseek-ai/dsh-flowleap-agent-builder/agent'

/** The resolved settings of the catalog. */
export interface CatalogOptions {
  /** The writable agents root. */
  readonly root: string
  /** The read-only firm agents root, if any. */
  readonly firmRoot?: string
  /** Largest indexed text, in estimated tokens, that the context mode puts into the system prompt. */
  readonly contextLimitTokens: number
  /** Largest upload, in bytes. */
  readonly maxFileBytes: number
  /** The preset whose plugin list each agent preset copies. */
  readonly basePreset: string
  /** Roster order of the agent presets. */
  readonly presetOrder: number
  /** Most hits one `search_agent_files` call returns. */
  readonly maxSearchResults: number
  /** Most pages one `read_agent_file` call returns. */
  readonly maxReadLocations: number
}

/** What the per-agent row composes for one revision of an agent. */
export interface AgentRevision {
  /** Agent id. */
  readonly id: AgentId
  /** The instructions section text. */
  readonly instructionsText: string
  /** The files section text; absent when the agent has no indexed file. */
  readonly filesText?: string
  /** The mode at this revision. */
  readonly mode: AgentMode
  /** The chosen connectors. */
  readonly connectors: readonly ConnectorChoiceId[]
}

interface LoadedAgent {
  folder: AgentFolder
  readonly index: AgentIndex
}

/** Service owning the agent folders, their indexes and their presets. */
export class AgentCatalog extends Service {
  static inject = ['agentPresets']

  private readonly agents = new Map<AgentId, LoadedAgent>()
  private readonly presets = new Map<AgentId, Promise<(() => Promise<void>) | undefined>>()
  private readonly work = new Set<Promise<void>>()
  private readonly abort = new AbortController()
  private started = false
  private waitingReported = false
  private readonly loaded: Promise<void>

  /**
   * @param ctx - Host context carrying `agentPresets`.
   * @param options - the resolved settings.
   */
  constructor(ctx: Context, readonly options: CatalogOptions) {
    super(ctx, 'flowleapAgentCatalog')
    // A microtask later, so the service is provided before the folders load; Service.init waits for the load.
    this.loaded = Promise.resolve().then(async () => {
      await this.load(this.options.root, false)
      if (this.options.firmRoot !== undefined) await this.load(this.options.firmRoot, true)
    })
  }

  protected async [Service.init](): Promise<void> {
    this.ctx.effect(() => () => this.close(), 'flowleap-agent-builder: agents')
    await this.loaded
    this.ctx.on('agent-preset/roster-changed', () => { this.start() })
    this.start()
  }

  /**
   * Settles when the agent folders are loaded; the Remote waits for it before its first answer.
   * @returns the load.
   */
  ready(): Promise<void> {
    return this.loaded
  }

  private async load(root: string, readOnly: boolean): Promise<void> {
    const { agents, problems } = await readAgentFolders(root, readOnly)
    for (const problem of problems) this.ctx.logger.warn(`flowleap agent ${problem.dir} not loaded: ${problem.message}`)
    for (const folder of agents) {
      const taken = this.agents.get(folder.id)
      if (taken !== undefined) {
        this.ctx.logger.warn(`flowleap agent ${folder.dir} not loaded: the id ${folder.id} is already taken by ${taken.folder.dir}`)
        continue
      }
      const indexPath = this.indexPath(folder)
      await mkdir(join(indexPath, '..'), { recursive: true, mode: 0o700 })
      const agent: LoadedAgent = { folder, index: AgentIndex.open(indexPath) }
      this.agents.set(folder.id, agent)
      this.track(this.reconcile(agent))
    }
  }

  /** A firm agent keeps its derived index below the writable root, so this Host never writes in the firm folder. */
  private indexPath(folder: AgentFolder): string {
    return folder.readOnly ? join(this.options.root, '.firm', folder.id, INDEX_SQLITE) : join(folder.dir, INDEX_SQLITE)
  }

  /** Index each file whose content the index has not read, and drop index rows of removed files. */
  private async reconcile(agent: LoadedAgent): Promise<void> {
    const names = await listFiles(agent.folder.dir)
    for (const file of agent.index.files()) {
      if (!names.includes(file.name)) agent.index.remove(file.name)
    }
    for (const name of names) {
      const stored = await hashFile(join(agent.folder.dir, FILES_DIR, name))
      const entry = agent.index.entry(name)
      if (entry !== undefined && entry.sha256 === stored.sha256 && entry.state !== 'indexing') continue
      await this.indexFile(agent, name, stored)
    }
  }

  private track(work: Promise<void>): void {
    const tracked = work.catch((error: unknown) => {
      this.ctx.logger.warn(`flowleap agents: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => { this.work.delete(tracked) })
    this.work.add(tracked)
  }

  private async close(): Promise<void> {
    this.abort.abort()
    // A failed load already rejected Service.init; close releases what the load opened.
    await this.loaded.catch(() => undefined)
    this.started = false
    await Promise.all([...this.work])
    await Promise.all([...this.presets.values()].map(async (tail) => { await (await tail)?.() }))
    this.presets.clear()
    for (const agent of this.agents.values()) agent.index.close()
    this.agents.clear()
  }

  /** Register every agent preset once the base preset is on the roster. */
  private start(): void {
    if (this.started || this.abort.signal.aborted) return
    if (this.ctx.agentPresets.definition(this.options.basePreset) === undefined) {
      if (!this.waitingReported) {
        this.waitingReported = true
        this.ctx.logger.warn(`flowleap agents: waiting for the base preset "${this.options.basePreset}"; no agent preset is registered until it is declared`)
      }
      return
    }
    this.started = true
    for (const id of this.agents.keys()) void this.refresh(id)
  }

  /**
   * Replace the preset of one agent with its current revision, or remove it when the agent is gone. Calls for one agent
   * run in order.
   */
  private refresh(id: AgentId): Promise<unknown> {
    if (!this.started) return Promise.resolve()
    const previous = this.presets.get(id) ?? Promise.resolve(undefined)
    const next = previous.then(async (dispose) => {
      await dispose?.()
      const agent = this.agents.get(id)
      const base = this.ctx.agentPresets.definition(this.options.basePreset)
      if (agent === undefined || base === undefined || !this.started) return undefined
      return await this.ctx.agentPresets.register(this.presetOf(agent, base))
    }).catch((error: unknown) => {
      this.ctx.logger.warn(`flowleap agent ${id}: preset not registered: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    })
    this.presets.set(id, next)
    return next
  }

  private presetOf(agent: LoadedAgent, base: PresetDefinition): PresetDefinition {
    const { id } = agent.folder
    return {
      id,
      name: agent.folder.definition.name,
      description: agent.folder.definition.description,
      order: this.options.presetOrder,
      plugins: [...base.plugins, { id: 'flowleap-agent', name: AGENT_ROW_MODULE, config: {
        agent: id, maxSearchResults: this.options.maxSearchResults, maxReadLocations: this.options.maxReadLocations,
      } }],
    }
  }

  private emit(): void {
    this.ctx.emit('flowleap-agents/changed')
  }

  private get(id: AgentId): LoadedAgent {
    const agent = this.agents.get(id)
    if (agent === undefined) throw new RemoteError('flowleap-agents/not-found', `No agent has the id ${id}`, { id })
    return agent
  }

  private writable(id: AgentId): LoadedAgent {
    const agent = this.get(id)
    if (agent.folder.readOnly) throw new RemoteError('flowleap-agents/read-only', `The agent ${id} belongs to the firm folder and cannot be changed here`, { id })
    return agent
  }

  /**
   * The current revision of one agent for its preset row.
   * @param id - the agent.
   * @returns the revision.
   * @throws RemoteError `flowleap-agents/not-found` for an unknown agent.
   */
  revision(id: AgentId): AgentRevision {
    const agent = this.get(id)
    const mode = this.modeOf(agent)
    const indexed = agent.index.files().filter(file => file.state.kind === 'indexed').map(file => file.name)
    const filesText = indexed.length === 0
      ? undefined
      : mode === 'context'
        ? renderContextFiles(agent.index.allText())
        : renderSearchFiles(indexed, SEARCH_AGENT_FILES_NAME, READ_AGENT_FILE_NAME)
    return {
      id,
      instructionsText: renderInstructions(agent.folder.definition.name, agent.folder.instructions),
      ...filesText === undefined ? {} : { filesText },
      mode,
      connectors: agent.folder.definition.connectors,
    }
  }

  private modeOf(agent: LoadedAgent): AgentMode {
    return agentMode(agent.index.indexedChars(), this.options.contextLimitTokens)
  }

  /**
   * Search one agent's indexed files.
   * @param id - the agent.
   * @param query - the words.
   * @param limit - most hits.
   * @returns hits, best first.
   */
  search(id: AgentId, query: string, limit: number): SearchHit[] {
    return this.get(id).index.search(query, limit)
  }

  /**
   * Read locations of one file of one agent.
   * @param id - the agent.
   * @param file - the file name.
   * @param from - first location.
   * @param to - last location, inclusive.
   * @returns the locations and the location count, or undefined for an unknown file.
   */
  readFile(id: AgentId, file: string, from: number, to: number): { readonly rows: LocationRow[]; readonly total: number } | undefined {
    return this.get(id).index.read(file, from, to)
  }

  /**
   * Every agent, by name.
   * @returns the summaries.
   */
  list(): AgentSummary[] {
    return [...this.agents.values()].map(agent => this.summary(agent))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  private summary(agent: LoadedAgent): AgentSummary {
    const { id, readOnly, definition } = agent.folder
    return { id, name: definition.name, description: definition.description, readOnly }
  }

  /**
   * One agent with its fields, files and mode.
   * @param id - the agent.
   * @returns the view.
   * @throws RemoteError `flowleap-agents/not-found` for an unknown agent.
   */
  read(id: AgentId): AgentView {
    const agent = this.get(id)
    return {
      ...this.summary(agent),
      instructions: agent.folder.instructions,
      connectors: agent.folder.definition.connectors,
      files: agent.index.files(),
      mode: this.modeOf(agent),
    }
  }

  /**
   * The connector rows an agent can choose, each with whether it can answer on this Host.
   * @returns one row per choice.
   */
  async connectors(): Promise<ConnectorChoice[]> {
    const presence = await this.ctx.get('flowleapConnectors')?.describe()
    const flowleap = this.ctx.get('tools')?.definitions().some(definition => definition.name.startsWith(FLOWLEAP_MCP_PREFIX)) ?? false
    return CONNECTOR_CHOICE_IDS.map(id => ({ id, configured: id === 'flowleap' ? flowleap : presence?.[id]?.configured === true }))
  }

  /**
   * Create an agent or change one. The caller validated the fields.
   * @param id - the agent to change, or undefined to create one.
   * @param definition - the `agent.yaml` fields.
   * @param instructions - the instructions.
   * @returns the agent after the change.
   * @throws RemoteError `flowleap-agents/not-found` or `flowleap-agents/read-only` for an id that cannot change.
   */
  async save(id: AgentId | undefined, definition: AgentDefinition, instructions: string): Promise<AgentView> {
    if (id !== undefined) {
      const agent = this.writable(id)
      await writeAgentFolder(agent.folder.dir, definition, instructions)
      agent.folder = { ...agent.folder, definition, instructions }
      void this.refresh(id)
      this.emit()
      return this.read(id)
    }
    let created = newAgentId(definition.name)
    while (this.agents.has(created)) created = newAgentId(definition.name)
    const dir = join(this.options.root, created)
    await writeAgentFolder(dir, definition, instructions)
    const folder: AgentFolder = { id: created, dir, readOnly: false, definition, instructions }
    this.agents.set(created, { folder, index: AgentIndex.open(this.indexPath(folder)) })
    await this.refresh(created)
    this.emit()
    return this.read(created)
  }

  /**
   * Delete one agent: its preset, its index and its folder.
   * @param id - the agent.
   * @throws RemoteError `flowleap-agents/not-found` or `flowleap-agents/read-only`.
   */
  async delete(id: AgentId): Promise<void> {
    const agent = this.writable(id)
    this.agents.delete(id)
    await this.refresh(id)
    this.presets.delete(id)
    agent.index.close()
    await removeAgentFolder(agent.folder.dir)
    this.emit()
  }

  /**
   * Remove one file of one agent.
   * @param id - the agent.
   * @param name - the file name.
   * @throws RemoteError `flowleap-agents/not-found` or `flowleap-agents/read-only`.
   */
  async removeFile(id: AgentId, name: string): Promise<void> {
    const agent = this.writable(id)
    if (fileNameProblem(name) !== undefined) throw new RemoteError('flowleap-agents/invalid', `"${name}" is not a file name of this agent`, { field: 'name', reason: 'unknown file' })
    agent.index.remove(name)
    await rm(join(agent.folder.dir, FILES_DIR, name), { force: true })
    void this.refresh(id)
    this.emit()
  }

  /**
   * Store one uploaded file, then index it in the background. A file with the content the index already read is not
   * read again.
   * @param id - the agent.
   * @param name - the file name.
   * @param chunks - the request body.
   * @returns the file as stored, in its state after the upload.
   * @throws RemoteError `flowleap-agents/invalid` for a refused name or a body larger than the limit.
   */
  async upload(id: AgentId, name: string, chunks: AsyncIterable<Uint8Array>): Promise<AgentFileView> {
    const agent = this.writable(id)
    const problem = fileNameProblem(name)
    if (problem !== undefined) {
      const reason = problem === 'type' ? 'only PDF, DOCX, TXT and MD files are accepted' : 'the name must be a plain file name'
      throw new RemoteError('flowleap-agents/invalid', `"${name}": ${reason}`, { field: 'name', reason })
    }
    let stored: StoredFile
    try {
      stored = await storeUpload(join(agent.folder.dir, FILES_DIR, name), chunks, this.options.maxFileBytes)
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        throw new RemoteError('flowleap-agents/invalid', `"${name}": ${error.message}`, { field: 'file', reason: 'too large' })
      }
      throw error
    }
    const entry = agent.index.entry(name)
    if (entry?.sha256 !== stored.sha256 || entry.state === 'indexing') {
      agent.index.begin(name, stored.bytes, stored.sha256)
      this.track(this.indexFile(agent, name, stored, true))
    }
    this.emit()
    return agent.index.files().find(file => file.name === name)
      ?? { name, bytes: stored.bytes, state: { kind: 'indexing' }, locations: 0, unit: 'page' }
  }

  /** Read one stored file once and record the outcome; `begun` when the caller already started the lifecycle. */
  private async indexFile(agent: LoadedAgent, name: string, stored: StoredFile, begun = false): Promise<void> {
    if (!begun) {
      agent.index.begin(name, stored.bytes, stored.sha256)
      this.emit()
    }
    const bytes = new Uint8Array(await readFile(join(agent.folder.dir, FILES_DIR, name)))
    const extraction = await extractText(name, bytes, this.ctx.get('flowleapOcr'), this.abort.signal)
    if (this.abort.signal.aborted || this.agents.get(agent.folder.id) !== agent) return
    if (!agent.index.complete(name, stored.sha256, extraction)) return
    void this.refresh(agent.folder.id)
    this.emit()
  }

  /**
   * Wait until every upload read and preset change started so far has settled.
   * @returns settles when the background work is done.
   */
  async settled(): Promise<void> {
    await this.loaded
    while (this.work.size > 0) await Promise.all([...this.work])
    await Promise.all([...this.presets.values()])
  }
}
