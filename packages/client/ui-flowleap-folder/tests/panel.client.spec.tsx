// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutCatalogEntry, ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { FileTreeInput } from '@deepseek-ai/dsh-client-ui-sidebar-files/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { KeyHandlers } from '../src/client/keys.ts'
import { en } from '../src/client/locales.ts'
import { FolderModel } from '../src/client/model.ts'
import { ClientsIcon, FolderPanel, type AskTarget, type PanelProps } from '../src/client/Panel.tsx'
import type { ViewerReads } from '../src/client/viewer.tsx'
import { dir, file, memoryFolder } from './memory-folder.client.ts'
import { en as addClientEn } from '../src/client/add-client/locales/index.ts'
import { AddClientModel } from '../src/client/add-client/model.ts'
import { SYNTEGON_ID, fakeHost, fakeRecord, firmClient } from './add-client-fakes.client.ts'

const SYNTEGON = 'ws-syntegon' as WorkspaceId
const SESSION = 'session-syntegon' as SessionId
const TODAY = '2026-11-08T10:00:00.000Z'

const client = (workspaceId: WorkspaceId, title: string): WorkspaceView => ({
  workspaceId, title, path: `/firm/Clients/${title}`, sessionIds: [], createdAt: TODAY, updatedAt: TODAY,
})

