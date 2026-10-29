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
import { AgentFormController, type AgentBuilderDeps, type AgentUploadResult } from '../src/client/form-store.ts'
import { NewAgentMenuItem } from '../src/client/NewAgentMenuItem.tsx'
import type { AgentFormDialogInjected } from '../src/client/AgentFormDialog.tsx'
import type { EditAgentMenuItemInjected } from '../src/client/EditAgentMenuItem.tsx'
import type { NewAgentMenuItemInjected } from '../src/client/NewAgentMenuItem.tsx'
import { apply as nodeApply } from '../src/index.ts'
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
    upload: vi.fn(() => Promise.resolve<AgentUploadResult>({ ok: true })),
  }
  return { ...base, ...overrides }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const refused = <T,>(message: string): Promise<RemoteResult<T>> =>
  Promise.resolve({ ok: false, error: new RemoteError('flowleap-agents/not-found', message, { id: ID }) })

const indexed = (name: string) => ({ name, bytes: 1, state: { kind: 'indexed' as const }, locations: 1, unit: 'page' as const })

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
    const failing = deps({ upload: vi.fn(() => Promise.resolve<AgentUploadResult>({ ok: false, error: 'too-large' })) })
    const second = new AgentFormController(failing)
    second.openCreate()
    second.edit({ name: 'x', instructions: 'y' })
    second.addFiles([file('big.pdf')])
    await second.save()
    expect(second.state.getSnapshot()).toMatchObject({ mode: 'edit', busy: false, error: { kind: 'upload', file: 'big.pdf', reason: 'too-large' } })
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

  it('closes after Save changes without new files, and stays open on the agent while new files upload', async () => {
    const d = deps()
    const form = new AgentFormController(d)
    await form.openEdit(ID)
    form.edit({ instructions: 'Work harder.' })
    await form.save()
    expect(d.save).toHaveBeenCalledWith({ id: ID, name: 'Responder', description: 'Drafts.', instructions: 'Work harder.', connectors: ['epo-ops'] })
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
    await form.openEdit(ID)
    form.addFiles([file('a.pdf')])
    vi.mocked(d.read).mockReturnValue(ok(view({ files: [{ name: 'a.pdf', bytes: 3, state: { kind: 'indexing' }, locations: 0, unit: 'page' }] })))
    await form.save()
    expect(d.upload).toHaveBeenCalledWith(ID, expect.any(File))
    expect(form.state.getSnapshot()).toMatchObject({ kind: 'open', mode: 'edit', busy: false, draft: { files: [{ name: 'a.pdf', state: 'indexing' }] } })
  })

  it('ignores form actions while the form is closed, and Delete before the first Save', async () => {
    const d = deps()
    const form = new AgentFormController(d)
    form.edit({ name: 'x' })
    form.toggleConnector('epo-ops', true)
    form.addFiles([file('a.pdf')])
    form.requestDelete()
    await form.removeFile('a.pdf')
    await form.save()
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
    form.openCreate()
    await form.confirmDelete()
    expect(d.save).not.toHaveBeenCalled()
    expect(d.removeFile).not.toHaveBeenCalled()
    expect(d.delete).not.toHaveBeenCalled()
  })

  it('shows read and remove errors from the Host, clears a connector, and cancels the delete confirmation', async () => {
    const form = new AgentFormController(deps({ connectors: vi.fn(() => refused<never>('connectors unavailable')) }))
    form.openCreate()
    await settle()
    expect(form.state.getSnapshot()).toMatchObject({ error: { kind: 'load', detail: 'connectors unavailable' } })
    const missing = new AgentFormController(deps({ read: vi.fn(() => refused<AgentView>('no agent')) }))
    await missing.openEdit(ID)
    expect(missing.state.getSnapshot()).toMatchObject({ busy: false, error: { kind: 'load', detail: 'no agent' } })
    const d = deps({ read: vi.fn(() => ok(view({ files: [indexed('old.txt')] }))), removeFile: vi.fn(() => refused<undefined>('gone')) })
    const editing = new AgentFormController(d)
    await editing.openEdit(ID)
    await settle()
    editing.toggleConnector('epo-ops', false)
    expect(editing.state.getSnapshot()).toMatchObject({ draft: { connectors: [] } })
    await editing.removeFile('old.txt')
    expect(editing.state.getSnapshot()).toMatchObject({ error: { kind: 'save', detail: 'gone' }, draft: { files: [{ name: 'old.txt' }] } })
    editing.requestDelete()
    editing.cancelDelete()
    expect(editing.state.getSnapshot()).toMatchObject({ confirmingDelete: false })
  })

  it('keeps files waiting for Save beside the Host files when the Host reports a change', async () => {
    const d = deps({ read: vi.fn(() => ok(view({ files: [indexed('old.txt')] }))) })
    const form = new AgentFormController(d)
    await form.openEdit(ID)
    form.addFiles([file('new.pdf'), file('old.txt')])
    form.changed()
    await settle()
    expect(form.state.getSnapshot()).toMatchObject({ draft: { files: [{ name: 'old.txt', state: 'indexed' }, { name: 'new.pdf', state: 'pending' }] } })
    vi.mocked(d.read).mockReturnValue(refused('no agent'))
    form.changed()
    await settle()
    expect(form.state.getSnapshot()).toMatchObject({ error: null, draft: { files: [{ name: 'old.txt' }, { name: 'new.pdf' }] } })
  })

  it('keeps the last agent list when a read fails', async () => {
    const d = deps()
    const form = new AgentFormController(d)
    await form.loadAgents()
    vi.mocked(d.list).mockReturnValue(refused('offline'))
    await form.loadAgents()
    expect(form.agents.getSnapshot()).toMatchObject([{ id: ID, name: 'Responder' }])
  })

  it('drops a Host answer that arrives after the form closed', async () => {
    const removal = deferred<RemoteResult<void>>()
    const remover = new AgentFormController(deps({ read: vi.fn(() => ok(view({ files: [indexed('old.txt')] }))), removeFile: vi.fn(() => removal.promise) }))
    await remover.openEdit(ID)
    const removing = remover.removeFile('old.txt')
    remover.close()
    removal.resolve({ ok: true, value: undefined })
    await removing
    expect(remover.state.getSnapshot()).toEqual({ kind: 'closed' })
    const read = deferred<RemoteResult<AgentView>>()
    const save = deferred<RemoteResult<AgentView>>()
    const upload = deferred<AgentUploadResult>()
    const d = deps({ read: vi.fn(() => read.promise), save: vi.fn(() => save.promise), upload: vi.fn(() => upload.promise) })
    const form = new AgentFormController(d)
    const opening = form.openEdit(ID)
    form.close()
    read.resolve({ ok: true, value: view() })
    await opening
    form.changed()
    await settle()
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
    form.openCreate()
    form.edit({ name: 'x', instructions: 'y' })
    const saving = form.save()
    await form.save()
    form.close()
    save.resolve({ ok: true, value: view() })
    await saving
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
    form.openCreate()
    form.edit({ name: 'x', instructions: 'y' })
    form.addFiles([file('a.pdf')])
    vi.mocked(d.save).mockReturnValue(ok(view()))
    const uploading = form.save()
    await settle()
    form.close()
    upload.resolve({ ok: true })
    await uploading
    expect(form.state.getSnapshot()).toEqual({ kind: 'closed' })
    expect(d.save).toHaveBeenCalledTimes(2)
  })

  it('leaves the form ready for another Save when a dependency rejects', async () => {
    const d = deps({ save: vi.fn(() => Promise.reject(new Error('flowleapAgents.save is not mounted'))) })
    const form = new AgentFormController(d)
    form.openCreate()
    form.edit({ name: 'x', instructions: 'y' })
    await expect(form.save()).rejects.toThrow('flowleapAgents.save is not mounted')
    expect(form.state.getSnapshot()).toMatchObject({ kind: 'open', busy: false })
    vi.mocked(d.save).mockReturnValue(ok(view()))
    await form.save()
    expect(form.state.getSnapshot()).toMatchObject({ mode: 'edit', id: ID, busy: false })
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

  it('names the file and the reason when an upload fails', async () => {
    const form = new AgentFormController(deps({ upload: vi.fn(() => Promise.resolve<AgentUploadResult>({ ok: false, error: 'type' })) }))
    form.openCreate()
    form.edit({ name: 'Responder', instructions: 'Work.' })
    form.addFiles([file('notes.odt')])
    await form.save()
    render(<AgentFormDialog {...callbacks(form)} />)
    expect(screen.getByRole('alert').textContent).toBe('Cannot upload notes.odt: only PDF, DOCX, TXT and MD files are accepted.')
    expect(screen.getByText('Uploads on save')).toBeTruthy()
  })

  it('marks the drop area while files are dragged over it, and opens the file chooser from choose files', () => {
    const form = new AgentFormController(deps())
    form.openCreate()
    const { container } = render(<AgentFormDialog {...callbacks(form)} />)
    const zone = screen.getByText('choose files').closest('div')!
    const idle = zone.className
    fireEvent.dragOver(zone)
    expect(zone.className).not.toBe(idle)
    fireEvent.dragLeave(zone)
    expect(zone.className).toBe(idle)
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type=file]')!
    const choose = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'choose files' }))
    expect(choose).toHaveBeenCalled()
  })

  it('closes the preset menu and opens an empty form from New agent', () => {
    const onDismiss = vi.fn()
    const openCreate = vi.fn()
    render(<NewAgentMenuItem {...standard} t={t} onDismiss={onDismiss} currentId="patent" openCreate={openCreate} />)
    fireEvent.click(screen.getByText('New agent'))
    expect(onDismiss).toHaveBeenCalled()
    expect(openCreate).toHaveBeenCalled()
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

it('registers nothing in the node half', () => {
  expect(() => { nodeApply() }).not.toThrow()
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
        await useInjectedEntries(ctx, d)
      }
      await fiber.dispose()
      expect(ctx.slots.entries('agentPreset.menu.actions')).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('posts a file to the upload route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ ok: true, value: { name: 'a b.pdf' } }))
    expect(await uploadAgentFile(ID, file('a b.pdf'))).toEqual({ ok: true })
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${AGENT_UPLOAD_ROUTE}?agent=${ID}&name=a+b.pdf`)
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'content-type': 'application/octet-stream' } })
    fetchSpy.mockRestore()
  })

  const refusal = (code: string, details: unknown) => Response.json({ ok: false, error: { code, message: 'refused', details } })
  it.each([
    ['too-large', refusal('flowleap-agents/invalid', { field: 'file', reason: 'too large' })],
    ['type', refusal('flowleap-agents/invalid', { field: 'name', reason: 'type' })],
    ['storage-low', refusal('flowleap-agents/invalid', { field: 'file', reason: 'storage low' })],
    ['refused', refusal('flowleap-agents/invalid', { field: 'name', reason: 'path' })],
    ['refused', refusal('flowleap-agents/invalid', null)],
    ['refused', refusal('flowleap-agents/read-only', { id: ID })],
    ['server', new Response('forbidden', { status: 403 })],
    ['server', new Response('<html>', { status: 200 })],
    ['server', Response.json(null)],
    ['server', Response.json({ ok: true })],
    ['server', Response.json({ ok: 'yes' })],
    ['server', Response.json({ ok: false, error: 'refused' })],
    ['server', Response.json({ ok: false, error: { code: 7 } })],
  ] as const)('reports a %s failure for an upload answer', async (error, response) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)
    expect(await uploadAgentFile(ID, file('a.pdf'))).toEqual({ ok: false, error })
    fetchSpy.mockRestore()
  })

  it('reports a network failure when the request does not reach the Host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    expect(await uploadAgentFile(ID, file('a.pdf'))).toEqual({ ok: false, error: 'network' })
    fetchSpy.mockRestore()
  })
})

/** Drive the registered rows and form the way the attorney does, and check what the Remote receives. */
async function useInjectedEntries(ctx: Context, d: AgentBuilderDeps): Promise<void> {
  const [newRow, editRow] = ctx.slots.entries('agentPreset.menu.actions')
  const newAgent: Partial<NewAgentMenuItemInjected> | undefined = newRow?.inject?.()
  const editAgent: Partial<EditAgentMenuItemInjected> | undefined = editRow?.inject?.()
  const overlay: Partial<AgentFormDialogInjected> | undefined = ctx.slots.entries('shell.overlay')[0]?.inject?.()
  if (newAgent?.openCreate === undefined || editAgent?.openEdit === undefined || editAgent.hooks === undefined
    || overlay?.hooks === undefined || overlay.save === undefined || overlay.removeFile === undefined
    || overlay.confirmDelete === undefined || overlay.close === undefined) {
    throw new Error('expected the injected rows and form')
  }
  expect(editAgent.hooks.agents.getSnapshot()).toMatchObject([{ id: ID }])
  newAgent.openCreate()
  expect(overlay.hooks.agentForm.getSnapshot()).toMatchObject({ kind: 'open', mode: 'create' })
  overlay.close()
  vi.mocked(d.read).mockReturnValue(ok(view({ files: [{ name: 'old.txt', bytes: 1, state: { kind: 'indexed' }, locations: 1, unit: 'page' }] })))
  await editAgent.openEdit(ID)
  expect(d.connectors).toHaveBeenCalled()
  await overlay.removeFile('old.txt')
  expect(d.removeFile).toHaveBeenCalledWith(ID, 'old.txt')
  await overlay.confirmDelete()
  expect(d.delete).toHaveBeenCalledWith(ID)
  await editAgent.openEdit(ID)
  await overlay.save()
  expect(d.save).toHaveBeenCalledWith({ id: ID, name: 'Responder', description: 'Drafts.', instructions: 'Work.', connectors: ['epo-ops'] })
  expect(overlay.hooks.agentForm.getSnapshot()).toEqual({ kind: 'closed' })
}
