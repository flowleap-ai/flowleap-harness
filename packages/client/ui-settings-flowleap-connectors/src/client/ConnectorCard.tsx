/** One connector's card: its name and presence, write-only key fields, and the save, remove, and test controls. */

import type { ReactNode } from 'react'
import { Button, SettingsSecretField, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectorCardState, ConnectorId } from './connectors-store.ts'
import { draftComplete } from './connectors-store.ts'
import type { ConnectorsLocaleKey } from './locales.ts'
import css from './ConnectorCard.module.css'

/** Translate within this package's namespace. */
export type Translate = (key: ConnectorsLocaleKey) => string

/** Copy keys of each connector's name and hint. */
const COPY: Readonly<Record<ConnectorId, { name: ConnectorsLocaleKey; hint: ConnectorsLocaleKey }>> = {
  'epo-ops': { name: 'epoOpsName', hint: 'epoOpsHint' },
  'uspto-odp': { name: 'usptoOdpName', hint: 'usptoOdpHint' },
  'semantic-scholar': { name: 'semanticScholarName', hint: 'semanticScholarHint' },
  mistral: { name: 'mistralName', hint: 'mistralHint' },
}

/** Copy key of each credential field label; an unknown field shows its own name. */
function fieldLabel(field: string, t: Translate): string {
  switch (field) {
    case 'consumerKey': return t('consumerKey')
    case 'consumerSecret': return t('consumerSecret')
    case 'apiKey': return t('apiKey')
    default: return field
  }
}

/** The card's actions, bound by the owner to one connector. */
export interface ConnectorCardActions {
  /** Stage one field. */
  edit: (id: ConnectorId, field: string, text: string) => void
  /** Write the complete draft. */
  save: (id: ConnectorId) => void
  /** Remove the stored record. */
  remove: (id: ConnectorId) => void
  /** Run the Host's connection test. */
  test: (id: ConnectorId) => void
}

/** Props of one card: a compact card (the wizard) renders the fields and outcome only, so it takes no save, remove, or test action. */
export type ConnectorCardProps = {
  /** The card state. */
  card: ConnectorCardState
  /** Section copy. */
  t: Translate
} & Pick<ConnectorCardActions, 'edit'> & (
  | { /** Render the fields and outcome only, without the card frame and its controls. */ compact: true }
  | ({ compact?: false } & Omit<ConnectorCardActions, 'edit'>)
)

/**
 * Render the connector's name and hint.
 * @param props - the connector id, copy, and whether to show the presence tag.
 * @returns the head row.
 */
export function ConnectorHead(
  { id, configured, t, tag = true }: { id: ConnectorId; configured: boolean; t: Translate; tag?: boolean },
): ReactNode {
  return (
    <div className={css.head}>
      <span className={css.name}>{t(COPY[id].name)}</span>
      {tag && <Tag tone={configured ? 'info' : 'quiet'}>{t(configured ? 'configured' : 'notConfigured')}</Tag>}
    </div>
  )
}

/**
 * Render one connector card.
 * @param props - the card state, copy, and actions.
 * @returns the card.
 */
export function ConnectorCard(props: ConnectorCardProps): ReactNode {
  const { card, t } = props
  const { id } = card
  const busy = card.busy !== 'idle'
  const disabled = !card.writable || busy
  const outcome = card.test
  const body = (
    <>
      <p className={css.hint}>{t(COPY[id].hint)}</p>
      {card.writable ? null : <p className={css.notice}>{t('readOnly')}</p>}
      {card.fields.map(field => (
        <SettingsSecretField
          key={field}
          id={`flowleap-connector-${id}-${field}`}
          label={fieldLabel(field, t)}
          hint={t('fieldHint')}
          disabled={disabled}
          text={card.draft[field] ?? ''}
          configured={card.configured}
          stateLabel={t(card.configured ? 'stored' : 'empty')}
          onEdit={(text) => { props.edit(id, field, text) }}
        />
      ))}
      {card.error === undefined ? null : <p className={css.error} role="alert">{card.error}</p>}
      {outcome === undefined ? null : (
        <p className={outcome.ok ? css.ok : css.failed} role="status">
          <strong>{t(outcome.ok ? 'testPassed' : 'testFailed')}</strong>
          {' '}
          {outcome.message}
        </p>
      )}
    </>
  )
  if (props.compact === true) {
    return (
      <div className={css.compact}>
        <ConnectorHead id={id} configured={card.configured} t={t} />
        {body}
      </div>
    )
  }
  return (
    <div className={css.card}>
      <ConnectorHead id={id} configured={card.configured} t={t} />
      {body}
      <div className={css.actions}>
        <Button variant="primary" size="sm" disabled={disabled || !draftComplete(card)} onClick={() => { props.save(id) }}>
          {t(card.busy === 'saving' ? 'saving' : 'save')}
        </Button>
        {card.configured && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { props.test(id) }}>
            {t(card.busy === 'testing' ? 'testing' : 'test')}
          </Button>
        )}
        {card.configured && (
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => { props.remove(id) }}>
            {t(card.busy === 'removing' ? 'removing' : 'remove')}
          </Button>
        )}
      </div>
    </div>
  )
}
