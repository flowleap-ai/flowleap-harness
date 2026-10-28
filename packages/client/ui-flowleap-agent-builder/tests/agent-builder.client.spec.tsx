// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector, makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { AgentId, AgentSummary, AgentView } from '@deepseek-ai/dsh-flowleap-agent-builder/types'
import { AgentFormDialog } from '../src/client/AgentFormDialog.tsx'
import { EditAgentMenuItem } from '../src/client/EditAgentMenuItem.tsx'
import { AgentFormController, type AgentBuilderDeps } from '../src/client/form-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(en)
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
    const d = deps({ save: vi.fn(() => Promise.resolve<RemoteResult<AgentView>>({ ok: false, error: new RemoteError('flowleap-agents/invalid', 'name: too long', {}) })) })
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
  const callbacks = (form: AgentFormController) => ({
    useAgentForm: bindSnapshotSelector(form.state), close: form.close, edit: form.edit, toggleConnector: form.toggleConnector,
    addFiles: form.addFiles, removeFile: form.removeFile, save: form.save, requestDelete: form.requestDelete,
    cancelDelete: form.cancelDelete, confirmDelete: form.confirmDelete, t,
  })

  it('shows the mode line, a disabled connector without a key, and the delete confirmation', async () => {
    const form = new AgentFormController(deps())
    await form.openEdit(ID)
    await settle()
    render(<AgentFormDialog {...callbacks(form) as never} />)
    expect(screen.getByText('All files in context')).toBeTruthy()
    expect(screen.getByText('Not configured. An administrator adds the key in Settings.')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Semantic Scholar' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }))
    expect(screen.getByText('Delete Responder?')).toBeTruthy()
  })

  it('offers Edit agent only for a chosen agent that the user owns', async () => {
    const form = new AgentFormController(deps({
      list: vi.fn(() => ok<AgentSummary[]>([
        { id: ID, name: 'Responder', description: '', readOnly: false },
        { id: 'firm-guide' as AgentId, name: 'Firm guide', description: '', readOnly: true },
      ])),
    }))
    await form.loadAgents()
    const props = { t, onDismiss: vi.fn(), useAgents: bindSnapshotSelector(form.agents), openEdit: vi.fn(() => Promise.resolve()) }
    const { rerender, container } = render(<EditAgentMenuItem {...props as never} currentId={ID} />)
    expect(screen.getByText('Edit Responder')).toBeTruthy()
    fireEvent.click(screen.getByText('Edit Responder'))
    expect(props.onDismiss).toHaveBeenCalled()
    expect(props.openEdit).toHaveBeenCalledWith(ID)
    rerender(<EditAgentMenuItem {...props as never} currentId="firm-guide" />)
    expect(container.textContent).toBe('')
    rerender(<EditAgentMenuItem {...props as never} currentId="patent" />)
    expect(container.textContent).toBe('')
  })
})
