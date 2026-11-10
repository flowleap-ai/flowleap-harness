// @vitest-environment jsdom
/** FlowLeap fork modification: configured panel groups and foot panels through the production slot renderer. */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Config, SIDEBAR_PAGE_GLOBAL } from '../src/config.ts'
import { apply, inject } from '../src/client/index.ts'

const runtimes = new Set<SlotTestRuntime>()

afterEach(async () => {
  try {
    for (const runtime of runtimes) await runtime.dispose()
  } finally {
    runtimes.clear()
    cleanup()
    vi.unstubAllGlobals()
  }
})

const LAYOUT = {
  groups: [
    { id: 'work', label: { en: 'Work', de: 'Arbeit' }, panels: ['my-work', 'board'] },
    { id: 'firm', label: { en: 'Firm', de: 'Kanzlei' }, panels: ['matters', 'missing'] },
    { id: 'empty', label: { en: 'Empty' }, panels: ['not-registered'] },
  ],
  footPanels: ['plugins'],
}

async function bench(collapsed = false) {
  vi.stubGlobal(SIDEBAR_PAGE_GLOBAL, LAYOUT)
  const runtime = await SlotTestRuntime.create()
  runtimes.add(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  const layout = {
    panelInfo: runtime.panelInfo,
    beginNavigation: vi.fn(() => new AbortController().signal),
    toggleSidebar: vi.fn(),
    selectPanel: vi.fn((activePanelId: MainPanelId | null) => { runtime.panelInfo.set({ activePanelId }) }),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
  } satisfies ILayout
  await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.provide('shortcuts', { catalog: createSnapshotStore([]) } as never)
      ctx.provide('layout', layout)
      ctx.provide('uiWorkspace', { startSession: vi.fn() } as never)
      ctx.provide('locale', locale)
      ctx.effect(() => locale.register('common', { zh: commonZh, en: commonEn }), 'group test: common locale')
      ctx.slots.installLocale(locale)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'conversation' }, () => <p>Conversation</p>))
      // Registration order differs from the configured order, which wins inside a group.
      for (const [id, order] of [['board', 1], ['other', 2], ['matters', 3], ['my-work', 4], ['plugins', 5]] as const) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order, label: id }, () => null))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id }, () => <p>{id} page</p>))
      }
    },
  })
  function Frame({ renderSlot }: PropsRuntime<'root'> & PropsRenderSlots<'sidebar'>) {
    return <aside>{renderSlot('sidebar', { collapsed, width: collapsed ? 56 : 300, drawer: false })}</aside>
  }
  await runtime.root.declare({ sidebar: { kind: 'single', scope: 'root' } }, Frame)
  await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  return { locale, layout, view }
}

const rowNames = (list: HTMLElement) => within(list).getAllByRole('button').map(button => button.getAttribute('aria-label'))

describe('sidebar panel groups', () => {
  it('draws each configured group as a labelled list in the configured order, then the unplaced rows', async () => {
    const { view } = await bench()
    const navigation = view.getByRole('navigation')
    const lists = within(navigation).getAllByRole('list')
    expect(lists.map(list => list.getAttribute('aria-labelledby') === null ? null : document.getElementById(list.getAttribute('aria-labelledby') as string)?.textContent))
      .toEqual(['Work', 'Firm'])
    expect(rowNames(lists[0] as HTMLElement)).toEqual(['my-work', 'board'])
    expect(rowNames(lists[1] as HTMLElement)).toEqual(['matters'])
    expect(within(navigation).getAllByRole('button').map(button => button.getAttribute('aria-label')))
      .toEqual(['my-work', 'board', 'matters', 'other'])
    expect(view.queryByText('Empty')).toBeNull()
  })

  it('draws foot panels outside the navigation and they still select their panel', async () => {
    const { view, layout } = await bench()
    const plugins = view.getByRole('button', { name: 'plugins' })
    expect(view.getByRole('navigation').contains(plugins)).toBe(false)
    fireEvent.click(plugins)
    expect(layout.selectPanel).toHaveBeenCalledWith('plugins')
  })

  it('names the rail groups without a visible label', async () => {
    const { view } = await bench(true)
    expect(view.queryByText('Work')).toBeNull()
    expect(within(view.getByRole('navigation')).getAllByRole('list').map(list => list.getAttribute('aria-label')))
      .toEqual(['Work', 'Firm'])
  })

  it('follows the active language', async () => {
    const { view, locale } = await bench()
    locale.addLanguage({ id: 'de', label: 'Deutsch', fallback: 'en' })
    act(() => { locale.setLocale('de') })
    expect(view.getByText('Arbeit')).toBeTruthy()
    expect(view.getByText('Kanzlei')).toBeTruthy()
  })
})

describe('sidebar layout configuration', () => {
  it('keeps the flat list with no groups', () => {
    expect(Config({})).toEqual({ groups: [], footPanels: [] })
  })

  it('fails on a repeated group, a panel named twice, or a label without English', () => {
    const group = { id: 'a', label: { en: 'A' }, panels: ['x'] }
    expect(() => Config({ groups: [group, { ...group, panels: [] }] })).toThrow('group id "a" is repeated')
    expect(() => Config({ groups: [group], footPanels: ['x'] })).toThrow('panel "x" is named twice')
    expect(() => Config({ groups: [{ id: 'b', label: { de: 'B' } as never, panels: [] }] })).toThrow('needs English text')
  })
})
