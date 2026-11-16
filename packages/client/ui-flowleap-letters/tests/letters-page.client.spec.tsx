// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, bindSnapshotSelector, contextMenuHook, makeTranslate, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, PANEL_ID } from '../src/client/index.ts'
import { apply as applyNode, name } from '../src/index.ts'
import { LettersPage, type LettersPageProps } from '../src/client/LettersPage.tsx'
import { LettersPanelIcon } from '../src/client/LettersPanelIcon.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh } from '../src/client/locales.ts'
import { PAGE_SIZE, type Mailbox, type MailboxSnapshot } from '../src/client/mailbox.ts'
import { FOLDERS, LETTERS, ok, READ } from './fixture.client.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t = makeTranslate(en)

const READY: MailboxSnapshot = {
  phase: 'ready', reading: false, failure: null, letters: LETTERS, folders: FOLDERS, total: LETTERS.length, readAt: READ.readAt,
  view: 'all', query: '', limit: PAGE_SIZE, selected: null, wide: false, pdf: null, opened: [],
}

/** Render the page over one fixed state; the acts are spies. */
function page(state: Partial<MailboxSnapshot> = {}) {
  const snapshot = { ...READY, ...state }
  const acts = {
    refresh: vi.fn(() => Promise.resolve()), select: vi.fn(() => Promise.resolve()), step: vi.fn(() => Promise.resolve()),
    setView: vi.fn(), setQuery: vi.fn(), more: vi.fn(), setWide: vi.fn(), dispose: vi.fn(),
  }
  const hooks: Mailbox['hooks'] = { mailbox: { getSnapshot: () => snapshot, subscribe: () => () => {} } }
  const props: LettersPageProps = {
    ...acts,
    useMailbox: bindSnapshotSelector(hooks.mailbox),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessions: () => { throw new Error('The page reads no Session') },
    useWorkspaces: () => { throw new Error('The page reads no workspace') },
    useSessionStatus: () => { throw new Error('The page reads no Session status') },
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The page loads no document resources') },
    ...allowAllAccess,
    useContextMenu: contextMenuHook(),
    t,
  }
  const view = render(<LettersPage {...props} />)
  return { ...view, acts }
}

const row = (title: string): HTMLElement => screen.getByText(title, { selector: 'li span' }).closest('button') as HTMLElement

