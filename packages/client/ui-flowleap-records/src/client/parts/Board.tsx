/**
 * The work board (product rule 7): a column for each atlas state of one machine and a card for each work item. A
 * card moves only on an allowed transition, by a person who may make it; while a card is lifted, an allowed column
 * says "Drop to decide" and what opens, and a column that takes no card says why at full contrast. A drop that is a
 * decision opens the decision bar; nothing moves until the person records it.
 */

import type { DragEvent, ReactNode } from 'react'
import clsx from 'clsx'
import { AvatarStack, type AvatarPerson } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AtlasRef } from '../atlas.ts'
import { SkeletonBone } from './List.tsx'
import { AtlasStatus, FactStatus, RowStatusIcon, type AtlasWord } from './Status.tsx'
import css from './Board.module.css'

/** How a column answers a lifted card. */
export type DropState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'allowed'; readonly title: string; readonly body: string }
  | { readonly kind: 'refused'; readonly reason: string }

/**
 * Render a board column: its state's icon and word, the count, the owner of the state, and the cards.
 * @param props.status - the column's atlas state.
 * @param props.word - its word.
 * @param props.count - the cards in the column.
 * @param props.owner - who moves cards out of the column, such as "You" or "FlowLeap".
 * @param props.drop - how the column answers a lifted card.
 * @param props.onDrop - take a card dropped on an allowed column; the column takes no drop while it is not allowed.
 * @param props.children - the cards.
 * @returns the column.
 */
export function BoardColumn({ status, word, count, owner, drop = { kind: 'idle' }, onDrop, children }: {
  status: AtlasRef
  word: AtlasWord
  count: number
  owner: string
  drop?: DropState
  onDrop?: (() => void) | undefined
  children: ReactNode
}) {
  const allowed = drop.kind === 'allowed' && onDrop !== undefined
  const over = (event: DragEvent<HTMLElement>) => {
    if (!allowed) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  return (
    <section
      className={css.column}
      data-drop={drop.kind}
      aria-label={word}
      onDragOver={over}
      onDrop={(event) => {
        if (!allowed) return
        event.preventDefault()
        onDrop()
      }}
    >
      <header className={css.columnHead}>
        <AtlasStatus status={status} word={word} />
        <span className={css.count}>{count}</span>
        <span className={css.owner}>{owner}</span>
      </header>
      {drop.kind === 'refused' && <p className={css.refused}>{drop.reason}</p>}
      {drop.kind === 'allowed' && (
        <div className={css.dropHint}><div><b className={css.dropTitle}>{drop.title}</b>{drop.body}</div></div>
      )}
      {children}
    </section>
  )
}

/** One labelled fact of a card that carries a status, such as "Deadline · Active". */
export interface CardFact {
  readonly label: string
  readonly status: AtlasRef
  readonly word: AtlasWord
}

/**
 * Render a board card: the column's icon (`aria-hidden`) and the matter key, the team, the title in two lines at
 * most, the matter name with the due date, and the labelled facts, one line each ("Deadline · Active"). The matter key and
 * every fact's label and status word are never cut and never wrap: the board column takes the width of its longest
 * fact.
 * @param props.status - the column's atlas state.
 * @param props.matterKey - the file number.
 * @param props.team - the team inside the matter's wall.
 * @param props.title - the work's title.
 * @param props.matterName - the matter's name, which hides at 390px, where the matter key names the matter.
 * @param props.due - the due date as text, such as "due Mon, 1 Mar 2027", or null for work with no due date.
 * @param props.facts - the labelled facts.
 * @param props.lifted - the card is drawn lifted, as while it is dragged.
 * @param props.drag - the card can move: start and end of its drag. A dragged card leaves the dashed empty slot at
 * its place while the browser draws the moving card.
 * @param props.dragging - the card is being dragged.
 * @param props.onOpen - open the work: a click anywhere on the card, or ↵ on its title. A drag does not click.
 * @returns the card.
 */
export function BoardCard({ status, matterKey, team, title, matterName, due, facts, lifted = false, drag, dragging = false, onOpen }: {
  status: AtlasRef
  matterKey: string
  team: readonly AvatarPerson[]
  title: string
  matterName: string
  due: string | null
  facts: readonly CardFact[]
  lifted?: boolean
  drag?: { readonly id: string; readonly onStart: () => void; readonly onEnd: () => void } | undefined
  dragging?: boolean
  onOpen: () => void
}) {
  return (
    <article
      className={css.card}
      data-lifted={lifted || undefined}
      data-dragging={dragging || undefined}
      draggable={drag !== undefined || undefined}
      onDragStart={drag === undefined
        ? undefined
        : (event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', drag.id)
          drag.onStart()
        }}
      onDragEnd={drag?.onEnd}
      onClick={onOpen}
    >
      <div className={css.top}>
        <RowStatusIcon status={status} />
        <span className={css.key}>{matterKey}</span>
        <AvatarStack people={team} className={css.team} />
      </div>
      {/* The keyboard's way into the card: ↵ or Space on the title clicks it, and the card's click opens the work. */}
      <button type="button" className={css.title}>{title}</button>
      <div className={css.sub}>
        <span className={css.matterName}>{matterName}</span>
        {due !== null && <span className={css.due}>{due}</span>}
      </div>
      {facts.length > 0 && (
        <div className={css.facts}>
          {facts.map(fact => (
            <FactStatus key={fact.label} label={fact.label} status={fact.status} word={fact.word} className={css.fact} />
          ))}
        </div>
      )}
    </article>
  )
}

/**
 * Render a dashed empty slot at a lifted card's old place, with no text.
 * @returns the slot.
 */
export function CardSlot() {
  return <div className={css.slot} aria-hidden="true" />
}

/**
 * Render a loading board column (R18): the column with a skeleton header and skeleton cards, no shimmer.
 * @param props.cards - the skeleton cards in the column.
 * @param props.place - the column's place, which varies the bar widths.
 * @returns the column, hidden from assistive technology; the board names the loading state.
 */
export function BoardColumnSkeleton({ cards, place }: { cards: number; place: number }) {
  return (
    <section className={css.column} aria-hidden="true">
      <header className={css.columnHead}>
        <SkeletonBone cell="dot" place={place} />
        <SkeletonBone cell="bar" place={place} />
      </header>
      {Array.from({ length: cards }, (_, card) => (
        <div key={card} className={clsx(css.card, css.skeletonCard)}>
          <SkeletonBone cell="bar" place={place + card} />
          <SkeletonBone cell="bar" place={place + card + 1} />
          <SkeletonBone cell="bar" place={place + card + 2} />
        </div>
      ))}
    </section>
  )
}
