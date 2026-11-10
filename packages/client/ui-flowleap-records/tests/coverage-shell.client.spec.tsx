// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { MenuContribution } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { apply, inject, MY_WORK_PANEL_ID, PANEL_ID, RECORDS_LINK_ROUTE, type PanelInjected } from '../src/client/index.ts'
import type { AccountInjected } from '../src/client/Account.tsx'
import type { FileNumber, RecordsApi, TicketDetail, TicketId } from '../src/client/api.ts'
import type { FindInjected } from '../src/client/FindDialog.tsx'
import { en } from '../src/client/locales.ts'
import { MyWorkIcon } from '../src/client/Panel.tsx'
import { AgentDock } from '../src/client/parts/AgentDock.tsx'
import type { WorkRowTarget } from '../src/client/row-menu.ts'
import { fakeReference } from './agent-fakes.client.tsx'
import { createFixtureApi, fixtures, FIXTURE_IDS, intakeWaitingWire, meWire, sha } from './fixtures.client.ts'
import { flush, mountPanel } from './screen-harness.client.tsx'

const FILE = 'FL-2026-0001' as FileNumber
const WORK = { view: 'work', id: FIXTURE_IDS.ticket as TicketId } as const

let mounted: Awaited<ReturnType<typeof mountPanel>> | null = null
beforeEach(() => {
  vi.setSystemTime(Date.parse('2026-11-04T15:00:00Z'))
})
afterEach(() => {
  mounted?.dispose()
  mounted = null
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

class RemoteStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }
}

const json = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

/**
 * Mount the browser half over a stubbed `fetch` that answers the records-link route with `link`.
 * @param link - the answer of the records-link route.
 * @returns the context, the requests, the menus, the panel selections, the ⌘K handler and the ⌘K openings.
 */
async function plugin(link: () => Promise<Response>) {
  const stub = vi.fn(async (url: string) => {
    if (url === RECORDS_LINK_ROUTE) return link()
    return json(url === 'records/api/me' ? meWire : intakeWaitingWire)()
  })
  vi.stubGlobal('fetch', stub)
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new RemoteStub(ctx)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  const register = (_entry: unknown) => () => {}
  ctx.provide('shortcuts', {
    catalog: createSnapshotStore([]), fixedCatalog: createSnapshotStore([]), registerScope: register, registerScoped: register,
    registerScopedFixed: register, register,
  } as never)
  const opened: boolean[] = []
  ctx.provide('commandMenu', { contribute: register, close: () => {}, open: () => { opened.push(true); return true } } as never)
  const panelInfo = createSnapshotStore<{ activePanelId: string | null }>({ activePanelId: null })
  const selected: (string | null)[] = []
  ctx.provide('layout', { panelInfo, selectPanel: (id: string | null) => { selected.push(id); panelInfo.set({ activePanelId: id }) } } as never)
  const itemMenus: ((search: () => void) => boolean)[] = []
  ctx.provide('uiWorkspace', {
    startSession: () => {},
    provideLanding: () => () => {},
    provideItemMenu: (open: (search: () => void) => boolean) => {
      itemMenus.push(open)
      return () => {}
    },
  } as never)
  const menus: MenuContribution<'records.work-row'>[] = []
  ctx.provide('contextMenus', { register: (menu: MenuContribution<'records.work-row'>) => { menus.push(menu); return () => {} } } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.panellist': { kind: 'list', scope: 'root' }, 'sidebar.panellist.count': { kind: 'list', scope: 'root' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' }, 'main': { kind: 'keyed', scope: 'root' },
      'contextMenu.icon': { kind: 'keyed', scope: 'root', inline: true }, 'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.locale.setLocale('en')
  await ctx.plugin({ inject: [...inject], apply }).await()
  await flush()
  return { ctx, stub, menus, panelInfo, selected, itemMenus, opened }
}

/** The injected face of each slot that the tests read. */
interface Faces {
  'main': PanelInjected
  'shell.overlay': FindInjected
  'sidebar.footer.action': AccountInjected
  'sidebar.panellist.count': { readonly hooks: { readonly myWork: unknown } }
}

/**
 * The injected face of a slot's entry.
 * @param ctx - the context.
 * @param name - the slot.
 * @param index - the entry.
 * @returns the face.
 */
function face<N extends keyof Faces>(ctx: Context, name: N, index = 0): Faces[N] {
  return ctx.slots.entries(name)[index]!.inject!() as Faces[N]
}

