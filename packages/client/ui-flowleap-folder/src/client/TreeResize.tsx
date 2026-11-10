/**
 * The handle on the right edge of the folder tree, in the pattern of the app sidebar's drag handle in `ui-layout`: an
 * 8 px strip on the border, pointer capture, one width report for each animation frame, and the app sidebar's width
 * limits. The arrow keys change the width in 16 px steps when the handle has the focus.
 * @module
 */

import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import css from './Panel.module.css'

/** The narrowest tree, as the app sidebar (`SIDEBAR_MIN` of `ui-layout`). */
export const TREE_MIN = 264
/** The widest tree, as the app sidebar (`SIDEBAR_MAX` of `ui-layout`). */
export const TREE_MAX = 420
/** The tree's first width, as the app sidebar (`SIDEBAR_DEFAULT` of `ui-layout`). */
export const TREE_DEFAULT = 280
/** One arrow key press. */
const KEY_STEP = 16

/**
 * A width inside the tree's limits.
 * @param px - the wanted width.
 * @returns the width, at least `TREE_MIN` and at most `TREE_MAX`; `TREE_DEFAULT` for a value that is not a number.
 */
export function clampTreeWidth(px: number): number {
  return Number.isFinite(px) ? Math.min(Math.max(Math.round(px), TREE_MIN), TREE_MAX) : TREE_DEFAULT
}

/** The handle's props. */
export interface TreeResizeProps {
  /** The tree's width now. */
  readonly width: number
  /** Set a new width; the caller keeps it inside the limits. */
  readonly onWidth: (px: number) => void
  /** The accessible name. */
  readonly label: string
}

/**
 * Render the handle.
 * @param props - the width, its setter and the accessible name.
 * @returns the handle.
 */
export function TreeResize({ width, onWidth, label }: TreeResizeProps) {
  const base = useRef(width)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const capture = useRef<{ readonly element: HTMLDivElement; readonly id: number } | null>(null)
  const report = useRef(onWidth)
  report.current = onWidth

  const end = useCallback(() => {
    const active = capture.current
    if (active === null) return
    capture.current = null
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id)
  }, [])
  useEffect(() => end, [end])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || capture.current !== null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    capture.current = { element: event.currentTarget, id: event.pointerId }
    base.current = width
    origin.current = event.clientX
    latest.current = event.clientX
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== event.pointerId) return
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      report.current(base.current + latest.current - origin.current)
    })
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== event.pointerId) return
    report.current(base.current + event.clientX - origin.current)
    end()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onWidth(width + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP))
  }
  return (
    <div
      className={css.resize}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={TREE_MIN}
      aria-valuemax={TREE_MAX}
      aria-valuenow={width}
      tabIndex={0}
      style={{ left: width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={onKeyDown}
    />
  )
}