beforeEach(() => {
  vi.setSystemTime(Date.parse('2026-11-09T15:00:00.000Z'))
  URL.createObjectURL = () => 'blob:panel/1'
  URL.revokeObjectURL = () => {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }

/** The Syntegon folder: a family folder, files of each kind, and an Office folder below. */
function syntegon() {
  return memoryFolder({
    '': [
      dir('EP 23 171 862', { source: { kind: 'folder', at: TODAY } }),
      dir('Archive'),
      file('Mandate.pdf', 1234, { source: { kind: 'upload', at: TODAY }, modifiedAt: '2026-11-09T10:00:00.000Z' }),
      file('Fees.xlsx', 15_000_000),
      file('notes.md', 11),
      file('Huge.bin', 5_000_000_000_000),
    ],
    'EP 23 171 862': [dir('Office'), dir('Search')],
    'EP 23 171 862/Office': [file('EP-Register.md', 11)],
    'EP 23 171 862/Search': [],
    'Archive': [],
  })
}

/** The tree of the files sidebar as the page uses it: a button for each drawn entry. */
function FakeTree({ input }: { readonly input: FileTreeInput }) {
  return (
    <ul data-testid="tree" data-current={input.current ?? ''}>
      {input.entries.map((entry) => {
        const expanded = input.expanded.includes(entry.path)
        const state = input.directories?.[entry.path]
        return (
          <li key={entry.path}>
            <button type="button" data-tree-path={entry.path} aria-expanded={entry.meta?.kind === 'directory' ? expanded : undefined}
              onClick={() => { if (entry.meta?.kind === 'directory') input.onToggle(entry, !expanded); else input.onOpen(entry) }}>
              {entry.name}
            </button>
            {state?.loading === true && <span>tree loading {entry.path}</span>}
            {state?.failure !== undefined && <span>{state.failure}</span>}
          </li>
        )
      })}
    </ul>
  )
}

const CATALOG: readonly ShortcutCatalogEntry[] = [
  { id: 'flowleap.folder.ask' as ShortcutCommandId, label: 'Ask', aliases: [], keys: ['A'], keycaps: [['A']], aria: undefined, binding: null, modified: false, conflicts: [], issue: null },
  { id: 'flowleap.folder.newFolder' as ShortcutCommandId, label: 'New folder', aliases: [], keys: ['⇧N'], keycaps: [['⇧', 'N']], aria: undefined, binding: null, modified: false, conflicts: [], issue: null },
]

/**
 * Mount the page over a model of the fixture folder.
 * @param options - the clients, the folder, and the Session answer.
 * @returns the model, the folder, and what the page asked for.
 */
async function mount(options: {
  readonly clients?: readonly WorkspaceView[]
  readonly folder?: ReturnType<typeof memoryFolder>
  readonly connect?: () => Promise<SessionId>
  readonly reads?: ViewerReads
  readonly host?: ReturnType<typeof fakeHost>
  readonly firm?: ReturnType<typeof fakeRecord>
} = {}) {
  const folder = options.folder ?? syntegon()
  const model = new FolderModel({ connect: options.connect ?? (async () => SESSION), apiFor: () => folder.api })
  const host = options.host ?? fakeHost()
  const firm = options.firm ?? fakeRecord()
  const addClient = new AddClientModel({ api: host, record: firm.record, open: (id) => { void model.openClient(id) } })
  const asked: [WorkspaceId, readonly AskTarget[]][] = []
  const keys: { current: KeyHandlers } = { current: {} }
  const trees: FileTreeInput[] = []
  const read = vi.fn(async () => new TextEncoder().encode('# Register'))
  const treeWidth = createSnapshotStore(280)
  const props = {
    t: makeTranslate(en),
    useFolder: bindSnapshotSelector(model.store),
    useClients: bindSnapshotSelector(createSnapshotStore(options.clients ?? [client(SYNTEGON, 'Syntegon')])),
    useCatalog: bindSnapshotSelector(createSnapshotStore(CATALOG)),
    useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>('en')),
    useTreeWidth: bindSnapshotSelector(treeWidth),
    useAddClient: bindSnapshotSelector(addClient.store),
    addClient,
    addClientT: makeTranslate(addClientEn),
    setTreeWidth: (px: number) => { treeWidth.set(px) },
    useContextMenu: contextMenuHook(),
    model,
    reads: () => options.reads ?? { bytes: read, officePdf: read },
    ask: (workspaceId: WorkspaceId, targets: readonly AskTarget[]) => { asked.push([workspaceId, targets]) },
    setKeys: (handlers: KeyHandlers) => { keys.current = handlers },
    renderFactorySlot: (_name: 'sidebar.files.tree', input: FileTreeInput) => {
      trees.push(input)
      return <FakeTree input={input} />
    },
  } as PanelProps
  const view = render(<FolderPanel {...props} />)
  await flush()
  const open = async (path = '') => {
    await act(async () => { await model.openClient(SYNTEGON, path) })
    await flush()
  }
  return { model, folder, asked, keys, trees, view, open, read, treeWidth, addClient, host, firm }
}

const rowNames = () => screen.queryAllByTestId('folder-row').map(row => within(row).getAllByRole('gridcell')[1]!.textContent)
const cells = (name: string) => within(screen.getAllByTestId('folder-row').find(row => row.textContent.includes(name))!).getAllByRole('gridcell').map(cell => cell.textContent)
const button = (name: string | RegExp) => screen.getByRole('button', { name })
/** The text of the notice, without its buttons. */
const noticeText = () => screen.getByRole('status').querySelector('span')!.textContent
/** A button of the bulk bar, or null when the bar or the button is not there. */
const bulkButton = (name: string) => {
  const bar = document.querySelector<HTMLElement>('[data-bulk]')
  return bar === null ? null : within(bar).queryByRole('button', { name })
}
/** The wide button of a top bar act; a narrow screen shows the same act as an icon button. */
const wideButton = (name: string) => screen.getAllByRole('button', { name })[0]!
const click = async (target: Element) => {
  fireEvent.click(target)
  await flush()
}

describe('the Clients list', () => {
  it('says how a client folder comes when there is none', async () => {
    await mount({ clients: [] })
    expect(screen.getByRole('heading', { level: 1, name: en['clients.title'] })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: en['clients.empty.title'] })).toBeTruthy()
    expect(screen.queryByRole('list', { name: en['clients.listLabel'] })).toBeNull()
  })

  it('takes the focus back when the pressed client leaves the page, so that Find and the other keys run', async () => {
    const { keys } = await mount()
    const syntegon = within(screen.getByRole('list', { name: en['clients.listLabel'] })).getByRole('button', { name: 'Syntegon' })
    syntegon.focus()
    await click(syntegon)
    expect(syntegon.isConnected).toBe(false)
    expect(document.activeElement).toBe(screen.getByTestId('flowleap-folder'))
    act(() => { keys.current.find?.() })
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: en['search.label'] }))
  })

  it('leaves the focus where a person put it', async () => {
    const { open } = await mount()
    await open()
    const field = screen.getByRole('searchbox', { name: en['search.label'] })
    field.focus()
    await click(screen.getAllByRole('gridcell').find(cell => cell.textContent === 'Archive')!)
    expect(document.activeElement).toBe(field)
  })

  it('lists each client folder and opens one with no chat', async () => {
    const { model } = await mount({ clients: [client(SYNTEGON, 'Syntegon'), client('ws-bosch' as WorkspaceId, 'Bosch')] })
    const list = screen.getByRole('list', { name: en['clients.listLabel'] })
    expect(within(list).getAllByRole('button').map(item => item.textContent)).toEqual(['Syntegon', 'Bosch'])
    await click(within(list).getByRole('button', { name: 'Syntegon' }))
    expect(model.state.workspaceId).toBe(SYNTEGON)
    expect(screen.getByRole('heading', { level: 1, name: 'Syntegon' })).toBeTruthy()
  })

  it('draws the Clients row icon at the sidebar size', () => {
    const { container } = render(<ClientsIcon size={20} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('the client folder', () => {
  it('lists folders before files, each group by name, with kind, size, modified time and source', async () => {
    const { open } = await mount()
    await open()
    expect(screen.getAllByRole('row').filter(row => row.className.includes('group')).map(row => row.textContent)).toEqual(['Folders2', 'Files4'])
    expect(rowNames()).toEqual(['Archive', 'EP 23 171 862', 'Fees.xlsx', 'Huge.bin', 'Mandate.pdf', 'notes.md'])
    expect(cells('EP 23 171 862').slice(2)).toEqual(['Folder', '', 'Nov 8, 2026', 'Made here'])
    expect(cells('Mandate.pdf').slice(2)).toEqual(['PDF document', '1.2 KB', expect.stringMatching(/^Today, /u), 'Uploaded'])
    expect(cells('Fees.xlsx').slice(2)).toEqual(['Spreadsheet', '15 MB', 'Nov 8, 2026', 'Not recorded'])
    expect(cells('notes.md').slice(2, 4)).toEqual(['Markdown', '11 B'])
    expect(cells('Huge.bin').slice(2, 4)).toEqual(['File', '5,000 GB'])
    expect(screen.queryByText(/·/u)).toBeNull()
  })

  it('shows a skeleton while the first listing loads', async () => {
    const folder = syntegon()
    const { model, trees } = await mount({ folder })
    const opened = folder.hold('list')
    act(() => { void model.openClient(SYNTEGON) })
    await flush()
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
    expect(trees.at(-1)!.directories).toEqual({ '': { loading: true } })
    opened()
    await flush()
    expect(screen.queryByRole('status', { name: en.loading })).toBeNull()
  })

  it('says a folder is empty and offers Upload files', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { open } = await mount()
    await open('Archive')
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing in Archive yet' })).toBeTruthy()
    expect(screen.getByText('Syntegon · Archive')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('heading', { level: 2 }).parentElement!).getByRole('button', { name: en['act.upload'] }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('says the folder could not be read, keeps the last entries with their time, and reads it again on Try again', async () => {
    const { open, folder, model } = await mount()
    await open()
    folder.failNext('list', 'network')
    await act(async () => { await model.refresh('') })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(en['error.list'])
    expect(alert.textContent).toMatch(/The list shows it as of \d/u)
    expect(rowNames()).toHaveLength(6)
    folder.tree.set('', [file('Mandate.pdf')])
    await click(within(alert).getByRole('button', { name: en['act.retry'] }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(rowNames()).toEqual(['Mandate.pdf'])
  })

  it('names no time when the folder could not be read at all', async () => {
    const { open, folder, trees } = await mount()
    folder.failNext('list', 'network')
    await open()
    expect(screen.getByRole('alert').textContent).toBe(`${en['error.list']} ${en['act.retry']}`)
    expect(trees.at(-1)!.directories).toEqual({ '': { failure: en['error.list'] } })
  })
})

describe('the location and the tree', () => {
  it('goes into a folder, shows the way back in the location, and goes back up', async () => {
    const { open, model } = await mount()
    await open()
    expect(screen.queryByRole('button', { name: en['act.up'] })).toBeNull()
    await click(screen.getAllByRole('gridcell').find(cell => cell.textContent === 'EP 23 171 862')!)
    expect(model.state.folder).toBe('EP 23 171 862')
    await click(screen.getAllByRole('gridcell').find(cell => cell.textContent === 'Office')!)
    const crumbs = screen.getByRole('navigation', { name: en['crumbs.label'] })
    expect(crumbs.textContent).toBe(`${en['clients.title']}›Syntegon›…›OfficeOffice`)
    expect(within(crumbs).getByText('…').getAttribute('title')).toBe('EP 23 171 862/Office')
    await click(button(en['act.up']))
    expect(model.state.folder).toBe('EP 23 171 862')
    await click(within(crumbs).getByRole('button', { name: 'Syntegon' }))
    expect(model.state.folder).toBe('')
    await click(within(crumbs).getByRole('button', { name: en['clients.title'] }))
    expect(model.state.workspaceId).toBeNull()
    expect(screen.getByRole('list', { name: en['clients.listLabel'] })).toBeTruthy()
  })

  it('opens a file in the middle area with its facts and its viewer, and goes back to its folder', async () => {
    const { open, model, read } = await mount()
    await open('EP 23 171 862/Office')
    await click(screen.getAllByRole('gridcell').find(cell => cell.textContent === 'EP-Register.md')!)
    expect(model.state.open).toBe('EP 23 171 862/Office/EP-Register.md')
    expect(screen.getByRole('heading', { level: 1, name: 'EP-Register.md' }).nextElementSibling?.textContent).toBe('Markdown11 BNot recordedNov 8, 2026')
    expect(await screen.findByRole('heading', { name: 'Register' })).toBeTruthy()
    expect(read).toHaveBeenCalledWith('EP 23 171 862/Office/EP-Register.md', expect.any(AbortSignal))
    const crumbs = screen.getByRole('navigation', { name: en['crumbs.label'] })
    expect(within(crumbs).getByText('EP-Register.md')).toBeTruthy()
    await click(within(crumbs).getByRole('button', { name: 'Office' }))
    expect(model.state.open).toBeNull()
    model.openFile('Mandate.pdf')
    await flush()
    await click(button(en['act.up']))
    expect(model.state).toMatchObject({ folder: '', open: null })
  })

  it('shows a file it has no entry for with its kind only', async () => {
    const { open, model } = await mount()
    await open()
    act(() => { model.openFile('Inbox/scan.pdf') })
    await flush()
    expect(screen.getByRole('heading', { level: 1, name: 'scan.pdf' }).nextElementSibling?.textContent).toBe('PDF document')
  })

  it('selects no text with the second click of the double-click that opened a file, and selects text with a later one', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { open, model } = await mount()
    await open()
    act(() => { model.openFile('Mandate.pdf') })
    await flush()
    const view = screen.getByRole('heading', { level: 1, name: 'Mandate.pdf' }).closest('[class*="file"]')!
    expect(fireEvent.mouseDown(view, { detail: 2 })).toBe(false)
    expect(fireEvent.mouseDown(view, { detail: 1 })).toBe(true)
    now.mockReturnValue(1600)
    expect(fireEvent.mouseDown(view, { detail: 2 })).toBe(true)
    now.mockRestore()
  })

  it('shows the folder list while the Session of the client folder is not yet there', async () => {
    let connect: (session: SessionId) => void = () => {}
    const { model } = await mount({ connect: () => new Promise<SessionId>((resolve) => { connect = resolve }) })
    act(() => { void model.openClient(SYNTEGON) })
    act(() => { model.openFile('Mandate.pdf') })
    await flush()
    expect(screen.queryByRole('heading', { level: 1, name: 'Mandate.pdf' })).toBeNull()
    expect(wideButton(en['act.newFolder']).hasAttribute('disabled')).toBe(true)
    connect(SESSION)
    await flush()
  })

  it('lists an open folder of the tree that the middle area does not list, and closes the listed one', async () => {
    const { open, model } = await mount()
    await open()
    await click(screen.getByRole('button', { name: 'EP 23 171 862', expanded: false }))
    await click(screen.getByRole('button', { name: 'Office', expanded: false }))
    expect(model.state.folder).toBe('EP 23 171 862/Office')
    await click(screen.getByRole('button', { name: 'EP 23 171 862', expanded: true }))
    expect(model.state).toMatchObject({ folder: 'EP 23 171 862', open: null })
    expect(model.state.expanded).toContain('EP 23 171 862')
    await click(screen.getByText('EP-Register.md', { selector: '[data-tree-path]' }))
    await click(screen.getByRole('button', { name: 'Office', expanded: true }))
    expect(model.state).toMatchObject({ folder: 'EP 23 171 862/Office', open: null })
    await click(screen.getByRole('button', { name: 'Office', expanded: true }))
    expect(model.state.expanded).not.toContain('EP 23 171 862/Office')
  })

  it('opens folders and files from the tree, and closes the tree on narrow screens after a pick', async () => {
    const { open, model, trees } = await mount()
    await open()
    const toggle = button(en['act.showFolders'])
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await click(screen.getByRole('button', { name: 'EP 23 171 862', expanded: false }))
    expect(model.state).toMatchObject({ folder: 'EP 23 171 862', expanded: ['EP 23 171 862'] })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await click(screen.getByRole('button', { name: 'EP 23 171 862', expanded: true }))
    expect(model.state.expanded).toEqual([])
    await click(screen.getByRole('button', { name: 'EP 23 171 862', expanded: false }))
    await click(screen.getByRole('button', { name: 'Office', expanded: false }))
    await click(screen.getByText('EP-Register.md', { selector: '[data-tree-path]' }))
    expect(model.state.open).toBe('EP 23 171 862/Office/EP-Register.md')
    expect(trees.at(-1)).toMatchObject({ root: '', current: 'EP 23 171 862/Office/EP-Register.md' })
    expect(trees.at(-1)!.entries.find(entry => entry.path === 'Mandate.pdf')).toEqual({ path: 'Mandate.pdf', name: 'Mandate.pdf', meta: { kind: 'file', size: 1234 } })
    expect(trees.at(-1)!.entries.find(entry => entry.path === 'Archive')).toEqual({ path: 'Archive', name: 'Archive', meta: { kind: 'directory' } })
  })

  it('says the client folder could not open and opens it on Try again', async () => {
    let refuse = true
    const { model } = await mount({ connect: async () => { if (refuse) throw new Error('refused'); return SESSION } })
    await act(async () => { await model.openClient(SYNTEGON) })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByRole('heading').textContent).toBe(en['error.connect'])
    refuse = false
    await click(within(alert).getByRole('button', { name: en['act.retry'] }))
    expect(model.state.connect).toBe('ready')
    expect(rowNames()).toHaveLength(6)
  })
})

describe('the acts of the page', () => {
  it('asks about the listed folder, the open file, or the checked entries', async () => {
    const { open, model, asked } = await mount()
    await open('EP 23 171 862')
    await click(button(/^Ask about this/u))
    expect(asked.at(-1)).toEqual([SYNTEGON, [{ path: 'EP 23 171 862', kind: 'directory' }]])
    act(() => { model.openFile('EP 23 171 862/Office/EP-Register.md') })
    await flush()
    await click(button(/^Ask about this/u))
    expect(asked.at(-1)).toEqual([SYNTEGON, [{ path: 'EP 23 171 862/Office/EP-Register.md', kind: 'file' }]])
    act(() => { model.check('EP 23 171 862/Office/EP-Register.md', true) })
    await flush()
    expect(screen.queryByRole('button', { name: /^Ask about this/u })).toBeNull()
    await act(async () => { await model.go('') })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Mandate.pdf' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Archive' }))
    await flush()
    expect(screen.getByText('2 selected')).toBeTruthy()
    await click(button(/^Ask about these 2/u))
    expect(asked.at(-1)).toEqual([SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }, { path: 'Archive', kind: 'directory' }]])
    act(() => { model.check('Gone.pdf', true) })
    await click(button(/^Ask about these 3/u))
    expect(asked.at(-1)![1].at(-1)).toEqual({ path: 'Gone.pdf', kind: 'file' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Archive' }))
    await click(button(en['act.clear']))
    expect(model.state.checked).toEqual([])
    expect(screen.queryByText(/selected/u)).toBeNull()
  })

  it('shows the keycaps of an act from the shortcut catalog', async () => {
    const { open } = await mount()
    await open()
    expect(button(/^Ask about this/u).textContent).toBe('Ask about thisA')
    expect(wideButton(en['act.newFolder']).textContent).toBe(`${en['act.newFolder']}⇧N`)
    expect(wideButton(en['act.upload']).textContent).toBe(en['act.upload'])
  })

  it('gives the keys the acts that apply now, and none while a dialog is open or the folder is not ready', async () => {
    const { open, model, keys, asked } = await mount()
    expect(keys.current).toEqual({})
    await open()
    expect(Object.keys(keys.current)).toEqual(['ask', 'newFolder', 'upload', 'find'])
    act(() => { keys.current.ask!() })
    expect(asked).toHaveLength(1)
    act(() => { keys.current.newFolder!() })
    expect(model.state.edit).toEqual({ kind: 'new-folder', parent: '' })
    act(() => { model.cancelEdit(); model.check('Mandate.pdf', true) })
    expect(Object.keys(keys.current)).toEqual(['ask', 'newFolder', 'upload', 'rename', 'move', 'trash', 'find'])
    act(() => { keys.current.rename!() })
    expect(model.state.edit).toEqual({ kind: 'rename', path: 'Mandate.pdf' })
    act(() => { model.cancelEdit(); model.check('Archive', true) })
    expect(Object.keys(keys.current)).toEqual(['ask', 'newFolder', 'upload', 'move', 'trash', 'find'])
    act(() => { keys.current.move!() })
    expect(model.state.moving).toEqual(['Mandate.pdf', 'Archive'])
    expect(keys.current).toEqual({})
  })

  it('uploads the files a person chooses into the listed folder', async () => {
    const choose = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { open, folder, keys } = await mount()
    await open('Archive')
    for (const upload of screen.getAllByRole('button', { name: en['act.upload'] })) fireEvent.click(upload)
    act(() => { keys.current.upload!() })
    expect(choose).toHaveBeenCalledTimes(4)
    const input = screen.getByLabelText(en['upload.label'])
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'D1.pdf')], configurable: true })
    fireEvent.change(input)
    await flush()
    expect(folder.calls).toContain('upload Archive/D1.pdf')
    Object.defineProperty(input, 'files', { value: [], configurable: true })
    fireEvent.change(input)
    Object.defineProperty(input, 'files', { value: null, configurable: true })
    fireEvent.change(input)
    await flush()
    expect(folder.calls.filter(call => call.startsWith('upload'))).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('1 file added to Archive')
  })

  it('shows a hint while files are dragged over the list, and adds the dropped files to the listed folder', async () => {
    const { open, folder } = await mount()
    await open('EP 23 171 862/Search')
    const area = screen.getByRole('heading', { level: 1 }).closest('[class*="folder"]')!
    const drag = (count: number, types = ['Files']) => ({ dataTransfer: { types, items: { length: count }, files: [], dropEffect: 'none' } })
    fireEvent.dragOver(area, drag(1, ['text/plain']))
    expect(screen.queryByText(/Drop to add/u)).toBeNull()
    fireEvent.dragOver(area, drag(1))
    expect(screen.getByText('Drop to add 1 file to Search')).toBeTruthy()
    fireEvent.dragOver(area, drag(3))
    expect(screen.getByText('Drop to add 1 file to Search')).toBeTruthy()
    const intoChild = createEvent.dragLeave(area)
    Object.defineProperty(intoChild, 'relatedTarget', { value: area.firstElementChild })
    fireEvent(area, intoChild)
    expect(screen.getByText('Drop to add 1 file to Search')).toBeTruthy()
    fireEvent.dragLeave(area, { relatedTarget: null })
    expect(screen.queryByText(/Drop to add/u)).toBeNull()
    fireEvent.dragOver(area, drag(3))
    expect(screen.getByText('Drop to add 3 files to Search')).toBeTruthy()
    fireEvent.drop(area, { dataTransfer: { files: [] } })
    fireEvent.dragOver(area, drag(0))
    expect(screen.getByText('Drop to add files to Search')).toBeTruthy()
    const hold = folder.hold('upload')
    fireEvent.drop(area, { dataTransfer: { files: [new File(['%PDF'], 'D1.pdf'), new File(['%PDF'], 'D2.pdf')] } })
    await flush()
    expect(screen.queryByText(/Drop to add/u)).toBeNull()
    const adding = screen.getAllByRole('row').filter(row => row.textContent.includes(en.adding))
    expect(adding.map(row => row.textContent)).toEqual([`D1.pdfPDF document${en.adding}${en['source.upload']}`, `D2.pdfPDF document${en.adding}${en['source.upload']}`])
    expect((adding[0]!.querySelector('[class*="progress"] span') as HTMLElement).style.width).toBe('0%')
    hold()
    await flush()
    expect(rowNames()).toEqual(['D1.pdf', 'D2.pdf'])
    const notice = screen.getByRole('status')
    expect(notice.textContent).toBe('2 files added to Search')
    await click(within(notice).getByRole('button', { name: en['act.close'] }))
    expect(screen.queryByText(/files added/u)).toBeNull()
  })

  it('names no folder in the notice for files added to the client folder itself', async () => {
    const { open, model } = await mount()
    await open()
    await act(async () => { await model.upload([new File(['x'], 'a.pdf')], '') })
    expect(screen.getByRole('status').textContent).toBe('1 file added to ')
    await act(async () => { await model.upload([new File(['x'], 'b.pdf'), new File(['x'], 'c.pdf')], '') })
    expect(screen.getByRole('status').textContent).toBe('2 files added to ')
  })

  it('reports a failed upload as an alert', async () => {
    const { open, model, folder } = await mount()
    await open()
    folder.failNext('upload', 'storage-low')
    await act(async () => { await model.upload([new File(['x'], 'a.pdf')], '') })
    expect(screen.getByRole('alert').textContent).toBe(en['failure.storage-low'])
  })
})

