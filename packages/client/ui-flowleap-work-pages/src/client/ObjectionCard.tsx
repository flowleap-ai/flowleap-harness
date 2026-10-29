/** One objection card of the board: the legal basis, the claims hit, the cited passages, the review state, and the owner. */

import { useState } from 'react'
import {
  Button, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, Input, Menu, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { objectionState, REVIEW_STATES, type AttorneyFields, type CitedDocument, type CitationLabel, type Objection, type ObjectionState } from './board.ts'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

type T = TranslateNS<typeof NS>

/**
 * Localized label of a legal basis, for example `Art. 54 EPC`.
 * @param t - copy.
 * @param objection - the objection.
 * @returns the label.
 */
export function basisLabel(t: T, objection: Objection): string {
  return t(`basis.${objection.basis}`)
}

/**
 * Render the colored dot of a review state.
 * @param props.state - the state.
 * @returns the decorative dot.
 */
export function StateMark({ state }: { state: ObjectionState }) {
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
  state: ObjectionState
  onChange: (state: ObjectionState) => void
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
        onChange(objectionState(id))
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
 * Render the owner field. The value is committed on blur and on Enter.
 * @param props.label - accessible name of the field.
 * @param props.owner - the current owner.
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
  const [draft, setDraft] = useState(owner)
  const commit = () => { if (draft.trim() !== owner) onChange(draft.trim()) }
  return (
    <Input
      className={css.owner as string}
      aria-label={label}
      placeholder={t('card.ownerPlaceholder')}
      value={draft}
      onChange={(event) => { setDraft(event.currentTarget.value) }}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
    />
  )
}

/** Props of one objection card. */
export interface ObjectionCardProps {
  readonly objection: Objection
  readonly fields: AttorneyFields
  readonly documents: Readonly<Record<CitationLabel, CitedDocument>>
  readonly selected: boolean
  readonly onOpen: () => void
  readonly onState: (state: ObjectionState) => void
  readonly onOwner: (owner: string) => void
  readonly t: T
}

/**
 * Render one objection card.
 * @param props - the objection, its attorney fields, the cited documents, the actions, and copy.
 * @returns the card.
 */
export function ObjectionCard({ objection, fields, documents, selected, onOpen, onState, onOwner, t }: ObjectionCardProps) {
  const basis = basisLabel(t, objection)
  return (
    <li className={css.card} data-selected={selected ? '' : undefined} data-objection={objection.id}>
      <Button className={css.cardOpen} aria-label={t('card.open', { basis })} aria-pressed={selected} onClick={onOpen}>
        <span className={css.cardTitleRow}>
          <span className={css.basis}>{basis}</span>
          <span className={css.basisName}>{t(`basis.${objection.basis}.name`)}</span>
          <IconChevronRightOutlineRegular size={14} className={css.chevron} />
        </span>
        <span className={css.summary}>{objection.summary}</span>
      </Button>
      <div className={css.cardBody}>
        <div>
          <p className={css.fieldLabel}>{t('card.claims')}</p>
          <div className={css.claims}>
            <Tag tone="neutral">{t('card.claimList', { numbers: objection.claims.join(', ') })}</Tag>
          </div>
        </div>
        <div>
          <p className={css.fieldLabel}>{t('card.cited')}</p>
          {objection.citations.length === 0
            ? <p className={css.muted}>{t('card.noCitations')}</p>
            : (
              <ul className={css.passages}>
                {objection.citations.map(citation => (
                  <li key={`${citation.label}-${citation.location}`} className={css.passage}>
                    <span className={css.passageRef} title={documents[citation.label].number}>{citation.label} {citation.location}</span>
                    <span className={css.passageText}>{citation.text}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
      <div className={css.cardFooter}>
        <span className={css.control}>
          {t('card.state')}
          <StatePicker label={t('card.stateLabel', { basis, state: t(`state.${fields.state}`) })} state={fields.state} onChange={onState} t={t} />
        </span>
        <span className={css.control}>
          {t('card.owner')}
          <OwnerField key={fields.owner} label={t('card.ownerLabel', { basis })} owner={fields.owner} onChange={onOwner} t={t} />
        </span>
      </div>
    </li>
  )
}
