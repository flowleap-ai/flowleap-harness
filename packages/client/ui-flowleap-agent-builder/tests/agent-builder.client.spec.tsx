// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess, bindSnapshotSelector, makeTranslate, RemoteError, StaticRemoteAccess, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { AGENT_UPLOAD_PATH, type AgentId, type AgentSummary, type AgentView } from '@deepseek-ai/dsh-flowleap-agent-builder/types'
import { AGENT_UPLOAD_ROUTE, apply, inject, uploadAgentFile } from '../src/client/index.ts'
import { AgentFormDialog, type AgentFormDialogProps } from '../src/client/AgentFormDialog.tsx'
import { EditAgentMenuItem, type EditAgentMenuItemProps } from '../src/client/EditAgentMenuItem.tsx'
import { AgentFormController, type AgentBuilderDeps } from '../src/client/form-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(en)
const hook = <T,>(value: T) => <R,>(select: (state: T) => R): R => select(value)
const sessions: SessionListState = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
const workspaces: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }
/** The global standard seat every root-scope entry receives. */
const standard: GlobalStandardProps = {
  useSessions: hook(sessions),
  useSessionStatus: hook(new Map()),
  useSessionRetainInfo: () => undefined,
  usePanelInfo: hook({ activePanelId: null }),
  useResource: () => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} }),
  useWorkspaces: hook(workspaces),
  ...allowAllAccess,
}
const ID = 'responder-a1b2c3' as AgentId
const ok = <T,>(value: T): Promise<RemoteResult<T>> => Promise.resolve({ ok: true, value })

function view(patch: Partial<AgentView> = {}): AgentView {
  return {
    id: ID, name: 'Responder', description: 'Drafts.', readOnly: false, instructions: 'Work.', connectors: ['epo-ops'],
    files: [], mode: 'context', ...patch,
  }
}

function deps(overrides: Partial<AgentBuilderDeps> = {}) {
  const base: AgentBuilderDeps = {
    list: vi.fn(() => ok<AgentSummary[]>([{ id: ID, name: 'Responder', description: 'Drafts.', readOnly: false }])),
    read: vi.fn(() => ok(view())),
    connectors: vi.fn(() => ok([{ id: 'epo-ops' as const, configured: true }, { id: 'semantic-scholar' as const, configured: false }])),
    save: vi.fn(() => ok(view())),
    delete: vi.fn(() => ok(undefined)),
    removeFile: vi.fn(() => ok(undefined)),
    upload: vi.fn(() => Promise.resolve(undefined)),
  }
  return { ...base, ...overrides }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}

function file(name: string, text = 'abc'): File {
  return new File([text], name, { type: 'application/pdf' })
}

