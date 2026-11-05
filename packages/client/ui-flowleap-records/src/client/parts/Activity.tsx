/**
 * The Activity timeline: one line per event with a 24px icon column joined by a 0.5px line. A person's act shows
 * the person's avatar and name in the primary colour; a system event shows a UI glyph on a system avatar and the
 * actor in the secondary colour. The icon is never a status shape: the text says what happened. A comment box can
 * close the list, and Audit, the only place for record positions and event types, is a disclosure below it.
 */

import type { ReactNode } from 'react'
import { Avatar, type AvatarPerson } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Activity.module.css'

/** Who did the event. */
export type ActivityActor =
  | { readonly kind: 'person'; readonly person: AvatarPerson }
  | { readonly kind: 'system'; readonly name: string; readonly icon: ReactNode }

/** One worded event. */
export interface ActivityLine {
  /** Stable identity of the event, such as its record position. */
  readonly key: string
  readonly actor: ActivityActor
  /** What happened, after the actor's name, such as "filed the EPO letter of 30 Oct 2026 on this matter". */
  readonly text: string
  /** The time, such as "14:16". */
  readonly time: string
}

/** One Audit row: the record position, the event type and the time, verbatim. */
export interface AuditRow {
  readonly key: string
  readonly cells: readonly string[]
}

/**
 * Render the Activity timeline.
 * @param props.heading - "Activity".
 * @param props.lines - the worded events, oldest first.
 * @param props.comment - the comment box that closes the list.
 * @param props.audit - the Audit disclosure: its label and rows.
 * @returns the timeline.
 */
export function ActivityTimeline({ heading, lines, comment, audit }: {
  heading: string
  lines: readonly ActivityLine[]
  comment?: ReactNode
  audit: { readonly label: string; readonly rows: readonly AuditRow[] }
}) {
  return (
    <section className={css.activity}>
      <h2 className={css.heading}>{heading}</h2>
      <ol className={css.events}>
        {lines.map(line => (
          <li key={line.key} className={css.event} data-person={line.actor.kind === 'person' || undefined}>
            <span className={css.icon}>
              {line.actor.kind === 'person'
                ? <Avatar person={line.actor.person} size={24} nameShown />
                : <span className={css.system} data-fdl-part="av">{line.actor.icon}</span>}
            </span>
            <span className={css.text}>
              <b className={css.actor}>{line.actor.kind === 'person' ? line.actor.person.name : line.actor.name}</b>
              {` ${line.text}`}
              <time className={css.time}>{line.time}</time>
            </span>
          </li>
        ))}
      </ol>
      {comment}
      <details className={css.audit} data-audit="">
        <summary className={css.summary}>{audit.label}</summary>
        <table className={css.auditTable}>
          <tbody>
            {audit.rows.map(row => (
              <tr key={row.key}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
