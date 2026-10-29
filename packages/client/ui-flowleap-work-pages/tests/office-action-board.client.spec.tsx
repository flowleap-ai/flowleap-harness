// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { allowAllAccess, bindSnapshotSelector, makeTranslate, StaticRemoteAccess, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, PANEL_ID } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import {
  attorneyFieldsOf, createBoard, daysUntil, needsReviewCount, objectionState, type Board,
} from '../src/client/board.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { OfficeActionBoard, type OfficeActionBoardProps } from '../src/client/OfficeActionBoard.tsx'
import { SAMPLE_ANALYSIS } from '../src/client/sample-board.ts'
import { WorkPagesPanelIcon } from '../src/client/WorkPagesPanelIcon.tsx'

afterEach(() => { cleanup() })

const t = makeTranslate(en)
const NOW = Date.parse('2026-10-29T12:00:00.000Z')

function renderBoard(board: Board = createBoard(SAMPLE_ANALYSIS), now = NOW) {
  const props: OfficeActionBoardProps = {
    analysis: board.analysis,
    setState: board.setState,
    setOwner: board.setOwner,
    select: board.select,
    setFormOpen: board.setFormOpen,
    notify: board.notify,
    useBoard: bindSnapshotSelector(board.hooks.board),
    usePanelInfo: select => select({ activePanelId: null }),
    useSessions: () => { throw new Error('The board reads no Session list') },
    useWorkspaces: () => { throw new Error('The board reads no workspace') },
    useSessionStatus: () => { throw new Error('The board reads no Session status') },
    useSessionRetainInfo: () => undefined,
    useResource: () => { throw new Error('The board loads no document resources') },
    ...allowAllAccess,
    now: () => now,
    t,
  }
  render(<OfficeActionBoard {...props} />)
  return board
}

function card(basis: string): HTMLElement {
  return screen.getByRole('button', { name: `Open ${basis} in the side panel` }).closest('li')!
}

describe('board model', () => {
  it('changes only the attorney fields of the named objection', () => {
    const board = createBoard(SAMPLE_ANALYSIS)
    board.setState('art54', 'done')
    board.setOwner('art84', 'A. Novak')
    board.setState('unknown', 'done')
    const { attorney } = board.hooks.board.getSnapshot()
    expect(attorney).toEqual({
      art54: { state: 'done', owner: 'M. Keller' },
      art56: { state: 'needs_review', owner: 'S. Brandt' },
      art84: { state: 'relevant', owner: 'A. Novak' },
    })
    expect(SAMPLE_ANALYSIS.attorney.art54?.state).toBe('needs_review')
    expect(needsReviewCount(attorney)).toBe(1)
  })

  it('reads menu ids and attorney fields, and fails loud on an unknown one', () => {
    expect(objectionState('not_relevant')).toBe('not_relevant')
    expect(() => objectionState('argue')).toThrow('unknown review state "argue"')
    expect(attorneyFieldsOf(SAMPLE_ANALYSIS.attorney, 'art56')).toEqual({ state: 'needs_review', owner: 'S. Brandt' })
    expect(() => attorneyFieldsOf(SAMPLE_ANALYSIS.attorney, 'art123')).toThrow('objection "art123" has no attorney fields')
  })

  it('counts whole UTC days to the time limit', () => {
    expect(daysUntil('2026-12-09', NOW)).toBe(41)
    expect(daysUntil('2026-10-29', NOW)).toBe(0)
    expect(daysUntil('2026-10-27', NOW)).toBe(-2)
  })
})

