// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { installKeyboard } from '@deepseek-ai/dsh-client-shortcuts/src/client/dom.ts'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
import type { MenuContribution } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { apply, askPrompt, inject, PANEL_ID, type PanelInjected } from '../src/client/index.ts'
import { FOLDER_SCOPE } from '../src/client/keys.ts'
// The row menu declares its context-menu target in this module.
import type {} from '../src/client/row-menu.ts'
import { de, en, NS } from '../src/client/locales.ts'

const SYNTEGON = 'ws-syntegon' as WorkspaceId
const SESSION = 'session-syntegon'
const ROOT = '/firm/Clients/Syntegon'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
}

/** Whether an injected face is the page's. */
function isPanel(value: unknown): value is PanelInjected {
  return typeof value === 'object' && value !== null && 'hooks' in value && 'model' in value
}

/** One followed folder: the Remote stream that the page reads its changes from. */
class Feed implements AsyncIterable<{ readonly value: { readonly kind: string }; readonly accept: () => void }> {
  disposed = false
  accepted = 0
  private readonly items: { readonly value: { readonly kind: string }; readonly accept: () => void }[] = []
  private failure: Error | undefined
  private wake: () => void = () => {}

  constructor(readonly name: string, private readonly ended: () => Error) {}

  push(kind: string): void {
    this.items.push({ value: { kind }, accept: () => { this.accepted += 1 } })
    this.wake()
  }

  end(): void {
    this.failure = this.ended()
    this.wake()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.wake()
  }

  async* [Symbol.asyncIterator]() {
    for (;;) {
      const item = this.items.shift()
      if (item !== undefined) {
        yield item
        continue
      }
      if (this.failure !== undefined) throw this.failure
      if (this.disposed) return
      await new Promise<void>((resolve) => { this.wake = resolve })
    }
  }
}

/** The Host's folder routes: each listing answers the entries of its folder. */
function folderRoutes(listings: Record<string, unknown[]>) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const path = new URL(url, 'http://firm.test/').searchParams.get('path') ?? ''
    return new Response(JSON.stringify({ path, entries: listings[path] ?? [], truncated: false }))
  }))
  return urls
}

const ENTRY = { name: 'Mandate.pdf', kind: 'file', size: 10, modifiedAt: '2026-11-08T09:00:00.000Z' }

/** Mount the browser half over service doubles; return the context and what the doubles saw. */
async function mounted(options: { readonly office?: boolean; readonly sidebar?: boolean } = {}) {
  const urls = folderRoutes({ '': [ENTRY] })
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const shortcuts = new ShortcutRegistry('web', 'macos', undefined, 500)
  ctx.provide('shortcuts', shortcuts as never)
  const menus: MenuContribution<'flowleap.folder-row'>[] = []
  ctx.provide('contextMenus', {
    register: (contribution: MenuContribution<'flowleap.folder-row'>) => {
      menus.push(contribution)
      return () => { menus.splice(menus.indexOf(contribution), 1) }
    },
  } as never)
  ctx.provide('layout', {} as never)
  const workspaces = createSnapshotStore({ items: [{ workspaceId: SYNTEGON, path: ROOT, title: 'Syntegon', sessionIds: [], createdAt: '', updatedAt: '' }] })
  ctx.provide('workspaces', { list: workspaces } as never)
  const started: unknown[][] = []
  ctx.provide('uiWorkspace', {
    connectWorkspace: async () => SESSION,
    startSession: (...args: unknown[]) => { started.push(args) },
  } as never)
  const feeds: Feed[] = []
  const changes: [string, string][] = []
  const reads: [string, string][] = []
  let readOk = true
  const workspaceFiles = {
    changes: (session: string, target: string) => { changes.push([session, target]) },
    readBytes: async (session: string, path: string) => {
      reads.push([session, path])
      return readOk ? { ok: true, value: { data: new Uint8Array([1, 2]) } } : { ok: false, error: { message: 'gone' } }
    },
  }
  const officeToPdf = {
    render: async (session: string, path: string, priority: string) => {
      reads.push([session, `${path} ${priority}`])
      return readOk ? { ok: true, value: { data: new Uint8Array([3]) } } : { ok: false, error: { message: 'no converter' } }
    },
  }
  ctx.provide('remote', {
    workspaceFiles,
    ...(options.office === true ? { officeToPdf } : {}),
    $stream: (stream: { readonly name: string; readonly open: (lifetime: string) => void; readonly ended: () => Error }) => {
      stream.open('lifetime')
      const feed = new Feed(stream.name, stream.ended)
      feeds.push(feed)
      return feed
    },
  } as never)
  ctx.provide('remote.workspaceFiles', workspaceFiles as never)
  const mountedSession = createSnapshotStore<string | null>(null)
  const resources: string[] = []
  if (options.sidebar !== false) {
    ctx.provide('sidebarRight', { mounted: mountedSession, openResource: (address: string) => { resources.push(address) } } as never)
  }
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: { 'sidebar.panellist': { kind: 'list', scope: 'root' }, main: { kind: 'keyed', scope: 'root' }, 'contextMenu.icon': { kind: 'keyed', scope: 'root', inline: true } },
  } as never, () => null)
  ctx.locale.setLocale('en')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  await settle()
  const face: unknown = ctx.slots.entries('main')[0]?.inject?.()
  if (!isPanel(face)) throw new Error('the main entry injects the page face')
  return {
    ctx, fiber, face, model: face.model, shortcuts, menus, workspaces, started, feeds, changes, reads, urls, mountedSession, resources,
    failReads: () => { readOk = false },
  }
}

