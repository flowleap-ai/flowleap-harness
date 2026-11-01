/** Models-owned next step in the chat row of a Turn that failed with `MISSING_CREDENTIAL`. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { en } from './locales.ts'

/** Injected share of the managed-deployment occupant: the Models copy. */
export interface ManagedModelNoticeInjected {
  /** Translate a Models key in the active locale. */
  t: (key: keyof typeof en) => string
}

/** Injected share of the user-managed occupant: the Models copy and the way to the Models page. */
export interface SetUpModelButtonInjected extends ManagedModelNoticeInjected {
  /** Open Settings on the Models section. */
  openModels: () => void
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

/**
 * Occupant for a user who sets up models: one control that opens Settings on
 * the Models section, where the user adds a provider and its key.
 * @param props - the Models copy and the Models page opener.
 * @returns the set-up button.
 */
export function SetUpModelButton({ t, openModels }: SetUpModelButtonInjected) {
  return <Button size="sm" onClick={openModels}>{t('missingCredentialSetUp')}</Button>
}
