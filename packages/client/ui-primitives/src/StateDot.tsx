import clsx from 'clsx'
import css from './StateDot.module.css'
import { IconCheckOutlineRegular } from './icons/index.tsx'
import { StatusShapeIcon, type StatusShape } from './StatusShape.tsx'

/**
 * State semantic: green done / amber user-attention / tertiary-grey loading /
 * red error / neutral-grey idle for a tracked subject with nothing in progress.
 */
export type StateDotState = 'done' | 'warning' | 'ongoing' | 'error' | 'idle'

/**
 * Pin the loader's CSS animations to document time zero. A CSS animation starts
 * when its element is inserted and restarts when the element is moved or shown
 * again, so loaders started at different moments rotate out of phase; one shared
 * start time keeps every visible loader in step. Mount pins the first start; the
 * element's own `animationstart` listener pins each restart.
 * @param element - the mounted loader, or null on unmount.
 */
function syncSpinner(element: SVGSVGElement | null): void {
  if (element === null) return
  pinSpinner(element)
  element.addEventListener('animationstart', () => { pinSpinner(element) })
}

/**
 * Set every CSS animation in the loader's subtree to start at document time zero.
 * @param element - the mounted loader.
 */
function pinSpinner(element: SVGSVGElement): void {
  // jsdom (the unit lane) implements no Web Animations despite lib.dom's
  // non-optional typing; the optional call leaves that lane unsynced.
  const spinner = element as { getAnimations?: SVGSVGElement['getAnimations'] }
  for (const animation of spinner.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0
}

/** Props of the colour dot: one of the five states, drawn as a dot, a loader or a step. */
interface StateDotStateProps {
  state: StateDotState
  shape?: undefined
  size?: number | undefined
  className?: string | undefined
  appearance?: 'dot' | 'step'
}

/** Props of the status icon: one of the six status shapes. */
interface StateDotShapeProps {
  shape: StatusShape
  state?: undefined
  size?: number | undefined
  className?: string | undefined
  appearance?: undefined
}

/**
 * Render a state dot, or a status icon when `shape` is set.
 * @param props.state - which of `done`, `warning`, `ongoing`, `error`, or `idle` to show.
 * @param props.shape - instead of `state`, one of the six status shapes, drawn as a 14px icon in its role colour.
 * @param props.size - outer diameter in px; defaults to 14 for ongoing and a shape, and 10 for solid states.
 * @param props.className - extra class for layout placement.
 * @param props.appearance - compact dot by default; step uses a filled check or hollow pending circle.
 * @returns the dot element (aria-hidden; pair with text for accessibility).
 */
export function StateDot(props: StateDotStateProps | StateDotShapeProps) {
  if (props.shape !== undefined) return <StatusShapeIcon shape={props.shape} size={props.size} className={props.className} />
  const { state, size, className, appearance = 'dot' } = props
  const edge = size ?? (state === 'ongoing' ? 14 : 10)
  if (state === 'ongoing') {
    return (
      <svg
        ref={syncSpinner}
        className={clsx(css.spinner, className)}
        data-state="ongoing"
        width={edge}
        height={edge}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <g className={css.spinnerMotion}>
          <circle className={css.spinnerTrack} cx="12" cy="12" r="9.5" />
          <circle className={css.spinnerArc} cx="12" cy="12" r="9.5" />
        </g>
      </svg>
    )
  }
  return (
    <span
      className={clsx(appearance === 'step' ? css.step : css.dot, className)}
      data-state={state}
      style={{ width: edge, height: edge }}
      aria-hidden="true"
    >{appearance === 'step' && state === 'done' && <IconCheckOutlineRegular size={edge - 2} />}</span>
  )
}