describe('askPrompt', () => {
  it('drafts one mention for each entry, closes a quoted folder mention, and leaves out what a mention cannot hold', () => {
    expect(askPrompt([])).toBe('')
    expect(askPrompt([{ path: 'Mandate.pdf', kind: 'file' }])).toBe('@Mandate.pdf ')
    expect(askPrompt([{ path: 'Office', kind: 'directory' }, { path: 'EP 23 171 862', kind: 'directory' }, { path: 'Search report.md', kind: 'file' }]))
      .toBe('@Office/ @"EP 23 171 862/" @"Search report.md" ')
    expect(askPrompt([{ path: '', kind: 'directory' }, { path: 'Say "hi".md', kind: 'file' }])).toBe('')
  })
})

describe('ui-flowleap-folder browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'shortcuts', 'contextMenus', 'layout', 'workspaces', 'uiWorkspace', 'remote', 'remote.workspaceFiles'])
  })

  it('registers the Clients row, the page, the row menu, the keys and the copy, and removes them all on dispose', async () => {
    const { ctx, fiber, face, shortcuts, menus, feeds, model } = await mounted()
    const rows = ctx.slots.entries('sidebar.panellist')
    expect(rows.map(row => row.options)).toMatchObject([{ id: PANEL_ID, order: 19 }])
    expect((rows[0]!.options as { label: () => string }).label()).toBe(en.panel)
    expect(ctx.slots.entries('main').map(entry => (entry.options as { key: string }).key)).toEqual([PANEL_ID])
    expect(ctx.slots.entries('contextMenu.icon').map(entry => (entry.options as { key: string }).key)).toEqual([
      'flowleap.folder.open', 'flowleap.folder.ask', 'flowleap.folder.rename', 'flowleap.folder.move', 'flowleap.folder.copyPath',
    ])
    expect(menus.map(menu => [menu.id, menu.target])).toEqual([['flowleap.folder-row', 'flowleap.folder-row']])
    const folderKeys = () => shortcuts.catalog.getSnapshot().filter(row => row.id.startsWith('flowleap.folder.'))
    expect(folderKeys()).toHaveLength(5)
    expect(ctx.locale.bind(NS)('panel')).toBe(en.panel)
    expect(face.hooks.catalog).toBe(shortcuts.catalog)
    await model.openClient(SYNTEGON)
    expect(feeds).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    expect(ctx.slots.entries('contextMenu.icon')).toEqual([])
    expect(menus).toEqual([])
    expect(folderKeys()).toEqual([])
    expect(ctx.locale.bind(NS)('panel')).not.toBe(en.panel)
    expect(feeds[0]!.disposed).toBe(true)
    await ctx.fiber.dispose()
  })

  it('follows the UI language and the client folders of the runtime', async () => {
    const { ctx, face, workspaces } = await mounted()
    expect(face.hooks.language.getSnapshot()).toBe('en')
    ctx.locale.setLocale('de')
    expect(face.hooks.language.getSnapshot()).toBe('de')
    expect(ctx.locale.bind(NS)('panel')).toBe(de.panel)
    expect(face.hooks.clients.getSnapshot().map(client => client.title)).toEqual(['Syntegon'])
    workspaces.set({ items: [] })
    expect(face.hooks.clients.getSnapshot()).toEqual([])
    await ctx.fiber.dispose()
  })

  it('lists the open client folder through the folder routes and lists it again when a file in it changes', async () => {
    const { ctx, model, feeds, changes, urls } = await mounted()
    await model.openClient(SYNTEGON)
    expect(urls).toEqual([`api/flowleap/folder/list?workspace=${SYNTEGON}&path=`])
    expect(model.state.listings['']?.entries).toEqual([ENTRY])
    expect(changes).toEqual([[SESSION, ROOT]])
    expect(feeds[0]!.name).toBe('client folder ')
    feeds[0]!.push('ready')
    await settle()
    expect(feeds[0]!.accepted).toBe(1)
    expect(urls).toHaveLength(1)
    feeds[0]!.push('changed')
    await settle()
    expect(urls).toHaveLength(2)
    model.openFile('EP 23 171 862/Office/EP-Register.md')
    expect(feeds[0]!.disposed).toBe(true)
    expect(changes.at(-1)).toEqual([SESSION, `${ROOT}/EP 23 171 862/Office`])
    feeds[1]!.end()
    await settle()
    expect(model.state.connect).toBe('ready')
    await ctx.fiber.dispose()
  })

  it('follows no folder of a client folder that is no longer a workspace', async () => {
    const { ctx, model, feeds, workspaces } = await mounted()
    workspaces.set({ items: [] })
    await model.openClient(SYNTEGON)
    expect(feeds).toEqual([])
    await ctx.fiber.dispose()
  })

  it('reads a file under the client folder\'s Session, and an Office file through the Host\'s PDF conversion', async () => {
    const { ctx, face, reads, failReads } = await mounted({ office: true })
    const readers = face.reads(SESSION)
    const signal = new AbortController().signal
    expect(await readers.bytes('Mandate.pdf', signal)).toEqual(new Uint8Array([1, 2]))
    expect(await readers.officePdf('Letter.docx', signal)).toEqual(new Uint8Array([3]))
    expect(reads).toEqual([[SESSION, 'Mandate.pdf'], [SESSION, 'Letter.docx foreground']])
    failReads()
    await expect(readers.bytes('Mandate.pdf', signal)).rejects.toThrow('gone')
    await expect(readers.officePdf('Letter.docx', signal)).rejects.toThrow('no converter')
    await ctx.fiber.dispose()
  })

  it('cannot show an Office file in a runtime with no PDF conversion', async () => {
    const { ctx, face } = await mounted()
    await expect(face.reads(SESSION).officePdf('Letter.docx', new AbortController().signal)).rejects.toThrow('converts no Office file')
    await ctx.fiber.dispose()
  })

  it('opens the row menu acts on the row: open, ask, rename, move and copy path', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    onTestFinished(() => { Reflect.deleteProperty(navigator, 'clipboard') })
    const { ctx, menus, model, started } = await mounted()
    const resolve = (path: string, kind: 'file' | 'directory') => menus[0]!.resolve({ path, kind }, new AbortController().signal)
    const run = async (path: string, kind: 'file' | 'directory', id: string) => {
      const action = (await resolve(path, kind)).find(item => item.id === id)!
      await action.run!()
      await settle()
    }
    expect((await resolve('Mandate.pdf', 'file')).map(action => [action.id, action.label, action.commandId, action.icon?.key])).toEqual([
      ['open', en['act.open'], undefined, 'flowleap.folder.open'],
      ['ask', en['act.ask'], 'flowleap.folder.ask', 'flowleap.folder.ask'],
      ['rename', en['act.rename'], 'flowleap.folder.rename', 'flowleap.folder.rename'],
      ['move', en['act.move'], 'flowleap.folder.move', 'flowleap.folder.move'],
      ['copy-path', en['act.copyPath'], undefined, 'flowleap.folder.copyPath'],
    ])
    await run('Mandate.pdf', 'file', 'ask')
    expect(started).toEqual([])
    await run('Mandate.pdf', 'file', 'copy-path')
    expect(writeText).toHaveBeenLastCalledWith('/Mandate.pdf')
    await model.openClient(SYNTEGON)
    await run('EP 23 171 862', 'directory', 'open')
    expect(model.state.folder).toBe('EP 23 171 862')
    await run('EP 23 171 862/Office/EP-Register.md', 'file', 'open')
    expect(model.state.open).toBe('EP 23 171 862/Office/EP-Register.md')
    await run('Mandate.pdf', 'file', 'rename')
    expect(model.state.edit).toEqual({ kind: 'rename', path: 'Mandate.pdf' })
    await run('Mandate.pdf', 'file', 'move')
    expect(model.state.moving).toEqual(['Mandate.pdf'])
    await run('EP 23 171 862', 'directory', 'ask')
    expect(started).toEqual([[SYNTEGON, { prompt: '@"EP 23 171 862/" ', whenDraftExists: 'append' }]])
    await run('Mandate.pdf', 'file', 'copy-path')
    expect(writeText).toHaveBeenLastCalledWith(`${ROOT}/Mandate.pdf`)
    await ctx.fiber.dispose()
  })

  it('shows one asked file beside the chat once that Session is on screen', async () => {
    const { ctx, face, model, mountedSession, resources, started } = await mounted()
    await model.openClient(SYNTEGON)
    face.ask(SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }])
    expect(started).toEqual([[SYNTEGON, { prompt: '@Mandate.pdf ', whenDraftExists: 'append' }]])
    expect(resources).toEqual([])
    mountedSession.set('another session')
    expect(resources).toEqual([])
    mountedSession.set(SESSION)
    expect(resources).toEqual([fileAddressFor(SESSION, ROOT, 'Mandate.pdf')])
    mountedSession.set(null)
    mountedSession.set(SESSION)
    expect(resources).toHaveLength(1)
    face.ask(SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }])
    expect(resources).toHaveLength(2)
    await ctx.fiber.dispose()
  })

  it('stops waiting for the chat after five seconds', async () => {
    const { ctx, face, model, mountedSession, resources } = await mounted()
    await model.openClient(SYNTEGON)
    vi.useFakeTimers()
    face.ask(SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }])
    vi.advanceTimersByTime(4999)
    mountedSession.set('another session')
    vi.advanceTimersByTime(1)
    mountedSession.set(SESSION)
    expect(resources).toEqual([])
    await ctx.fiber.dispose()
  })

  it('shows no file beside the chat for a folder, several entries, no open Session, or no right sidebar', async () => {
    const { ctx, face, model, mountedSession, resources, started } = await mounted()
    mountedSession.set(SESSION)
    face.ask(SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }])
    await model.openClient(SYNTEGON)
    face.ask(SYNTEGON, [{ path: 'Office', kind: 'directory' }])
    face.ask(SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }, { path: 'Fee.pdf', kind: 'file' }])
    face.ask(SYNTEGON, [])
    expect(resources).toEqual([])
    expect(started).toHaveLength(4)
    await ctx.fiber.dispose()
    const bare = await mounted({ sidebar: false })
    await bare.model.openClient(SYNTEGON)
    bare.face.ask(SYNTEGON, [{ path: 'Mandate.pdf', kind: 'file' }])
    expect(bare.started).toHaveLength(1)
    await bare.ctx.fiber.dispose()
  })

  it('runs the key handlers that the page set last', async () => {
    const { ctx, face, shortcuts } = await mounted()
    const stop = installKeyboard(window, shortcuts, undefined, false)
    const page = document.createElement('section')
    page.dataset.shortcutScope = FOLDER_SCOPE
    page.tabIndex = -1
    document.body.append(page)
    page.focus()
    const ask = vi.fn()
    face.setKeys({ ask })
    page.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', bubbles: true, cancelable: true }))
    expect(ask).toHaveBeenCalledTimes(1)
    stop()
    page.remove()
    await ctx.fiber.dispose()
  })
})