describe('the name field', () => {
  it('makes a new folder with the typed name on Enter', async () => {
    const { open, model } = await mount()
    await open()
    await click(wideButton(en['act.newFolder']))
    const field = screen.getByRole('textbox', { name: en['name.label'] }) as HTMLInputElement
    expect(field.value).toBe(en['act.newFolder'])
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, en['act.newFolder'].length])
    expect(document.activeElement).toBe(field)
    fireEvent.change(field, { target: { value: 'Examination' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await flush()
    expect(model.state.edit).toBeNull()
    expect(rowNames()).toContain('Examination')
  })

  it('shows why a name is refused and keeps the field open, also when the focus leaves it', async () => {
    const { open, model } = await mount()
    await open()
    await click(wideButton(en['act.newFolder']))
    const field = screen.getByRole('textbox', { name: en['name.label'] })
    fireEvent.change(field, { target: { value: 'Archive' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await flush()
    expect(screen.getByRole('alert').textContent).toBe(en['failure.exists'])
    expect(field.getAttribute('aria-invalid')).toBe('true')
    fireEvent.blur(field)
    expect(model.state.edit).not.toBeNull()
    fireEvent.keyDown(field, { key: 'a' })
    fireEvent.keyDown(field, { key: 'Escape' })
    await flush()
    expect(model.state.edit).toBeNull()
  })

  it('renames a file with the name before its extension selected, and closes with no change when the focus leaves', async () => {
    const { open, model } = await mount()
    await open()
    act(() => { model.startRename('Mandate.pdf') })
    await flush()
    const field = screen.getByRole('textbox', { name: en['name.label'] }) as HTMLInputElement
    expect([field.value, field.selectionStart, field.selectionEnd]).toEqual(['Mandate.pdf', 0, 7])
    fireEvent.blur(field)
    expect(model.state.edit).toBeNull()
    act(() => { model.startRename('Archive') })
    await flush()
    const folderField = screen.getByRole('textbox', { name: en['name.label'] }) as HTMLInputElement
    expect([folderField.selectionStart, folderField.selectionEnd]).toEqual([0, 7])
    act(() => { model.cancelEdit(); model.startRename('notes.md') })
    await flush()
    fireEvent.change(screen.getByRole('textbox', { name: en['name.label'] }), { target: { value: '.md' } })
    act(() => { model.cancelEdit(); model.startRename('.env') })
    await flush()
  })

  it('selects the whole name of a file with no extension', async () => {
    const folder = memoryFolder({ '': [file('.env'), file('README')] })
    const { open, model } = await mount({ folder })
    await open()
    act(() => { model.startRename('.env') })
    await flush()
    const field = screen.getByRole('textbox', { name: en['name.label'] }) as HTMLInputElement
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 4])
  })

  it('shows the new folder field in an empty folder', async () => {
    const { open, model } = await mount()
    await open('Archive')
    await click(screen.getAllByRole('button', { name: en['act.newFolder'] }).at(-1)!)
    expect(model.state.edit).toEqual({ kind: 'new-folder', parent: 'Archive' })
    expect(screen.getByRole('textbox', { name: en['name.label'] })).toBeTruthy()
    expect(screen.getByText(en['group.folders'])).toBeTruthy()
  })
})

describe('the Move to dialog', () => {
  it('lists the client folder and the known folders, blocks the entry, its folder and below it, and moves to the pick', async () => {
    const { open, model } = await mount()
    await open('EP 23 171 862')
    await act(async () => { await model.go('') })
    act(() => { model.check('EP 23 171 862', true) })
    await flush()
    await click(button(en['act.move']))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Move 1 item to…')).toBeTruthy()
    expect(within(dialog).getByText('An item can move only inside the Syntegon folder.')).toBeTruthy()
    const picks = within(within(dialog).getByRole('list', { name: en['move.target'] })).getAllByRole('button')
    expect(picks.map(pick => [pick.textContent, pick.hasAttribute('disabled'), pick.style.paddingInlineStart])).toEqual([
      ['Syntegon', true, '8px'],
      ['Archive', false, '20px'],
      ['EP 23 171 862', true, '20px'],
      ['Office', true, '32px'],
      ['Search', true, '32px'],
    ])
    const moveHere = within(dialog).getByRole('button', { name: en['act.moveHere'] })
    expect(moveHere.hasAttribute('disabled')).toBe(true)
    await click(picks[1]!)
    expect(picks[1]!.getAttribute('aria-pressed')).toBe('true')
    await click(moveHere)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(model.state.listings.Archive?.entries.map(entry => entry.name)).toEqual(['EP 23 171 862'])
  })

  it('keeps the dialog open with the reason when a move fails, and closes it on Cancel or Close', async () => {
    const { open, model, folder } = await mount()
    await open()
    act(() => { model.startMove(['Mandate.pdf', 'notes.md']) })
    await flush()
    expect(within(screen.getByRole('dialog')).getByText('Move 2 items to…')).toBeTruthy()
    folder.failNext('move', 'exists')
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }))
    await click(button(en['act.moveHere']))
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(en['failure.exists'])
    await click(button(en['act.cancel']))
    expect(model.state.moving).toBeNull()
    act(() => { model.startMove(['Mandate.pdf']) })
    await flush()
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: en['act.close'] }))
    expect(model.state.moving).toBeNull()
  })
})

