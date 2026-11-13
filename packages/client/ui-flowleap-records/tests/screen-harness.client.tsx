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
import { de, en } from '../src/client/locales.ts'
import { createRecordsModel, type PanelRoot, type Route } from '../src/client/model.ts'
import { MyWorkPanel, RecordsPanel, type PanelProps } from '../src/client/Panel.tsx'
import type { IntakeRowTarget } from '../src/client/row-menu.ts'
import { agentProps } from './agent-fakes.client.tsx'

/** A form code in any of its forms, such as "2004C" or "EPO Form 2004C" (R19). */
export const FORM_CODE = /2004C|\bForm(?:blatt)?\s*\d+/u

/**
 * The text of the page outside the elements that match a selector, as a person reads it.
 * @param exempt - the elements to leave out.
 * @returns the text.
 */
function textOutside(exempt: string): string {
  const page = document.body.cloneNode(true) as HTMLElement
  for (const element of page.querySelectorAll(exempt)) element.remove()
  return page.textContent
}

/**
 * The main view's text: the page without the Audit disclosure and the letter drawing, the two places where a form
 * code may show (R19).
 * @returns the text.
 */
export const mainViewText = (): string => textOutside('[data-audit], [role="img"][data-verbatim]')

/**
 * The text that the deny-list of `check-copy.mjs` and `check-mockups.mjs` reads: the page without the elements that
 * they exempt (`data-verbatim`, `data-audit`, `data-address`).
 * @returns the text.
 */
export const deniedText = (): string => textOutside('[data-verbatim], [data-audit], [data-address]')

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
 * @param language - the UI language.
 * @param root - the panel: the Matters panel (default) or My work.
 * @returns the model, the registries, the context menu spy, the ⌘K opener spy, the Find a matter and cross-panel spies,
 * the fake run Session and a disposer.
 */
export async function mountPanel(api: RecordsApi, route: Route, language: 'en' | 'de' = 'en', root: PanelRoot = 'matters') {
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
  const model = createRecordsModel(api, route, root)
  const openFind = vi.fn()
  const openInMatters = vi.fn((_route: Route) => {})
  const openMyWork = vi.fn()
  const openMenu = vi.fn((_target: { readonly kind: string; readonly value: IntakeRowTarget }, _point: MenuPoint) => {})
  const openSearch = vi.fn()
  const agent = agentProps()
  const props = {
    ...agent.props,
    t: makeTranslate(language === 'de' ? de : en),
    useScreen: bindSnapshotSelector(model.screen),
    useMe: bindSnapshotSelector(model.me),
    useMyWork: bindSnapshotSelector(model.myWork),
    useWaitingCount: bindSnapshotSelector(model.waitingCount),
    useCatalog: bindSnapshotSelector(registry.catalog),
    useFixedCatalog: bindSnapshotSelector(registry.fixedCatalog),
    useLanguage: bindSnapshotSelector(createSnapshotStore<LocaleId>(language)),
    useContextMenu: contextMenuHook(openMenu),
    navigate: (next: Route) => { model.navigate(next) },
    retry: () => { model.retry() },
    refresh: () => { model.refresh() },
    perform: (acts: readonly Act[]) => model.perform(acts),
    contentHref: (document: DocumentId) => api.contentHref(document),
    pageHref: href => api.pageHref(href),
    nextConfirmer: (document, fileNumber, signal) => api.nextConfirmer(document, fileNumber, signal),
    letterText: (document, signal) => api.letterText(document, signal),
    keyActs,
    commandItems,
    linkOf: (next: Route) => `https://firm.test/?page=flowleap-records&records=${next.view}`,
    openSearch,
    openFind,
    openInMatters,
    openMyWork,
    root,
  } as PanelProps<'records.agent.conversation'>
  const view = render(root === 'my-work' ? <MyWorkPanel {...(props as PanelProps<'records.mywork.agent.conversation'> & PanelProps<'records.agent.conversation'>)} /> : <RecordsPanel {...props} />)
  await flush()
  return {
    model, keyActs, commandItems, openMenu, openSearch, openFind, openInMatters, openMyWork, registry, view, agent,
    panel: view.getByTestId('flowleap-records'),
    dispose: () => {
      view.unmount()
      for (const dispose of disposers.reverse()) dispose()
      model.dispose()
    },
  }
}