describe('agent form controller', () => {
  it('saves a new agent, then uploads each added file, and stays open on the saved agent', async () => {
    const d = deps({ read: vi.fn(() => ok(view({ files: [{ name: 'a.pdf', bytes: 3, state: { kind: 'indexing' }, locations: 0, unit: 'page' }] }))) })
    const form = new AgentFormController(d)
    form.openCreate()
    await settle()
    form.edit({ name: 'Responder', instructions: 'Work.' })
    form.toggleConnector('epo-ops', true)
    form.toggleConnector('semantic-scholar', true)
    form.addFiles([file('a.pdf')])
    expect(form.state.getSnapshot()).toMatchObject({ draft: { connectors: ['epo-ops'], files: [{ name: 'a.pdf', state: 'pending' }] } })
    await form.save()
    expect(d.save).toHaveBeenCalledWith({ name: 'Responder', description: '', instructions: 'Work.', connectors: ['epo-ops'] })
    expect(d.upload).toHaveBeenCalledWith(ID, expect.any(File))
    expect(form.state.getSnapshot()).toMatchObject({
      kind: 'open', mode: 'edit', id: ID, agentMode: 'context', busy: false, draft: { files: [{ name: 'a.pdf', state: 'indexing' }] },
    })
    vi.mocked(d.read).mockReturnValue(ok(view({ mode: 'search', files: [{ name: 'a.pdf', bytes: 3, state: { kind: 'indexed' }, locations: 2, unit: 'page' }] })))
    form.changed()
    await settle()
    expect(form.state.getSnapshot()).toMatchObject({ agentMode: 'search', draft: { files: [{ name: 'a.pdf', state: 'indexed' }] } })
  })

  it('keeps the draft and shows the Host error when Save fails, and stops at a failed upload', async () => {
    const d = deps({ save: vi.fn(() => Promise.resolve<RemoteResult<AgentView>>({ ok: false, error: new RemoteError('flowleap-agents/invalid', 'name: too long', { field: 'name', reason: 'too long' }) })) })
    const form = new AgentFormController(d)
    form.openCreate()
    form.edit({ name: 'x', instructions: 'y' })
    await form.save()
    expect(form.state.getSnapshot()).toMatchObject({ mode: 'create', busy: false, error: { kind: 'save', detail: 'name: too long' }, draft: { name: 'x' } })
    const failing = deps({ upload: vi.fn(() => Promise.resolve('too large')) })
    const second = new AgentFormController(failing)
    second.openCreate()
    second.edit({ name: 'x', instructions: 'y' })
    second.addFiles([file('big.pdf')])
    await second.save()
    expect(second.state.getSnapshot()).toMatchObject({ mode: 'edit', error: { kind: 'upload', detail: 'big.pdf: too large' } })
  })

  it('opens an existing agent, removes an uploaded file on the Host and a pending file locally, and deletes after confirmation', async () => {
    const d = deps({ read: vi.fn(() => ok(view({ files: [{ name: 'old.txt', bytes: 1, state: { kind: 'indexed' }, locations: 1, unit: 'page' }] }))) })
    const form = new AgentFormController(d)
    await form.openEdit(ID)
    expect(form.state.getSnapshot()).toMatchObject({ mode: 'edit', id: ID, draft: { name: 'Responder', files: [{ name: 'old.txt' }] } })
    form.addFiles([file('new.md')])
    await form.removeFile('new.md')
    expect(d.removeFile).not.toHaveBeenCalled()
    await form.removeFile('old.txt')
    expect(d.removeFile).toHaveBeenCalledWith(ID, 'old.txt')
    expect(form.state.getSnapshot()).toMatchObject({ draft: { files: [] } })
    form.requestDelete()
    expect(form.state.getSnapshot()).toMatchObject({ confirmingDelete: true })
    await form.confirmDelete()
    expect(d.delete).toHaveBeenCalledWith(ID)
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
  })
})

describe('agent builder surfaces', () => {
  const callbacks = (form: AgentFormController): AgentFormDialogProps => ({
    ...standard,
    useAgentForm: bindSnapshotSelector(form.state), close: form.close, edit: form.edit, toggleConnector: form.toggleConnector,
    addFiles: form.addFiles, removeFile: form.removeFile, save: form.save, requestDelete: form.requestDelete,
    cancelDelete: form.cancelDelete, confirmDelete: form.confirmDelete, t,
  })

  it('shows the mode line, a disabled connector without a key, and the delete confirmation', async () => {
    const form = new AgentFormController(deps())
    await form.openEdit(ID)
    await settle()
    render(<AgentFormDialog {...callbacks(form)} />)
    expect(screen.getByText('All files in context')).toBeTruthy()
    expect(screen.getByText('Not configured. An administrator adds the key in Settings.')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Semantic Scholar' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }))
    expect(screen.getByText('Delete Responder?')).toBeTruthy()
  })

  it('creates an agent from typed fields, a chosen file and a connector', async () => {
    const d = deps()
    const form = new AgentFormController(d)
    form.openCreate()
    await settle()
    const { container } = render(<AgentFormDialog {...callbacks(form)} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Responder' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Drafts.' } })
    fireEvent.change(screen.getByLabelText('Instructions'), { target: { value: 'Work.' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'EPO OPS' }))
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type=file]')
    if (input === null) throw new Error('no file input')
    fireEvent.change(input, { target: { files: [file('a.pdf')] } })
    expect(screen.getByText('Uploads on save')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.pdf' }))
    await settle()
    fireEvent.drop(screen.getByText('choose files').closest('div')!, { dataTransfer: { files: [file('b.md')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }))
    await settle()
    expect(d.save).toHaveBeenCalledWith({ name: 'Responder', description: 'Drafts.', instructions: 'Work.', connectors: ['epo-ops'] })
    expect(d.upload).toHaveBeenCalledTimes(1)
    expect(screen.getByText('All files in context')).toBeTruthy()
  })

  it('deletes after the acknowledgement and shows a Host error', async () => {
    const d = deps({ delete: vi.fn(() => Promise.resolve<RemoteResult<void>>({ ok: false, error: new RemoteError('flowleap-agents/read-only', 'firm agent', { id: ID }) })) })
    const form = new AgentFormController(d)
    await form.openEdit(ID)
    render(<AgentFormDialog {...callbacks(form)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'I understand that this cannot be undone' }))
    const confirm = screen.getAllByRole('button', { name: 'Delete agent' }).at(-1)!
    fireEvent.click(confirm)
    await settle()
    expect(d.delete).toHaveBeenCalledWith(ID)
    expect(screen.getByRole('alert').textContent).toBe('Cannot delete the agent: firm agent')
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!)
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
  })

  it('offers Edit agent only for a chosen agent that the user owns', async () => {
    const form = new AgentFormController(deps({
      list: vi.fn(() => ok<AgentSummary[]>([
        { id: ID, name: 'Responder', description: '', readOnly: false },
        { id: 'firm-guide' as AgentId, name: 'Firm guide', description: '', readOnly: true },
      ])),
    }))
    await form.loadAgents()
    const props: Omit<EditAgentMenuItemProps, 'currentId'> = { ...standard, t, onDismiss: vi.fn(), useAgents: bindSnapshotSelector(form.agents), openEdit: vi.fn(() => Promise.resolve()) }
    const { rerender, container } = render(<EditAgentMenuItem {...props} currentId={ID} />)
    expect(screen.getByText('Edit Responder')).toBeTruthy()
    fireEvent.click(screen.getByText('Edit Responder'))
    expect(props.onDismiss).toHaveBeenCalled()
    expect(props.openEdit).toHaveBeenCalledWith(ID)
    rerender(<EditAgentMenuItem {...props} currentId="firm-guide" />)
    expect(container.textContent).toBe('')
    rerender(<EditAgentMenuItem {...props} currentId="patent" />)
    expect(container.textContent).toBe('')
  })
})