describe('the name conflict of a dropped file', () => {
  it('offers Keep both with the new name, or Skip, and closes as Skip', async () => {
    const { open, model } = await mount()
    await open('EP 23 171 862/Office')
    await act(async () => { await model.upload([new File(['x'], 'EP-Register.md')], 'EP 23 171 862/Office') })
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('EP-Register.md is already in Office')).toBeTruthy()
    expect(within(dialog).getByText(/Keep both adds the new file as EP-Register 2\.md\./u)).toBeTruthy()
    await click(within(dialog).getByRole('button', { name: en['act.keepBoth'] }))
    expect(rowNames()).toEqual(['EP-Register 2.md', 'EP-Register.md'])
    await act(async () => { await model.upload([new File(['x'], 'EP-Register.md')], 'EP 23 171 862/Office') })
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: en['act.skip'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { await model.upload([new File(['x'], 'Mandate.pdf')], '') })
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/^Mandate\.pdf is already in$/u)).toBeTruthy()
    await click(within(dialog).getByRole('button', { name: en['act.close'] }))
    expect(model.state.conflict).toBeNull()
  })
})

describe('the folder tree width', () => {
  it('sizes the tree column to the stored width and changes it from the handle on its edge', async () => {
    const { open, treeWidth } = await mount()
    await open()
    const handle = screen.getByRole('separator', { name: en['resize.label'] })
    const body = handle.parentElement!
    expect([body.style.gridTemplateColumns, handle.getAttribute('aria-valuenow')]).toEqual(['280px minmax(0, 1fr)', '280'])
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(treeWidth.getSnapshot()).toBe(296)
    expect([body.style.gridTemplateColumns, handle.getAttribute('aria-valuenow')]).toEqual(['296px minmax(0, 1fr)', '296'])
  })
})

