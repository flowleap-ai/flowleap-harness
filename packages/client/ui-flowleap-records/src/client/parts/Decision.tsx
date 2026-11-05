/**
 * The decision bar (product rule 6, R12 to R14): an elevated panel docked at the bottom of the work column. The header
 * names the deciding person ("Your decision", or "Dr. Anna Becker decides" when it is another person's), the question
 * and why this person may decide; one row for each required part shows its
 * evidence state; the footer holds the tertiary negative act, a note, the secondary acts and the one primary act. A
 * negative act asks for its reason in its own step. Missing evidence disables the primary act and says why. When the
 * decision is another person's, the footer says who decides and has no primary act. At 390px the note hides and the
 * secondary acts move into an overflow menu, so every act stays reachable; each part keeps its title, its control and
 * its evidence state on one line, and why the person may decide keeps one line under the question.
 * The bar takes at most 40% of the view height: above that, the part rows scroll inside it, and the header, a failure
 * notice and the footer with the primary act stay in view (R13).
 */

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar, Button, IconWarningTriangleOutlineRegular, Input, Keycap, type AvatarPerson } from '@deepseek-ai/dsh-client-ui-primitives'
import { ActButton, OverflowActs, type ActSpec } from './Act.tsx'
import { Notice, type NoticeSpec } from './States.tsx'
import css from './Decision.module.css'

/** A negative act (Not relevant, Reject): tertiary, and it asks for a reason in its own step. */
export interface ReasonAct extends Omit<ActSpec, 'run'> {
  /** The step is open; the screen holds it, so the act's key can open it too. */
  readonly open: boolean
  /** Open or close the step. */
  readonly onOpenChange: (open: boolean) => void
  /** The reason field's label, such as "Why is this letter not relevant?". */
  readonly reasonLabel: string
  /** The confirm button's label, such as "Mark not relevant". */
  readonly confirmLabel: string
  readonly cancelLabel: string
  /**
   * Record the act with the reason.
   * @param reason - the trimmed reason; never empty.
   */
  readonly onConfirm: (reason: string) => void
}

/** Who decides, as the bar's header names them. */
export interface DecisionHeading {
  /** The deciding person as a 24px avatar; null when the bar does not know who decides. */
  readonly person: AvatarPerson | null
  /** "Your decision", "Dr. Anna Becker decides", or "Not your decision"; also the bar's accessible name. */
  readonly text: string
}

/** Copy of the decision bar. */
export interface DecisionLabels {
  /** The accessible name of the overflow menu button at 390px, "More acts". */
  readonly more: string
}

/**
 * Render the docked decision bar.
 * @param props.heading - who decides: the signed-in person, or the person who decides when it is not them.
 * @param props.question - the decision in plain words, such as "Which matter is this letter for?".
 * @param props.why - why this person may decide; one line at 390px, with the full text on hover.
 * @param props.parts - one `DecisionPart` for each required part.
 * @param props.note - a one-line note before the acts; hidden at 390px.
 * @param props.negative - the negative act with its reason step.
 * @param props.secondary - the secondary acts; at 390px they move into the overflow menu.
 * @param props.overflow - acts that show only in the overflow menu at 390px, because a wider screen shows them in
 * the content or in a part.
 * @param props.primary - the one primary act; null when the decision is another person's.
 * @param props.blocked - why the primary act waits (missing evidence, R14): it takes the note's place with a warning
 * icon, and the primary act is disabled.
 * @param props.decider - who decides when it is not this person, as one sentence; replaces the note and the primary.
 * @param props.failure - the failure of the decision's last act, in place above the acts: what failed, what is still
 * safe, and Try again (R18).
 * @param props.labels - the bar's own copy.
 * @returns the bar.
 */
