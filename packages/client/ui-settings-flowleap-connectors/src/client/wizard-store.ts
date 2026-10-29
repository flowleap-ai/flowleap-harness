/**
 * First-run wizard dismissal derived from this row's settings scope: the
 * wizard follows the Host section and records "saved or skipped once" through
 * it, so it never reappears on any browser sharing the same home.
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { WIZARD_DISMISSED_FIELD } from '../wizard-settings.ts'

/** State rendered by the wizard step. */
export interface WizardState {
  /** `error` when the scope is unavailable or a dismissal did not persist. */
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error'
  /** Whether the wizard was saved or skipped once. */
  dismissed: boolean
  /** Why the state is `error`, for the log; the wizard shows no error copy of its own. */
  error: string | null
}

/** The wizard section as the step reads it. */
export type WizardSection = Record<string, unknown>

/**
 * Accept any object section verbatim; a malformed durable value reads as an
 * empty section, so the wizard treats it as not dismissed.
 * @param section - the wire section value.
 * @returns the section object, or an empty one for non-object values.
 */
export function decodeWizardSection(section: unknown): WizardSection {
  return typeof section === 'object' && section !== null && !Array.isArray(section)
    ? section as WizardSection
    : {}
}

/* v8 ignore next 3 -- closed-union default only defends future source widening */
function assertNever(_value: never): never {
  throw new Error('unexpected wizard settings status')
}

/** Coordinates the durable Host dismissal. */
export class WizardStore {
  /** uSES-safe state source shared by the registered wizard step. */
  readonly store: SnapshotStore<WizardState> = createSnapshotStore<WizardState>({
    status: 'idle', dismissed: false, error: null,
  })

  private saving = false
  private following: (() => void) | undefined

  constructor(private readonly scope: ConfigForm<WizardSection>) {}

  /**
   * Begin following the bound scope (idempotent) and publish its current answer.
   * @returns settlement after the current answer is published.
   */
  load(): Promise<void> {
    this.following ??= this.scope.subscribe(() => { this.derive() })
    this.derive()
    return Promise.resolve()
  }

  /**
   * Persist the dismissal through the scope. Success is judged against the
   * state the write left behind.
   * @returns true when the Host holds the dismissal.
   */
  async dismiss(): Promise<boolean> {
    this.saving = true
    this.store.update((state) => { state.status = 'saving'; state.error = null })
    try {
      await this.scope.set(WIZARD_DISMISSED_FIELD, true)
    } finally {
      this.saving = false
    }
    this.derive()
    const { dismissed } = this.store.getSnapshot()
    if (!dismissed) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = 'the wizard dismissal did not persist'
      })
    }
    return dismissed
  }

  /* jscpd:ignore-start -- mirrors the package-private copy in dsh-client-ui-settings-models;
     a shared export would change that upstream package on each sync */
  /** Stop following the scope. */
  dispose(): void {
    this.following?.()
    this.following = undefined
  }

  private derive(): void {
    if (this.saving) return
    const scope = this.scope.getSnapshot()
    switch (scope.status) {
      case 'loading':
        this.store.update((state) => { state.status = 'loading'; state.error = null })
        return
      case 'unavailable':
        this.store.update((state) => {
          state.status = 'error'
          state.dismissed = false
          state.error = 'wizard settings are unavailable'
        })
        return
        /* jscpd:ignore-end */
      case 'ready': {
        const dismissed = decodeWizardSection(scope.value)[WIZARD_DISMISSED_FIELD] === true
        this.store.update((state) => {
          state.status = 'ready'
          state.dismissed = dismissed
          state.error = null
        })
        return
      }
      /* v8 ignore next -- every current settings scope status is handled above */
      default: return assertNever(scope.status)
    }
  }
}