it('restates the Host upload route as a document-relative path', () => {
  expect(`/${AGENT_UPLOAD_ROUTE}`).toBe(AGENT_UPLOAD_PATH)
})

class RemoteStub extends Service {
  readonly listeners = new Map<string, () => void>()
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  $on(event: string, listener: () => void): () => void {
    this.listeners.set(event, listener)
    return () => { this.listeners.delete(event) }
  }
}

describe('browser half', () => {
  it('registers the rows and the form while the Peer may read the agents, and reads again on a change', async () => {
    for (const allowed of [false, true]) {
      const ctx = new Context()
      await ctx.plugin(SlotRegistry).await()
      new StaticRemoteAccess(ctx, () => allowed)
      const remote = new RemoteStub(ctx)
      const d = deps()
      await ctx.plugin({ apply(provider: Context) { provider.provide('remote.flowleapAgents', d as never) } }).await()
      ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
      await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
      ctx.slots.register({
        name: 'root',
        children: { 'agentPreset.menu.actions': { kind: 'list', scope: 'root' }, 'shell.overlay': { kind: 'list', scope: 'root' } },
      } as never, () => null)
      const fiber = ctx.plugin({ inject: [...inject], apply })
      await fiber.await()
      await settle()
      expect(ctx.slots.entries('agentPreset.menu.actions')).toHaveLength(allowed ? 2 : 0)
      expect(ctx.slots.entries('shell.overlay')).toHaveLength(allowed ? 1 : 0)
      if (allowed) {
        await settle()
        remote.listeners.get('flowleap-agents/changed')?.()
        await settle()
        expect(d.list).toHaveBeenCalledTimes(2)
      }
      await fiber.dispose()
      expect(ctx.slots.entries('agentPreset.menu.actions')).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('posts a file to the upload route and reports the Host refusal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    fetchSpy.mockResolvedValueOnce(Response.json({ ok: true, value: {} }))
    expect(await uploadAgentFile(ID, file('a b.pdf'))).toBeUndefined()
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${AGENT_UPLOAD_ROUTE}?agent=${ID}&name=a+b.pdf`)
    fetchSpy.mockResolvedValueOnce(Response.json({ ok: false, error: { message: 'too large' } }))
    expect(await uploadAgentFile(ID, file('a.pdf'))).toBe('too large')
    fetchSpy.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    expect(await uploadAgentFile(ID, file('a.pdf'))).toBe('HTTP 403')
    fetchSpy.mockRestore()
  })
})
