/**
 * Step 4 of Add client: the Conflict check of the role Client, with the state of its two halves, each possible conflict
 * with its EP Register facts, and "I checked this conflict" with the reason; or the Matter of the role Other party, a
 * matter of your firm and the company's role in it.
 */

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconCheckOutlineRegular, IconInfoOutlineRegular, IconLoadingOutlineRegular, IconSearchOutlineRegular, IconWarningTriangleOutlineRegular,
  MenuSurface, SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConflictHalf, ConflictHit } from '../../add-client/wire.ts'
import { Notice, RetryButton, Section, hostText, recordText } from './AddClient.tsx'
import { applicationLabel, asOfText, counted, dayText, publicationLabel, type AddClientTranslate } from './format.ts'
import type { OtherPartyRole } from './plan.ts'
import { hitKey, type Hit } from './records.ts'
import { StepHead, type StepProps } from './WizardPage.tsx'
import { hitsOf, type WizardView } from './wizard.ts'
import css from './AddClient.module.css'

type HeadProps = StepProps & { readonly stepper: ReactNode }

/**
 * The Conflict check step.
 * @param props - the wizard, the model, copy, the keys and the stepper.
 * @returns the step.
 */
export function ConflictStep(props: HeadProps) {
  const { t, view, stepper } = props
  const name = view.group?.name ?? ''
  return (
    <>
      <StepHead stepper={stepper} title={t('conflict.stepTitle', { name })} lede={t('conflict.lede')} />
      <ConflictResult {...props} />
      <Halves {...props} />
    </>
  )
}

/** The failure of a read of the conflict check, as one sentence. */
function failureText(t: AddClientTranslate, view: WizardView): string | null {
  const { firm, check } = view
  if (firm.status === 'error') return recordText(t, firm.error)
  if (check.status === 'error') return hostText(t, check.error)
  if (check.status === 'no-key') return t('host.no-key')
  return null
}

function ConflictResult({ t, view, model, locale, retryKeycaps }: HeadProps) {
  const { firm, check, conflict, group } = view
  const name = group?.name ?? ''
  const retry = <RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />
  const failure = failureText(t, view)
  if (failure !== null) return <Notice tone="bad" lead={t('conflict.failed.lead')} rest={failure} act={retry} />
  if (firm.status !== 'ready' || check.status === 'loading') {
    return <p className={css.hint} role="status"><IconLoadingOutlineRegular size={16} /><span>{t('conflict.loading')}</span></p>
  }
  const hits = hitsOf(view)
  const byName = check.status === 'by-name'
  const decided = conflict.checked && conflict.reason.trim() !== ''
  const count = group?.names.length ?? 0
  if (hits.length === 0 && !byName) {
    return (
      <Section title={t('conflict.result')} count={t('sum.conflict.none')}>
        <div className={css.okLine}>
          <IconCheckOutlineRegular size={16} />
          <div><div>{t('conflict.none')}</div><div className={css.sub}>{count > 1 ? t('conflict.noneBody', { count }) : t('conflict.noneBodyOne')}</div></div>
        </div>
      </Section>
    )
  }
  const checkBox = (
    <>
      <label className={clsx(css.checkRow, conflict.checked && css.on)}>
        <input type="checkbox" checked={conflict.checked} onChange={(event) => { model.setConflict(event.currentTarget.checked, conflict.reason) }} />
        <span>
          <span className={css.strong}>{byName ? t('conflict.checkSelf') : t('conflict.check')}</span>
          <span className={clsx(css.sub, css.block)}>{byName ? t('conflict.checkSelfBody', { name }) : t('conflict.checkBody', { name })}</span>
        </span>
      </label>
      <textarea className={css.reason} value={conflict.reason} aria-label={t('conflict.reason')} placeholder={t('conflict.reason')}
        onChange={(event) => { model.setConflict(conflict.checked, event.currentTarget.value) }} />
    </>
  )
  // By name only, FlowLeap read no EP opposition: the person checks conflicts and writes how.
  if (hits.length === 0) {
    return (
      <Section title={t('conflict.result')}>
        <Notice tone="warn" lead={t('conflict.byName.lead')} rest={t('conflict.byName.rest')} />
        {checkBox}
      </Section>
    )
  }
  const clientName = (id: string) => firm.details.find(detail => detail.client.clientId === id)?.client.name
  const register = new Map((check.status === 'checked' ? check.answer.conflicts : []).map(item => [hitKey(item), item]))
  const [first] = hits
  const applications = new Set(hits.map(hit => hit.applicationNumber)).size
  const lead = hits.length === 1 && first !== undefined
    ? t('conflict.lead.one', { party: first.otherParty, client: clientName(first.existingClientId) ?? first.existingClientParty, application: applicationLabel(first.applicationNumber) })
    : t('conflict.lead.many', { count: applications })
  const hitsText = counted(t, hits.length, 'conflict.count.one', 'conflict.count.many')
  return (
    <Section title={t('conflict.result')} count={decided ? t('conflict.checkedCount', { hits: hitsText }) : hitsText}>
      <Notice tone="warn" lead={lead} rest={decided ? t('conflict.checkedRest') : t('conflict.rest')} />
      {byName && <Notice tone="warn" lead={t('conflict.byName.lead')} rest={t('conflict.byName.rest')} />}
      {hits.map(hit => (
        <HitFacts key={hitKey(hit)} t={t} hit={hit} detail={register.get(hitKey(hit))} client={clientName(hit.existingClientId)}
          locale={locale} />
      ))}
      <p className={css.sourceLine}>{t('conflict.searched')}</p>
      {checkBox}
    </Section>
  )
}

