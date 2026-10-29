/** Blocking first-run dialog chrome, the same posture as the Models onboarding steps (package-private there). */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './OnboardingModal.module.css'

const ignoreImplicitDismiss = (): void => {}

/* jscpd:ignore-start -- mirrors the package-private copy in dsh-client-ui-settings-models;
   a shared export would change that upstream package on each sync */
/**
 * Render a blocking onboarding dialog and keep the application root inert.
 * @param props.title - accessible and visible dialog title.
 * @param props.children - step-owned body and actions.
 * @returns the body-portaled modal.
 */
export function OnboardingModal({ title, children }: { title: string; children: ReactNode }): ReactNode {
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    const appRoot = document.getElementById('root')
    if (appRoot === null) return
    const previous = appRoot.inert
    appRoot.inert = true
    return () => { appRoot.inert = previous }
  }, [])

  useEffect(() => { titleRef.current?.focus() }, [])

  return (
    <Modal open title={title} onClose={ignoreImplicitDismiss} headless className={css.dialog as string}>
      <div className={css.content}>
        <h2 ref={titleRef} className={css.title} tabIndex={-1}>{title}</h2>
        <div className={css.body}>{children}</div>
      </div>
    </Modal>
  )
}
/* jscpd:ignore-end */
