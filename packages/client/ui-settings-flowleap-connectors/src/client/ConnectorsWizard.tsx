/**
 * First-run wizard: shown once, while no connector is configured and the
 * dismissal is not recorded. Save writes every completed draft and records the
 * dismissal; Test saves the drafts, then runs the Host's connection test on each
 * stored connector; Skip records the dismissal alone.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { ConnectorCard, type Translate } from './ConnectorCard.tsx'
import { CONNECTOR_IDS, type ConnectorsState, type ConnectorsStore } from './connectors-store.ts'
import { OnboardingModal } from './OnboardingModal.tsx'
import type { WizardState, WizardStore } from './wizard-store.ts'
import css from './ConnectorsWizard.module.css'

/** Registration-side dependencies of {@link ConnectorsWizard}. */
export interface ConnectorsWizardInjected {
  hooks: {
    /** The page state shared with the section. */
    connectors: SnapshotStore<ConnectorsState>
    /** The durable dismissal. */
    wizard: SnapshotStore<WizardState>
  }
  /** The page controller. */
  controller: ConnectorsStore
  /** The dismissal controller. */
  wizardController: WizardStore
  /** Package copy. */
  t: Translate
}

/** Coordinator owner props plus this step's injected face. */
export type ConnectorsWizardProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<ConnectorsWizardInjected>

/**
 * Render the wizard until a connector is configured or the user saves or skips.
 * @param props - onboarding owner state and the injected stores.
 * @returns the modal, or null while the step decides not to show.
 */
export function ConnectorsWizard(props: ConnectorsWizardProps): ReactNode {
  const { complete, controller, wizardController, useConnectors, useWizard, t, explicit = false } = props
  const connectors = useConnectors(snapshot => snapshot)
  const wizard = useWizard(snapshot => snapshot)
  const [saveFailed, setSaveFailed] = useState(false)
  const finished = useRef(false)
  const finish = useCallback((): void => {
    if (finished.current) return
    finished.current = true
    complete()
  }, [complete])

  useEffect(() => {
    if (wizard.status === 'idle') void wizardController.load()
    if (connectors.status === 'idle') void controller.load()
  }, [controller, wizardController, wizard.status, connectors.status])

  const deciding = wizard.status === 'idle' || wizard.status === 'loading'
    || connectors.status === 'idle' || connectors.status === 'loading'
  const skip = !explicit && (wizard.dismissed || connectors.anyConfigured || connectors.status === 'error')

  useEffect(() => {
    if (!deciding && skip) finish()
  }, [deciding, skip, finish])

  if (deciding || skip) return null

  const busy = CONNECTOR_IDS.some(id => connectors.cards[id].busy !== 'idle') || wizard.status === 'saving'

  const save = async (): Promise<void> => {
    setSaveFailed(false)
    if (!(await controller.saveFilled())) {
      setSaveFailed(true)
      return
    }
    await wizardController.dismiss()
    finish()
  }
  const test = async (): Promise<void> => {
    setSaveFailed(false)
    if (!(await controller.saveFilled())) setSaveFailed(true)
    await controller.testConfigured()
  }
  const skipForNow = async (): Promise<void> => {
    await wizardController.dismiss()
    finish()
  }

  return (
    <OnboardingModal title={t('wizardTitle')}>
      <p className={css.intro}>{t('wizardIntro')}</p>
      <div className={css.fields}>
        {CONNECTOR_IDS.map(id => (
          <ConnectorCard
            key={id}
            compact
            card={connectors.cards[id]}
            t={t}
            edit={(target, field, text) => { controller.edit(target, field, text) }}
          />
        ))}
      </div>
      {saveFailed ? <p className={css.error} role="alert">{t('wizardSaveFailed')}</p> : null}
      <p className={css.hint}>{t('wizardTestHint')}</p>
      <div className={css.actions}>
        <Button variant="ghost" disabled={busy} onClick={() => { void skipForNow() }}>{t('wizardSkip')}</Button>
        <span className={css.spacer} />
        <Button variant="outline" disabled={busy} onClick={() => { void test() }}>{t('wizardTest')}</Button>
        <Button variant="primary" disabled={busy} onClick={() => { void save() }}>{t('wizardSave')}</Button>
      </div>
    </OnboardingModal>
  )
}
