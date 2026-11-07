/**
 * The account button at the sidebar foot (sheet 00 section 6, finding 1): the signed-in person's avatar and display
 * name. It opens the account menu: the person, Sign out (only where the deployment names a sign-out path),
 * and one line that says what happens after Sign out. Sign out leaves the app for the firm proxy's path, which ends
 * the FlowLeap session.
 */

import { useState } from 'react'
import {
  Avatar, IconChevronsUpDownOutlineRegular, IconRightUpOutlineRegular, Menu, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Me } from './api.ts'
import { shownData, type Load } from './load.ts'
import type { NS } from './locales.ts'
import { avatarOf, personName } from './words.ts'
import css from './Account.module.css'

/** Injected share of the account button. */
export interface AccountInjected {
  readonly hooks: {
    /** The signed-in person. */
    readonly me: ObservableSnapshot<Load<Me>>
  }
  /** Where Sign out goes, or null when the deployment has no sign-in. */
  readonly signOutHref: string | null
  /** Leave the app for an address, as Sign out does. */
  readonly leave: (href: string) => void
}

/** Props of the account button. */
export type AccountProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & InjectFace<AccountInjected>

/**
 * Render the account button and its menu; nothing until the person is known.
 * @param props - the sidebar width, the person and Sign out.
 * @returns the button.
 */
export function AccountButton(props: AccountProps) {
  const { t, wide, useMe } = props
  const me = useMe(load => shownData(load)?.data ?? null)
  const [open, setOpen] = useState(false)
  if (me === null) return null
  const person = avatarOf(t, me.person)
  const name = personName(t, me.person)
  const role = me.role === null ? null : t(`account.role.${me.role}`)
  const items: MenuEntry[] = [
    { type: 'label', id: 'who', text: name },
    ...(role === null ? [] : [{ type: 'label' as const, id: 'role', text: role }]),
    { type: 'separator', id: 'sep' },
    ...(props.signOutHref === null ? [] : [{ id: 'sign-out', label: t('account.signOut'), icon: <IconRightUpOutlineRegular size={16} /> }]),
  ]
  return (
    <Menu
      open={open}
      side="top"
      align="start"
      portal
      items={items}
      footer={props.signOutHref === null ? [] : [{ type: 'label', id: 'after', text: t('account.after') }]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        setOpen(false)
        if (id === 'sign-out' && props.signOutHref !== null) props.leave(props.signOutHref)
      }}
      anchor={(
        <button
          type="button"
          className={css.account}
          data-open={open || undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('account.label', { person: name })}
          onClick={() => { setOpen(!open) }}
        >
          <Avatar person={person} size={24} />
          {wide && (
            <span className={css.who}>
              <span className={css.name}>{name}</span>
              {role !== null && <span className={css.role}>{role}</span>}
            </span>
          )}
          {wide && <IconChevronsUpDownOutlineRegular size={16} />}
        </button>
      )}
    />
  )
}