describe('office action board', () => {
  it('shows the sample banner, the header, the run state, one card per objection, and the footer', () => {
    renderBoard()
    expect(screen.getByRole('note').textContent).toContain(en['sample.title'])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('EP 3 456 789 · Communication under Article 94(3) EPC')
    expect(screen.getByText('Reply due in 41 days')).toBeTruthy()
    expect(screen.getByText('Owner: M. Keller')).toBeTruthy()
    expect(screen.getByText('Needs review: 2')).toBeTruthy()
    expect(within(screen.getByRole('status', { name: en['run.label'] })).getByText(en['run.reading'])).toBeTruthy()
    const cards = within(screen.getByRole('list', { name: en['list.label'] })).getAllByRole('listitem').filter(item => item.dataset.objection !== undefined)
    expect(cards.map(item => item.dataset.objection)).toEqual(['art54', 'art56', 'art84'])
    expect(within(card('Art. 56 EPC')).getByText('Claims 3, 4, 5, 6')).toBeTruthy()
    expect(within(card('Art. 56 EPC')).getByText('D2 col. 5, l. 10-25')).toBeTruthy()
    expect(within(card('Art. 84 EPC')).getByText(en['card.noCitations'])).toBeTruthy()
    expect(screen.getByText(en.footer)).toBeTruthy()
  })

  it('sets the state and the owner of a card and updates the review count', async () => {
    const board = renderBoard()
    const art54 = card('Art. 54 EPC')
    fireEvent.click(within(art54).getByRole('button', { name: 'Review state of Art. 54 EPC: Needs review' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Done/ }))
    expect(screen.getByText('Needs review: 1')).toBeTruthy()
    expect(within(art54).getByRole('button', { name: 'Review state of Art. 54 EPC: Done' })).toBeTruthy()
    const owner = within(card('Art. 84 EPC')).getByRole('textbox', { name: 'Owner of Art. 84 EPC' })
    fireEvent.change(owner, { target: { value: '  A. Novak ' } })
    fireEvent.keyDown(owner, { key: 'Tab' })
    expect(board.hooks.board.getSnapshot().attorney.art84?.owner).toBe('')
    fireEvent.keyDown(owner, { key: 'Enter' })
    expect(board.hooks.board.getSnapshot().attorney.art84?.owner).toBe('A. Novak')
    let writes = 0
    board.hooks.board.subscribe(() => { writes += 1 })
    fireEvent.blur(within(card('Art. 84 EPC')).getByRole('textbox', { name: 'Owner of Art. 84 EPC' }))
    expect(writes).toBe(0)
  })

  it('closes the state menu without a change', async () => {
    const board = renderBoard()
    const trigger = within(card('Art. 56 EPC')).getByRole('button', { name: 'Review state of Art. 56 EPC: Needs review' })
    fireEvent.click(trigger)
    await screen.findByRole('menuitem', { name: /Relevant/ })
    fireEvent.click(trigger)
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.click(trigger)
    await screen.findByRole('menuitem', { name: /Relevant/ })
    fireEvent.pointerDown(document.body)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(board.hooks.board.getSnapshot().attorney.art56?.state).toBe('needs_review')
  })

  it('shows the passed time limit', () => {
    renderBoard(createBoard(SAMPLE_ANALYSIS), Date.parse('2026-12-11T08:00:00.000Z'))
    expect(screen.getByText('Time limit passed 2 days ago')).toBeTruthy()
  })

  it('switches the side panel between cards and closes it on a second click', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Open Art. 56 EPC in the side panel' }))
    expect(within(screen.getByTestId('objection-panel')).getByText(en['response.accept'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Art. 56 EPC in the side panel' }))
    expect(screen.queryByTestId('objection-panel')).toBeNull()
  })

  it('opens a card in the side panel and closes it', () => {
    renderBoard()
    expect(screen.queryByTestId('objection-panel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Art. 54 EPC in the side panel' }))
    const panel = screen.getByRole('complementary', { name: en['side.label'] })
    expect(within(panel).getByText(/Document D1 discloses/)).toBeTruthy()
    expect(within(panel).getByText('Feature 1.4')).toBeTruthy()
    expect(within(panel).getByText('D1 [0031]')).toBeTruthy()
    expect(within(panel).getByText(en['response.argue'])).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: en['side.close'] }))
    expect(screen.queryByTestId('objection-panel')).toBeNull()
  })

  it('shows a notice for each action that the sample cannot do, and keeps Share disabled', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: en['action.plan'] }))
    expect(screen.getByText(en['notice.plan'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['action.export'] }))
    expect(screen.getByText(en['notice.export'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['run.openChat'] }))
    expect(screen.getByText(en['notice.chat'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['notice.dismiss'] }))
    expect(screen.queryByText(en['notice.chat'])).toBeNull()
    expect(screen.getByRole('button', { name: en['action.share'] }).hasAttribute('disabled')).toBe(true)
  })

  it('opens the form with the sample inputs and starts nothing', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: en['action.new'] }))
    const form = screen.getByRole('dialog', { name: en['form.title'] })
    expect(within(form).getByRole('textbox', { name: en['form.application'] }).getAttribute('value')).toBe('EP 3 456 789')
    expect(within(form).getByText('EP3456789_communication_94-3.pdf')).toBeTruthy()
    expect(within(form).getByRole('button', { name: 'Agent: Patent Agent' })).toBeTruthy()
    expect(within(form).getByText('€142 of €200 left this month')).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: 'Remove EP3456789_communication_94-3.pdf' }))
    expect(within(form).getByRole('button', { name: en['form.pdfChoose'] })).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: en['form.start'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(en['notice.run'])).toBeTruthy()
  })

  it('edits the form fields in the browser only and closes on Cancel', async () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: en['action.new'] }))
    const form = screen.getByRole('dialog', { name: en['form.title'] })
    const application = within(form).getByRole('textbox', { name: en['form.application'] })
    fireEvent.change(application, { target: { value: ' ' } })
    expect(within(form).getByRole('button', { name: en['form.start'] }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(application, { target: { value: 'US 17/123,456' } })
    expect(within(form).getByRole('button', { name: en['form.start'] }).hasAttribute('disabled')).toBe(false)

    fireEvent.click(within(form).getByRole('button', { name: 'Remove EP3456789_communication_94-3.pdf' }))
    fireEvent.click(within(form).getByRole('button', { name: en['form.pdfChoose'] }))
    const input = form.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [] } })
    expect(within(form).getByRole('button', { name: en['form.pdfChoose'] })).toBeTruthy()
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'action.pdf', { type: 'application/pdf' })] } })
    expect(within(form).getByText('action.pdf')).toBeTruthy()

    const agent = within(form).getByRole('button', { name: 'Agent: Patent Agent' })
    fireEvent.click(agent)
    await screen.findByRole('menuitem', { name: /Office action responder/ })
    fireEvent.click(agent)
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.click(agent)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Office action responder/ }))
    expect(within(form).getByRole('button', { name: 'Agent: Office action responder' })).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: 'Agent: Office action responder' }))
    await screen.findByRole('menuitem', { name: /Patent Agent/ })
    fireEvent.pointerDown(document.body)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menuitem')).toBeNull()

    fireEvent.click(within(form).getByRole('button', { name: en['form.cancel'] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(en['notice.run'])).toBeNull()
  })

  it('shows the review count on the launcher glyph', () => {
    const board = createBoard(SAMPLE_ANALYSIS)
    const { container } = render(<WorkPagesPanelIcon size={16} useBoard={bindSnapshotSelector(board.hooks.board)} />)
    expect(container.querySelector('[data-work-pages-count]')?.textContent).toBe('2')
    act(() => {
      board.setState('art54', 'done')
      board.setState('art56', 'not_relevant')
    })
    expect(container.querySelector('[data-work-pages-count]')).toBeNull()
  })
})

class RemoteStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  $on(): () => void {
    return () => {}
  }
}

async function pluginContext(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  new StaticRemoteAccess(ctx, () => true)
  new RemoteStub(ctx)
  ctx.provide('configForms', { developerTools: { enabled: createSnapshotStore(true) }, get: () => stubConfigForm().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      main: { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  return ctx
}

describe('ui-flowleap-work-pages browser half', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers the launcher and the board under one panel id and removes them on dispose', async () => {
    const ctx = await pluginContext()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const launcher = ctx.slots.entries('sidebar.panellist')
    expect(launcher.map(entry => entry.options.id)).toEqual([PANEL_ID])
    expect((launcher[0]!.options.label as () => string)()).toBe(en.panel)
    expect(ctx.slots.entries('main').map(entry => entry.options.key)).toEqual([PANEL_ID])
    const icon = launcher[0]!.inject!()
    const page = ctx.slots.entries('main')[0]!.inject!()
    const hooks = icon.hooks as Board['hooks']
    expect(hooks).toBe(page.hooks)
    ;(page.setState as Board['setState'])('art54', 'done')
    expect(needsReviewCount(hooks.board.getSnapshot().attorney)).toBe(1)
    expect(Math.abs((page.now as () => number)() - Date.now())).toBeLessThan(1000)
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    await ctx.fiber.dispose()
  })

  it('registers key-identical dictionaries and releases them with its fiber', async () => {
    const ctx = await pluginContext()
    ctx.locale.setLocale('zh')
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const translate = ctx.locale.bind(NS)
    expect(translate('action.plan')).toBe(zh['action.plan'])
    ctx.locale.setLocale('en')
    expect(translate('action.plan')).toBe('Write response plan')
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    await fiber.dispose()
    expect(translate('action.plan')).not.toBe(en['action.plan'])
    await ctx.fiber.dispose()
  })
})

describe('ui-flowleap-work-pages node half', () => {
  it('registers nothing on the host', () => {
    expect(() => { applyNode() }).not.toThrow()
  })
})