describe('Move to Trash and Restore', () => {
  it('moves the checked rows to Trash, says how many, and shows in Trash where each came from', async () => {
    const { open, model } = await mount()
    await open()
    await act(async () => { await model.trash(['EP 23 171 862/Office/EP-Register.md']) })
    expect(noticeText()).toBe(en['trashed.one'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Mandate.pdf' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select notes.md' }))
    await flush()
    expect(bulkButton(en['act.restore'])).toBeNull()
    await click(button(en['act.trash']))
    expect(noticeText()).toBe('2 items moved to Trash')
    expect(rowNames()).toEqual(['Archive', 'EP 23 171 862', 'Trash', 'Fees.xlsx', 'Huge.bin'])
    await click(screen.getAllByRole('gridcell').find(cell => cell.textContent === 'Trash')!)
    expect(cells('Mandate.pdf').at(-1)).toBe('From Syntegon')
    expect(cells('EP-Register.md').at(-1)).toBe('From EP 23 171 862/Office')
  })

  it('puts the entries that the notice counts back with the notice\'s Restore', async () => {
    const { open, model } = await mount()
    await open()
    await act(async () => { await model.trash(['Mandate.pdf', 'notes.md']) })
    await click(within(screen.getByRole('status')).getByRole('button', { name: en['act.restore'] }))
    expect(screen.getByRole('status').textContent).toBe('2 items restored')
    expect(model.state.listings['']?.entries.map(entry => entry.name)).toEqual(expect.arrayContaining(['Mandate.pdf', 'notes.md']))
  })

  it('offers Restore for the checked rows of Trash, and puts them back', async () => {
    const { open, model } = await mount()
    await open()
    await act(async () => { await model.trash(['Mandate.pdf', 'notes.md', 'Fees.xlsx']) })
    await open('Trash')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Mandate.pdf' }))
    await flush()
    expect(screen.queryByRole('button', { name: en['act.trash'] })).toBeNull()
    await click(button(en['act.restore']))
    expect(screen.getByRole('status').textContent).toBe(en['restored.one'])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select notes.md' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Fees.xlsx' }))
    await flush()
    await click(button(en['act.restore']))
    expect(screen.getByRole('status').textContent).toBe('2 items restored')
    expect(model.state.listings['']?.entries.map(entry => entry.name)).toEqual(expect.arrayContaining(['Mandate.pdf', 'notes.md', 'Fees.xlsx']))
  })

  it('keeps Trash for Move to Trash: an empty Trash says so, and the page offers no New folder, upload or drop there', async () => {
    const { open, model, keys } = await mount()
    await open()
    await act(async () => { await model.trash(['Mandate.pdf']) })
    await act(async () => { await model.restore(['Trash/Mandate.pdf']) })
    await open('Trash')
    expect(screen.getByRole('heading', { level: 2, name: en['trash.empty.title'] })).toBeTruthy()
    expect(screen.getByText(en['trash.empty.body'])).toBeTruthy()
    expect(screen.getAllByRole('button', { name: en['act.upload'] }).every(item => (item as HTMLButtonElement).disabled)).toBe(true)
    expect(screen.getAllByRole('button', { name: en['act.newFolder'] }).every(item => (item as HTMLButtonElement).disabled)).toBe(true)
    expect([keys.current.newFolder, keys.current.upload]).toEqual([undefined, undefined])
    const area = screen.getByRole('heading', { level: 1 }).closest('[class*="folder"]')!
    expect(fireEvent.dragOver(area, { dataTransfer: { types: ['Files'], items: { length: 1 }, files: [], dropEffect: 'none' } })).toBe(true)
    expect(screen.queryByText(/Drop to add/u)).toBeNull()
  })

  it('offers neither act for Trash itself or for rows of Trash checked with others, and gives the keys no Move to Trash', async () => {
    const { open, model, keys } = await mount()
    await open()
    await act(async () => { await model.trash(['Mandate.pdf']) })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Trash' }))
    await flush()
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(screen.queryByRole('button', { name: en['act.trash'] })).toBeNull()
    expect(bulkButton(en['act.restore'])).toBeNull()
    expect(keys.current.trash).toBeUndefined()
    act(() => { model.clearChecks(); model.check('notes.md', true); model.check('Trash/Mandate.pdf', true) })
    await flush()
    expect(screen.queryByRole('button', { name: en['act.trash'] })).toBeNull()
    expect(bulkButton(en['act.restore'])).toBeNull()
    expect(keys.current.trash).toBeUndefined()
  })

  it('moves the open file to Trash with the key, and Find puts the focus in the search field', async () => {
    const { open, model, keys } = await mount()
    await open()
    act(() => { model.openFile('notes.md') })
    await flush()
    act(() => { keys.current.trash!() })
    await flush()
    expect(model.state.open).toBeNull()
    expect(noticeText()).toBe(en['trashed.one'])
    act(() => { keys.current.find!() })
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: en['search.label'] }))
  })
})

