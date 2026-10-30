/** One objection card of the board: the ground, the claims hit, the cited passages, the review state, the owner, and the note. */

import { useState } from 'react'
import {
  Button, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, Input, Menu, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  MAX_NOTE_LENGTH, MAX_OWNER_LENGTH, REVIEW_STATES, type Objection, type ReviewFields, type WorkPageReviewState,
} from '@deepseek-ai/dsh-flowleap-deliverables/work-pages'
import { AnalysisText } from './AnalysisText.tsx'
import { reviewState } from './board.ts'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

type T = TranslateNS<typeof NS>

/**
 * Render the colored dot of a review state.
 * @param props.state - the state.
 * @returns the decorative dot.
 */
export function StateMark({ state }: { state: WorkPageReviewState }) {
  return <span className={css.stateDot} data-state={state} aria-hidden="true" />
}

/**
 * Render the review state button with its menu of the four states.
 * @param props.label - accessible name of the button.
 * @param props.state - the current state.
 * @param props.onChange - the chosen state.
 * @param props.t - copy.
 * @returns the anchored menu.
 */
export function StatePicker({ label, state, onChange, t }: {
  label: string
  state: WorkPageReviewState
  onChange: (state: WorkPageReviewState) => void
  t: T
}) {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      open={open}
      portal
      dense
      onClose={() => { setOpen(false) }}
      selectedId={state}
      items={REVIEW_STATES.map(value => ({ id: value, label: t(`state.${value}`), icon: <StateMark state={value} /> }))}
      onSelect={(id) => {
        setOpen(false)
        onChange(reviewState(id))
      }}
      anchor={(
        <Button
          variant="outline"
          size="sm"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          icon={<StateMark state={state} />}
          onClick={() => { setOpen(value => !value) }}
        >
          {t(`state.${state}`)}
          <IconChevronDownOutlineRegular size={12} />
        </Button>
      )}
    />
  )
}

/**
 * The text of a field that the attorney edits: the draft while the attorney types, else the saved value. A new read of
 * the page does not replace a draft; a commit sends a changed draft and shows the saved value again.
 * @param saved - the saved value.
 * @param onChange - receives a changed draft; the Host trims it.
 * @returns the shown value, the draft setter, and the commit.
 */
function useDraft(saved: string, onChange: (value: string) => void) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft !== saved) onChange(draft)
    setDraft(null)
  }
  return { value: draft ?? saved, setDraft, commit }
}

/**
 * Render the owner field. The value is committed on blur and on Enter.
 * @param props.label - accessible name of the field.
 * @param props.owner - the saved owner.
 * @param props.onChange - the committed owner.
 * @param props.t - copy.
 * @returns the text field.
 */
export function OwnerField({ label, owner, onChange, t }: {
  label: string
  owner: string
  onChange: (owner: string) => void
  t: T
}) {
  const { value, setDraft, commit } = useDraft(owner, onChange)
  return (
    <Input
      className={css.owner as string}
      aria-label={label}
      placeholder={t('card.ownerPlaceholder')}
      maxLength={MAX_OWNER_LENGTH}
      value={value}
      onChange={(event) => { setDraft(event.currentTarget.value) }}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
    />
  )
}

/**
 * Render the note field. The value is committed on blur.
 * @param props.label - accessible name of the field.
 * @param props.note - the saved note.
 * @param props.onChange - the committed note.
 * @param props.t - copy.
 * @returns the text area.
 */
export function NoteField({ label, note, onChange, t }: {
  label: string
  note: string
  onChange: (note: string) => void
  t: T
}) {
  const { value, setDraft, commit } = useDraft(note, onChange)
  return (
    <textarea
      className={css.note}
      aria-label={label}
      placeholder={t('card.notePlaceholder')}
      maxLength={MAX_NOTE_LENGTH}
      rows={2}
      value={value}
      onChange={(event) => { setDraft(event.currentTarget.value) }}
      onBlur={commit}
    />
  )
}

/** Props of one objection card. */
export interface ObjectionCardProps {
  readonly objection: Objection
  readonly review: ReviewFields
  readonly selected: boolean
  readonly onOpen: () => void
  readonly onReview: (fields: Partial<ReviewFields>) => void
  readonly t: T
}

/**
 * Render one objection card.
 * @param props - the objection, its review fields, the actions, and copy.
 * @returns the card.
 */
export function ObjectionCard({ objection, review, selected, onOpen, onReview, t }: ObjectionCardProps) {
  const id = objection.id
  return (
    <li className={css.card} data-selected={selected ? '' : undefined} data-objection={id}>
      <Button className={css.cardOpen} aria-label={t('card.open', { id })} aria-pressed={selected} onClick={onOpen}>
        <span className={css.cardTitleRow}>
          <span className={css.basis}>{t('card.objection', { id })}</span>
          <span className={css.basisName}>{objection.ground}</span>
          <IconChevronRightOutlineRegular size={14} className={css.chevron} />
        </span>
        <span className={css.summary}>{objection.title}</span>
      </Button>
      <div className={css.cardBody}>
        <div>
          <p className={css.fieldLabel}>{t('card.claims')}</p>
          <div className={css.claims}>
            <Tag tone="neutral">{objection.claims.length === 0 ? t('card.noClaims') : t('card.claimList', { numbers: objection.claims.join(', ') })}</Tag>
          </div>
        </div>
        <div>
          <p className={css.fieldLabel}>{t('card.cited')}</p>
          {objection.citations.length === 0
            ? <p className={css.muted}>{t('card.noCitations')}</p>
            : (
              <ul className={css.passages}>
                {objection.citations.map((citation, index) => (
                  <li key={`${index}-${citation.document}-${citation.passage}`} className={css.passage}>
                    <span className={css.passageRef} title={citation.document}>{citation.document} {citation.passage}</span>
                    <AnalysisText className={css.passageText} text={citation.says} t={t} />
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
      <div className={css.cardFooter}>
        <span className={css.control}>
          {t('card.state')}
          <StatePicker label={t('card.stateLabel', { id, state: t(`state.${review.state}`) })} state={review.state} onChange={(state) => { onReview({ state }) }} t={t} />
        </span>
        <span className={css.control}>
          {t('card.owner')}
          <OwnerField label={t('card.ownerLabel', { id })} owner={review.owner} onChange={(owner) => { onReview({ owner }) }} t={t} />
        </span>
        <span className={css.noteControl}>
          {t('card.note')}
          <NoteField label={t('card.noteLabel', { id })} note={review.note} onChange={(note) => { onReview({ note }) }} t={t} />
        </span>
      </div>
    </li>
  )
}
