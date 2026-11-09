/**
 * Step 5 of Add client, Review: every choice of the wizard with Edit to its step, before FlowLeap records anything. The
 * footer holds the one primary act of Add client.
 */

import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { Notice, RetryButton, recordText } from './AddClient.tsx'
import { applicationLabel, asOfText, counted } from './format.ts'
import { StepHead, othersText, type StepProps } from './WizardPage.tsx'
import { hitsOf, isTicked, matterRows, type StepId } from './wizard.ts'
import css from './AddClient.module.css'

/**
 * The Review step.
 * @param props - the wizard, the model, copy, the keys and the stepper.
 * @returns the step.
 */
export function ReviewStep(props: StepProps & { readonly stepper: ReactNode }) {
  const { t, view, model, locale, retryKeycaps, stepper } = props
  const { group, role, recording } = view
  const name = group?.name ?? ''
  const names = group?.names ?? []
  const rows = matterRows(view)
  const ticked = rows.filter(row => isTicked(view, row)).length
  const unticked = rows.filter(row => row.addressOnly && !isTicked(view, row)).length
  const docket = view.docket.status === 'read' && 'asOf' in view.docket.docket ? view.docket.docket.asOf : null
  const busy = recording.status === 'running'
  const row = (key: string, label: string, value: ReactNode, detail: ReactNode, step: StepId, warn = false) => (
    <div key={key} className={css.sumRow}>
      <div className={css.sumKey}>{label}</div>
      <div>
        <div className={clsx(warn && css.sumWarn)}>{warn && <IconWarningTriangleOutlineRegular size={16} />}{value}</div>
        {detail !== null && <div className={css.sub}>{detail}</div>}
      </div>
      <Button variant="ghost" size="sm" disabled={busy} aria-label={t('act.editStep', { step: label })} onClick={() => { model.edit(step) }}>{t('act.edit')}</Button>
    </div>
  )
  const mattersDetail = [
    unticked > 0 ? t('sum.matters.address', { count: unticked }) : null,
    docket === null ? null : t('sum.matters.source', { asOf: asOfText(t, docket, locale) }),
    view.others.status === 'counted' ? othersText(t, view.others, locale) : null,
  ].filter(part => part !== null).join(' ')
  const findTotal = view.find.status === 'found' ? view.find.names.length : names.length
  return (
    <>
      <StepHead stepper={stepper} title={t('review.title', { name })} lede={t('review.lede')} />
      {recording.status === 'failed' && (
        <Notice tone="bad" lead={recordText(t, recording.error)} rest={t('record.safe')} act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.retry() }} />} />
      )}
      <div className={css.sum}>
        {row('company', t('sum.company'), name, group?.byName === true ? t('sum.company.byName') : counted(t, names.length, 'names.one', 'names.many'), 'company')}
        {row('names', t('sum.names'), names.length === 0 ? t('sum.names.none') : t('sum.names.value', { ticked: names.length, total: findTotal }),
          names.length === 0 ? null : names.map(item => item.name).join(', '), 'company')}
        {row('matters', t('sum.matters'), counted(t, ticked, 'sum.matters.one', 'sum.matters.many'), mattersDetail === '' ? null : mattersDetail, 'matters')}
        {row('role', t('sum.role'), role === null ? '' : t(`role.${role}`), t('sum.role.detail'), 'role')}
        {role === 'client' && <ConflictRow {...props} row={row} />}
        {role === 'other-party' && row('matter', t('sum.matter'),
          view.other.applicationNumber === null ? '' : `${applicationLabel(view.other.applicationNumber)} · ${t(`other.role.${view.other.role}`)}`, null, 'matter')}
      </div>
    </>
  )
}

type RowOf = (key: string, label: string, value: ReactNode, detail: ReactNode, step: StepId, warn?: boolean) => ReactNode

/** The row of the conflict check: no conflict, checked with the reason, not checked, or not complete. */
function ConflictRow({ t, view, row }: StepProps & { readonly row: RowOf }) {
  const label = t('sum.conflict')
  const { check, conflict } = view
  const hits = hitsOf(view)
  const decided = conflict.checked && conflict.reason.trim() !== ''
  const reason = t('sum.conflict.reason', { reason: conflict.reason.trim() })
  const complete = view.firm.status === 'ready' && (check.status === 'by-name'
    || (check.status === 'checked' && check.answer.conflictCheck.groupOpposedClients.state === 'complete' && check.answer.conflictCheck.clientsOpposedGroup.state === 'complete'))
  if (!complete) return row('conflict', label, t('sum.conflict.waiting'), null, 'conflict', true)
  if (check.status === 'by-name' && hits.length === 0) {
    return decided ? row('conflict', label, t('sum.conflict.self'), reason, 'conflict') : row('conflict', label, t('sum.conflict.selfOpen'), t('sum.conflict.openBody'), 'conflict', true)
  }
  if (hits.length === 0) return row('conflict', label, t('sum.conflict.none'), t('conflict.searched'), 'conflict')
  const count = counted(t, hits.length, 'conflict.count.one', 'conflict.count.many')
  return decided
    ? row('conflict', label, t('sum.conflict.checked', { hits: count }), reason, 'conflict')
    : row('conflict', label, t('sum.conflict.open', { hits: count }), t('sum.conflict.openBody'), 'conflict', true)
}
