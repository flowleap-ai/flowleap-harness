/**
 * The client folder page: the Clients list, and a client's folder with the folder tree at the left and, in the middle,
 * the selected folder's folders and files or the selected file. The 44px top bar holds the location, New folder,
 * Upload files and the one primary action, Ask about this. Files dropped on the middle area go into the listed folder.
 * Add client is a view of this page: the Clients list opens it, and it ends on the new client's folder.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, FileTypeIcon, IconChevronLeftOutlineRegular, IconCloseOutlineRegular, IconEditOutlineRegular, IconFolderCloseRegular,
  IconNewChatOutlineRegular, IconPaperclipOutlineRegular, IconProjectAddOutlineRegular, IconRefreshOutlineRegular,
  IconRightUpOutlineRegular, IconTrashOutlineRegular, IconWarningTriangleOutlineRegular, IconWorkspaceTreeOutlineRegular, Keycap, Modal,
  type KeycapBox, type MarkdownLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TreeEntry } from '@deepseek-ai/dsh-client-ui-sidebar-files/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { TRASH, isTrashPath, type FolderEntry, type FolderSearchHit } from '../route.ts'
import { FOLDER_SCOPE, keycapsOf, recordKeyOf, type KeyAct, type KeyHandlers } from './keys.ts'
import { AddClientPage, AddClientToast, BuildState, WatchingList } from './add-client/AddClient.tsx'
import type { AddClientTranslate } from './add-client/format.ts'
import type { AddClientModel, AddClientSnapshot } from './add-client/model.ts'
import type { BuildStatus } from '../add-client/wire.ts'
import type { FlowleapFolderKey, NS } from './locales.ts'
import {
  baseName, childPath, keepBothName, namesIn, parentOf,
  type ConflictState, type FailureCode, type FolderModel, type FolderSnapshot, type Notice,
} from './model.ts'
import type { FolderRowTarget } from './row-menu.ts'
import { FileViewer, SHEET_COLUMNS, SHEET_ROWS, viewerKind, type ViewerReads } from './viewer.tsx'
import { TreeResize } from './TreeResize.tsx'
import css from './Panel.module.css'

/** One entry the page asks about. */
export interface AskTarget {
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/** Injected share of the page. */
export interface PanelInjected {
  readonly hooks: {
    /** The page's state. */
    readonly folder: ObservableSnapshot<FolderSnapshot>
    /** The client folders: the workspaces of this runtime. */
    readonly clients: ObservableSnapshot<readonly WorkspaceView[]>
    /** The shortcut catalog, for the keycaps of the acts. */
    readonly catalog: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
    /** The UI language, for dates and sizes. */
    readonly language: ObservableSnapshot<LocaleId>
    /** The folder tree's width in px, kept in this browser. */
    readonly treeWidth: ObservableSnapshot<number>
    /** The state of Add client. */
    readonly addClient: ObservableSnapshot<AddClientSnapshot>
  }
  /** Add client's acts. */
  readonly addClient: AddClientModel
  /** The translate function of the Add client namespace. */
  readonly addClientT: AddClientTranslate
  /** Set the folder tree's width; it is kept inside the app sidebar's limits. */
  readonly setTreeWidth: (px: number) => void
  readonly model: FolderModel
  /** The file readers of the open client folder's Session. */
  readonly reads: (session: string) => ViewerReads
  /** Start a chat in the open client folder's workspace about these entries. */
  readonly ask: (workspaceId: WorkspaceId, targets: readonly AskTarget[]) => void
  /** Set the handlers of the page's keys. */
  readonly setKeys: (handlers: KeyHandlers) => void
}

/** Props of the page. */
export type PanelProps = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<PanelInjected> & PropsRenderFactories

type Translate = (key: FlowleapFolderKey, values?: Record<string, string | number>) => string

/**
 * The Clients row's icon in the app sidebar.
 * @param props - the icon size.
 * @returns the icon.
 */
export function ClientsIcon({ size }: Pick<SidebarPanelIconOwnerProps, 'size'>) {
  return <IconFolderCloseRegular size={size} />
}

/** The kind word of an entry. */
function kindOf(t: Translate, entry: Pick<FolderEntry, 'name' | 'kind' | 'source'>): string {
  const role = entry.source?.kind === 'add-client' ? entry.source.role : undefined
  if (role !== undefined) return t(role === 'family' ? 'kind.family' : 'kind.matter')
  if (entry.kind === 'directory') return t('kind.folder')
  const kind = viewerKind(entry.name)
  return t(kind === 'none' ? 'kind.file' : `kind.${kind}`)
}

/** A byte size as the file manager writes it, in the UI language. */
function sizeOf(bytes: number | undefined, locale: LocaleId): string {
  if (bytes === undefined) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1 }).format(value)} ${units[unit]}`
}

/** A modified time: "Today, 14:02" for today, else the date. */
function modifiedOf(t: Translate, iso: string, locale: LocaleId, now: Date): string {
  const date = new Date(iso)
  if (date.toDateString() === now.toDateString()) {
    return t('modified.today', { time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date) })
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

/** The source word of an entry. */
function sourceOf(t: Translate, entry: FolderEntry, client: string): string {
  if (entry.trashedFrom !== undefined) return t('source.trashed', { folder: parentOf(entry.trashedFrom) === '' ? client : parentOf(entry.trashedFrom) })
  if (entry.source === undefined) return t('source.none')
  return t(entry.source.kind === 'upload' ? 'source.upload' : entry.source.kind === 'folder' ? 'source.folder' : 'source.addClient')
}

/** Whether an entry lies directly in Trash, where Restore applies. */
export function inTrash(path: string): boolean {
  return parentOf(path) === TRASH
}


/** How long the search waits after the last key before it asks the Host. */
const SEARCH_WAIT_MS = 150
/** A second click this soon after a file opens is part of the double-click that opened it. */
const OPEN_CLICK_MS = 500

/** The failure sentence of a code. */
function failureOf(t: Translate, code: FailureCode): string {
  return t(`failure.${code}`)
}

/** A button with its keycaps from the shortcut catalog. */
function ActButton({ label, icon, keycaps, primary = false, disabled = false, onClick, className }: {
  readonly label: string
  readonly icon: ReactNode
  readonly keycaps?: readonly KeycapBox[]
  readonly primary?: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly className?: string | undefined
}) {
  return (
    <Button variant={primary ? 'primary' : 'outline'} size="sm" icon={icon} disabled={disabled} onClick={onClick} className={className}>
      {label}
      {keycaps !== undefined && keycaps.length > 0 && <Keycap keycaps={keycaps} tone={primary ? 'primary' : 'default'} className={css.keycap} />}
    </Button>
  )
}

/**
 * Render the client folder page.
 * @param props - the hooks, the model, the readers and copy.
 * @returns the page.
 */
export function FolderPanel(props: PanelProps) {
  const { t, useFolder, useClients, useCatalog, useLanguage, useAddClient, model, addClient, addClientT } = props
  const state = useFolder(value => value)
  const adding = useAddClient(value => value)
  const clients = useClients(value => value)
  const catalog = useCatalog(rows => rows)
  const locale = useLanguage(value => value)
  const keycaps = useMemo(() => keycapsOf(catalog), [catalog])
  const client = clients.find(item => item.workspaceId === state.workspaceId) ?? null
  const page = useRef<HTMLElement>(null)
  // An act can remove the control that has the focus, such as a client of the list, and the focus then falls to the
  // document body, where no page key runs. The browser fires no blur for a removed control, so after each render the
  // page takes the focus when nothing has it.
  useEffect(() => {
    const active = document.activeElement
    if (active === null || active === document.body) page.current?.focus({ preventScroll: true })
  })
  // The builds and the Watch list stay current while the page is open.
  useEffect(() => addClient.follow(), [addClient])
  return (
    <section ref={page} className={css.panel} data-testid="flowleap-folder" data-shortcut-scope={FOLDER_SCOPE} tabIndex={-1}>
      {adding.view !== null
        ? (
          <AddClientPage t={addClientT} view={adding.view} model={addClient} locale={locale} setKeys={props.setKeys}
            recordKey={recordKeyOf(catalog)} retryKeycaps={keycaps('retry')} />
        )
        : client === null
          ? (
            <ClientsList t={t} addT={addClientT} clients={clients} builds={adding.builds} watching={adding.watching}
              open={(id) => { void model.openClient(id) }} add={() => { addClient.start() }}
              openBuild={(id) => { addClient.openBuild(id) }} />
          )
          : <ClientFolderView {...props} state={state} client={client} keycaps={keycaps} locale={locale} builds={adding.builds} />}
      {adding.view === null && adding.toast !== null && (
        <AddClientToast t={addClientT} toast={adding.toast} onClose={() => { addClient.dismissToast() }} />
      )}
    </section>
  )
}

/** The Clients list: one row for each client folder, a row for each build without its folder yet, and Watching. */
function ClientsList({ t, addT, clients, builds, watching, open, add, openBuild }: {
  readonly t: Translate
  readonly addT: AddClientTranslate
  readonly clients: readonly WorkspaceView[]
  readonly builds: readonly BuildStatus[]
  readonly watching: AddClientSnapshot['watching']
  readonly open: (id: WorkspaceId) => void
  readonly add: () => void
  readonly openBuild: (clientId: BuildStatus['clientId']) => void
}) {
  const buildOf = (id: WorkspaceId) => builds.find(build => build.workspace === id)
  // A build shows on its client's row; a build whose folder is not a listed client folder yet has its own row.
  const pending = builds.filter(build => build.state !== 'done' && !clients.some(item => item.workspaceId === build.workspace))
  return (
    <>
      <header className={css.topbar} data-frame-top-row="">
        <div className={css.crumbs}><span className={css.here}>{t('clients.title')}</span></div>
        <div className={css.actions}>
          <Button variant="primary" size="sm" icon={<IconProjectAddOutlineRegular size={16} />} onClick={add}>{addT('list.add')}</Button>
        </div>
      </header>
      <div className={css.scroll}>
        <div className={css.head}>
          <h1 className={css.title}>{t('clients.title')}</h1>
          <p className={css.lede}>{t('clients.lede')}</p>
        </div>
        {clients.length === 0 && pending.length === 0
          ? (
            <div className={css.empty}>
              <h2>{t('clients.empty.title')}</h2>
              <p>{t('clients.empty.body')}</p>
              <Button variant="outline" size="sm" icon={<IconProjectAddOutlineRegular size={16} />} onClick={add}>{addT('list.add')}</Button>
            </div>
          )
          : (
            <ul className={css.list} aria-label={t('clients.listLabel')}>
              {pending.map(build => (
                <li key={build.clientId}>
                  <button type="button" className={clsx(css.row, css.clientRow)} onClick={() => { openBuild(build.clientId) }}>
                    <span className={css.icon}><IconFolderCloseRegular size={16} /></span>
                    <span className={css.name}>{build.name}</span>
                    <BuildState t={addT} build={build} />
                  </button>
                </li>
              ))}
              {clients.map((item) => {
                const build = buildOf(item.workspaceId)
                // While its build runs or after it stopped, the row opens the build, where Try again is.
                const building = build !== undefined && build.state !== 'done'
                return (
                  <li key={item.workspaceId}>
                    <button type="button" className={clsx(css.row, css.clientRow)} onClick={() => { if (building) openBuild(build.clientId); else open(item.workspaceId) }}>
                      <span className={css.icon}><IconFolderCloseRegular size={16} /></span>
                      <span className={css.name}>{item.title}</span>
                      {build !== undefined && <BuildState t={addT} build={build} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        <WatchingList t={addT} watching={watching} />
      </div>
    </>
  )
}

/** The open client folder: the top bar, the tree and the middle area. */
function ClientFolderView(props: PanelProps & {
  readonly state: FolderSnapshot
  readonly client: WorkspaceView
  readonly keycaps: (act: KeyAct) => readonly KeycapBox[]
  readonly locale: LocaleId
  readonly builds: readonly BuildStatus[]
}) {
  const { t, state, client, keycaps, model, renderFactorySlot, useTreeWidth, builds, addClient, addClientT } = props
  // Add client built this folder: Check for new matters runs it again for the same client.
  const built = builds.find(build => build.workspace === client.workspaceId)
  const fileInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const treeWidth = useTreeWidth(width => width)
  const [query, setQuery] = useState(state.search.query)
  useEffect(() => {
    if (query === state.search.query) return undefined
    const timer = setTimeout(() => { void model.search(query) }, SEARCH_WAIT_MS)
    return () => { clearTimeout(timer) }
  }, [query, state.search.query, model])
  const searching = state.search.query.trim() !== '' || query.trim() !== ''
  const listing = state.listings[state.folder]
  const entries = listing?.entries ?? []
  const entryOf = (path: string): FolderEntry | undefined =>
    state.listings[parentOf(path)]?.entries.find(entry => entry.name === baseName(path))
  const targets = (paths: readonly string[]): AskTarget[] => paths.map(path => ({ path, kind: entryOf(path)?.kind ?? 'file' }))
  const askCurrent = () => {
    const subject = state.checked.length > 0 ? targets(state.checked) : state.open !== null ? targets([state.open]) : [{ path: state.folder, kind: 'directory' as const }]
    props.ask(client.workspaceId, subject)
  }
  const chooseFiles = () => { fileInput.current?.click() }
  // Trash holds only what Move to Trash put there, so the page makes and uploads nothing into it.
  const writable = state.connect === 'ready' && !isTrashPath(state.folder)
  const selection = state.checked.length > 0 ? state.checked : state.open === null ? [] : [state.open]
  const [single] = selection
  const handlers: KeyHandlers = state.connect !== 'ready' || state.moving !== null || state.conflict !== null
    ? {}
    : {
      ask: askCurrent,
      ...(writable ? { newFolder: () => { model.startNewFolder() }, upload: chooseFiles } : {}),
      ...(selection.length === 1 && single !== undefined ? { rename: () => { model.startRename(single) } } : {}),
      ...(selection.length > 0 ? { move: () => { model.startMove(selection) } } : {}),
      ...(selection.length > 0 && !selection.some(isTrashPath) ? { trash: () => { void model.trash(selection) } } : {}),
      find: () => { searchInput.current?.focus() },
    }
  useLayoutEffect(() => { props.setKeys(handlers) })
  const clearSearch = () => {
    setQuery('')
    void model.search('')
  }
  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const hit = state.search.hits[state.search.highlight]
    if (event.key === 'Escape') {
      event.preventDefault()
      clearSearch()
      event.currentTarget.blur()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      model.moveHighlight(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && hit !== undefined) {
      event.preventDefault()
      setQuery('')
      void model.openHit(hit)
    }
  }
  const folderTitle = state.folder === '' ? client.title : baseName(state.folder)
  const parts = state.folder === '' ? [] : state.folder.split('/')
  const crumbs = (
    <nav className={css.crumbs} aria-label={t('crumbs.label')}>
      {(parts.length > 0 || state.open !== null) && (
        <button type="button" className={clsx(css.iconButton, css.onlyNarrow)} aria-label={t('act.up')}
          onClick={() => { if (state.open !== null) model.closeFile(); else void model.go(parentOf(state.folder)) }}>
          <IconChevronLeftOutlineRegular size={16} />
        </button>
      )}
      <button type="button" className={clsx(css.iconButton, css.onlyNarrow)} aria-label={t('act.showFolders')} aria-expanded={treeOpen}
        onClick={() => { setTreeOpen(open => !open) }}>
        <IconWorkspaceTreeOutlineRegular size={16} />
      </button>
      <button type="button" className={clsx(css.crumb, css.wide)} onClick={() => { void model.openClient(null) }}>{t('clients.title')}</button>
      <span className={clsx(css.sep, css.wide)}>›</span>
      <button type="button" className={clsx(css.crumb, css.wide)} onClick={() => { void model.go('') }}>{client.title}</button>
      {parts.length > 1 && (
        <span className={css.wide}><span className={css.sep}>›</span><span className={css.sep} title={state.folder}>…</span></span>
      )}
      {parts.length > 0 && (
        <span className={clsx(css.level, css.wide)}>
          <span className={css.sep}>›</span>
          {state.open === null
            ? <span className={css.here} title={folderTitle}>{folderTitle}</span>
            : <button type="button" className={css.crumb} title={folderTitle} onClick={() => { model.closeFile() }}>{folderTitle}</button>}
        </span>
      )}
      {state.open !== null && (
        <span className={clsx(css.level, css.wide)}>
          <span className={css.sep}>›</span>
          <span className={css.here} title={baseName(state.open)}>{baseName(state.open)}</span>
        </span>
      )}
      {state.open === null && parts.length > 0 && <span className={clsx(css.here, css.onlyNarrow)}>{folderTitle}</span>}
    </nav>
  )
  const treeEntries: TreeEntry[] = Object.entries(state.listings).flatMap(([folder, item]) => item.entries.map(entry => ({
    path: childPath(folder, entry.name),
    name: entry.name,
    meta: { kind: entry.kind, ...(entry.size === undefined ? {} : { size: entry.size }) },
  })))
  const directories = Object.fromEntries(Object.entries(state.listings)
    .filter(([, item]) => item.status !== 'loaded')
    .map(([folder, item]) => [folder, item.status === 'loading' ? { loading: true as const } : { failure: t('error.list') }]))
  return (
    <>
      <header className={css.topbar} data-frame-top-row="">
        {crumbs}
        <input ref={searchInput} type="search" className={css.search} value={query} aria-label={t('search.label')}
          placeholder={t('search.placeholder', { client: client.title })} disabled={state.connect !== 'ready'}
          onChange={(event) => { setQuery(event.currentTarget.value) }} onKeyDown={onSearchKey} />
        <div className={css.actions}>
          {built !== undefined && (
            <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={16} />} className={css.wide}
              onClick={() => { void addClient.checkForNew(built.clientId) }}>{addClientT('folder.check')}</Button>
          )}
          <ActButton label={t('act.newFolder')} icon={<IconProjectAddOutlineRegular size={16} />} keycaps={keycaps('newFolder')}
            disabled={!writable} onClick={() => { model.startNewFolder() }} className={css.wide} />
          <ActButton label={t('act.upload')} icon={<IconPaperclipOutlineRegular size={16} />} keycaps={keycaps('upload')}
            disabled={!writable} onClick={chooseFiles} className={css.wide} />
          <button type="button" className={clsx(css.iconButton, css.onlyNarrow)} aria-label={t('act.newFolder')}
            disabled={!writable} onClick={() => { model.startNewFolder() }}>
            <IconProjectAddOutlineRegular size={16} />
          </button>
          <button type="button" className={clsx(css.iconButton, css.onlyNarrow)} aria-label={t('act.upload')}
            disabled={!writable} onClick={chooseFiles}>
            <IconPaperclipOutlineRegular size={16} />
          </button>
          {state.checked.length === 0 && state.open === null && (
            <ActButton label={t('act.ask')} icon={<IconNewChatOutlineRegular size={16} />} keycaps={keycaps('ask')} primary
              disabled={state.connect !== 'ready'} onClick={askCurrent} />
          )}
          <input ref={fileInput} type="file" multiple hidden aria-label={t('upload.label')}
            onChange={(event) => {
              const files = [...event.currentTarget.files ?? []]
              event.currentTarget.value = ''
              if (files.length > 0) void model.upload(files, state.folder)
            }} />
        </div>
      </header>
      {state.connect === 'failed'
        ? (
          <div className={css.empty} role="alert">
            <h2>{t('error.connect')}</h2>
            <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={16} />} onClick={() => { void model.openClient(client.workspaceId) }}>{t('act.retry')}</Button>
          </div>
        )
        : (
          <div className={css.body} style={{ gridTemplateColumns: `${treeWidth}px minmax(0, 1fr)` }}>
            <nav className={clsx(css.tree, treeOpen && css.treeOpen)} aria-label={t('tree.label')}>
              {renderFactorySlot('sidebar.files.tree', {
                root: '',
                entries: treeEntries,
                expanded: state.expanded,
                directories,
                current: state.open ?? undefined,
                // A press on a closed folder, or on an open folder that the middle area does not list, lists it; a press
                // on the listed folder closes it in the tree.
                onToggle: (entry, expand) => {
                  setTreeOpen(false)
                  if (expand || entry.path !== state.folder || state.open !== null) void model.go(entry.path)
                  else void model.toggle(entry.path, false)
                },
                onOpen: (entry) => {
                  setTreeOpen(false)
                  model.openFile(entry.path)
                },
              })}
            </nav>
            <TreeResize width={treeWidth} onWidth={props.setTreeWidth} label={t('resize.label')} />
            <div className={css.middle}>
              {searching
                ? <SearchView {...props} query={query} openHit={(hit) => { setQuery(''); void model.openHit(hit) }} clear={clearSearch} />
                : state.open !== null && state.session !== null
                  ? (
                    <FileView {...props} path={state.open} entry={entryOf(state.open)} session={state.session}
                      askCurrent={askCurrent} keycaps={keycaps} />
                  )
                  : (
                    <FolderView {...props} title={folderTitle} entries={entries} keycaps={keycaps}
                      askCurrent={askCurrent} chooseFiles={chooseFiles} />
                  )}
            </div>
          </div>
        )}
      {state.moving !== null && <MoveDialog {...props} moving={state.moving} />}
      {state.conflict !== null && <ConflictDialog {...props} conflict={state.conflict} />}
      {state.notice !== null && <NoticeBar {...props} notice={state.notice} />}
    </>
  )
}

/** The middle area for a file: its name, its facts, the viewer. */
function FileView({ t, state, locale: language, path, entry, session, askCurrent, keycaps, reads, client }: PanelProps & {
  readonly state: FolderSnapshot
  readonly locale: LocaleId
  readonly path: string
  readonly entry: FolderEntry | undefined
  readonly session: string
  readonly askCurrent: () => void
  readonly keycaps: (act: KeyAct) => readonly KeycapBox[]
  readonly client: WorkspaceView
}) {
  const readers = useMemo(() => reads(session), [reads, session])
  const labels = useViewerLabels(t)
  const name = baseName(path)
  const opened = useRef(0)
  useEffect(() => { opened.current = performance.now() }, [path])
  // The second click of a double-click on a row lands on the file that the first click opened; it selects no text.
  const onMouseDown = (event: MouseEvent) => {
    if (event.detail > 1 && performance.now() - opened.current < OPEN_CLICK_MS) event.preventDefault()
  }
  return (
    <div className={css.file} onMouseDown={onMouseDown}>
      <div className={css.fileHead}>
        <div className={css.fileTitle}>
          <h1 className={css.title}>{name}</h1>
          <p className={css.meta}>
            <span>{kindOf(t, { name, kind: 'file' })}</span>
            {entry !== undefined && <span>{sizeOf(entry.size, language)}</span>}
            {entry !== undefined && <span>{sourceOf(t, entry, client.title)}</span>}
            {entry !== undefined && <span>{modifiedOf(t, entry.modifiedAt, language, new Date())}</span>}
          </p>
        </div>
        <div className={css.actions}>
          {state.checked.length === 0 && (
            <ActButton label={t('act.ask')} icon={<IconNewChatOutlineRegular size={16} />} keycaps={keycaps('ask')} primary onClick={askCurrent} />
          )}
        </div>
      </div>
      <FileViewer path={path} reads={readers} labels={labels} locale={language} key={`${client.workspaceId}:${path}`} />
    </div>
  )
}

/** The viewers' copy, stable for a locale revision. */
function useViewerLabels(t: Translate) {
  return useMemo(() => {
    const markdown: MarkdownLabels = {
      code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied'), toolbarLabels: { codeLabel: t('markdown.code'), wrapLabel: t('markdown.wrap'), unwrapLabel: t('markdown.unwrap') } },
      footnotes: t('markdown.footnotes'),
    }
    return {
      loading: t('loading'), failed: t('viewer.failed'), none: t('viewer.none'), from: t('viewer.from'), to: t('viewer.to'),
      date: t('viewer.date'), noSubject: t('viewer.noSubject'), markdown,
      sheetTabs: t('sheet.tabs'), sheetEmpty: t('sheet.empty'), sheetCut: t('sheet.rows', { rows: SHEET_ROWS, columns: SHEET_COLUMNS }), document: (name: string) => t('viewer.document', { name }),
    }
  }, [t])
}

/** The middle area for a folder: its header, its folders and files, the drop target and the bulk bar. */
function FolderView(props: PanelProps & {
  readonly state: FolderSnapshot
  readonly client: WorkspaceView
  readonly locale: LocaleId
  readonly title: string
  readonly entries: readonly FolderEntry[]
  readonly keycaps: (act: KeyAct) => readonly KeycapBox[]
  readonly askCurrent: () => void
  readonly chooseFiles: () => void
}) {
  const { t, state, client, locale, title, entries, keycaps, model, useContextMenu } = props
  const [dragging, setDragging] = useState<number | null>(null)
  const { getTriggerProps } = useContextMenu()
  const listing = state.listings[state.folder]
  const now = new Date()
  const byName = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const folders = entries.filter(entry => entry.kind === 'directory').sort((a, b) => byName.compare(a.name, b.name))
  const files = entries.filter(entry => entry.kind === 'file').sort((a, b) => byName.compare(a.name, b.name))
  const uploads = state.uploads.filter(upload => upload.dir === state.folder)
  const edit = state.edit
  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files') || isTrashPath(state.folder)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (dragging === null) setDragging(event.dataTransfer.items.length)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(null)
    const dropped = [...event.dataTransfer.files]
    if (dropped.length > 0) void model.upload(dropped, state.folder)
  }
  const row = (entry: FolderEntry) => {
    const path = childPath(state.folder, entry.name)
    const target: FolderRowTarget = { path, kind: entry.kind, inTrash: inTrash(path) }
    const checked = state.checked.includes(path)
    if (edit?.kind === 'rename' && edit.path === path) return <NameRow key={path} {...props} initial={entry.name} kind={entry.kind} />
    return (
      <div key={path} role="row" className={clsx(css.row, checked && css.checked)} data-testid="folder-row"
        {...getTriggerProps({ kind: 'flowleap.folder-row', value: target })}>
        <span className={css.lead} role="gridcell">
          <input type="checkbox" className={css.check} checked={checked} aria-label={t('select.row', { name: entry.name })}
            onChange={(event) => { model.check(path, event.currentTarget.checked) }} />
        </span>
        <button type="button" role="gridcell" className={css.name} title={entry.name}
          onClick={() => { if (entry.kind === 'directory') void model.go(path); else model.openFile(path) }}>
          <span className={css.icon}>{entry.kind === 'directory' ? <IconFolderCloseRegular size={16} /> : <FileTypeIcon path={entry.name} size={16} />}</span>
          <span className={css.nameText}>{entry.name}</span>
        </button>
        <span role="gridcell" className={css.cell}>{kindOf(t, entry)}</span>
        <span role="gridcell" className={clsx(css.cell, css.num)}>{sizeOf(entry.size, locale)}</span>
        <span role="gridcell" className={clsx(css.cell, css.num)}>{modifiedOf(t, entry.modifiedAt, locale, now)}</span>
        <span role="gridcell" className={css.cell}>{sourceOf(t, entry, client.title)}</span>
      </div>
    )
  }
  const failed = listing?.status === 'failed'
  return (
    <div className={clsx(css.folder, dragging !== null && css.dropping)} onDragOver={onDragOver}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(null) }} onDrop={onDrop}>
      <div className={css.scroll}>
        {failed && (
          <div className={css.notice} role="alert">
            <IconWarningTriangleOutlineRegular size={16} />
            <span>{t('error.list')} {listing.asOf === undefined ? '' : t('error.asOf', { time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(listing.asOf)) })}</span>
            <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={16} />} onClick={() => { void model.refresh(state.folder) }}>{t('act.retry')}</Button>
          </div>
        )}
        <div className={css.head}>
          <h1 className={css.title}>{title}</h1>
          {state.folder !== '' && <p className={css.lede}>{client.title} · {state.folder}</p>}
        </div>
        {listing === undefined || listing.status === 'loading'
          ? <div className={css.skeleton} aria-label={t('loading')} role="status">{[70, 50, 60, 40, 55].map(width => <span key={width} style={{ width: `${width}%` }} />)}</div>
          : entries.length === 0 && uploads.length === 0 && edit === null
            ? (
              state.folder === TRASH
                ? <div className={css.empty}><h2>{t('trash.empty.title')}</h2><p>{t('trash.empty.body')}</p></div>
                : (
                  <div className={css.empty}>
                    <h2>{t('empty.title', { folder: title })}</h2>
                    <p>{t('empty.body')}</p>
                    <Button variant="outline" size="sm" icon={<IconPaperclipOutlineRegular size={16} />} onClick={props.chooseFiles}>{t('act.upload')}</Button>
                  </div>
                )
            )
            : (
              <div className={css.table} role="grid" aria-label={t('list.label')}>
                <div className={css.thead} role="row">
                  <span />
                  <span role="columnheader">{t('col.name')}</span>
                  <span role="columnheader">{t('col.kind')}</span>
                  <span role="columnheader">{t('col.size')}</span>
                  <span role="columnheader">{t('col.modified')}</span>
                  <span role="columnheader">{t('col.source')}</span>
                </div>
                {(folders.length > 0 || edit?.kind === 'new-folder') && (
                  <>
                    <div className={css.group} role="row"><span role="gridcell">{t('group.folders')}</span><span className={css.count}>{folders.length}</span></div>
                    {edit?.kind === 'new-folder' && <NameRow {...props} initial={t('act.newFolder')} kind="directory" />}
                    {folders.map(row)}
                  </>
                )}
                {(files.length > 0 || uploads.length > 0) && (
                  <>
                    <div className={css.group} role="row"><span role="gridcell">{t('group.files')}</span><span className={css.count}>{files.length + uploads.length}</span></div>
                    {uploads.map(upload => (
                      <div key={upload.id} role="row" className={clsx(css.row, css.adding)}>
                        <span className={css.lead} />
                        <span role="gridcell" className={css.name}><span className={css.icon}><FileTypeIcon path={upload.name} size={16} /></span><span className={css.nameText}>{upload.name}</span></span>
                        <span role="gridcell" className={css.cell}>{kindOf(t, { name: upload.name, kind: 'file' })}</span>
                        <span role="gridcell" className={css.cell}><span className={css.progress}><span style={{ width: `${Math.round(upload.progress * 100)}%` }} /></span></span>
                        <span role="gridcell" className={css.cell}>{t('adding')}</span>
                        <span role="gridcell" className={css.cell}>{t('source.upload')}</span>
                      </div>
                    ))}
                    {files.map(row)}
                  </>
                )}
              </div>
            )}
      </div>
      {dragging !== null && (
        <div className={css.dropHint} role="status">
          <IconPaperclipOutlineRegular size={16} />
          {dragging === 1 ? t('drop.one', { folder: title }) : dragging > 1 ? t('drop.many', { count: dragging, folder: title }) : t('drop.files', { folder: title })}
        </div>
      )}
      {state.checked.length > 0 && (
        <div className={css.bulkDock}>
          <div className={css.bulk} data-bulk="">
            <button type="button" className={css.iconButton} aria-label={t('act.clear')} onClick={() => { model.clearChecks() }}><IconCloseOutlineRegular size={16} /></button>
            <span className={css.bulkCount}>{t('selected', { count: state.checked.length })}</span>
            <span className={css.spacer} />
            {state.checked.every(inTrash)
              ? <ActButton label={t('act.restore')} icon={<IconRefreshOutlineRegular size={16} />} onClick={() => { void model.restore(state.checked) }} />
              : !state.checked.some(isTrashPath) && (
                <ActButton label={t('act.trash')} icon={<IconTrashOutlineRegular size={16} />} keycaps={keycaps('trash')} onClick={() => { void model.trash(state.checked) }} />
              )}
            <ActButton label={t('act.move')} icon={<IconRightUpOutlineRegular size={16} />} keycaps={keycaps('move')} onClick={() => { model.startMove(state.checked) }} />
            <ActButton label={t('act.askCount', { count: state.checked.length })} icon={<IconNewChatOutlineRegular size={16} />} keycaps={keycaps('ask')} primary onClick={props.askCurrent} />
          </div>
        </div>
      )}
    </div>
  )
}

/** The name field of a new folder or of a renamed entry, in the list. */
function NameRow({ t, state, model, initial, kind }: PanelProps & { readonly state: FolderSnapshot; readonly initial: string; readonly kind: 'file' | 'directory' }) {
  const [value, setValue] = useState(initial)
  const error = state.edit?.error
  const select = (input: HTMLInputElement | null) => {
    if (input === null || input.dataset.selected === 'true') return
    input.dataset.selected = 'true'
    input.focus()
    const dot = kind === 'file' ? initial.lastIndexOf('.') : -1
    input.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }
  return (
    <div role="row" className={clsx(css.row, css.editing)}>
      <span className={css.lead} />
      <span role="gridcell" className={css.nameEdit}>
        <span className={css.icon}>{kind === 'directory' ? <IconFolderCloseRegular size={16} /> : <IconEditOutlineRegular size={16} />}</span>
        <input ref={select} className={css.field} value={value} aria-label={t('name.label')} aria-invalid={error !== undefined}
          onChange={(event) => { setValue(event.currentTarget.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void model.commitEdit(value)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              model.cancelEdit()
            }
          }}
          onBlur={() => { if (state.edit?.error === undefined) model.cancelEdit() }} />
        {error !== undefined && <span className={css.fieldError} role="alert"><IconWarningTriangleOutlineRegular size={16} />{failureOf(t, error)}</span>}
      </span>
    </div>
  )
}

/** The Move to dialog: the client folder and the folders the page has listed, as a tree. */
function MoveDialog({ t, state, client, model, moving }: PanelProps & {
  readonly state: FolderSnapshot
  readonly client: WorkspaceView
  readonly moving: readonly string[]
}) {
  const [target, setTarget] = useState<string | null>(null)
  const known = Object.entries(state.listings).flatMap(([folder, item]) =>
    item.entries.filter(entry => entry.kind === 'directory').map(entry => childPath(folder, entry.name)))
  const folders = ['', ...new Set(known)].sort((a, b) => a.localeCompare(b))
  const blocked = (folder: string) => moving.some(path => folder === parentOf(path) || folder === path || folder.startsWith(`${path}/`))
  const footer = (
    <div className={css.dialogActions}>
      <Button variant="ghost" size="sm" onClick={() => { model.cancelMove() }}>{t('act.cancel')}</Button>
      <Button variant="primary" size="sm" disabled={target === null}
        onClick={target === null ? undefined : () => { void model.commitMove(target) }}>{t('act.moveHere')}</Button>
    </div>
  )
  return (
    <Modal open onClose={() => { model.cancelMove() }} closeLabel={t('act.close')} footer={footer}
      title={moving.length === 1 ? t('move.one') : t('move.many', { count: moving.length })}
      description={t('move.body', { client: client.title })}>
      <ul className={css.pickList} aria-label={t('move.target')}>
        {folders.map(folder => (
          <li key={folder}>
            <button type="button" className={clsx(css.pick, target === folder && css.picked)} disabled={blocked(folder)}
              style={{ paddingInlineStart: `${8 + (folder === '' ? 0 : folder.split('/').length) * 12}px` }}
              aria-pressed={target === folder} onClick={() => { setTarget(folder) }}>
              <IconFolderCloseRegular size={16} />
              <span>{folder === '' ? client.title : baseName(folder)}</span>
            </button>
          </li>
        ))}
      </ul>
      {state.moveError !== null && <p className={css.fieldError} role="alert"><IconWarningTriangleOutlineRegular size={16} />{failureOf(t, state.moveError)}</p>}
    </Modal>
  )
}

/** The name conflict of a dropped file: Keep both or Skip. */
function ConflictDialog({ t, state, model, conflict }: PanelProps & { readonly state: FolderSnapshot; readonly conflict: ConflictState }) {
  const folder = conflict.dir === '' ? '' : baseName(conflict.dir)
  const taken = namesIn(state, conflict.dir)
  return (
    <Modal open onClose={() => { void model.resolveConflict(false) }} closeLabel={t('act.close')}
      title={t('conflict.title', { name: conflict.name, folder })}
      description={t('conflict.body', { other: keepBothName(conflict.name, taken) })}
      footer={(
        <div className={css.dialogActions}>
          <Button variant="ghost" size="sm" onClick={() => { void model.resolveConflict(false) }}>{t('act.skip')}</Button>
          <Button variant="primary" size="sm" onClick={() => { void model.resolveConflict(true) }}>{t('act.keepBoth')}</Button>
        </div>
      )}>
      {null}
    </Modal>
  )
}

/** The notice after uploads, or after a failed act. */
function NoticeBar({ t, model, notice }: PanelProps & { readonly notice: Notice }) {
  const folderName = (folder: string) => folder === '' ? '' : baseName(folder)
  const text = notice.kind === 'added'
    ? notice.count === 1
      ? t('added.one', { folder: folderName(notice.folder) })
      : t('added.many', { count: notice.count, folder: folderName(notice.folder) })
    : notice.kind === 'trashed'
      ? notice.count === 1 ? t('trashed.one') : t('trashed.many', { count: notice.count })
      : notice.kind === 'restored'
        ? notice.count === 1 ? t('restored.one') : t('restored.many', { count: notice.count })
        : failureOf(t, notice.error)
  return (
    <div className={clsx(css.toast, notice.kind === 'failed' && css.toastFailed)} role={notice.kind === 'failed' ? 'alert' : 'status'}>
      {notice.kind === 'failed' && <IconWarningTriangleOutlineRegular size={16} />}
      <span>{text}</span>
      {notice.kind === 'trashed' && (
        <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={16} />} onClick={() => { void model.restore(notice.paths) }}>
          {t('act.restore')}
        </Button>
      )}
      <button type="button" className={css.iconButton} aria-label={t('act.close')} onClick={() => { model.dismissNotice() }}><IconCloseOutlineRegular size={16} /></button>
    </div>
  )
}

/** The middle area while a search runs: the matching files and folders with their folder, the one that Enter opens marked. */
function SearchView({ t, state, client, query, openHit, clear }: PanelProps & {
  readonly state: FolderSnapshot
  readonly client: WorkspaceView
  readonly query: string
  readonly openHit: (hit: FolderSearchHit) => void
  readonly clear: () => void
}) {
  const { search } = state
  const waiting = search.status === 'loading' || search.query !== query
  return (
    <div className={css.folder}>
      <div className={css.scroll}>
        <div className={css.head}>
          <h1 className={css.title}>{t('search.title', { query: query.trim() })}</h1>
          <p className={css.lede}>
            <button type="button" className={css.crumb} onClick={clear}>{t('search.clear')}</button>
          </p>
        </div>
        {search.status === 'failed' && !waiting && (
          <div className={css.notice} role="alert"><IconWarningTriangleOutlineRegular size={16} /><span>{t('search.failed')}</span></div>
        )}
        {waiting
          ? <div className={css.skeleton} aria-label={t('loading')} role="status">{[60, 45, 70].map(width => <span key={width} style={{ width: `${width}%` }} />)}</div>
          : search.status === 'loaded' && search.hits.length === 0
            ? <div className={css.empty}><p>{t('search.none')}</p></div>
            : (
              <>
                <div className={css.table} role="grid" aria-label={t('search.label')}>
                  {search.hits.map((hit, index) => (
                    <div key={hit.path} role="row" aria-selected={index === search.highlight} data-testid="search-hit"
                      className={clsx(css.row, css.hit, index === search.highlight && css.checked)}>
                      <button type="button" role="gridcell" className={css.hitButton} onClick={() => { openHit(hit) }}>
                        <span className={css.icon}>{hit.kind === 'directory' ? <IconFolderCloseRegular size={16} /> : <FileTypeIcon path={hit.path} size={16} />}</span>
                        <span className={css.hitText}>
                          <span className={css.nameText}>{baseName(hit.path)}</span>
                          <span className={css.hitPath}>{parentOf(hit.path) === '' ? client.title : parentOf(hit.path)}</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                {search.truncated && <p className={css.more}>{t('search.more', { count: search.hits.length })}</p>}
              </>
            )}
      </div>
    </div>
  )
}
