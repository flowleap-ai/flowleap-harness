// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { MenuContribution } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { apply, inject, PANEL_ID, RECORDS_LINK_ROUTE, type PanelInjected } from '../src/client/index.ts'
import type { DocumentId } from '../src/client/api.ts'
import { de, NS, zh } from '../src/client/locales.ts'
import { intakeWaitingWire, meWire } from './fixtures.client.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
}

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Answers the records-link route with `link` and the Records API with the fixtures. */
function routes(link: () => Promise<Response>) {
  return (url: string): Promise<Response> => {
    if (url === RECORDS_LINK_ROUTE) return link()
    if (url === 'records/api/me') return json(meWire)()
    return json(intakeWaitingWire)()
  }
}

/**
 * Whether an injected face is the panel's.
 * @param value - the injected face.
 * @returns true for the panel face.
 */
function isPanel(value: unknown): value is PanelInjected {
  return typeof value === 'object' && value !== null && 'hooks' in value && 'perform' in value
}

class RemoteStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }
}

/** Mount the browser half over a stubbed `fetch` and service doubles; return the context and the requests it saw. */
async function mounted(fetch: (url: string) => Promise<Response>) {
  const stub = vi.fn((url: string, _init?: RequestInit) => fetch(url))
  vi.stubGlobal('fetch', stub)
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new RemoteStub(ctx)
  const menus: MenuContribution<'records.intake-row'>[] = []
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  const keys: string[] = []
  const add = (command: { readonly id: string }) => {
    keys.push(command.id)
    return () => { keys.splice(keys.indexOf(command.id), 1) }
  }
  ctx.provide('shortcuts', {
    catalog: createSnapshotStore([]), fixedCatalog: createSnapshotStore([]), registerScope: add, registerScoped: add,
    registerScopedFixed: add, register: add,
  } as never)
  const contributions: unknown[] = []
  ctx.provide('commandMenu', {
    contribute: (contribution: unknown) => {
      contributions.push(contribution)
      return () => { contributions.splice(contributions.indexOf(contribution), 1) }
    },
    close: () => {},
    open: () => { opened.push(true); return true },
  } as never)
  const opened: boolean[] = []
  const panelInfo = createSnapshotStore<{ activePanelId: string | null }>({ activePanelId: null })
  ctx.provide('layout', { panelInfo } as never)
  const providers: { readonly protocol: string }[] = []
  ctx.provide('sessions', { list: createSnapshotStore({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }) } as never)
  ctx.provide('resources', {
    register: (provider: { readonly protocol: string }) => {
      providers.push(provider)
      return () => { providers.splice(providers.indexOf(provider), 1) }
    },
  } as never)
  ctx.provide('contextMenus', {
    register: (contribution: MenuContribution<'records.intake-row'>) => {
      menus.push(contribution)
      return () => { menus.splice(menus.indexOf(contribution), 1) }
    },
  } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: { 'sidebar.panellist': { kind: 'list', scope: 'root' }, main: { kind: 'keyed', scope: 'root' } },
  } as never, () => null)
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  await settle()
  return { ctx, fiber, stub, menus, keys, contributions, opened, panelInfo, providers }
}

