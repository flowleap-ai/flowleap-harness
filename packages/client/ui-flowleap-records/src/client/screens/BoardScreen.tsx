/**
 * The work board (product rule 7): a column for each state of the work machine that work waits or works in
 * (Assigned, Running, Proposals ready, Decided) and the count of every other state, or the same work as a list
 * grouped by state. A card moves only on an allowed transition by a person who may make it: the one move a person
 * makes is Proposals ready to Decided, a decision, so its drop opens the work page with its decision bar and nothing
 * moves until the person records it. While a card is dragged, every other column says why it takes no card.
 */

import { useState } from 'react'
import { AvatarStack, IconLayersOutlineRegular, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { Me, TicketRow, TicketsList } from '../api.ts'
import type { TicketState } from '../atlas.ts'
import { formatDate } from '../format.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { commandId } from '../keys.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import { BoardCard, BoardColumn, type CardFact, type DropState } from '../parts/Board.tsx'
import { ListFrame, ListGroup, ListRow, MetaCell, SkeletonRows, TimeCell, TitleCell } from '../parts/List.tsx'
import { EmptyState, LoadView } from '../parts/States.tsx'
import { AtlasStatus, atlasWord } from '../parts/Status.tsx'
import { letterTitle } from '../words.ts'
import type { ScreenContext, ScreenProps } from './context.ts'
import { LoadError } from './shared.tsx'
import css from './BoardScreen.module.css'

/** A column of the board: its state, who moves a card out of it, and why a person cannot drop a card on it. */
interface BoardColumnSpec {
  readonly state: TicketState
  readonly owner: FlowleapRecordsKey
  readonly refusal: FlowleapRecordsKey
}

/** The columns: the states that work waits or works in, as the board mockup shows them. */
export const BOARD_COLUMNS: readonly BoardColumnSpec[] = [
  { state: 'routed', owner: 'board.ownerFlowleap', refusal: 'board.refused.assigned' },
  { state: 'running', owner: 'board.ownerAgent', refusal: 'board.refused.running' },
  { state: 'proposals_ready', owner: 'board.ownerYou', refusal: 'board.refused.back' },
  { state: 'decided', owner: 'board.ownerYou', refusal: 'board.refused.decided' },
]

/** The states in "Other states": always these five, then any other state that has work. */
const OTHER_STATES: readonly TicketState[] = ['no_person', 'run_failed', 'observed', 'by_hand', 'cancelled']

/** The moves that a person makes on the board; each is a decision, recorded on the work page. */
export const PERSON_MOVES: readonly { readonly from: TicketState; readonly to: TicketState }[] = [
  { from: 'proposals_ready', to: 'decided' },
]

/** The column grid of the list layout: status, work, matter, team, due. */
const LIST_COLUMNS = '14px minmax(0, 1fr) 92px 64px 120px'

/**
 * Whether the signed-in person may make a decision on the work: a member of the matter's team.
 * @param row - the work.
 * @param me - the signed-in person.
 * @returns true when the person may move the card.
 */
export function mayMove(row: TicketRow, me: Me | null): boolean {
  return me !== null && row.team.some(person => person.id === me.person.id)
}

/**
 * How a column answers a dragged card.
 * @param ctx - the screen context.
 * @param column - the column.
 * @param card - the dragged card, or null when no card is dragged.
 * @returns the drop state.
 */
export function dropOf(ctx: ScreenContext, column: BoardColumnSpec, card: TicketRow | null): DropState {
  if (card === null || card.state === column.state) return { kind: 'idle' }
  const allowed = PERSON_MOVES.some(move => move.from === card.state && move.to === column.state)
  if (!allowed) return { kind: 'refused', reason: ctx.t(column.refusal) }
  if (!mayMove(card, ctx.me)) return { kind: 'refused', reason: ctx.t('board.refused.team') }
  return { kind: 'allowed', title: ctx.t('board.drop.title'), body: ctx.t('board.drop.body') }
}

/**
 * The labelled facts of a card: the deadline, the client report and the reply, each with its status.
 * @param ctx - the screen context.
 * @param row - the work.
 * @returns the facts.
 */
function factsOf(ctx: ScreenContext, row: TicketRow): CardFact[] {
  const { t } = ctx
  return [
    ...(row.deadline === null ? [] : [{ label: t('board.deadline'), status: { machine: 'deadline', state: row.deadline.state } as const }]),
    ...(row.report === null ? [] : [{ label: t('board.report'), status: { machine: 'report', state: row.report.state } as const }]),
    ...(row.reply === null ? [] : [{ label: t('board.reply'), status: { machine: 'outbox', state: row.reply.state } as const }]),
  ].map(fact => ({ ...fact, word: atlasWord(t, fact.status) }))
}

/**
 * The matter name and the due date of a card.
 * @param ctx - the screen context.
 * @param row - the work.
 * @returns the text.
 */
function subOf(ctx: ScreenContext, row: TicketRow): string {
  return row.due === null ? row.matter.title : `${row.matter.title} · ${ctx.t('board.due', { date: formatDate(row.due, ctx.locale) })}`
}

/**
 * Move the focus to the next or the previous row of the list layout; with no focused row, to the first or the last.
 * @param by - 1 for the next row, -1 for the previous one.
 */
function focusRow(by: 1 | -1): void {
  const rows = [...document.querySelectorAll<HTMLElement>('[data-row]')]
  const current = rows.findIndex(row => row.contains(document.activeElement))
  const next = current === -1 ? rows.at(by === 1 ? 0 : -1) : rows[current + by]
  next?.focus()
}

/**
 * Render the work board.
 * @param props.screen - the board route with its load.
 * @param props.ctx - the screen context.
 * @returns the board or its list.
 */
export function BoardScreen({ screen, ctx }: ScreenProps<'board'>) {
  const { t } = ctx
  const [mine, setMine] = useState(false)
  const [dragged, setDragged] = useState<TicketRow | null>(null)
  const layout = screen.layout ?? 'board'
  useKeyActs(ctx, {
    retry: ctx.retry,
    next: () => { focusRow(1) },
    previous: () => { focusRow(-1) },
    goIntake: () => { ctx.navigate({ view: 'intake', list: 'waiting', open: null }) },
    open: () => { document.activeElement?.closest<HTMLElement>('[data-row]')?.click() },
  })
  const item: CommandMenuItem = {
    label: t('board.title'),
    groups: [{ id: 'layout', label: t('board.layout'), acts: [
      { id: 'board', label: t('board.layoutBoard'), run: () => { ctx.navigate({ view: 'board', layout: 'board' }) } },
      { id: 'list', label: t('board.layoutList'), run: () => { ctx.navigate({ view: 'board', layout: 'list' }) } },
      { id: 'intake', label: t('tab.intake'), commandId: commandId('goIntake'), run: () => { ctx.navigate({ view: 'intake', list: 'waiting', open: null }) } },
    ] }],
  }
  useCommandItem(ctx, item)
  return (
    <div className={css.screen}>
      <div className={css.viewbar}>
        <Pill active={mine} aria-pressed={mine} onClick={() => { setMine(!mine) }}>{t('board.forMe')}</Pill>
        {dragged !== null && <span className={css.hint}>{t('board.dragHint')}</span>}
      </div>
      <LoadView
        load={screen.tickets}
        render={{
          loading: () => layout === 'list'
            ? <SkeletonRows label={t('loading')} cells={['dot', 'bar', 'bar', 'avatar', 'end']} />
            : <SkeletonRows label={t('loading')} cells={['dot', 'bar', 'bar', 'avatar', 'end']} count={4} />,
          failed: at => <LoadError ctx={ctx} at={at} />,
          ready: (data) => {
            const rows = mine ? data.rows.filter(row => row.routedTo?.id === ctx.me?.person.id) : data.rows
            if (rows.length === 0) {
              return (
                <EmptyState
                  icon={<IconLayersOutlineRegular size={16} />}
                  title={t('board.empty.title')}
                  body={t('board.empty.body')}
                />
              )
            }
            return layout === 'list'
              ? <WorkList ctx={ctx} rows={rows} />
              : <Board ctx={ctx} data={{ rows }} dragged={dragged} onDrag={setDragged} />
          },
        }}
      />
    </div>
  )
}

/**
 * Render the board's columns, cards and other states.
 * @param props.ctx - the screen context.
 * @param props.data - the work.
 * @param props.dragged - the dragged card.
 * @param props.onDrag - a drag starts (the card) or ends (null).
 * @returns the board.
 */
function Board({ ctx, data, dragged, onDrag }: {
  ctx: ScreenContext
  data: TicketsList
  dragged: TicketRow | null
  onDrag: (row: TicketRow | null) => void
}) {
  const { t } = ctx
  const shown = new Set<TicketState>(BOARD_COLUMNS.map(column => column.state))
  const others = [...OTHER_STATES, ...data.rows.map(row => row.state).filter(state => !OTHER_STATES.includes(state))]
    .filter((state, index, all) => !shown.has(state) && all.indexOf(state) === index)
  return (
    <div className={css.board}>
      {BOARD_COLUMNS.map((column) => {
        const status = { machine: 'ticket', state: column.state } as const
        const cards = data.rows.filter(row => row.state === column.state)
        const drop = dropOf(ctx, column, dragged)
        return (
          <BoardColumn
            key={column.state}
            status={status}
            word={atlasWord(t, status)}
            count={cards.length}
            owner={t(column.owner)}
            drop={drop}
            onDrop={dragged === null ? undefined : () => {
              onDrag(null)
              ctx.navigate({ view: 'work', id: dragged.id })
            }}
          >
            {cards.map((card) => {
              const movable = mayMove(card, ctx.me) && PERSON_MOVES.some(move => move.from === card.state)
              return (
                <BoardCard
                  key={card.id}
                  status={status}
                  matterKey={card.matter.fileNumber}
                  team={card.team}
                  title={letterTitle(t, card.code)}
                  sub={subOf(ctx, card)}
                  facts={factsOf(ctx, card)}
                  dragging={dragged?.id === card.id}
                  drag={movable ? { id: card.id, onStart: () => { onDrag(card) }, onEnd: () => { onDrag(null) } } : undefined}
                  onOpen={() => { ctx.navigate({ view: 'work', id: card.id }) }}
                />
              )
            })}
          </BoardColumn>
        )
      })}
      <section className={css.other} aria-label={t('board.otherStates')}>
        <h2 className={css.otherHead}>{t('board.otherStates')}</h2>
        <ul className={css.otherRows}>
          {others.map((state) => {
            const status = { machine: 'ticket', state } as const
            const count = data.rows.filter(row => row.state === state).length
            return (
              <li key={state} className={css.otherRow}>
                {count === 0
                  ? <AtlasStatus status={status} word={atlasWord(t, status)} />
                  : (
                    <button type="button" className={css.otherLink} onClick={() => { ctx.navigate({ view: 'board', layout: 'list' }) }}>
                      <AtlasStatus status={status} word={atlasWord(t, status)} />
                    </button>
                  )}
                <span className={css.otherCount}>{count}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

/**
 * Render the work as a list grouped by state: the board's columns first, then the other states.
 * @param props.ctx - the screen context.
 * @param props.rows - the work.
 * @returns the list.
 */
function WorkList({ ctx, rows }: { ctx: ScreenContext; rows: readonly TicketRow[] }) {
  const { t } = ctx
  const order = [...BOARD_COLUMNS.map(column => column.state), ...OTHER_STATES]
  const rank = (state: TicketState) => {
    const index = order.indexOf(state)
    return index === -1 ? order.length : index
  }
  const states = [...new Set(rows.map(row => row.state))].toSorted((left, right) => rank(left) - rank(right))
  return (
    <ListFrame label={t('board.listLabel')} columns={LIST_COLUMNS} header={['', t('board.col.work'), t('col.matter'), t('board.col.team'), t('board.col.due')]}>
      {states.map((state) => {
        const status = { machine: 'ticket', state } as const
        const group = rows.filter(row => row.state === state)
        return (
          <ListGroup key={state} status={status} word={atlasWord(t, status)} count={group.length}>
            {group.map(row => (
              <ListRow key={row.id} rowKey={row.id} status={status} onOpen={() => { ctx.navigate({ view: 'work', id: row.id }) }}>
                <TitleCell title={letterTitle(t, row.code)} source={row.matter.title} />
                <MetaCell truncate>{row.matter.fileNumber}</MetaCell>
                <AvatarStack people={row.team} />
                <TimeCell>{row.due === null ? '' : formatDate(row.due, ctx.locale)}</TimeCell>
              </ListRow>
            ))}
          </ListGroup>
        )
      })}
    </ListFrame>
  )
}
