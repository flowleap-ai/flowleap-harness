// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Load } from '../src/client/load.ts'
import { ActButton, type ActSpec } from '../src/client/parts/Act.tsx'
import { ActivityTimeline } from '../src/client/parts/Activity.tsx'
import { BoardCard, BoardColumn, CardSlot } from '../src/client/parts/Board.tsx'
import { DecisionBar, DecisionPart, type ReasonAct } from '../src/client/parts/Decision.tsx'
import { EvidenceQuote, MissingEvidence, RecordSource, StatementRow, StatementTable } from '../src/client/parts/Evidence.tsx'
import { DetailHeader, DetailLayout, KeyFact, KeyProperties, PropertiesPanel, QueueSplit, Section, WorkColumn } from '../src/client/parts/Layout.tsx'
import { ListFrame, ListGroup, ListRow, MetaCell, SelectionBar, SkeletonRows, TimeCell, TitleCell } from '../src/client/parts/List.tsx'
import { EmptyState, ErrorNotice, LoadView, PageSpinner } from '../src/client/parts/States.tsx'
import { AtlasPill, AtlasStatus, atlasWord, RowStatusIcon, type AtlasWord } from '../src/client/parts/Status.tsx'
import { en } from '../src/client/locales.ts'
import { fixtures } from './fixtures.client.ts'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const t = (key: keyof typeof en) => en[key]
const word = (text: string) => text as AtlasWord
const act = (id: string, label: string, extra: Partial<ActSpec> = {}): ActSpec => ({ id, label, keycaps: [['K']], run: vi.fn(), ...extra })
const waiting = { machine: 'intake', state: 'match_proposed' } as const

describe('status', () => {
  it('shows the shape with its word and names the atlas state', () => {
    render(<AtlasStatus status={waiting} word={atlasWord(t, waiting)} className="placed" />)
    const status = screen.getByText('Match proposed')
    expect(status.dataset['atlas']).toBe('intake.match_proposed')
    expect(status.querySelector('svg')?.dataset['shape']).toBe('wait')
    expect(status.classList.contains('placed')).toBe(true)
  })

  it('draws the eyebrow pill and the hidden row icon', () => {
    const { container } = render(<><AtlasPill status={{ machine: 'deadline', state: 'stale' }} word={word('Stale')} /><RowStatusIcon status={waiting} /></>)
    expect(screen.getByText('Stale').closest('[data-atlas]')?.getAttribute('data-atlas')).toBe('deadline.stale')
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2)
  })
})

describe('act button', () => {
  it('shows the label and the keycap and runs the act', () => {
    const accept = act('record', 'Accept and file', { command: 'records.decision.record' as ActSpec['command'] })
    render(<ActButton act={accept} rank="primary" size="md" />)
    const button = screen.getByRole('button', { name: /Accept and file/ })
    expect(button.dataset['act']).toBe('record')
    expect(button.dataset['command']).toBe('records.decision.record')
    expect(button.querySelector('kbd')?.textContent).toBe('K')
    fireEvent.click(button)
    expect(accept.run).toHaveBeenCalledOnce()
  })
})