/** The state of the two halves of the register check. */
function Halves({ t, view, model, locale, retryKeycaps }: HeadProps) {
  if (view.check.status !== 'checked') return null
  const { groupOpposedClients, clientsOpposedGroup } = view.check.answer.conflictCheck
  const halves = [['groupOpposedClients', groupOpposedClients], ['clientsOpposedGroup', clientsOpposedGroup]] as const
  // A half that reads or failed completes only with a new check: the opponent index reads on the Host meanwhile.
  const open = halves.some(([, half]) => half.state !== 'complete')
  return (
    <Section title={t('conflict.halves')} right={open ? <RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} /> : undefined}>
      <ul className={css.halves}>
        {halves.map(([key, half]) => (
          <li key={key} className={clsx(half.state !== 'complete' && css.halfOpen)}>
            {half.state === 'complete' ? <IconCheckOutlineRegular size={16} /> : half.state === 'reading' ? <IconLoadingOutlineRegular size={16} /> : <IconWarningTriangleOutlineRegular size={16} />}
            <span><span className={css.strong}>{t(`conflict.half.${key}`)}</span><span className={clsx(css.sub, css.block)}>{halfText(t, half, locale)}</span></span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function halfText(t: AddClientTranslate, half: ConflictHalf, locale: StepProps['locale']): string {
  if (half.state === 'complete') return t('conflict.half.complete', { asOf: asOfText(t, half.asOf, locale) })
  return half.state === 'reading' ? t('conflict.half.reading') : t('conflict.half.incomplete')
}

function HitFacts({ t, hit, detail, client, locale }: {
  readonly t: AddClientTranslate
  readonly hit: Hit
  readonly detail: ConflictHit | undefined
  readonly client: string | undefined
  readonly locale: StepProps['locale']
}) {
  const publication = hit.publicationNumber === undefined ? undefined : publicationLabel(hit.publicationNumber)
  const patent = [applicationLabel(hit.applicationNumber), publication, hit.title].filter((part): part is string => part !== undefined).join(' · ')
  const rows: [string, ReactNode][] = [
    [t('fact.patent'), patent],
    [t(`fact.role.${hit.otherPartyRole}`), hit.otherParty],
    [t('fact.yourClient'), client === undefined ? hit.existingClientParty : t('fact.clientParty', { party: hit.existingClientParty, client })],
    ...detail?.opposedOn === undefined ? [] : [[t('fact.opposed'), dayText(detail.opposedOn, locale)] as [string, ReactNode]],
    ...detail?.status === undefined ? [] : [[t('fact.status'), detail.status] as [string, ReactNode]],
    ...detail === undefined ? [] : [[t('fact.yourFirm'), t(`fact.yourFirm.${detail.yourFirm}`)] as [string, ReactNode]],
    [t('fact.source'), t(`fact.source.${hit.source}`, { asOf: asOfText(t, hit.asOf, locale) })],
  ]
  return <div className={css.facts}>{rows.map(([key, value]) => <FactRow key={key} name={key} value={value} />)}</div>
}

function FactRow({ name, value }: { readonly name: string; readonly value: ReactNode }) {
  return <><div className={css.factKey}>{name}</div><div>{value}</div></>
}

const OTHER_ROLES: readonly OtherPartyRole[] = ['opponent', 'licensee', 'other']

/**
 * The Matter step of the role Other party: find a matter of your firm and choose the company's role in it.
 * @param props - the wizard, the model, copy, the keys and the stepper.
 * @returns the step.
 */
export function MatterStep({ t, view, model, retryKeycaps, stepper }: HeadProps) {
  const [query, setQuery] = useState('')
  const { firm, other } = view
  const name = view.group?.name ?? ''
  const head = <StepHead stepper={stepper} title={t('matter.title', { name })} lede={t('other.hint', { name })} />
  if (firm.status === 'loading') return <>{head}<p className={css.hint} role="status"><IconLoadingOutlineRegular size={16} /><span>{t('conflict.loading')}</span></p></>
  if (firm.status === 'error') {
    return <>{head}<Notice tone="bad" lead={recordText(t, firm.error)} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} /></>
  }
  const words = query.trim().toLowerCase().split(/\s+/).filter(word => word !== '')
  const matters = firm.details.flatMap(detail => detail.applications.map(application => ({ ...application, client: detail.client.name })))
  const shown = matters.filter(matter => words.every(word => `${applicationLabel(matter.applicationNumber)} ${matter.applicationNumber} ${matter.title ?? ''} ${matter.client}`.toLowerCase().includes(word)))
  return (
    <>
      {head}
      <div className={clsx(css.fieldWrap, css.pick)}>
        <IconSearchOutlineRegular size={16} />
        <input className={clsx(css.field, css.pickField)} type="search" value={query} aria-label={t('other.find')} placeholder={t('other.find')}
          onChange={(event) => { setQuery(event.currentTarget.value) }} />
      </div>
      <MenuSurface compact className={css.pickMenu}>
        <ul className={css.pickList} role="listbox" aria-label={t('other.find')}>
          {matters.length === 0 && <li className={css.pickFoot}>{t('other.empty')}</li>}
          {matters.length > 0 && shown.length === 0 && <li className={css.pickFoot}>{t('other.none')}</li>}
          {shown.map(matter => (
            <li key={matter.applicationNumber}>
              <button type="button" className={css.pickItem} role="option" aria-selected={other.applicationNumber === matter.applicationNumber}
                onClick={() => { model.setOther(matter.applicationNumber, other.role) }}>
                <span className={css.key}>{applicationLabel(matter.applicationNumber)}</span>
                <span className={clsx(css.cell, css.text)}>{matter.title ?? matter.client}</span>
              </button>
            </li>
          ))}
          {matters.length > 0 && <li className={css.pickFoot}>{t('other.foot')}</li>}
        </ul>
      </MenuSurface>
      <div className={css.fieldLabel}>{t('other.role')}</div>
      <SegmentedControl id="add-client-matter-role" className={css.inlineSeg} label={t('other.role')} value={other.role}
        options={OTHER_ROLES.map(role => ({ value: role, label: t(`other.role.${role}`) }))}
        onChange={(role) => { model.setOther(other.applicationNumber, role) }} />
      <p className={css.sourceLine}><IconInfoOutlineRegular size={16} /> {t('role.recorded')}</p>
    </>
  )
}
