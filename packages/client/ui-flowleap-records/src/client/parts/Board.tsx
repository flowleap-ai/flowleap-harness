/**
 * The work board (product rule 7): a column for each atlas state of one machine and a card for each work item. A
 * card moves only on an allowed transition, by a person who may make it; while a card is lifted, an allowed column
 * says "Drop to decide" and what opens, and a column that takes no card says why at full contrast. A drop that is a
 * decision opens the decision bar; nothing moves until the person records it.
 */

import type { ReactNode } from 'react'
import { AvatarStack, type AvatarPerson } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AtlasRef } from '../atlas.ts'
import { AtlasStatus, RowStatusIcon, type AtlasWord } from './Status.tsx'
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
 * @param props.children - the cards.
 * @returns the column.
 */
export function BoardColumn({ status, word, count, owner, drop = { kind: 'idle' }, children }: {
  status: AtlasRef
  word: AtlasWord
  count: number
  owner: string
  drop?: DropState
  children: ReactNode
}) {
  return (
    <section className={css.column} data-drop={drop.kind}>
      <header className={css.columnHead}>
        <AtlasStatus status={status} word={word} />
        <span className={css.count}>{count}</span>
        <span className={css.owner}>{owner}</span>
      </header>
      {drop.kind === 'refused' && <p className={css.refused}>{drop.reason}</p>}
      {drop.kind === 'allowed' && (
        <div className={css.dropHint}><b className={css.dropTitle}>{drop.title}</b>{drop.body}</div>
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
 * most, the matter with the due date, and the labelled facts.
 * @param props.status - the column's atlas state.
 * @param props.matterKey - the file number.
 * @param props.team - the team inside the matter's wall.
 * @param props.title - the work's title.
 * @param props.sub - the matter name and the due date.
 * @param props.facts - the labelled facts.
 * @param props.lifted - the card is being dragged.
 * @param props.onOpen - open the work.
 * @returns the card.
 */
export function BoardCard({ status, matterKey, team, title, sub, facts, lifted = false, onOpen }: {
  status: AtlasRef
  matterKey: string
  team: readonly AvatarPerson[]
  title: string
  sub: ReactNode
  facts: readonly CardFact[]
  lifted?: boolean
  onOpen: () => void
}) {
  return (
    <article className={css.card} data-lifted={lifted || undefined}>
      <div className={css.top}>
        <RowStatusIcon status={status} />
        <span className={css.key}>{matterKey}</span>
        <AvatarStack people={team} className={css.team} />
      </div>
      <button type="button" className={css.title} onClick={onOpen}>{title}</button>
      <div className={css.sub}>{sub}</div>
      {facts.length > 0 && (
        <div className={css.facts}>
          {facts.map(fact => (
            <span key={fact.label} className={css.fact}>
              <span className={css.factLabel}>{fact.label}</span>
              <AtlasStatus status={fact.status} word={fact.word} />
            </span>
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
