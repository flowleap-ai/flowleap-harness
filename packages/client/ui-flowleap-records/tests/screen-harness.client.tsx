/**
 * Mount the Matters panel over a model of the fixture API with the real key layer: a shortcut registry with the
 * keyboard installed on the window, so a test presses keys as a person does.
 */
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { installKeyboard } from '@deepseek-ai/dsh-client-shortcuts/src/client/dom.ts'
import { ShortcutRegistry } from '@deepseek-ai/dsh-client-shortcuts/src/client/registry.ts'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { MenuPoint } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { Act, DocumentId, RecordsApi } from '../src/client/api.ts'
import { CommandItemRegistry, KeyActRegistry, registerKeyLayer } from '../src/client/key-layer.ts'
import { en } from '../src/client/locales.ts'
import { createRecordsModel, type Route } from '../src/client/model.ts'
import { RecordsPanel, type PanelProps } from '../src/client/Panel.tsx'
import type { IntakeRowTarget } from '../src/client/row-menu.ts'

/** Let the fixture answers and the effects settle. */
export const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }

/**
 * Press a key on an element, as the keyboard does.
 * @param target - the focused element.
 * @param code - the physical key, such as `KeyJ` or `Digit2`.
 * @param extra - modifiers.
 */
export function press(target: Element, code: string, extra: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^(Key|Digit)/u, '').toLowerCase(), bubbles: true, cancelable: true, ...extra }))
  })
}

/**
 * Mount the panel with the real key layer.
 * @param api - the Records API.
 * @param route - the first route.
 * @returns the model, the registries, the context menu spy, the ⌘K opener spy and a disposer.
 */
export async function mountPanel(api: RecordsApi, route: Route) {
  const registry = new ShortcutRegistry('web', 'macos', undefined, 500)
  const disposers: (() => void)[] = []
  const ctx = {
    shortcuts: registry,
    commandMenu: { contribute: () => () => {}, close: () => {} },
    effect: (setup: () => () => void) => { disposers.push(setup()) },
  } as never
  const keyActs = new KeyActRegistry()
  const commandItems = new CommandItemRegistry()
  registerKeyLayer(ctx, keyActs, commandItems, key => en[key])
  disposers.push(installKeyboard(window, registry, undefined, false))
  const model = createRecordsModel(api, route)
  const openMenu = vi.fn((_target: { readonly kind: string; readonly value: IntakeRowTarget }, _point: MenuPoint) => {})
  const openSearch = vi.fn()
  const props = {
    t: makeTranslate(en),
    useScreen: bindSnapshotSelector(model.screen),
    useMe: bindSnapshotSelector(model.me),
    useWaitingCount: bindSnapshotSelector(model.waitingCount),
    useCatalog: bindSnapshotSelector(registry.catalog),
    useFixedCatalog: bindSnapshotSelector(registry.fixedCatalog),
    useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>('en')),
    useContextMenu: contextMenuHook(openMenu),
    navigate: (next: Route) => { model.navigate(next) },
    retry: () => { model.retry() },
    refresh: () => { model.refresh() },
    perform: (acts: readonly Act[]) => model.perform(acts),
    contentHref: (document: DocumentId) => api.contentHref(document),
    keyActs,
    commandItems,
    linkOf: (next: Route) => `https://firm.test/?page=flowleap-records&records=${next.view}`,
    openSearch,
  } as PanelProps
  const view = render(<RecordsPanel {...props} />)
  await flush()
  return {
    model, keyActs, commandItems, openMenu, openSearch, registry, view,
    panel: view.getByTestId('flowleap-records'),
    dispose: () => {
      view.unmount()
      for (const dispose of disposers.reverse()) dispose()
      model.dispose()
    },
  }
}