describe('the Letters page', () => {
  it('shows the read in progress, then why MyEPO gave no list, with a new read', () => {
    page({ phase: 'loading', readAt: null })
    expect(screen.getByRole('status').textContent).toBe('Reading the MyEPO Mailbox…')
    cleanup()
    const { acts } = page({ readAt: null, letters: [], failure: { kind: 'not-linked' } })
    expect(screen.getByRole('heading', { name: 'MyEPO is not linked' })).toBeTruthy()
    expect(screen.getByText(en['state.notLinked.body'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))
    expect(acts.refresh).toHaveBeenCalledTimes(1)
    for (const [failure, text] of [
      [{ kind: 'refused' }, en['state.refused']],
      [{ kind: 'unreachable' }, 'MyEPO did not answer.'],
      [{ kind: 'failed', message: 'ERR_15' }, 'MyEPO answered with an error: ERR_15'],
      [{ kind: 'error', message: 'connection lost' }, 'MyEPO answered with an error: connection lost'],
    ] as const) {
      cleanup()
      page({ readAt: null, letters: [], failure, reading: true })
      expect(screen.getByRole('alert').textContent).toContain(text)
      expect(screen.queryByRole('heading')).toBeNull()
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Read again' }).disabled).toBe(true)
    }
  })

  it('lists the views with their counts and the letters with the fields of the MyEPO list', () => {
    const { acts } = page()
    const views = within(screen.getByRole('navigation', { name: 'View' }))
    expect(views.getAllByRole('button').map(button => button.textContent)).toEqual(['All letters4', 'Unread3', 'Not handled3', 'Drafts2', 'PDFs1'])
    expect(views.getByRole('button', { name: /All letters/ }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(views.getByRole('button', { name: /PDFs/ }))
    expect(acts.setView).toHaveBeenCalledWith('folder:pdfs')
    fireEvent.change(screen.getByRole('combobox', { name: 'View' }), { target: { value: 'unread' } })
    expect(acts.setView).toHaveBeenCalledWith('unread')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a letter' }), { target: { value: 'grant' } })
    expect(acts.setQuery).toHaveBeenCalledWith('grant')
    expect(screen.getByText('Letters: 4 · Unread: 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }))
    expect(acts.refresh).toHaveBeenCalledTimes(1)

    const list = within(screen.getByRole('list', { name: 'Letters of the Mailbox' }))
    expect(list.getAllByRole('listitem')).toHaveLength(4)
    const grant = row('Decision to grant a European patent')
    expect(grant.textContent).toBe('Dummy applicant 926 Feb 2023Decision to grant a European patentREF00009 · EP18123456.8')
    expect(within(grant).getByRole('img', { name: 'Unread' })).toBeTruthy()
    expect(within(row('European search report')).queryByRole('img')).toBeNull()
    // No applicant, no title, no reference and no application.
    expect(row('No title (document 52301_CONF)').textContent).toBe('No applicant26 Feb 2023No title (document 52301_CONF)No application')
    expect(row('Reminder').textContent).toContain('EP18123456.8')
    fireEvent.click(grant)
    expect(acts.select).toHaveBeenCalledWith('grant')
    expect(screen.getByText('Select a letter to read it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Show \d+ more/ })).toBeNull()
  })

  it('gives a line that does not fit a fade and its full text as a tooltip', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120)
    page()
    const applicant = screen.getAllByText('Dummy applicant 9')[0]!
    expect(applicant.getAttribute('title')).toBe('Dummy applicant 9')
    expect(applicant.hasAttribute('data-cut')).toBe(true)
    expect(applicant.getAttribute('dir')).toBe('auto')
  })

  it('says that no letter matches, that the Mailbox is empty, that rows are left, and that the list was cut', () => {
    const { acts } = page({ query: 'nothing', limit: 1 })
    expect(screen.getByText('No letter matches.')).toBeTruthy()
    cleanup()
    page({ letters: [], folders: [], total: 0 })
    expect(screen.getByText('The MyEPO Mailbox has no letters.')).toBeTruthy()
    expect(screen.queryByText('Folders')).toBeNull()
    cleanup()
    const cut = page({ limit: 1, total: 1284 })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more of 4' }))
    expect(cut.acts.more).toHaveBeenCalledTimes(1)
    expect(screen.getByText('The page shows the first 4 of 1,284 letters.')).toBeTruthy()
    expect(screen.getByText('Letters: 1,284 · Unread: 3')).toBeTruthy()
    expect(acts.more).not.toHaveBeenCalled()
  })

  it('keeps the last list when a later read fails, with the time of that list', () => {
    page({ failure: { kind: 'unreachable' } })
    const notice = screen.getByRole('alert').textContent
    expect(notice).toContain('MyEPO did not answer.')
    expect(notice).toContain('The list shows the Mailbox as of')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('shows the open letter with its fields, its PDF, and the acts of its top bar', () => {
    const { acts, container } = page({ selected: 'grant', pdf: { id: 'grant', status: 'ready', url: 'blob:letter', fileName: 'grant.pdf' }, opened: ['grant'] })
    const letter = within(screen.getByRole('article', { name: 'The open letter' }))
    expect(letter.getByRole('heading', { level: 1, name: 'Decision to grant a European patent' })).toBeTruthy()
    expect(letter.getByText('Not handled')).toBeTruthy()
    expect(letter.getByText('Drafts')).toBeTruthy()
    expect(letter.getByText('2006A')).toBeTruthy()
    expect([...container.querySelectorAll('dl > div')].map(item => item.textContent)).toEqual([
      'ApplicationEP18123456.8', 'Your referenceREF00009', 'ApplicantDummy applicant 9', 'RecipientDummy recipient 000026', 'Dispatched26 Feb 2023',
    ])
    expect(letter.getByText(en['pdf.read'])).toBeTruthy()
    expect(letter.getByTitle('The letter as PDF').getAttribute('src')).toBe('blob:letter')
    expect(letter.getByRole('link', { name: 'Open in MyEPO' }).getAttribute('href')).toBe('https://my-i.epo.org/user-area/mailbox-intg/applications/EP18123456')
    const download = letter.getByRole('link', { name: 'Download PDF' })
    expect([download.getAttribute('href'), download.getAttribute('download')]).toEqual(['blob:letter', 'grant.pdf'])
    expect(row('Decision to grant a European patent').getAttribute('aria-current')).toBe('true')
    expect(letter.queryByRole('button', { name: /full title/ })).toBeNull()

    fireEvent.click(letter.getByRole('button', { name: 'Previous letter' }))
    fireEvent.click(letter.getByRole('button', { name: 'Next letter' }))
    expect(acts.step.mock.calls).toEqual([[-1], [1]])
    fireEvent.click(letter.getByRole('button', { name: 'Read wide' }))
    expect(acts.setWide).toHaveBeenCalledWith(true)
    fireEvent.click(letter.getByRole('button', { name: 'Close' }))
    fireEvent.click(letter.getByRole('button', { name: 'Letters' }))
    expect(acts.select.mock.calls).toEqual([[null], [null]])
  })

  it('shows a handled letter in an unknown folder, the fields the EPO left out, and a PDF that is on its way or missing', () => {
    page({ selected: 'search', pdf: { id: 'search', status: 'loading' } })
    expect(screen.getByText('Handled')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Downloading the letter from MyEPO…')
    expect(screen.queryByRole('link', { name: 'Download PDF' })).toBeNull()
    expect(screen.queryByText(en['pdf.read'])).toBeNull()
    cleanup()
    const { container } = page({ selected: 'reps', pdf: { id: 'reps', status: 'failed', message: 'the EPO did not answer' } })
    expect(screen.getByRole('heading', { level: 1, name: 'No title (document 52301_CONF)' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('MyEPO gave no PDF for this letter. the EPO did not answer')
    expect(screen.queryByRole('link', { name: 'Open in MyEPO' })).toBeNull()
    expect([...container.querySelectorAll('dl > div')].slice(0, 3).map(item => item.textContent)).toEqual(['ApplicationNone', 'Your referenceNone', 'ApplicantNone'])
    cleanup()
    page({ selected: 'lost', pdf: null })
    expect(screen.getByText('Unknown folder')).toBeTruthy()
    expect(screen.queryByTitle('The letter as PDF')).toBeNull()
    cleanup()
    // The open letter left the Mailbox with a later read.
    page({ selected: 'was-here' })
    expect(screen.getByText('Select a letter to read it.')).toBeTruthy()
  })

  it('shows three lines of a long title until the person asks for all of it', () => {
    const long = 'Communication pursuant to Rules 161(1) and 162 EPC: '.repeat(4)
    page({ letters: [{ ...LETTERS[0]!, title: long }], selected: 'grant', pdf: { id: 'grant', status: 'loading' } })
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.hasAttribute('data-clamp')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show the full title' }))
    expect(heading.hasAttribute('data-clamp')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(heading.hasAttribute('data-clamp')).toBe(true)
  })

  it('reads the open letter in the full width and goes back to the three panes', () => {
    const { acts, container } = page({ selected: 'grant', wide: true, pdf: { id: 'grant', status: 'loading' } })
    expect(container.querySelector('section')?.hasAttribute('data-wide')).toBe(true)
    const panes = screen.getByRole('button', { name: 'Three panes' })
    expect(panes.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(panes)
    fireEvent.click(screen.getByRole('button', { name: 'Letters' }))
    expect(acts.setWide.mock.calls).toEqual([[false], [false]])
    expect(acts.select).not.toHaveBeenCalled()
  })

  it('steps, widens and closes with the keys, and leaves the keys of a field alone', () => {
    const closed = page()
    const section = closed.container.querySelector('section') as HTMLElement
    for (const key of ['j', 'ArrowDown', 'k', 'ArrowUp', 'f', 'x', 'Escape']) fireEvent.keyDown(section, { key })
    expect(closed.acts.step.mock.calls).toEqual([[1], [1], [-1], [-1]])
    // No letter is open: F does nothing, and Escape closes nothing that shows.
    expect(closed.acts.setWide).not.toHaveBeenCalled()
    expect(closed.acts.select).toHaveBeenCalledWith(null)
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'j' })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'j' })
    expect(closed.acts.step).toHaveBeenCalledTimes(4)
    cleanup()
    const open = page({ selected: 'grant', pdf: { id: 'grant', status: 'loading' } })
    fireEvent.keyDown(open.container.querySelector('section') as HTMLElement, { key: 'f' })
    expect(open.acts.setWide).toHaveBeenCalledWith(true)
    cleanup()
    const wide = page({ selected: 'grant', wide: true, pdf: { id: 'grant', status: 'loading' } })
    const wideSection = wide.container.querySelector('section') as HTMLElement
    fireEvent.keyDown(wideSection, { key: 'f' })
    fireEvent.keyDown(wideSection, { key: 'Escape' })
    expect(wide.acts.setWide.mock.calls).toEqual([[false], [false]])
    expect(wide.acts.select).not.toHaveBeenCalled()
  })
})

describe('the Letters launcher glyph', () => {
  it('draws at the requested edge', () => {
    const { container } = render(<LettersPanelIcon size={18} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

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

describe('ui-flowleap-letters browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.flowleapConnectors'])
  })

  it('registers the launcher and the page, reads through the Remote, and removes both on dispose', async () => {
    const createUrl = vi.fn((_blob: Blob) => 'blob:letter')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }))
    const { ctx, connectors } = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const launcher = ctx.slots.entries('sidebar.panellist')[0]!
    expect(launcher.options.id).toBe(PANEL_ID)
    expect((launcher.options.label as () => string)()).toBe('Letters')
    const main = ctx.slots.entries('main')[0]!
    expect(main.options.key).toBe(PANEL_ID)
    const injected = main.inject!()
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
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    await ctx.fiber.dispose()
    vi.unstubAllGlobals()
  })

  it('registers key-identical dictionaries in eight locales and releases them with its fiber', async () => {
    const { ctx } = await pluginContext()
    ctx.locale.setLocale('de')
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const translate = ctx.locale.bind(NS)
    expect(translate('panel')).toBe('Schreiben')
    ctx.locale.setLocale('en')
    expect(translate('view.open')).toBe('Not handled')
    for (const dictionary of [zh, ja, es, fr, de, ru, pt]) expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort())
    await fiber.dispose()
    expect(translate('panel')).not.toBe(en.panel)
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-letters node half', () => {
  it('registers nothing on the host', () => {
    expect(name).toBe('ui-flowleap-letters')
    expect(() => { applyNode() }).not.toThrow()
  })
})