describe('the browser half with a Records service', () => {
  it('opens My work for a landing address with a route, and connects the panels, Find a matter, ⌘K and Sign out', async () => {
    window.history.replaceState(null, '', '/?records=board')
    const { ctx, stub, panelInfo, selected, itemMenus, opened } = await plugin(json({ href: 'records/', signOutHref: null }))
    expect(selected).toEqual([MY_WORK_PANEL_ID])
    const myWork = face(ctx, 'main', 0)
    const matters = face(ctx, 'main', 1)
    expect(myWork.hooks.screen.getSnapshot().view).toBe('board')
    expect(face(ctx, 'sidebar.panellist.count').hooks.myWork).toBe(myWork.hooks.myWork)
    expect(myWork.pageHref('pages/1' as never)).toBe('records/api/pages/1')
    await myWork.nextConfirmer(sha(1) as never, FILE, new AbortController().signal)
    expect(stub.mock.calls.map(([url]) => url)).toContain(`records/api/intake/documents/${sha(1)}?matter=${FILE}`)

    myWork.openInMatters({ view: 'matter', fileNumber: FILE })
    expect(matters.hooks.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: FILE })
    expect(selected.at(-1)).toBe(PANEL_ID)
    matters.openMyWork()
    expect(myWork.hooks.screen.getSnapshot().view).toBe('my-work')
    expect(selected.at(-1)).toBe(MY_WORK_PANEL_ID)

    const find = face(ctx, 'shell.overlay')
    const [itemMenu] = itemMenus
    panelInfo.set({ activePanelId: 'chat' })
    expect(itemMenu!(() => {})).toBe(false)
    panelInfo.set({ activePanelId: MY_WORK_PANEL_ID })
    expect(itemMenu!(() => {})).toBe(true)
    expect(find.hooks.opening.getSnapshot()).toBe(1)
    myWork.openFind()
    expect(find.hooks.opening.getSnapshot()).toBe(2)
    find.close()
    expect(find.hooks.opening.getSnapshot()).toBeNull()
    const leave = myWork.commandItems.provide({ current: { id: 'item' } as never })
    expect(itemMenu!(() => {})).toBe(true)
    expect(opened).toEqual([true])
    expect(find.hooks.opening.getSnapshot()).toBeNull()
    leave()
    await find.search('Kessler', new AbortController().signal)
    expect(stub.mock.calls.map(([url]) => url)).toContainEqual(expect.stringMatching(/^records\/api\/search\?q=Kessler&/u))
    find.openMatter(FILE)
    expect(matters.hooks.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: FILE })

    face(ctx, 'sidebar.footer.action').leave('#signed-out')
    expect(window.location.hash).toBe('#signed-out')
    await ctx.fiber.dispose()
  })

  it('opens a My work task, its matter and its link from the row menu, and offers no acts for a task with no page', async () => {
    window.history.replaceState(null, '', '/')
    const { ctx, menus } = await plugin(json({ href: 'records/' }))
    const [myWork, matters] = [face(ctx, 'main', 0), face(ctx, 'main', 1)]
    const menu = menus.find(entry => entry.target === 'records.work-row')!
    const resolve = (row: WorkRowTarget) => menu.resolve(row, new AbortController().signal)
    const deadline = `deadline/${FIXTURE_IDS.deadline}`
    const actions = await resolve({ act: deadline, fileNumber: FILE })
    expect(actions.map(action => action.id)).toEqual(['open', 'open-matter', 'copy-link'])
    await actions[0]!.run!()
    expect(myWork.hooks.screen.getSnapshot()).toMatchObject({ view: 'deadline', id: FIXTURE_IDS.deadline })
    await actions[1]!.run!()
    expect(matters.hooks.screen.getSnapshot()).toMatchObject({ view: 'matter', fileNumber: FILE })
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await actions[2]!.run!()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`records=deadline%2F${FIXTURE_IDS.deadline}`))
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    await expect(actions[2]!.run!()).rejects.toThrow('clipboard')
    expect((await resolve({ act: deadline, fileNumber: null })).map(action => action.id)).toEqual(['open', 'copy-link'])
    expect(await resolve({ act: 'answer/1', fileNumber: FILE })).toEqual([])
    await ctx.fiber.dispose()
  })

  it('registers nothing for an answer that is not an object', async () => {
    for (const body of [null, 'records/']) {
      const { ctx } = await plugin(json(body))
      expect(ctx.slots.entries('main')).toEqual([])
      await ctx.fiber.dispose()
    }
  })
})

