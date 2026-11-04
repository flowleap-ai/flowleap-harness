// Tag: read-only capsule badge. The selectable capsule button is `Pill` —
// a tag takes no `onClick` and no `active`, and carries no copy of its own.

import type { ReactNode } from 'react'
import clsx from 'clsx'
import css from './Tag.module.css'
import shapes from './StatusShape.module.css'
import { StatusShapeIcon, type StatusShape } from './StatusShape.tsx'

/** Palette selector; each tone names one shipped appearance. */
export type TagTone =
  /** Hairline outline on tertiary text: the read-only default. */
  | 'outline'
  /** Inverted fill: one tag per group that names the current selection. */
  | 'solid'
  /** Platform-gray fill: a neutral fact with no status meaning. */
  | 'neutral'
  /** Text only, no fill: a fact stated more quietly than `neutral`. */
  | 'quiet'
  /** Tinted green: a healthy or enabled state. */
  | 'success'
  /** Tinted blue: informational classification, not health. */
  | 'info'
  /** Tinted amber: attention needed, not yet a failure. */
  | 'warning'
  /** Tinted red: a failure. */
  | 'danger'

/** Props of a toned tag. */
interface TagToneProps {
  tone?: TagTone
  shape?: undefined
  // `| undefined` so a caller can forward an optional class straight through
  // under exactOptionalPropertyTypes (a CSS-module lookup is string|undefined).
  className?: string | undefined
  children?: ReactNode
}

/** Props of a status pill. */
interface TagShapeProps {
  shape: StatusShape
  tone?: undefined
  className?: string | undefined
  children: ReactNode
}

/**
 * Render a read-only tag, or the status pill when `shape` is set.
 * @param props.tone - which palette to use (default `outline`).
 * @param props.shape - instead of `tone`, a status shape: a 24px capsule on the shape's status tint with the shape's
 * icon before the children; the children are the state word and stay in the primary label colour.
 * @param props.className - extra class for layout placement.
 * @param props.children - the localized label, owned by the render site.
 * @returns the tag element.
 */
export function Tag(props: TagToneProps | TagShapeProps) {
  if (props.shape !== undefined) {
    return (
      <span className={clsx(shapes.pill, props.className)} data-shape={props.shape}>
        <StatusShapeIcon shape={props.shape} />{props.children}
      </span>
    )
  }
  const { tone = 'outline', className, children } = props
  return <span className={clsx(css.tag, className)} data-tone={tone}>{children}</span>
}