describe('list', () => {
  it('renders the header, groups with counts, and hides an empty group', () => {
    render(
      <ListFrame label="Letters" columns="14px 1fr" header={['', 'Letter']}>
        <ListGroup status={waiting} word={word('Match proposed')} count={1}>
          <ListRow status={waiting} selection={{ checked: false, label: 'Select A', onChange: vi.fn() }} onOpen={vi.fn()}>
            <TitleCell title="A" source="EPO" /><MetaCell>FL-1</MetaCell><TimeCell>14:16</TimeCell>
          </ListRow>
        </ListGroup>
        <ListGroup status={{ machine: 'intake', state: 'unmatched' }} word={word('No matter found')} count={0}>{null}</ListGroup>
      </ListFrame>,
    )
    const list = screen.getByRole('list', { name: 'Letters' })
    expect(within(list).getByText('Match proposed')).toBeTruthy()
    expect(within(list).queryByText('No matter found')).toBeNull()
    expect(screen.getByText('EPO')).toBeTruthy()
    expect(screen.getByText('A').textContent).toBe('AEPO')
  })

  it('opens a row on click, selects a range with shift, and leaves the open row selected', () => {
    const onOpen = vi.fn()
    const onChange = vi.fn()
    const menuOpen = vi.fn()
    render(
      <ListFrame label="Letters" columns="14px 1fr" header={['', 'Letter']} selecting>
        <ListRow status={waiting} open selection={{ checked: true, label: 'Select A', onChange }} onOpen={onOpen} menu={{ onContextMenu: menuOpen }}>
          <TitleCell title="A" source={null} />
        </ListRow>
      </ListFrame>,
    )
    const row = screen.getAllByRole('listitem')[0]!
    expect(row.getAttribute('aria-current')).toBe('true')
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledOnce()
    fireEvent.click(row, { shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(false, true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select A' }), { shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(false, true)
    expect(onOpen).toHaveBeenCalledOnce()
    fireEvent.contextMenu(row)
    expect(menuOpen).toHaveBeenCalledOnce()
  })

  it('draws skeleton rows on the column grid and the selection bar', () => {
    const accept = act('record', 'Accept and file 3')
    const clear = act('clear', 'Clear the selection', { keycaps: [] })
    render(<><SkeletonRows label="Loading" cells={['dot', 'bar', 'avatar', 'end']} count={2} /><SelectionBar label="3 selected" acts={[clear]} primary={accept} /></>)
    expect(screen.getByRole('status', { name: 'Loading' }).children).toHaveLength(2)
    expect(screen.getByText('3 selected').closest('[data-bulk]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Accept and file 3/ }))
    expect(accept.run).toHaveBeenCalledOnce()
    render(<SkeletonRows label="Loading two" cells={['bar']} />)
    expect(screen.getByRole('status', { name: 'Loading two' }).children).toHaveLength(6)
    render(<MetaCell truncate>FL-2026-0001 Pressure sensor housing</MetaCell>)
    expect(screen.getByText('FL-2026-0001 Pressure sensor housing').className).toContain('truncate')
  })
})

describe('layout', () => {
  it('shows the list alone, or the list and the open item', () => {
    const { container, rerender } = render(<QueueSplit list={<p>list</p>} item={null} />)
    expect((container.firstElementChild as HTMLElement).dataset['open']).toBeUndefined()
    rerender(<QueueSplit list={<p>list</p>} item={<p>item</p>} />)
    expect((container.firstElementChild as HTMLElement).dataset['open']).toBe('true')
    expect(screen.getByText('item')).toBeTruthy()
  })

  it('renders the detail page parts', () => {
    render(
      <DetailLayout decision properties={<PropertiesPanel label="Properties" groups={[{ heading: 'Matter', rows: [{ label: 'Client', value: 'Kessler', title: 'Kessler Sensorik GmbH' }] }]} />}>
        <WorkColumn decision={<p>bar</p>}>
          <DetailHeader eyebrow={<span>eyebrow</span>} title="Title" lede="Lede" />
          <DetailHeader eyebrow={null} title="Second" />
          <KeyFact value="Monday, 1 March 2027" detail="117 days left" />
          <KeyFact value="Only" />
          <Section heading="Deadlines" count={1} actions={<button type="button">Add</button>}><p>rows</p></Section>
          <Section heading="Plain"><p>more</p></Section>
          <KeyProperties rows={[{ label: 'Client', value: 'Kessler' }]} />
        </WorkColumn>
        <WorkColumn decision={null}><p>no bar</p></WorkColumn>
      </DetailLayout>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeTruthy()
    expect(screen.getByText('Lede')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeTruthy()
    expect(screen.getByTitle('Kessler Sensorik GmbH').textContent).toBe('Kessler')
    expect(screen.getByText('117 days left')).toBeTruthy()
    expect(screen.getByText('bar')).toBeTruthy()
    const { container } = render(<DetailLayout properties={null}><p>page</p></DetailLayout>)
    expect((container.firstElementChild as HTMLElement).dataset['decision']).toBeUndefined()
  })
})

describe('decision bar', () => {
  const me = fixtures.me.person

  function reasonAct(open: boolean, extra: Partial<ReasonAct> = {}): ReasonAct {
    return {
      id: 'reject', label: 'Not relevant…', keycaps: [['2']], open, onOpenChange: vi.fn(), reasonLabel: 'Why?', confirmLabel: 'Mark not relevant',
      cancelLabel: 'Cancel', onConfirm: vi.fn(), ...extra,
    }
  }

  it('names the person, the question, the parts and runs the one primary act', () => {
    const accept = act('record', 'Accept and file')
    const negative = reasonAct(false)
    render(
      <DecisionBar
        person={me} question="Which matter is this letter for?" why="Filing puts your name on the record" note="After you record it"
        labels={{ yours: 'Your decision', more: 'More acts' }}
        parts={<DecisionPart icon={<span />} title="FL-2026-0001" detail="3 reasons agree" control={<button type="button">Choose</button>} />}
        negative={negative} secondary={[act('otherMatter', 'Other matter…')]} primary={accept}
      />,
    )
    expect(screen.getByRole('region', { name: 'Your decision' })).toBeTruthy()
    expect(screen.getByText('Which matter is this letter for?')).toBeTruthy()
    expect(screen.getByText('After you record it')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Accept and file/ }))
    expect(accept.run).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Not relevant/ }))
    expect(negative.onOpenChange).toHaveBeenCalledWith(true)
  })

  it('moves the secondary acts into the overflow menu', () => {
    const other = act('otherMatter', 'Other matter…')
    render(<DecisionBar person={me} question="Q" labels={{ yours: 'Your decision', more: 'More acts' }} secondary={[other, act('x', 'Other', { disabled: true })]} primary={null} />)
    const more = screen.getByRole('button', { name: 'More acts' })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: /Other matter/ }))
    expect(other.run).toHaveBeenCalledOnce()
    fireEvent.click(more)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('blocks the primary act with the reason while evidence is missing', () => {
    render(
      <DecisionBar person={me} question="Q" labels={{ yours: 'Your decision', more: 'More acts' }} blocked="Statement 5 has no source, so Accept waits."
        parts={<DecisionPart icon={<span />} title="Client report" missing="Statement 5 has no source, so Accept waits." />}
        primary={act('record', 'Record decision')} />,
    )
    expect(screen.getByRole('button', { name: /Record decision/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('note').textContent).toContain('Statement 5 has no source')
  })

  it('says who decides and shows no primary act when the decision is another person\'s', () => {
    render(<DecisionBar person={me} question="Q" labels={{ yours: 'Your decision', more: 'More acts' }} decider="Jonas Weber decides this." primary={act('record', 'Confirm deadline')} />)
    expect(screen.getByText('Jonas Weber decides this.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Confirm deadline/ })).toBeNull()
  })

  it('asks for the reason of a negative act and records it', () => {
    const negative = reasonAct(true)
    render(<DecisionBar person={me} question="Q" labels={{ yours: 'Your decision', more: 'More acts' }} negative={negative} primary={act('record', 'Accept')} />)
    const field = screen.getByLabelText('Why?')
    const confirm = screen.getByRole('button', { name: 'Mark not relevant' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.submit(field.closest('form')!)
    expect(negative.onConfirm).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '  Advertising  ' } })
    fireEvent.click(confirm)
    expect(negative.onConfirm).toHaveBeenCalledWith('Advertising')
    fireEvent.keyDown(field, { key: 'a' })
    fireEvent.keyDown(field, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(negative.onOpenChange).toHaveBeenCalledTimes(2)
    expect(negative.onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('evidence', () => {
  const span = fixtures.ticket.reports[0]!.statements[1]!.evidence[0]!.span!

  it('quotes the span with its page, focusable for its excerpt', () => {
    render(<EvidenceQuote span={span} labels={{ page: 'p. 1', excerpt: 'Letter, page 1', exact: 'Exact span' }} />)
    const quote = screen.getByText('intends to grant a European patent')
    expect(quote.getAttribute('tabindex')).toBe('0')
    expect(screen.getByText('p. 1')).toBeTruthy()
  })

  it('quotes a span with no page text without an excerpt', () => {
    render(<EvidenceQuote span={{ ...span, excerpt: null }} labels={{ page: 'p. 1', excerpt: 'Letter, page 1', exact: 'Exact span' }} />)
    expect(screen.getByText('intends to grant a European patent').getAttribute('tabindex')).toBeNull()
  })

  it('shows missing evidence with its two ways out, in a tinted statement row', () => {
    const onFind = vi.fn()
    const onRemove = vi.fn()
    render(
      <StatementTable headers={{ number: '#', says: 'What the draft says', source: 'Source in the letter' }}>
        <StatementRow number={4} text="Ends on 1 March 2027."><RecordSource icon={<span />}>Deadline, active</RecordSource></StatementRow>
        <StatementRow number={5} text="The fee is EUR 1,050." missing>
          <MissingEvidence labels={{ title: 'Missing evidence', why: 'The letter does not state this.', find: 'Find the source', remove: 'Remove from the draft' }} onFind={onFind} onRemove={onRemove} />
        </StatementRow>
      </StatementTable>,
    )
    expect(screen.getAllByRole('row')[2]!.dataset['missing']).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Find the source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from the draft' }))
    expect(onFind).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.getByText('Deadline, active')).toBeTruthy()
  })
})

describe('activity', () => {
  it('writes a person by name and a system actor beside its glyph, with Audit', () => {
    render(
      <ActivityTimeline
        heading="Activity"
        lines={[
          { key: '1', actor: { kind: 'system', name: 'FlowLeap', icon: <svg /> }, text: 'read the letter', time: '14:16' },
          { key: '2', actor: { kind: 'person', person: fixtures.me.person }, text: 'filed the letter', time: '14:17' },
        ]}
        comment={<p>comment</p>}
        audit={{ label: 'Audit', rows: [{ key: '1', cells: ['101', 'intake/read', '2026-11-04T14:16:00Z'] }] }}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items[0]!.textContent).toBe('FlowLeap read the letter14:16')
    expect(items[1]!.dataset['person']).toBe('true')
    expect(screen.getByText('Audit').closest('[data-audit]')).not.toBeNull()
    expect(screen.getByText('comment')).toBeTruthy()
  })
})

describe('board', () => {
  it('renders columns in each drop state and cards that open their work', () => {
    const onOpen = vi.fn()
    const ready = { machine: 'ticket', state: 'proposals_ready' } as const
    render(
      <>
        <BoardColumn status={ready} word={word('Proposals ready')} count={1} owner="You" drop={{ kind: 'allowed', title: 'Drop to decide', body: 'Nothing moves until you record it.' }}>
          <BoardCard status={ready} matterKey="FL-2026-0001" team={[{ name: 'Dr. Anna Becker' }]} title="Rule 71(3) communication" sub="Pressure sensor housing" lifted
            facts={[{ label: 'Deadline', status: { machine: 'deadline', state: 'active' }, word: word('Active') }]} onOpen={onOpen} />
          <CardSlot />
        </BoardColumn>
        <BoardColumn status={{ machine: 'ticket', state: 'routed' }} word={word('Assigned')} count={0} owner="FlowLeap" drop={{ kind: 'refused', reason: 'FlowLeap assigns the work.' }}>{null}</BoardColumn>
        <BoardColumn status={{ machine: 'ticket', state: 'decided' }} word={word('Decided')} count={1} owner="You">
          <BoardCard status={{ machine: 'ticket', state: 'decided' }} matterKey="FL-2023-0610" team={[]} title="Renewal fee reminder" sub="Rotor blade clamp" facts={[]} onOpen={onOpen} />
        </BoardColumn>
      </>,
    )
    expect(screen.getByText('Drop to decide')).toBeTruthy()
    expect(screen.getByText('FlowLeap assigns the work.')).toBeTruthy()
    expect(screen.getAllByRole('article')[0]!.dataset['lifted']).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Rule 71(3) communication' }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.getByText('Active').closest('[data-atlas]')?.getAttribute('data-atlas')).toBe('deadline.active')
  })
})

describe('states', () => {
  it('renders the empty state, the error notice and the spinner', () => {
    const retry = act('retry', 'Try again')
    render(
      <>
        <EmptyState icon={<svg />} title="Nothing waits for you" body="Forward a letter." action={act('showFiled', 'Show filed today')} />
        <EmptyState icon={<svg />} title="No matters yet" body="Matters show here." />
        <ErrorNotice lead="FlowLeap could not load this view." body="It shows the data as of 14:16." retry={retry} />
        <ErrorNotice lead="Second failure." retry={retry} />
        <PageSpinner label="Loading" />
      </>,
    )
    expect(screen.getAllByRole('alert')[0]!.textContent).toContain('as of 14:16')
    fireEvent.click(screen.getAllByRole('button', { name: /Try again/ })[0]!)
    expect(retry.run).toHaveBeenCalledOnce()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
  })

  it('renders each phase of a load and keeps the last data under the notice', () => {
    const render$ = { loading: () => <p>skeleton</p>, ready: (data: string) => <p>{data}</p>, failed: (at: number | null) => <p>{`failed ${at ?? 'never'}`}</p> }
    const view = (load: Load<string>) => render(<LoadView load={load} render={render$} />).container.textContent
    expect(view({ phase: 'waiting' })).toBe('')
    expect(view({ phase: 'skeleton' })).toBe('skeleton')
    expect(view({ phase: 'ready', data: 'rows', at: 1, refreshing: false })).toBe('rows')
    expect(view({ phase: 'failed', error: { kind: 'network' }, last: { data: 'old rows', at: 5 }, retrying: false })).toBe('failed 5old rows')
    expect(view({ phase: 'failed', error: { kind: 'network' }, last: null, retrying: false })).toBe('failed never')
  })
})
