// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, frameSrc, inject, PANEL_ID, probeRecords, RECORDS_LINK_ROUTE } from '../src/client/index.ts'
import { RecordsIcon, RecordsPage, type ColorScheme, type RecordsPageProps } from '../src/client/RecordsPage.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function theme(colorScheme: ColorScheme): ThemeSnapshot {
  return { active: { id: colorScheme, colorScheme, tokens: {} } } as ThemeSnapshot
}

/** Mount the browser half over a stubbed `fetch` and a theme double; return the context and the requests it saw. */
async function mounted(fetch: () => Promise<Response>, colorScheme: ColorScheme = 'light') {
  const stub = vi.fn((_url: string, _init: RequestInit) => fetch())
  vi.stubGlobal('fetch', stub)
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new RemoteStub(ctx)
  ctx.provide('theme', { getTheme: () => theme(colorScheme) } as never)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: { 'sidebar.panellist': { kind: 'list', scope: 'root' }, main: { kind: 'keyed', scope: 'root' } },
  } as never, () => null)
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  await settle()
  return { ctx, fiber, stub }
}

class RemoteStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }
}

describe('ui-flowleap-records browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme'])
  })

  it('asks the Host route once, registers the launcher and the page for a path, and removes them on dispose', async () => {
    const { ctx, fiber, stub } = await mounted(json({ href: 'records/' }), 'dark')
    expect(stub).toHaveBeenCalledOnce()
    expect(stub.mock.calls[0]![0]).toBe(RECORDS_LINK_ROUTE)
    expect(RECORDS_LINK_ROUTE).toBe('api/flowleap/records-link')
    const launchers = ctx.slots.entries('sidebar.panellist')
    expect(launchers).toHaveLength(1)
    expect(launchers[0]!.options).toMatchObject({ id: PANEL_ID })
    expect((launchers[0]!.options as { label: () => string }).label()).toBe(zh.panel)
    const pages = ctx.slots.entries('main')
    expect(pages).toHaveLength(1)
    expect(pages[0]!.options).toMatchObject({ key: PANEL_ID })
    const injected = pages[0]!.inject!() as {
      href: string
      probe: (signal: AbortSignal) => Promise<boolean>
      colorScheme: { getSnapshot: () => ColorScheme }
    }
    expect(injected.href).toBe('records/')
    stub.mockResolvedValueOnce(new Response('', { status: 200 }))
    expect(await injected.probe(new AbortController().signal)).toBe(true)
    expect(stub.mock.calls[1]![0]).toBe('records/?embedded=1')
    expect(injected.colorScheme.getSnapshot()).toBe('dark')
    ctx.emit('theme/change', theme('light'))
    expect(injected.colorScheme.getSnapshot()).toBe('light')
    expect(ctx.locale.bind(NS)('panel')).toBe(zh.panel)
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    await ctx.fiber.dispose()
  })

  it('registers nothing for a failed request, an error status, or an answer it cannot read', async () => {
    for (const fetch of [
      async () => { throw new TypeError('Failed to fetch') },
      json({ href: 'records/' }, 403),
      async () => new Response('not json'),
      json({ href: '' }),
      json({ href: 42 }),
      json([]),
    ]) {
      const { ctx } = await mounted(fetch)
      expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
      expect(ctx.slots.entries('main')).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('registers nothing when disposed before the Host answers', async () => {
    let answer: (response: Response) => void = () => {}
    const { ctx, fiber, stub } = await mounted(() => new Promise<Response>((resolve) => { answer = resolve }))
    const signal = stub.mock.calls[0]![1].signal!
    await fiber.dispose()
    expect(signal.aborted).toBe(true)
    answer(new Response(JSON.stringify({ href: 'records/' })))
    await settle()
    expect(ctx.slots.entries('main')).toEqual([])
    await ctx.fiber.dispose()
  })

  it('probes the embedded pages and reports only a 200 as present', async () => {
    const stub = vi.fn(async (_url: string, _init: RequestInit) => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', stub)
    const signal = new AbortController().signal
    expect(await probeRecords('records/', signal)).toBe(true)
    expect(stub.mock.calls[0]![0]).toBe('records/?embedded=1')
    stub.mockResolvedValueOnce(new Response('', { status: 404 }))
    expect(await probeRecords('records/', signal)).toBe(false)
    stub.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await probeRecords('records/', signal)).toBe(false)
  })
})

describe('RecordsPage', () => {
  const t = makeTranslate(en)

  function props(present: boolean | Promise<boolean>, scheme: ColorScheme = 'light') {
    const colorScheme = createSnapshotStore<ColorScheme>(scheme)
    const probe = vi.fn(async (_signal: AbortSignal) => present)
    const page: RecordsPageProps = { href: 'records/', probe, colorScheme, t, usePanelInfo: select => select({ activePanelId: PANEL_ID }) } as RecordsPageProps
    return { page, probe, colorScheme }
  }

  it('shows the frame with the embedded flag and the client color scheme, and follows a theme change', async () => {
    const { page, colorScheme } = props(true, 'dark')
    render(<RecordsPage {...page} />)
    await settle()
    const frame = screen.getByTitle('Matters of the firm')
    expect(frame.getAttribute('src')).toBe('records/?embedded=1&theme=dark')
    act(() => { colorScheme.set('light') })
    expect(frame.getAttribute('src')).toBe('records/?embedded=1&theme=light')
    expect(frameSrc('records/', 'light')).toBe('records/?embedded=1&theme=light')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the empty state when the pages do not answer', async () => {
    const { page } = props(false)
    render(<RecordsPage {...page} />)
    await settle()
    expect(screen.getByRole('status').textContent).toContain('No matters yet')
    expect(screen.queryByTitle('Matters of the firm')).toBeNull()
  })

  it('shows nothing while the probe runs and ends the probe when it unmounts', async () => {
    let answer: (present: boolean) => void = () => {}
    const { page, probe } = props(new Promise<boolean>((resolve) => { answer = resolve }))
    const view = render(<RecordsPage {...page} />)
    await settle()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByTitle('Matters of the firm')).toBeNull()
    const signal = probe.mock.calls[0]![0]
    view.unmount()
    expect(signal.aborted).toBe(true)
    answer(true)
    await settle()
  })

  it('renders the launcher glyph at the requested size', () => {
    const { container } = render(<RecordsIcon size={18} />)
    expect(container.querySelector('svg')?.getAttribute('height')).toBe('18')
  })
})
