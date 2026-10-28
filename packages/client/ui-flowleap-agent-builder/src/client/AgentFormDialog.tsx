/** The agent form: name, description, instructions, files, and connectors of one new or existing agent. */
import { useId, useRef, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  Button, Checkbox, FileTypeIcon, IconCloseOutlineRegular, IconTrashOutlineRegular, Input, Modal, fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentDraft, AgentFileRow, AgentFormState, ConnectorChoice } from './form-store.ts'
import type { FlowleapAgentBuilderKey } from './locales.ts'
import css from './AgentBuilder.module.css'

/** Form state and edits supplied by the plugin. */
export interface AgentFormDialogInjected {
  hooks: {
    agentForm: SnapshotStore<AgentFormState>
  }
  connectors: readonly ConnectorChoice[]
  close: () => void
  edit: (patch: Partial<AgentDraft>) => void
  toggleConnector: (id: string, selected: boolean) => void
  addFiles: (files: readonly File[]) => void
  removeFile: (name: string) => void
}

type AgentFormDialogProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'flowleapAgentBuilder'> & InjectFace<AgentFormDialogInjected>

const FILE_STATE_KEY: Record<AgentFileRow['state'], FlowleapAgentBuilderKey> = {
  indexed: 'file.indexed',
  indexing: 'file.indexing',
  failed: 'file.failed',
}

/**
 * Render the agent form while it is open.
 * @param props - locale, form state, and edits.
 * @returns the modal form, or null while closed.
 */
export function AgentFormDialog({
  t, useAgentForm, connectors, close, edit, toggleConnector, addFiles, removeFile,
}: AgentFormDialogProps) {
  const state = useAgentForm(value => value)
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  if (state.kind !== 'open') return null
  const { draft, mode } = state
  const ready = draft.name.trim() !== '' && draft.instructions.trim() !== ''

  return (
    <Modal
      open
      title={t(mode === 'create' ? 'form.titleCreate' : 'form.titleEdit')}
      description={t('form.intro')}
      closeLabel={t('form.close')}
      onClose={close}
      className={css.dialog as string}
      contentClassName={css.content as string}
      footer={(
        <div className={css.footer}>
          {mode === 'edit' && (
            <Button variant="ghost" className={css.delete} icon={<IconTrashOutlineRegular size={14} />}>
              {t('action.delete')}
            </Button>
          )}
          <span className={css.footerSpacer} />
          <Button variant="outline" onClick={close}>{t('action.cancel')}</Button>
          <Button variant="primary" disabled={!ready} onClick={close}>
            {t(mode === 'create' ? 'action.create' : 'action.save')}
          </Button>
        </div>
      )}
    >
      <div className={css.form}>
        <div className={css.field}>
          <label className={css.label} htmlFor={`${ids}-name`}>{t('name.label')}</label>
          <Input id={`${ids}-name`} data-modal-autofocus className={css.input as string}
            placeholder={t('name.placeholder')} value={draft.name}
            onChange={(event) => { edit({ name: event.target.value }) }} />
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor={`${ids}-description`}>{t('description.label')}</label>
          <Input id={`${ids}-description`} className={css.input as string}
            placeholder={t('description.placeholder')} value={draft.description}
            onChange={(event) => { edit({ description: event.target.value }) }} />
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor={`${ids}-instructions`}>{t('instructions.label')}</label>
          <span className={css.hint}>{t('instructions.hint')}</span>
          <textarea id={`${ids}-instructions`} className={css.textarea}
            placeholder={t('instructions.placeholder')} value={draft.instructions}
            onChange={(event) => { edit({ instructions: event.target.value }) }} />
        </div>

        <section className={css.field} aria-labelledby={`${ids}-files`}>
          <span className={css.label} id={`${ids}-files`}>{t('files.label')}</span>
          <span className={css.hint}>{t('files.hint')}</span>
          <div
            className={dragging ? `${css.drop} ${css.dropActive}` : css.drop}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => { setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              addFiles([...event.dataTransfer.files])
            }}
          >
            <span>
              {t('files.drop')}{' '}
              <button type="button" className={css.browse} onClick={() => { picker.current?.click() }}>
                {t('files.browse')}
              </button>
            </span>
            <span className={css.dropTypes}>{t('files.types')}</span>
            <input ref={picker} type="file" multiple hidden accept=".pdf,.docx,.txt,.md"
              onChange={(event) => {
                addFiles([...event.target.files ?? []])
                event.target.value = ''
              }} />
          </div>
          {draft.files.length === 0
            ? <span className={css.empty}>{t('files.empty')}</span>
            : (
              <ul className={css.files}>
                {draft.files.map(file => (
                  <li key={file.name} className={css.file}>
                    <FileTypeIcon path={file.name} size={20} />
                    <span className={css.fileName} title={file.name}>{file.name}</span>
                    <span className={css.fileSize}>{fileSizeText(file.bytes)}</span>
                    <span className={css[`state-${file.state}`]}>{t(FILE_STATE_KEY[file.state])}</span>
                    <button type="button" className={css.remove} aria-label={t('files.remove', { name: file.name })}
                      onClick={() => { removeFile(file.name) }}>
                      <IconCloseOutlineRegular size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className={css.field} aria-labelledby={`${ids}-connectors`}>
          <span className={css.label} id={`${ids}-connectors`}>{t('connectors.label')}</span>
          <span className={css.hint}>{t('connectors.hint')}</span>
          <ul className={css.connectors}>
            {connectors.map(row => (
              <li key={row.id} className={row.configured ? css.connector : `${css.connector} ${css.connectorOff}`}>
                <Checkbox
                  checked={row.configured && draft.connectors.includes(row.id)}
                  disabled={!row.configured}
                  label={t(`connector.${row.id}.title` as FlowleapAgentBuilderKey)}
                  onChange={(next) => { toggleConnector(row.id, next) }}
                />
                <span className={css.connectorDescription}>
                  {row.configured
                    ? t(`connector.${row.id}.description` as FlowleapAgentBuilderKey)
                    : t('connectors.notConfigured')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  )
}
