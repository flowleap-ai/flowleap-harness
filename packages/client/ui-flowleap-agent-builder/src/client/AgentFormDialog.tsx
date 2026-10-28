/** The agent form: name, description, instructions, files, and connectors of one new or existing agent. */
import { useId, useRef, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  Button, Checkbox, FileTypeIcon, IconCloseOutlineRegular, IconTrashOutlineRegular, Input, Modal, RiskConfirmation, fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentMode, ConnectorChoiceId } from '@deepseek-ai/dsh-flowleap-agent-builder/types'
import type { AgentDraft, AgentFileRowState, AgentFormError, AgentFormState, AgentUploadError } from './form-store.ts'
import type { FlowleapAgentBuilderKey } from './locales.ts'
import css from './AgentBuilder.module.css'

/** Form state and edits supplied by the plugin. */
export interface AgentFormDialogInjected {
  hooks: {
    agentForm: SnapshotStore<AgentFormState>
  }
  close: () => void
  edit: (patch: Partial<Pick<AgentDraft, 'name' | 'description' | 'instructions'>>) => void
  toggleConnector: (id: ConnectorChoiceId, selected: boolean) => void
  addFiles: (files: readonly File[]) => void
  removeFile: (name: string) => Promise<void>
  save: () => Promise<void>
  requestDelete: () => void
  cancelDelete: () => void
  confirmDelete: () => Promise<void>
}

/** Full component props. */
export type AgentFormDialogProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'flowleapAgentBuilder'> & InjectFace<AgentFormDialogInjected>

const FILE_STATE_KEY: Record<AgentFileRowState, FlowleapAgentBuilderKey> = {
  pending: 'file.pending',
  indexed: 'file.indexed',
  indexing: 'file.indexing',
  failed: 'file.failed',
}

interface ConnectorKeys {
  readonly title: FlowleapAgentBuilderKey
  readonly description: FlowleapAgentBuilderKey
}

const CONNECTOR_KEYS: Record<ConnectorChoiceId, ConnectorKeys> = {
  'epo-ops': { title: 'connector.epo-ops.title', description: 'connector.epo-ops.description' },
  'uspto-odp': { title: 'connector.uspto-odp.title', description: 'connector.uspto-odp.description' },
  flowleap: { title: 'connector.flowleap.title', description: 'connector.flowleap.description' },
  'semantic-scholar': { title: 'connector.semantic-scholar.title', description: 'connector.semantic-scholar.description' },
}

const MODE_KEY: Record<AgentMode, FlowleapAgentBuilderKey> = {
  context: 'mode.context',
  search: 'mode.search',
}

const ERROR_KEY: Record<Exclude<AgentFormError['kind'], 'upload'>, FlowleapAgentBuilderKey> = {
  load: 'error.load',
  save: 'error.save',
  delete: 'error.delete',
}

const UPLOAD_ERROR_KEY: Record<AgentUploadError, FlowleapAgentBuilderKey> = {
  network: 'upload.network',
  server: 'upload.server',
  'too-large': 'upload.too-large',
  type: 'upload.type',
  refused: 'upload.refused',
}

/**
 * Render the agent form while it is open.
 * @param props - locale, form state, and edits.
 * @returns the modal form, or null while closed.
 */
export function AgentFormDialog({
  t, useAgentForm, close, edit, toggleConnector, addFiles, removeFile, save, requestDelete, cancelDelete, confirmDelete,
}: AgentFormDialogProps) {
  const state = useAgentForm(value => value)
  const ids = useId()
  const picker = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  if (state.kind !== 'open') return null
  const { draft, mode, connectors, busy } = state
  const ready = draft.name.trim() !== '' && draft.instructions.trim() !== '' && !busy

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
            <Button variant="ghost" className={css.delete} disabled={busy} icon={<IconTrashOutlineRegular size={14} />}
              onClick={() => { setAcknowledged(false); requestDelete() }}>
              {t('action.delete')}
            </Button>
          )}
          <span className={css.footerSpacer} />
          <Button variant="outline" onClick={close}>{t(mode === 'create' ? 'action.cancel' : 'action.close')}</Button>
          <Button variant="primary" disabled={!ready} onClick={() => { void save() }}>
            {t(busy ? 'action.saving' : mode === 'create' ? 'action.create' : 'action.save')}
          </Button>
        </div>
      )}
    >
      <div className={css.form}>
        {state.error !== null && (
          <p className={css.error} role="alert">
            {state.error.kind === 'upload'
              ? t('error.upload', { name: state.error.file, reason: t(UPLOAD_ERROR_KEY[state.error.reason]) })
              : t(ERROR_KEY[state.error.kind], { detail: state.error.detail })}
          </p>
        )}
        {state.agentMode !== undefined && (
          <p className={css.mode}>
            <span className={css.modeLabel}>{t('mode.label')}</span>
            <span>{t(MODE_KEY[state.agentMode])}</span>
          </p>
        )}
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
                /* v8 ignore next -- an input of type file always has a FileList. */
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
                      onClick={() => { void removeFile(file.name) }}>
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
                  label={t(CONNECTOR_KEYS[row.id].title)}
                  onChange={(next) => { toggleConnector(row.id, next) }}
                />
                <span className={css.connectorDescription}>
                  {row.configured
                    ? t(CONNECTOR_KEYS[row.id].description)
                    : t('connectors.notConfigured')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <RiskConfirmation
        open={state.confirmingDelete}
        title={t('delete.title', { name: draft.name })}
        description={t('delete.description')}
        acknowledgeLabel={t('delete.acknowledge')}
        cancelLabel={t('action.cancel')}
        closeLabel={t('form.close')}
        confirmLabel={t('action.delete')}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        onCancel={cancelDelete}
        onConfirm={() => { void confirmDelete() }}
      />
    </Modal>
  )
}
