/**
 * The six status shapes of the IPMS design language: the shape carries the meaning and the role colour repeats it.
 * `StateDot` draws a shape as a 14 px icon and `Tag` draws it in the status pill; neither renders the state word,
 * so the render site always puts the word beside the icon.
 */

import clsx from 'clsx'
import css from './StatusShape.module.css'

/**
 * Status shape: `wait` waits for a person, `ok` is done, `run` is working, `bad` is refused or rejected, `stale` is
 * stale or disputed, `idle` needs no action.
 */
export type StatusShape = 'wait' | 'ok' | 'run' | 'bad' | 'stale' | 'idle'

/** Every status shape, in the order of the status map. */
export const STATUS_SHAPES: readonly StatusShape[] = ['wait', 'ok', 'run', 'bad', 'stale', 'idle']

/**
 * Draw the paths of one shape in a 16-unit box. Fill and stroke ride `currentColor`; the cut-out marks of `ok`, `bad`
 * and `stale` take the surface colour from the `cut` class.
 * @param shape - the status shape.
 * @returns the SVG children of the shape.
 */
function paths(shape: StatusShape) {
  switch (shape) {
    case 'wait':
      return (
        <>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.2 1.6" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </>
      )
    case 'ok':
      return (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path className={css.cut} d="M5.2 8.2 7.2 10.1 10.9 6" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'run':
      return (
        <>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.4A3.6 3.6 0 0 1 11.6 8H8z" fill="currentColor" />
          <path d="M8 8h3.6A3.6 3.6 0 0 1 8 11.6z" fill="currentColor" />
        </>
      )
    case 'bad':
      return (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path className={css.cut} d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" fill="none" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )
    case 'stale':
      return (
        <>
          <path d="M8 2.2 14.3 13.3H1.7z" fill="currentColor" />
          <path className={css.cut} d="M8 6.5v3M8 11.3v.1" fill="none" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )
    case 'idle':
      return (
        <>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.5 8h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )
  }
}

/**
 * Render one status shape as a decorative icon.
 * @param props.shape - which of the six shapes to draw.
 * @param props.size - edge in px; 14 by default.
 * @param props.className - extra class for layout placement.
 * @returns the `aria-hidden` icon; the render site owns the state word.
 */
export function StatusShapeIcon({ shape, size = 14, className }: {
  shape: StatusShape
  size?: number | undefined
  className?: string | undefined
}) {
  return (
    <svg
      className={clsx(css.glyph, className)}
      data-shape={shape}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >{paths(shape)}</svg>
  )
}
