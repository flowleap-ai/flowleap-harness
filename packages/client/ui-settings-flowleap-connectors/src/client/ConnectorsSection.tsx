/** The Patent data connectors settings section: one card per connector over the shared store. */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ConnectorCard } from './ConnectorCard.tsx'
import { CONNECTOR_IDS, type ConnectorsState, type ConnectorsStore } from './connectors-store.ts'
import css from './ConnectorsSection.module.css'

/** What the section asks of the page controller. */
export type ConnectorsSectionController = Pick<ConnectorsStore, 'load' | 'edit' | 'save' | 'remove' | 'test'>

/** Registration-side dependencies of {@link ConnectorsSection}. */
export interface ConnectorsSectionInjected {
  hooks: {
    /** The page state. */
    connectors: SnapshotStore<ConnectorsState>
  }
  /** The page controller. */
  controller: ConnectorsSectionController
}

/** Shell owner props, the framework `t` seat, and this section's injected face. */
export type ConnectorsSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.flowleapConnectors'> & InjectFace<ConnectorsSectionInjected>

/**
 * Render the section; it re-reads presence each time it mounts.
 * @param props - shell owner state, copy, and the injected store.
 * @returns the section, or null while the shell has not injected yet.
 */
export function ConnectorsSection(props: ConnectorsSectionProps): ReactNode {
  const { controller, useConnectors, t } = props
  const state = useConnectors(snapshot => snapshot)
  useEffect(() => { void controller.load() }, [controller])
  return (
    <section className={css.section} aria-labelledby="flowleap-connectors-title">
      <h2 id="flowleap-connectors-title" className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {state.status === 'error' ? <p className={css.notice} role="alert">{t('loadFailed')}</p> : null}
      <ul className={css.rows}>
        {CONNECTOR_IDS.map(id => (
          <li key={id}>
            <ConnectorCard
              card={state.cards[id]}
              t={t}
              edit={(target, field, text) => { controller.edit(target, field, text) }}
              save={(target) => { void controller.save(target) }}
              remove={(target) => { void controller.remove(target) }}
              test={(target) => { void controller.test(target) }}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