describe('the search by name', () => {
  /** The pause after the last key before the page asks the Host. */
  const SEARCH_WAIT_MS = 150
  const field = () => screen.getByRole<HTMLInputElement>('searchbox', { name: en['search.label'] })
  const type = (value: string) => { fireEvent.change(field(), { target: { value } }) }
  const wait = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
  const hits = () => screen.queryAllByTestId('search-hit').map(hit => [hit.textContent, hit.getAttribute('aria-selected')])

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(Date.parse('2026-11-09T15:00:00.000Z'))
  })

  it('waits for the typing to pause, then lists the names that match with their folder', async () => {
    const { open, folder } = await mount()
    await open()
    expect(field().placeholder).toBe('Find in Syntegon')
    type('off')
    await wait(100)
    type('office')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Names with “office”')
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
    await wait(SEARCH_WAIT_MS - 1)
    expect(folder.calls.filter(call => call.startsWith('search'))).toEqual([])
    await wait(1)
    await flush()
    expect(folder.calls.filter(call => call.startsWith('search'))).toEqual(['search office'])
    expect(hits()).toEqual([['OfficeEP 23 171 862', 'true']])
    type('mandate')
    await wait(SEARCH_WAIT_MS)
    await flush()
    expect(hits()).toEqual([['Mandate.pdfSyntegon', 'true']])
  })

  it('moves the highlight with the arrow keys and opens the highlighted hit on Enter', async () => {
    const { open, model } = await mount()
    await open()
    type('e')
    await wait(SEARCH_WAIT_MS)
    await flush()
    expect(hits().map(([, selected]) => selected)).toEqual(['true', ...Array.from({ length: 8 }, () => 'false')])
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    fireEvent.keyDown(field(), { key: 'a' })
    expect(hits()[1]).toEqual(['EP 23 171 862Syntegon', 'true'])
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(field().value).toBe('')
    expect(model.state).toMatchObject({ folder: 'EP 23 171 862', open: null, search: { query: '', status: 'idle' } })
    expect(rowNames()).toEqual(['Office', 'Search'])
  })

  it('opens a file hit in the middle area on a click', async () => {
    const { open, model } = await mount()
    await open()
    type('register')
    await wait(SEARCH_WAIT_MS)
    await flush()
    await click(within(screen.getByTestId('search-hit')).getByRole('gridcell'))
    expect(model.state.open).toBe('EP 23 171 862/Office/EP-Register.md')
    expect(screen.getByRole('heading', { level: 1, name: 'EP-Register.md' })).toBeTruthy()
  })

  it('says when no name matches, opens nothing on Enter, and ends the search on Escape or on Clear the search', async () => {
    const { open, model } = await mount()
    await open()
    type('zzz')
    await wait(SEARCH_WAIT_MS)
    await flush()
    expect(screen.getByText(en['search.none'])).toBeTruthy()
    fireEvent.keyDown(field(), { key: 'Enter' })
    await flush()
    expect(model.state.search.query).toBe('zzz')
    field().focus()
    fireEvent.keyDown(field(), { key: 'Escape' })
    await flush()
    expect([field().value, model.state.search.query, document.activeElement === field()]).toEqual(['', '', false])
    expect(rowNames()).toHaveLength(6)
    type('mandate')
    await wait(SEARCH_WAIT_MS)
    await flush()
    await click(button(en['search.clear']))
    expect([field().value, model.state.search.query]).toEqual(['', ''])
    expect(screen.queryByTestId('search-hit')).toBeNull()
  })

  it('says the search could not run and keeps the last hits, and says when the cap dropped hits', async () => {
    const { open, folder } = await mount()
    await open()
    folder.limits.searchHits = 2
    type('e')
    await wait(SEARCH_WAIT_MS)
    await flush()
    expect(hits()).toHaveLength(2)
    expect(screen.getByText('FlowLeap shows the first 2 matches. Add a word to narrow the search.')).toBeTruthy()
    folder.failNext('search', 'network')
    type('ep')
    await wait(SEARCH_WAIT_MS)
    await flush()
    expect(screen.getByRole('alert').textContent).toBe(en['search.failed'])
    expect(hits()).toHaveLength(2)
  })

  it('keeps the search field off until the client folder is ready', async () => {
    let connect: (session: SessionId) => void = () => {}
    const { model } = await mount({ connect: () => new Promise<SessionId>((resolve) => { connect = resolve }) })
    act(() => { void model.openClient(SYNTEGON) })
    await flush()
    expect(field().disabled).toBe(true)
    connect(SESSION)
    await flush()
    expect(field().disabled).toBe(false)
  })
})