describe('the My work panel', () => {
  it('renders its own conversation slot in the agent panel of the work page', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel(api, WORK, 'en', 'my-work')
    fireEvent.click(mounted.panel.querySelector('button[data-dock]:not([aria-label])')!)
    act(() => { mounted!.agent.resource.set({ status: 'live', value: { kind: 'ready', reference: fakeReference('ses_r71work') }, failure: undefined }) })
    expect(mounted.panel.querySelector('[data-slot="records.mywork.agent.conversation"]')).toBeTruthy()
  })

  it('shows My work as the breadcrumb root over a view that no task opens, and over a dossier before it loads', async () => {
    const { api } = createFixtureApi()
    const records: RecordsApi = { ...api, matter: () => new Promise(() => {}) }
    mounted = await mountPanel(records, { view: 'board' }, 'en', 'my-work')
    const crumbs = () => screen.getByRole('navigation', { name: en['crumbs.label'] })
    expect(within(crumbs()).getByRole('button', { name: en['mywork.panel'] })).toBeTruthy()
    expect(crumbs().querySelector('[aria-current="page"]')!.textContent).toBe('')
    act(() => { mounted!.model.navigate({ view: 'matter', fileNumber: FILE }) })
    expect(crumbs().textContent).toBe(`${en['mywork.panel']}${FILE}`)
  })

  it('moves to the task before with the pager and copies the page link', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel(api, { view: 'deadline', id: FIXTURE_IDS.deadline as never }, 'en', 'my-work')
    fireEvent.click(screen.getByRole('button', { name: en['pager.previous'] }))
    expect(mounted.model.screen.getSnapshot()).toMatchObject({ view: 'letter', document: sha(1) })
    await flush()
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const pager = screen.getByLabelText('Task 2 of 3').parentElement!
    fireEvent.click(within(pager).getByRole('button', { name: en['intake.act.copyLink'] }))
    expect(writeText).toHaveBeenCalledWith('https://firm.test/?page=flowleap-records&records=letter')
  })

  it('draws the My work launcher glyph at the size the sidebar asks', () => {
    const { container } = render(<MyWorkIcon size={20} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('20')
  })
})

describe('the letter page', () => {
  it('shows a spinner while the letter loads and a notice when it fails', async () => {
    const { api } = createFixtureApi()
    mounted = await mountPanel({ ...api, intakeDocument: () => new Promise(() => {}) }, { view: 'letter', document: sha(1) as never })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 160) }) })
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
    mounted.dispose()
    cleanup()
    mounted = await mountPanel({ ...api, intakeDocument: () => Promise.resolve({ ok: false, error: { kind: 'network' } }) }, { view: 'letter', document: sha(1) as never })
    expect(screen.getByText(en['error.load'])).toBeTruthy()
  })
})

describe('the agent panel', () => {
  it('renders nothing when closed', () => {
    const labels = { minimise: 'Minimise', expand: 'Expand', collapse: 'Show at the side', close: 'Close' }
    const { container } = render(<AgentDock view="closed" name="Patent agent" model={null} labels={labels} onView={() => {}}>Body</AgentDock>)
    expect(container.textContent).toBe('')
  })

  it('lists the reply draft before the client report for unrouted work with no letter', async () => {
    const { api } = createFixtureApi()
    const report = fixtures.ticket.reports[0]!
    const ticket: TicketDetail = {
      ...fixtures.ticket,
      ticket: { ...fixtures.ticket.ticket, routedTo: null },
      letter: null,
      reports: [report, { ...report, kind: 'office-reply', proposalId: 'proposal-2' as never, fileName: 'reply.docx' }],
      run: { ...fixtures.ticket.run!, session: null },
    }
    mounted = await mountPanel({ ...api, ticket: () => Promise.resolve({ ok: true, value: ticket }) }, WORK)
    fireEvent.click(mounted.panel.querySelector('button[data-dock]:not([aria-label])')!)
    const dock = screen.getByRole('complementary', { name: 'Patent agent' })
    const proposals = within(dock).getByRole('list', { name: 'Proposals of this run' })
    expect(within(proposals).getAllByRole('listitem').map(item => item.querySelector('span span')?.textContent)).toEqual([en['work.draftReplyPlain'], en['work.clientReport']])
  })
})