describe('ui-flowleap-records browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'shortcuts', 'contextMenus', 'commandMenu', 'layout'])
  })

  it('asks the Host route once, then registers the launcher, the panel and the row menu, and removes them on dispose', async () => {
    window.history.replaceState(null, '', '/?page=flowleap-records&records=board&keep=1')
    const { ctx, fiber, stub, menus, keys, contributions, opened, panelInfo, providers } = await mounted(routes(json({ href: 'records/' })))
    expect(providers.map(provider => provider.protocol)).toEqual(['recordsrun'])
    expect(ctx.slots.entries('records.agent.conversation')).toHaveLength(1)
    expect(keys).toContain('records')
    expect(keys).toContain('records.decision.record')
    expect(keys).toContain('records.row.open')
    expect(contributions).toHaveLength(1)
    expect(stub.mock.calls[0]![0]).toBe(RECORDS_LINK_ROUTE)
    expect(RECORDS_LINK_ROUTE).toBe('api/flowleap/records-link')
    expect(stub.mock.calls.map(([url]) => url)).toContain('records/api/intake?view=waiting')
    const launchers = ctx.slots.entries('sidebar.panellist')
    expect(launchers).toHaveLength(1)
    expect(launchers[0]!.options).toMatchObject({ id: PANEL_ID })
    expect((launchers[0]!.options as { label: () => string }).label()).toBe(zh.panel)
    const pages = ctx.slots.entries('main')
    expect(pages).toHaveLength(1)
    const injected: unknown = pages[0]!.inject!()
    if (!isPanel(injected)) throw new Error('the main entry injects the panel face')
    expect(injected.hooks.waitingCount.getSnapshot()).toBe(22)
    expect(injected.hooks.language.getSnapshot()).toBe('zh')
    ctx.locale.setLocale('de')
    expect(injected.hooks.language.getSnapshot()).toBe('de')
    expect(ctx.locale.bind(NS)('panel')).toBe(de.panel)
    expect(injected.hooks.screen.getSnapshot().view).toBe('board')
    expect(window.location.search).toBe('?page=flowleap-records&keep=1')
    panelInfo.set({ activePanelId: PANEL_ID })
    expect(window.location.search).toBe('?page=flowleap-records&keep=1&records=board')
    injected.navigate({ view: 'intake', list: 'filed-today', open: null })
    expect(window.location.search).toBe('?page=flowleap-records&keep=1&records=intake%2Ffiled-today')
    expect(injected.linkOf({ view: 'board', layout: 'list' })).toBe('http://localhost:3000/?page=flowleap-records&keep=1&records=board%2Flist')
    panelInfo.set({ activePanelId: null })
    expect(window.location.search).toBe('?page=flowleap-records&keep=1')
    injected.openSearch()
    expect(opened).toEqual([true])
    injected.retry()
    injected.refresh()
    expect(await injected.perform([])).toEqual({ failed: [] })
    expect(injected.contentHref('a'.repeat(64) as DocumentId)).toBe(`records/api/documents/${'a'.repeat(64)}/content`)
    expect(menus).toHaveLength(1)
    expect(menus[0]!.target).toBe('records.intake-row')
    const actions = await menus[0]!.resolve({ document: 'a'.repeat(64) as DocumentId, list: 'waiting', proposed: null }, new AbortController().signal)
    expect(actions.map(action => action.id)).toEqual(['open', 'other-matter', 'not-relevant', 'copy-link'])
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    expect(menus).toEqual([])
    expect(keys).toEqual([])
    expect(contributions).toEqual([])
    expect(providers).toEqual([])
    expect(ctx.slots.entries('records.agent.conversation')).toEqual([])
    await ctx.fiber.dispose()
  })

  it('opens Intake when the address names no route', async () => {
    window.history.replaceState(null, '', '/')
    const { ctx } = await mounted(routes(json({ href: 'records/' })))
    const injected: unknown = ctx.slots.entries('main')[0]!.inject!()
    if (!isPanel(injected)) throw new Error('the main entry injects the panel face')
    expect(injected.hooks.screen.getSnapshot()).toMatchObject({ view: 'intake', list: 'waiting', open: null })
    await ctx.fiber.dispose()
  })

  it('registers nothing for a failed request, an error status, or an answer it cannot read', async () => {
    for (const link of [
      async () => { throw new TypeError('Failed to fetch') },
      json({ href: 'records/' }, 403),
      async () => new Response('not json'),
      json({ href: '' }),
      json({ href: 42 }),
      json([]),
    ]) {
      const { ctx, menus } = await mounted(routes(link))
      expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
      expect(ctx.slots.entries('main')).toEqual([])
      expect(menus).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('registers nothing when disposed before the Host answers', async () => {
    let answer: (response: Response) => void = () => {}
    const { ctx, fiber, stub } = await mounted(() => new Promise<Response>((resolve) => { answer = resolve }))
    const signal = stub.mock.calls[0]![1]!.signal!
    await fiber.dispose()
    expect(signal.aborted).toBe(true)
    answer(new Response(JSON.stringify({ href: 'records/' })))
    await settle()
    expect(ctx.slots.entries('main')).toEqual([])
    await ctx.fiber.dispose()
  })
})
