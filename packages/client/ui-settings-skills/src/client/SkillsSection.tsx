/** The Skills settings section: one read-only card per skill of the agent, then the files with faults. */

import { useEffect, type ReactNode } from 'react'
import { Button, PathLabel, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillInventoryRow, SkillInventoryValue, SkillOrigin } from '../types.ts'
import { faultText, originLabel, SkillCard, type Translate } from './SkillCard.tsx'
import { skillKey, type SkillsState, type SkillsStore } from './skills-store.ts'
import css from './SkillsSection.module.css'

/** What the section asks of the page controller. */
export type SkillsSectionController = Pick<SkillsStore, 'load' | 'readText'>

/** Registration-side dependencies of {@link SkillsSection}. */
export interface SkillsSectionInjected {
  hooks: {
    /** The page state. */
    skills: SnapshotStore<SkillsState>
  }
  /** The page controller. */
  controller: SkillsSectionController
}

/** Shell owner props, the framework `t` seat, and this section's injected face. */
export type SkillsSectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'settings.skills'> & InjectFace<SkillsSectionInjected>

/**
 * Origins each winner replaces, keyed by the winner's row index. A replaced
 * row follows its winner in the inventory order.
 */
function replacedOrigins(skills: readonly SkillInventoryRow[]): Map<number, SkillOrigin[]> {
  const result = new Map<number, SkillOrigin[]>()
  let winner = -1
  for (const [index, skill] of skills.entries()) {
    if (skill.replacedBy === undefined) {
      winner = index
      continue
    }
    const list = result.get(winner) ?? []
    list.push(skill.origin)
    result.set(winner, list)
  }
  return result
}

/**
 * Render the section; it reads the inventory again each time it mounts.
 * @param props - shell owner state, copy, and the injected store.
 * @returns the section.
 */
export function SkillsSection(props: SkillsSectionProps): ReactNode {
  const { controller, useSkills, t } = props
  const state = useSkills(snapshot => snapshot)
  useEffect(() => { void controller.load() }, [controller])
  const { inventory } = state
  return (
    <section className={css.section} aria-labelledby="settings-skills-title">
      <h2 id="settings-skills-title" className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {inventory.status === 'ready'
        ? <SkillsBody inventory={inventory.inventory} state={state} t={t} controller={controller} />
        : inventory.status === 'error'
          ? (
            <div className={css.failure}>
              <p className={css.error} role="alert">{t('loadFailed')}</p>
              <Button variant="outline" size="sm" onClick={() => { void controller.load() }}>{t('retry')}</Button>
            </div>
          )
          : <div className={css.loading} role="status" aria-label={t('loading')}><StateDot state="ongoing" /></div>}
    </section>
  )
}

function SkillsBody({ inventory, state, t, controller }: {
  inventory: SkillInventoryValue
  state: SkillsState
  t: Translate
  controller: SkillsSectionController
}): ReactNode {
  const replaces = replacedOrigins(inventory.skills)
  return (
    <>
      {inventory.complete ? null : <p className={css.warning} role="status">{t('incomplete')}</p>}
      {inventory.skills.length === 0 ? <p className={css.empty}>{t('empty')}</p> : (
        <ul className={css.rows}>
          {inventory.skills.map((skill, index) => (
            <li key={skillKey(skill)}>
              <SkillCard
                skill={skill}
                replaces={replaces.get(index) ?? []}
                text={state.texts[skillKey(skill)]}
                t={t}
                readText={(ref) => { void controller.readText(ref) }}
              />
            </li>
          ))}
        </ul>
      )}
      {inventory.faults.length === 0 ? null : (
        <section className={css.faults} aria-labelledby="settings-skills-faults-title">
          <h3 id="settings-skills-faults-title" className={css.subtitle}>{t('faultsTitle')}</h3>
          <p className={css.intro}>{t('faultsIntro')}</p>
          <ul className={css.rows}>
            {inventory.faults.map(fault => (
              <li key={fault.path} className={css.card} data-skill-fault={fault.reason.kind}>
                <div className={css.head}>
                  <PathLabel className={css.path} path={fault.path} />
                  <Tag tone="warning">{originLabel(fault.origin, t)}</Tag>
                </div>
                <p className={css.reason}>{faultText(fault.reason, t)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