export function DecisionBar({
  heading, question, why, parts, note, negative, secondary = [], overflow = [], primary, blocked = null, decider = null, failure, labels,
}: {
  heading: DecisionHeading
  question: string
  why?: string | undefined
  parts?: ReactNode
  note?: string | undefined
  negative?: ReasonAct | undefined
  secondary?: readonly ActSpec[]
  overflow?: readonly ActSpec[]
  primary: ActSpec | null
  blocked?: string | null
  decider?: string | null
  failure?: NoticeSpec | undefined
  labels: DecisionLabels
}) {
  const shownPrimary = decider === null ? primary : null
  const menu = [...secondary, ...overflow]
  return (
    <section className={css.bar} aria-label={heading.text}>
      <header className={css.head}>
        {heading.person !== null && <Avatar person={heading.person} size={24} nameShown />}
        <span className={css.yours}>{heading.text}</span>
        <span className={css.question}>{question}</span>
        {why !== undefined && <span className={css.why} title={why}>{why}</span>}
      </header>
      {parts !== undefined && <div className={css.parts}>{parts}</div>}
      {failure !== undefined && <div className={css.failure}><Notice notice={failure} /></div>}
      {negative?.open === true
        ? <ReasonStep act={negative} />
        : (
          <footer className={css.foot}>
            {negative !== undefined && (
              <ActButton act={{ ...negative, run: () => { negative.onOpenChange(true) } }} rank="tertiary" />
            )}
            {decider !== null && <span className={css.decider}>{decider}</span>}
            {decider === null && blocked !== null && (
              <span className={css.blocked} role="note"><IconWarningTriangleOutlineRegular size={16} />{blocked}</span>
            )}
            {decider === null && blocked === null && note !== undefined && <span className={css.note}>{note}</span>}
            <div className={css.acts}>
              {menu.length > 0 && <OverflowActs className={css.more} label={labels.more} acts={menu} />}
              {secondary.map(act => <ActButton key={act.id} act={act} rank="secondary" className={css.secondary} />)}
              {shownPrimary !== null && (
                <ActButton act={blocked === null ? shownPrimary : { ...shownPrimary, disabled: true }} rank="primary" size="md" />
              )}
            </div>
          </footer>
        )}
    </section>
  )
}

/**
 * Give an element that may be cut to one line its full text on hover.
 * @param element - the mounted element, or null on unmount.
 */
function titleFromText(element: HTMLElement | null): void {
  if (element !== null) element.title = element.textContent
}

/**
 * Render the reason step of a negative act: a field for the reason, Cancel, and the confirm button, enabled once
 * the reason has text. Esc in the field cancels.
 * @param props.act - the negative act.
 * @returns the step.
 */
function ReasonStep({ act }: { act: ReasonAct }) {
  const [reason, setReason] = useState('')
  const id = useId()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = reason.trim()
    if (text !== '') act.onConfirm(text)
  }
  return (
    <form className={css.reason} onSubmit={submit}>
      <label className={css.reasonLabel} htmlFor={id}>{act.reasonLabel}</label>
      <Input
        id={id}
        className={clsx(css.reasonField)}
        value={reason}
        autoFocus
        onChange={(event) => { setReason(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') act.onOpenChange(false)
        }}
      />
      <div className={css.acts}>
        <Button variant="ghost" size="sm" onClick={() => { act.onOpenChange(false) }}>{act.cancelLabel}</Button>
        <Button variant="outline" size="sm" type="submit" disabled={reason.trim() === ''} data-act={act.id}>
          {act.confirmLabel}
          <Keycap keycaps={act.keycaps} />
        </Button>
      </div>
    </form>
  )
}

/**
 * Render one required part of a decision: its icon, what it is, its evidence state, and its control. At 390px the
 * icon hides, the evidence state is cut to one line with the full text on hover, and the control follows the title on
 * its line when it fits; a missing evidence warning stays.
 * @param props.icon - a 16px UI icon; never a status shape.
 * @param props.title - the part, such as "FL-2026-0001 Pressure sensor housing".
 * @param props.detail - its evidence state, such as "3 reasons on page 1 agree".
 * @param props.hint - what the part still needs, such as "Choose Accept or Reject", after the evidence state; it
 * hides in a bar narrower than 800px, where the control beside it says the same.
 * @param props.missing - why the part waits for evidence; replaces the detail with a warning (R14).
 * @param props.control - the part's control, such as Accept and Reject.
 * @returns the part row.
 */
export function DecisionPart({ icon, title, detail, hint, missing = null, control }: {
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
  hint?: string | undefined
  missing?: string | null
  control?: ReactNode
}) {
  return (
    <div className={css.part} data-missing={missing !== null || undefined}>
      <span className={css.partIcon}>{icon}</span>
      <div className={css.partText}>
        <div className={css.partTitle}>{title}</div>
        {missing !== null
          ? <div className={css.partMissing}><IconWarningTriangleOutlineRegular size={16} />{missing}</div>
          : (detail !== undefined || hint !== undefined) && (
            <div className={css.partDetail} ref={(element) => { titleFromText(element) }}>
              {detail}
              {hint !== undefined && <span className={css.partHint}><span aria-hidden="true">·</span>{hint}</span>}
            </div>
          )}
      </div>
      {control !== undefined && <div className={css.partControl}>{control}</div>}
    </div>
  )
}
