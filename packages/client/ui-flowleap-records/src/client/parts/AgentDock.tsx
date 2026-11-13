/**
 * The docked agent panel (components.md): a 376px column at the right of the work page with a 44px header (the agent's
 * name, its model, minimise, expand and close) and the run's conversation, or its empty state with the run summary and
 * the composer that starts a new chat. Minimised,
 * the panel stays mounted and hidden, so the conversation keeps its place and its draft; closed, it is not rendered.
 * Full, it fills the work area; at 390px only the full panel shows. The keys of the work page do not act while
 * focus is in the panel, so a key typed in the conversation never records a decision.
 */

import { useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconAgentPresetOutlineRegular, IconCloseOutlineRegular, IconFullscreenOutlineRegular, IconPanelLeftOutlineRegular,
  IconSendOutlineRegular, Input, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { KEYS_ELSEWHERE } from '../key-layer.ts'
import css from './AgentDock.module.css'
import summary from './AgentSummary.module.css'

/** Where the agent panel is: the right column, the whole work area, hidden but mounted, or closed. */
export type DockView = 'docked' | 'full' | 'minimised' | 'closed'

/** The labels of the panel's header controls. */
export interface AgentDockLabels {
  readonly minimise: string
  readonly expand: string
  readonly collapse: string
  readonly close: string
}

/**
 * Give the focus back to the panel's view when a header control hides the panel.
 * @param event - the click on the control.
 */
function keepFocus(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest<HTMLElement>('[data-shortcut-scope]')?.focus()
}

/**
 * Render the agent panel.
 * @param props.view - where the panel is.
 * @param props.name - the agent's name.
 * @param props.model - the run's model, or null when the record names none.
 * @param props.labels - the header controls' labels.
 * @param props.onView - move the panel.
 * @param props.children - the conversation, or the panel's empty state.
 * @returns the panel, or nothing when it is closed.
 */
export function AgentDock({ view, name, model, labels, onView, children }: {
  view: DockView
  name: string
  model: string | null
  labels: AgentDockLabels
  onView: (view: DockView) => void
  children: ReactNode
}) {
  if (view === 'closed') return null
  const full = view === 'full'
  const control = (label: string, icon: ReactNode, next: DockView, extra: { pressed?: boolean } = {}) => (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={label}
        aria-pressed={extra.pressed}
        data-dock-act={next}
        onClick={(event) => {
          if (next === 'minimised' || next === 'closed') keepFocus(event)
          onView(next)
        }}
      >
        {icon}
      </Button>
    </Tooltip>
  )
  return (
    <aside className={css.dock} data-fdl-part="dock" data-view={view} aria-label={name} hidden={view === 'minimised'} {...{ [KEYS_ELSEWHERE]: '' }}>
      <header className={css.head}>
        <span className={css.icon}><IconAgentPresetOutlineRegular size={16} /></span>
        <span className={css.name}>{name}</span>
        {model !== null && <span className={css.model}>{`· ${model}`}</span>}
        <span className={css.controls}>
          {control(labels.minimise, <IconPanelLeftOutlineRegular size={16} />, 'minimised')}
          <span className={css.expand}>
            {control(full ? labels.collapse : labels.expand, <IconFullscreenOutlineRegular size={16} />, full ? 'docked' : 'full', { pressed: full })}
          </span>
          {control(labels.close, <IconCloseOutlineRegular size={16} />, 'closed')}
        </span>
      </header>
      <div className={css.body}>{children}</div>
    </aside>
  )
}

/** The proposals of a run as file rows, with the list's accessible name. */
export interface AgentResults {
  readonly label: string
  readonly items: readonly ReactNode[]
}

/**
 * Render the panel's empty state when it has no conversation (R18): a 48px tile with a UI icon (or the run's working
 * or refused shape), the run's state as the heading, one sentence on where the conversation is, then the run's facts
 * and its proposals.
 * @param props.notice - a notice above the state, such as a failed read of the conversation; null for none.
 * @param props.icon - the tile's icon.
 * @param props.title - the run's state, such as "The patent agent finished this letter".
 * @param props.body - one sentence on where the conversation is.
 * @param props.facts - the run's facts on one line, such as "Finished 14:12 · 7 steps"; empty for none.
 * @param props.results - the run's proposals, or null when it proposed nothing.
 * @returns the state.
 */
export function AgentEmpty({ notice, icon, title, body, facts, results }: {
  notice: ReactNode
  icon: ReactNode
  title: string
  body: string
  facts: string
  results: AgentResults | null
}) {
  return (
    <div className={css.empty}>
      {notice}
      <div className={summary.tile} aria-hidden="true">{icon}</div>
      <h2 className={summary.emptyTitle}>{title}</h2>
      <p className={summary.emptyBody}>{body}</p>
      {facts !== '' && <p className={summary.facts}>{facts}</p>}
      {results !== null && <ul className={summary.results} aria-label={results.label}>{results.items}</ul>}
    </div>
  )
}

/**
 * Render one proposal of a run as a file row: its icon, the work product and its status, and the file name under them.
 * @param props.icon - a 16px UI icon.
 * @param props.title - the work product, such as "Client report".
 * @param props.file - the file name, in the secondary line across the row; it is never cut.
 * @param props.status - the proposal's status with its word.
 * @returns the row.
 */
export function AgentResult({ icon, title, file, status }: { icon: ReactNode; title: string; file: string; status: ReactNode }) {
  return (
    <li className={summary.result}>
      <span className={summary.resultIcon}>{icon}</span>
      <span className={summary.resultText}>
        <span className={summary.resultTitle}>{title}</span>
        <span className={summary.resultFile}>{file}</span>
      </span>
      {status}
    </li>
  )
}

/** The copy of the composer. */
export interface AskLabels {
  /** The field's accessible name, "Ask about this letter". */
  readonly field: string
  readonly placeholder: string
  /** The send button's accessible name, "Ask in a new chat". */
  readonly send: string
}

/**
 * Render the composer of a panel with no conversation: a question field and the send button. Sending opens a new
 * chat about this letter and sends the question in it; an empty question sends nothing.
 * @param props.labels - the composer's copy.
 * @param props.onAsk - start the new chat with the trimmed question.
 * @returns the composer.
 */
export function AskComposer({ labels, onAsk }: { labels: AskLabels; onAsk: (question: string) => void }) {
  const [question, setQuestion] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (text === '') return
    onAsk(text)
    setQuestion('')
  }
  return (
    <form className={summary.composer} onSubmit={submit}>
      <Input
        className={clsx(summary.composerField)}
        aria-label={labels.field}
        placeholder={labels.placeholder}
        value={question}
        onChange={(event) => { setQuestion(event.target.value) }}
      />
      <Tooltip label={labels.send} side="top" delayMs={500}>
        <Button variant="outline" size="sm" type="submit" aria-label={labels.send} disabled={question.trim() === ''}>
          <IconSendOutlineRegular size={16} />
        </Button>
      </Tooltip>
    </form>
  )
}
