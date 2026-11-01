/** Models-owned next step in the chat row of a Turn that failed with `MISSING_CREDENTIAL`. */
import type { en } from './locales.ts'

/** Injected share of the managed-deployment occupant: the Models copy. */
export interface ManagedModelNoticeInjected {
  /** Translate a Models key in the active locale. */
  t: (key: keyof typeof en) => string
}

/**
 * Occupant for a deployment that manages its model routes and keys: the user
 * cannot add a key, so the row tells them who can.
 * @param props - the Models copy.
 * @returns the ask-your-administrator text.
 */
export function ManagedModelNotice({ t }: ManagedModelNoticeInjected) {
  return <span>{t('missingCredentialManaged')}</span>
}