describe('Add client on the client folder page', () => {
  const tick = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })

  it('opens Add client from the Clients list, and goes back to the list', async () => {
    await mount({ clients: [] })
    await click(screen.getAllByRole('button', { name: addClientEn['list.add'] })[0]!)
    expect(screen.getByRole('heading', { level: 1, name: addClientEn.title })).toBeTruthy()
    await click(button(addClientEn['crumbs.clients']))
    expect(screen.getByRole('heading', { level: 1, name: en['clients.title'] })).toBeTruthy()
    await click(screen.getAllByRole('button', { name: addClientEn['list.add'] })[1]!)
    expect(screen.getByRole('heading', { level: 1, name: addClientEn.title })).toBeTruthy()
  })

  it('shows one row for each client folder, and the Watching list', async () => {
    const firm = fakeRecord({ clients: [firmClient('33333333-2222-4333-8444-555555555555' as never, 'Watched AG', 'watch'), firmClient(SYNTEGON_ID, 'Syntegon')] })
    const { model } = await mount({ firm, clients: [client(SYNTEGON, 'Syntegon'), client('ws-done' as WorkspaceId, 'Done AG')] })
    await tick()
    const list = screen.getByRole('list', { name: en['clients.listLabel'] })
    expect(within(list).getAllByRole('button').map(row => row.textContent)).toEqual(['Syntegon', 'Done AG'])
    expect(within(screen.getByRole('list', { name: addClientEn['list.watchingLabel'] })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Watched AG'])
    await click(within(list).getByRole('button', { name: 'Done AG' }))
    expect(model.state.workspaceId).toBe('ws-done')
  })

  it('says what an act did in a toast, and closes it', async () => {
    const { addClient } = await mount()
    const toasts = [
      [{ kind: 'watch', name: 'Gerhard Schubert' }, 'Gerhard Schubert added to Watch'],
      [{ kind: 'party', name: 'Gerhard Schubert', applicationNumber: 'EP4292805A1' }, 'Gerhard Schubert added as a party to EP 4 292 805 A1'],
      [{ kind: 'failed', error: { kind: 'network' } }, addClientEn['error.network']],
    ] as const
    for (const [toast, text] of toasts) {
      act(() => { addClient.store.update((draft) => { draft.toast = toast }) })
      expect(screen.getByText(text)).toBeTruthy()
    }
    expect(screen.getByRole('alert')).toBeTruthy()
    await click(button(addClientEn['act.close']))
    expect(screen.queryByText(addClientEn['error.network'])).toBeNull()
  })

  it('checks the client folder of a client for new matters, and names the folders and files that Add client wrote', async () => {
    const host = fakeHost()
    const at = '2026-11-08T14:02:00.000Z'
    const folder = memoryFolder({
      '': [
        dir('Method and apparatus for producing a packaging element', { source: { kind: 'add-client', at, from: 'template', role: 'family', key: 'EP23171862' } }),
        dir('EP 23 171 862', { source: { kind: 'add-client', at, from: 'template', role: 'matter', key: 'EP23171862' } }),
        dir('00 Client', { source: { kind: 'add-client', at, from: 'template' } }),
        file('EP Register 2026-11-08.md', 2000, { source: { kind: 'add-client', at, from: 'ep-register' } }),
      ],
    })
    const firm = fakeRecord({ details: [{ client: firmClient(SYNTEGON_ID, 'Syntegon'), names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat' }], applications: [], conflictChecks: [] }] })
    const { open } = await mount({ host, firm, folder })
    await tick()
    await open()
    expect(cells('packaging element').slice(2)).toEqual([en['kind.family'], '', expect.any(String), en['source.addClient']])
    expect(cells('EP 23 171 862')[2]).toBe(en['kind.matter'])
    expect(cells('00 Client')[2]).toBe(en['kind.folder'])
    expect(cells('EP Register')[5]).toBe(en['source.addClient'])
    await click(button(addClientEn['folder.check']))
    expect(screen.getByRole('heading', { level: 1, name: 'Syntegon' })).toBeTruthy()
    expect(host.review).toHaveBeenCalledWith({ names: ['SYNTEGON TECHNOLOGY'], clients: [] })
  })

  it('offers no check for a folder whose client the Firm Record does not have', async () => {
    const firm = fakeRecord({ clients: [firmClient(SYNTEGON_ID, 'Another Client')] })
    const { open } = await mount({ firm })
    await tick()
    await open()
    expect(screen.queryByRole('button', { name: addClientEn['folder.check'] })).toBeNull()
  })
})
