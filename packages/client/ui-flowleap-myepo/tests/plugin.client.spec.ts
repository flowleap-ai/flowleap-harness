// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { MyEpoApplicationDetailView } from '@deepseek-ai/dsh-api-remotes/client'
import { apply, APPLICATIONS_PANEL_ID, AUTO_READ_MS, inject, LETTERS_PANEL_ID } from '../src/client/index.ts'
import { apply as applyNode, name } from '../src/index.ts'
import type { Docket } from '../src/client/applications/docket.ts'
import type { Mailbox } from '../src/client/letters/mailbox.ts'
import * as applications from '../src/client/locales/applications.ts'
import * as letters from '../src/client/locales/letters.ts'
import { DETAIL, KEYS, LIST } from './applications-fixture.client.ts'
import { ok, READ } from './letters-fixture.client.ts'

class RemoteStub extends Service {
  constructor(ctx: Context, readonly flowleapConnectors: object) {
    super(ctx, 'remote')
  }
}

async function pluginContext() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const connectors = {
    myEpoMailbox: vi.fn(() => Promise.resolve(ok(READ))),
    myEpoLetterPdf: vi.fn((_id: string) => Promise.resolve(ok({ fileName: 'grant.pdf', pdf: new Uint8Array([37, 80, 68, 70]) }))),
    myEpoApplications: vi.fn(() => Promise.resolve(ok(LIST))),
    myEpoApplication: vi.fn((_procedure: string, _number: string) => Promise.resolve(ok<MyEpoApplicationDetailView>(DETAIL))),
  }
  new RemoteStub(ctx, connectors)
  await ctx.plugin({ apply(provider: Context) { provider.provide('remote.flowleapConnectors', connectors as never) } }).await()
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: { 'sidebar.panellist': { kind: 'list', scope: 'root' }, main: { kind: 'keyed', scope: 'root' } },
  } as never, () => null)
  return { ctx, connectors }
}

describe('ui-flowleap-myepo browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.flowleapConnectors'])
  })

  it('registers the two launchers and the two pages, and removes them on dispose', async () => {
    const { ctx } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const launchers = ctx.slots.entries('sidebar.panellist')
    expect(launchers.map(entry => [entry.options.id, (entry.options.label as () => string)()])).toEqual([
      [LETTERS_PANEL_ID, 'Letters'], [APPLICATIONS_PANEL_ID, 'Applications'],
    ])
    expect(ctx.slots.entries('main').map(entry => entry.options.key)).toEqual([LETTERS_PANEL_ID, APPLICATIONS_PANEL_ID])
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    await ctx.fiber.dispose()
  })

  it('reads the Mailbox and the PDF of a letter through the Remote, and releases the PDF address on dispose', async () => {
    const createUrl = vi.fn((_blob: Blob) => 'blob:letter')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }))
    const { ctx, connectors } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const injected = ctx.slots.entries('main')[0]!.inject!()
    const mailbox = {
      hooks: injected.hooks as Mailbox['hooks'], refresh: injected.refresh as Mailbox['refresh'], select: injected.select as Mailbox['select'],
    }
    await mailbox.refresh()
    expect(connectors.myEpoMailbox).toHaveBeenCalledTimes(1)
    await mailbox.select('grant')
    expect(connectors.myEpoLetterPdf).toHaveBeenCalledWith('grant')
    expect(createUrl.mock.calls[0]![0]).toMatchObject({ type: 'application/pdf', size: 4 })
    expect(mailbox.hooks.mailbox.getSnapshot().pdf).toMatchObject({ status: 'ready', url: 'blob:letter' })
    await fiber.dispose()
    expect(revokeUrl).toHaveBeenCalledWith('blob:letter')
    await ctx.fiber.dispose()
    vi.unstubAllGlobals()
  })

  it('reads the applications and the data of each one through the Remote', async () => {
    const { ctx, connectors } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const injected = ctx.slots.entries('main')[1]!.inject!()
    const docket = { hooks: injected.hooks as Docket['hooks'], refresh: injected.refresh as Docket['refresh'], today: injected.today as () => string }
    expect(docket.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
    await docket.refresh()
    expect(connectors.myEpoApplications).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => { expect(connectors.myEpoApplication).toHaveBeenCalledTimes(4) })
    expect(connectors.myEpoApplication).toHaveBeenCalledWith('EPC', 'EP00000001')
    await vi.waitFor(() => { expect(docket.hooks.docket.getSnapshot().data[KEYS[3]]).toEqual({ status: 'ready', detail: DETAIL }) })
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('reads an open page again every minute and when the window shows again, not while the window is hidden, and stops on dispose', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const { ctx, connectors } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const hooks = ctx.slots.entries('main')[0]!.inject!().hooks as Mailbox['hooks']
    // No page is open: the timer reads nothing.
    await vi.advanceTimersByTimeAsync(AUTO_READ_MS)
    expect(connectors.myEpoMailbox).not.toHaveBeenCalled()
    const stop = hooks.mailbox.subscribe(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(connectors.myEpoMailbox).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(AUTO_READ_MS)
    expect(connectors.myEpoMailbox).toHaveBeenCalledTimes(2)
    expect(connectors.myEpoApplications).not.toHaveBeenCalled()
    visibility.mockReturnValue('hidden')
    await vi.advanceTimersByTimeAsync(AUTO_READ_MS)
    expect(connectors.myEpoMailbox).toHaveBeenCalledTimes(2)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(connectors.myEpoMailbox).toHaveBeenCalledTimes(3)
    await fiber.dispose()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(AUTO_READ_MS)
    expect(connectors.myEpoMailbox).toHaveBeenCalledTimes(3)
    stop()
    await ctx.fiber.dispose()
    vi.useRealTimers()
    visibility.mockRestore()
  })

  it('registers key-identical dictionaries in eight locales for each page and releases them with its fiber', async () => {
    const { ctx } = await pluginContext()
    ctx.locale.setLocale('de')
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const lettersCopy = ctx.locale.bind(letters.NS)
    const applicationsCopy = ctx.locale.bind(applications.NS)
    expect([lettersCopy('panel'), applicationsCopy('panel')]).toEqual(['Schreiben', 'Anmeldungen'])
    ctx.locale.setLocale('en')
    expect([lettersCopy('view.open'), applicationsCopy('col.due')]).toEqual(['Not handled', 'Next due date'])
    for (const page of [letters, applications]) {
      for (const dictionary of [page.zh, page.ja, page.es, page.fr, page.de, page.ru, page.pt]) {
        expect(Object.keys(dictionary).sort()).toEqual(Object.keys(page.en).sort())
      }
    }
    await fiber.dispose()
    expect(lettersCopy('panel')).not.toBe(letters.en.panel)
    expect(applicationsCopy('panel')).not.toBe(applications.en.panel)
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-myepo node half', () => {
  it('registers nothing on the host', () => {
    expect(name).toBe('ui-flowleap-myepo')
    expect(() => { applyNode() }).not.toThrow()
  })
})
