/** The analysis form: the application number, the optional office action PDF, the agent, and the budget left. */

import { useId, useRef, useState } from 'react'
import {
  Button, FileTypeIcon, IconChevronDownOutlineRegular, IconCloseOutlineRegular, Input, Menu, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { OfficeActionAnalysis } from './board.ts'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

/** Props of the analysis form. */
export interface AnalysisFormProps {
  readonly open: boolean
  /** The analysis whose inputs fill the form. */
  readonly analysis: OfficeActionAnalysis
  readonly onClose: () => void
  /** Start the analysis; the sample only shows a notice. */
  readonly onStart: () => void
  readonly t: TranslateNS<typeof NS>
}

/**
 * Render the analysis form in a modal. The fields keep their values while the page stays mounted.
 * @param props - the inputs, the actions, and copy.
 * @returns the modal.
 */
export function AnalysisForm({ open, analysis, onClose, onStart, t }: AnalysisFormProps) {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [application, setApplication] = useState(analysis.application)
  const [pdf, setPdf] = useState(analysis.pdf)
  const [agent, setAgent] = useState(analysis.agent)
  const [agentMenu, setAgentMenu] = useState(false)
  const money = new Intl.NumberFormat(t('time.locale'), { style: 'currency', currency: analysis.budget.currency, maximumFractionDigits: 0 })
  const share = Math.round((analysis.budget.left / analysis.budget.limit) * 100)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('form.title')}
      description={t('form.description')}
      closeLabel={t('form.close')}
      className={css.dialog as string}
      footer={(
        <div className={css.formActions}>
          <Button variant="outline" onClick={onClose}>{t('form.cancel')}</Button>
          <Button variant="primary" disabled={application.trim() === ''} onClick={onStart}>{t('form.start')}</Button>
        </div>
      )}
    >
      <div className={css.form} data-testid="analysis-form">
        <div className={css.field}>
          <label className={css.label} htmlFor={`${id}-application`}>{t('form.application')}</label>
          <Input id={`${id}-application`} value={application} data-modal-autofocus="" onChange={(event) => { setApplication(event.currentTarget.value) }} />
          <span className={css.hint}>{t('form.applicationHint')}</span>
        </div>
        <div className={css.field}>
          <span className={css.label}>{t('form.pdf')}</span>
          {pdf === null
            ? (
              <div>
                <Button variant="outline" size="sm" onClick={() => { fileInput.current?.click() }}>{t('form.pdfChoose')}</Button>
                <input
                  ref={fileInput}
                  className={css.hidden}
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => { setPdf(event.currentTarget.files?.[0]?.name ?? null) }}
                />
              </div>
            )
            : (
              <div className={css.file}>
                <FileTypeIcon path={pdf} size={20} />
                <span className={css.fileName}>{pdf}</span>
                <Button size="sm" aria-label={t('form.pdfRemove', { name: pdf })} icon={<IconCloseOutlineRegular size={12} />} onClick={() => { setPdf(null) }} />
              </div>
            )}
          <span className={css.hint}>{t('form.pdfHint')}</span>
        </div>
        <div className={css.field}>
          <span className={css.label}>{t('form.agent')}</span>
          <Menu
            open={agentMenu}
            portal
            minWidthFromAnchor
            onClose={() => { setAgentMenu(false) }}
            selectedId={agent}
            items={analysis.agents.map(name => ({ id: name, label: name }))}
            onSelect={(name) => { setAgent(name); setAgentMenu(false) }}
            anchor={(
              <Button
                variant="outline"
                aria-label={t('form.agentLabel', { agent })}
                aria-haspopup="menu"
                aria-expanded={agentMenu}
                onClick={() => { setAgentMenu(value => !value) }}
              >
                {agent}
                <IconChevronDownOutlineRegular size={12} />
              </Button>
            )}
          />
        </div>
        <div className={css.field}>
          <span className={css.label}>{t('form.budget')}</span>
          <div className={css.budget}>
            <span className={css.meter} aria-hidden="true"><span className={css.meterFill} style={{ width: `${share}%` }} /></span>
            <span>{t('form.budgetValue', { left: money.format(analysis.budget.left), limit: money.format(analysis.budget.limit) })}</span>
          </div>
          <span className={css.hint}>{t('form.budgetHint')}</span>
        </div>
      </div>
    </Modal>
  )
}
