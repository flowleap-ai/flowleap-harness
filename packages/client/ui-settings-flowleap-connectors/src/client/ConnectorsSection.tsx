/** The Connectors settings section: the MyEPO card of the firm's EPO account, then one card per patent data connector. */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { ConnectorCard } from './ConnectorCard.tsx'
import { CONNECTOR_IDS, type ConnectorsState, type ConnectorsStore } from './connectors-store.ts'
import { MyEpoCard } from './MyEpoCard.tsx'
import type { MyEpoState, MyEpoStore } from './myepo-store.ts'
import css from './ConnectorsSection.module.css'

/** What the section asks of the page controller. */
export type ConnectorsSectionController = Pick<ConnectorsStore, 'load' | 'edit' | 'save' | 'remove' | 'test'>

/** What the section asks of the MyEPO card controller. */
export type MyEpoSectionController = Pick<MyEpoStore, 'load' | 'edit' | 'link' | 'test' | 'unlink' | 'replace'>

/** Registration-side dependencies of {@link ConnectorsSection}. */
export interface ConnectorsSectionInjected {
  hooks: {
    /** The page state. */
    connectors: SnapshotStore<ConnectorsState>
    /** The MyEPO card state. */
    myEpo: SnapshotStore<MyEpoState>
  }
  /** The page controller. */
  controller: ConnectorsSectionController
  /** The MyEPO card controller. */
  myEpoController: MyEpoSectionController
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
  const { controller, myEpoController, useConnectors, useMyEpo, t } = props
  const state = useConnectors(snapshot => snapshot)
  const myEpo = useMyEpo(snapshot => snapshot)
  useEffect(() => { void controller.load() }, [controller])
  useEffect(() => { void myEpoController.load() }, [myEpoController])
  return (
    <section className={css.section} aria-labelledby="flowleap-connectors-title">
      <h2 id="flowleap-connectors-title" className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {state.status === 'error' ? <p className={css.notice} role="alert">{t('loadFailed')}</p> : null}
      <h3 className={css.group}>{t('groupFirmAccount')}</h3>
      <MyEpoCard
        state={myEpo}
        t={t}
        edit={(field, text) => { myEpoController.edit(field, text) }}
        link={() => { void myEpoController.link() }}
        test={() => { void myEpoController.test() }}
        unlink={() => { void myEpoController.unlink() }}
        replace={(replacing) => { myEpoController.replace(replacing) }}
      />
      <h3 className={css.group}>{t('groupPatentData')}</h3>
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
