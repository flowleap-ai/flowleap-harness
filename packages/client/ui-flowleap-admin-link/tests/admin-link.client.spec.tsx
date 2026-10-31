// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { ADMIN_LINK_ROUTE, apply, inject } from '../src/client/index.ts'
import { AdminLinkAction, type AdminLinkActionProps } from '../src/client/AdminLink.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const rows = { rowClassName: 'row', activeRowClassName: 'active', glyphClassName: 'glyph', titleClassName: 'title' }

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
}

/** Mount the browser half over a stubbed `fetch` and return the context and the request it saw. */
async function mounted(fetch: () => Promise<Response>) {
  const stub = vi.fn((_url: string, _init: RequestInit) => fetch())
  vi.stubGlobal('fetch', stub)
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new RemoteStub(ctx)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({ name: 'root', children: { 'sidebar.actions': { kind: 'list', scope: 'root' } } } as never, () => null)
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

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('ui-flowleap-admin-link browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('asks the Host route once and registers the Firm admin row for a console path, and removes it on dispose', async () => {
    const { ctx, fiber, stub } = await mounted(json({ href: 'admin/' }))
    expect(stub).toHaveBeenCalledOnce()
    expect(stub.mock.calls[0]![0]).toBe(ADMIN_LINK_ROUTE)
    expect(ADMIN_LINK_ROUTE).toBe('api/flowleap/admin-link')
    const entries = ctx.slots.entries('sidebar.actions')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.options).toMatchObject({ id: 'flowleap-admin-link' })
    expect(entries[0]!.inject!()).toEqual({ href: 'admin/' })
    expect(ctx.locale.bind(NS)('link')).toBe(zh.link)
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.actions')).toEqual([])
    await ctx.fiber.dispose()
  })

  it('registers nothing for href null, a failed request, an error status, or an answer it cannot read', async () => {
    for (const fetch of [
      json({ href: null }),
      async () => { throw new TypeError('Failed to fetch') },
      json({ href: 'admin/' }, 403),
      async () => new Response('not json'),
      json({ href: 42 }),
      json([]),
    ]) {
      const { ctx } = await mounted(fetch)
      expect(ctx.slots.entries('sidebar.actions')).toEqual([])
      await ctx.fiber.dispose()
    }
  })

  it('registers nothing when disposed before the Host answers', async () => {
    let answer: (response: Response) => void = () => {}
    const { ctx, fiber, stub } = await mounted(() => new Promise<Response>((resolve) => { answer = resolve }))
    const signal = stub.mock.calls[0]![1].signal!
    await fiber.dispose()
    expect(signal.aborted).toBe(true)
    answer(new Response(JSON.stringify({ href: 'admin/' })))
    await settle()
    expect(ctx.slots.entries('sidebar.actions')).toEqual([])
    await ctx.fiber.dispose()
  })
})

describe('AdminLinkAction', () => {
  const props = (wide: boolean): AdminLinkActionProps => ({ ...rows, wide, href: 'admin/', t: makeTranslate(en) })

  it('is a same-tab link to the console, labelled Firm admin, with the title when wide', () => {
    render(<AdminLinkAction {...props(true)} />)
    const link = screen.getByRole('link', { name: 'Firm admin' })
    expect(link.getAttribute('href')).toBe('admin/')
    expect(link.getAttribute('target')).toBeNull()
    expect(link.textContent).toBe('Firm admin')
  })

  it('keeps the accessible name on the rail without the title', () => {
    render(<AdminLinkAction {...props(false)} />)
    const link = screen.getByRole('link', { name: 'Firm admin' })
    expect(link.textContent).toBe('')
  })
})
