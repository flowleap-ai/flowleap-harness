/** One skill's read-only card: name, source, description, replace note, and the full text on request. */

import { useState, type ReactNode } from 'react'
import { Button, DetailDocument, detailDocumentState, Tag, useDetailDocumentLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { SkillFaultReason, SkillInventoryRow, SkillOrigin, SkillRef } from '../types.ts'
import type { SkillTextState } from './skills-store.ts'
import css from './SkillsSection.module.css'

/** Translate within this package's namespace. */
export type Translate = PropsLocale<'settings.skills'>['t']

/**
 * Name the origin of a skill as the user sees it.
 * @param origin - the origin.
 * @param t - section copy.
 * @returns the source tag text.
 */
export function originLabel(origin: SkillOrigin, t: Translate): string {
  switch (origin.kind) {
    case 'mine': return t('originMine')
    case 'firm': return t('originFirm')
    case 'project': return t('originProject')
    case 'plugin': return origin.name
    /* v8 ignore start -- SkillOrigin is a closed union; a future kind must fail compilation here. */
    default: return assertNever(origin, 'SkillOrigin.kind')
    /* v8 ignore stop */
  }
}

/**
 * Explain why a file is not a skill.
 * @param reason - the fault reason.
 * @param t - section copy.
 * @returns one localized sentence.
 */
export function faultText(reason: SkillFaultReason, t: Translate): string {
  switch (reason.kind) {
    case 'missing-frontmatter': return t('faultMissingFrontmatter')
    case 'invalid-yaml': return t('faultInvalidYaml')
    case 'missing-field': return t('faultMissingField', { field: reason.field })
    case 'invalid-name': return t('faultInvalidName', { name: reason.name })
    case 'invalid-invocation': return t('faultInvalidInvocation')
    case 'not-text': return t('faultNotText')
    /* v8 ignore start -- SkillFaultReason is a closed union; a future kind must fail compilation here. */
    default: return assertNever(reason, 'SkillFaultReason.kind')
    /* v8 ignore stop */
  }
}

/** Props of one card. */
export interface SkillCardProps {
  /** The skill. */
  readonly skill: SkillInventoryRow
  /** Origins of the skills this one replaces, in precedence order; empty for a replaced skill. */
  readonly replaces: readonly SkillOrigin[]
  /** The full-text read, undefined before the first request. */
  readonly text: SkillTextState | undefined
  /** Section copy. */
  readonly t: Translate
  /** Request the full text. */
  readonly readText: (ref: SkillRef) => void
}

/**
 * Render one skill card.
 * @param props - the skill, what it replaces, its full-text read, copy, and the read action.
 * @returns the card.
 */
export function SkillCard({ skill, replaces, text, t, readText }: SkillCardProps): ReactNode {
  const [open, setOpen] = useState(false)
  const textId = `skill-text-${skill.provider}-${skill.source}-${skill.name}`
  const toggle = (): void => {
    if (!open) readText(skill)
    setOpen(!open)
  }
  return (
    <article className={css.card} data-skill={skill.name} data-replaced={skill.replacedBy === undefined ? undefined : ''}>
      <div className={css.head}>
        <span className={css.name}>{skill.name}</span>
        <Tag tone={skill.replacedBy === undefined ? 'info' : 'quiet'}>{originLabel(skill.origin, t)}</Tag>
      </div>
      <p className={css.description}>{skill.description}</p>
      {replaces.map((origin, index) => (
        <p key={index} className={css.note}>{t('replaces', { source: originLabel(origin, t) })}</p>
      ))}
      {skill.replacedBy === undefined
        ? null
        : <p className={css.note}>{t('replacedBy', { source: originLabel(skill.replacedBy.origin, t) })}</p>}
      {skill.userInvocable ? null : <p className={css.note}>{t('agentOnly')}</p>}
      {skill.modelInvocable ? null : <p className={css.note}>{t('userOnly')}</p>}
      <div className={css.actions}>
        <Button variant="outline" size="sm" aria-expanded={open} aria-controls={open ? textId : undefined} onClick={toggle}>
          {t(open ? 'hideText' : 'showText')}
        </Button>
      </div>
      {open ? <div id={textId}><SkillText skill={skill} text={text} t={t} readText={readText} /></div> : null}
    </article>
  )
}

function SkillText({ skill, text, t, readText }: Pick<SkillCardProps, 'skill' | 'text' | 't' | 'readText'>): ReactNode {
  const labels = useDetailDocumentLabels({
    title: t('textTitle', { name: skill.name }), loading: t('textLoading'), retry: t('retry'), copy: t('copy'), copied: t('copied'),
    codeBlock: t('codeBlock'), wrap: t('wrap'), unwrap: t('unwrap'), footnotes: t('footnotes'),
  })
  const shown = detailDocumentState(
    text === undefined || text.status === 'loading' ? text
      : text.status === 'ready' ? { status: 'ready', markdown: text.content }
        : { status: 'error', message: t(text.status === 'gone' ? 'textGone' : 'textFailed') },
  )
  return <DetailDocument state={shown} labels={labels} onRetry={() => { readText(skill) }} />
}
