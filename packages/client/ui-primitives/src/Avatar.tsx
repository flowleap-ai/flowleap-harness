/**
 * People avatars of the IPMS design language: a round avatar with the initial of the given name, or a neutral glyph
 * for a person with no display name to show, and a stack of them for a team. A person shows by display name only,
 * never by an account handle; the render site passes the display name and decides whether the name also shows as text
 * beside the avatar.
 */

import clsx from 'clsx'
import { IconUserOutlineRegular } from './icons/index.tsx'
import { Tooltip } from './Tooltip.tsx'
import css from './Avatar.module.css'

/** Avatar edge in px: 20 in list rows and cards, 24 in headers, the properties panel and the decision bar. */
export type AvatarSize = 20 | 24

/** One person in an avatar or a stack. */
export interface AvatarPerson {
  /** The display name, such as `Dr. Anna Becker`. */
  readonly name: string
  /** Whether the person is present now; draws the presence dot. */
  readonly present?: boolean | undefined
  /** Accessible name and hover text, such as `Jonas Weber, viewing now`; the display name when absent. */
  readonly label?: string | undefined
  /**
   * The person has no display name to show, such as a person outside a matter's wall: the avatar draws a neutral
   * person glyph instead of the initial of `name`, which is then a description such as `Unnamed person`.
   */
  readonly anonymous?: boolean | undefined
}

/**
 * The initial of the given name: the first letter of the first word that is not a title such as `Dr.` or `Prof.`.
 * @param name - the display name.
 * @returns one upper-case character, or an empty string for an empty name.
 */
export function avatarInitial(name: string): string {
  const words = name.trim().split(/\s+/u).filter(word => word !== '')
  const given = words.find(word => !word.endsWith('.')) ?? words[0] ?? ''
  return (Array.from(given)[0] ?? '').toLocaleUpperCase()
}

/**
 * Render one avatar.
 * @param props.person - the display name, the presence and the optional accessible name.
 * @param props.size - 20 (default) or 24.
 * @param props.nameShown - the display name shows as text beside the avatar, so the avatar is decorative and has
 * no hover text; otherwise the avatar is an image named by the person that shows the name on hover.
 * @param props.className - extra class for layout placement.
 * @returns the avatar element.
 */
export function Avatar({ person, size = 20, nameShown = false, className }: {
  person: AvatarPerson
  size?: AvatarSize
  nameShown?: boolean
  className?: string | undefined
}) {
  const label = person.label ?? person.name
  const avatar = (
    <span
      className={clsx(css.avatar, className)}
      data-size={size}
      data-present={person.present === true || undefined}
      data-anonymous={person.anonymous === true || undefined}
      role={nameShown ? undefined : 'img'}
      aria-label={nameShown ? undefined : label}
      aria-hidden={nameShown || undefined}
    >{person.anonymous === true ? <IconUserOutlineRegular size={12} /> : avatarInitial(person.name)}</span>
  )
  return nameShown ? avatar : <Tooltip label={label} side="top">{avatar}</Tooltip>
}

/**
 * Render a team as overlapping avatars, each named by its person and showing the name on hover.
 * @param props.people - the team in display order.
 * @param props.size - 20 (default) or 24.
 * @param props.className - extra class for layout placement.
 * @returns the stack element; null for an empty team.
 */
export function AvatarStack({ people, size = 20, className }: {
  people: readonly AvatarPerson[]
  size?: AvatarSize
  className?: string | undefined
}) {
  if (people.length === 0) return null
  return (
    <span className={clsx(css.stack, className)}>
      {people.map((person, index) => <Avatar key={`${index}:${person.name}`} person={person} size={size} />)}
    </span>
  )
}
