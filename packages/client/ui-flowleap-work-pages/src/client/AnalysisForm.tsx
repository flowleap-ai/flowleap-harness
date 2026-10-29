/**
 * The analysis form: the application number. Start opens a new chat with the analysis request drafted; the attorney
 * attaches the office action PDF there when there is one, and sends the request.
 */

import { useId, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import css from './WorkPages.module.css'

/** Props of the analysis form. */
export interface AnalysisFormProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Open the chat with the request for this application number. */
  readonly onStart: (application: string) => void
  readonly t: TranslateNS<typeof NS>
}

/**
 * Render the analysis form in a modal. The field keeps its value while the page stays mounted.
 * @param props - the actions and copy.
 * @returns the modal.
 */
export function AnalysisForm({ open, onClose, onStart, t }: AnalysisFormProps) {
  const id = useId()
  const [application, setApplication] = useState('')
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
          <Button variant="primary" disabled={application.trim() === ''} onClick={() => { onStart(application) }}>{t('form.start')}</Button>
        </div>
      )}
    >
      <div className={css.form} data-testid="analysis-form">
        <div className={css.field}>
          <label className={css.label} htmlFor={`${id}-application`}>{t('form.application')}</label>
          <Input id={`${id}-application`} value={application} data-modal-autofocus="" onChange={(event) => { setApplication(event.currentTarget.value) }} />
          <span className={css.hint}>{t('form.applicationHint')}</span>
        </div>
        <p className={css.hint}>{t('form.pdfHint')}</p>
      </div>
    </Modal>
  )
}
