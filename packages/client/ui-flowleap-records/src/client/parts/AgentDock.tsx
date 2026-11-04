/**
 * The docked agent panel (components.md): a 376px column at the right of the work page with a 44px header (the agent's
 * name, its model, minimise, expand and close) and the run's conversation or one sentence of its state. Minimised,
 * the panel stays mounted and hidden, so the conversation keeps its place and its draft; closed, it is not rendered.
 * Full, it fills the work area; at 390px only the full panel shows. The keys of the work page do not act while
 * focus is in the panel, so a key typed in the conversation never records a decision.
 */

import type { MouseEvent, ReactNode } from 'react'
import {
  Button, IconAgentPresetOutlineRegular, IconCloseOutlineRegular, IconFullscreenOutlineRegular, IconPanelLeftOutlineRegular,
  StateDot, type StatusShape, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { KEYS_ELSEWHERE } from '../key-layer.ts'
import css from './AgentDock.module.css'

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
 * @param props.children - the conversation, or the panel's state.
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
    <aside className={css.dock} data-view={view} aria-label={name} hidden={view === 'minimised'} {...{ [KEYS_ELSEWHERE]: '' }}>
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

/**
 * Render the panel's state when it has no conversation to show: a status icon and one sentence.
 * @param props.shape - `idle` when nothing ran or nothing is recorded, `bad` when the conversation cannot show.
 * @param props.text - the sentence.
 * @returns the state.
 */
export function AgentDockState({ shape, text }: { shape: Extract<StatusShape, 'idle' | 'bad'>; text: string }) {
  return (
    <p className={css.state} data-dock-state={shape}>
      <StateDot shape={shape} />
      <span>{text}</span>
    </p>
  )
}
