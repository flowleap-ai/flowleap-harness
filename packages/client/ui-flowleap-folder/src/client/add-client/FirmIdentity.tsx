/**
 * The Firm identity section of Settings (approved mockup `6-firm-identity`): what FlowLeap sends to the EP Register,
 * the state of the firm docket with its read time, and the firm's names, addresses and representatives with **Save**.
 * Only a firm administrator gets the fields to edit and **Save**; every other person sees them read-only.
 */

import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  Button, IconCheckOutlineRegular, IconClockOutlineRegular, IconCloseOutlineRegular, IconInfoOutlineRegular, IconLoadingOutlineRegular,
  IconPlusOutlineRegular, IconRefreshOutlineRegular, IconShieldOutlineRegular, Input, type KeycapBox,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { ShortcutCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocketAnswer, DocketState, RefreshState } from '../../add-client/wire.ts'
import { IDENTITY_SCOPE, identityRetryKeycaps } from '../keys.ts'
import { Notice, RetryButton, hostText } from './AddClient.tsx'
import { asOfText, counted, type AddClientTranslate } from './format.ts'
import { IDENTITY_LISTS, changed, refreshOf, type FirmIdentityModel, type IdentityList, type IdentityState } from './identity-model.ts'
import css from './FirmIdentity.module.css'

/** Registration-side dependencies of {@link FirmIdentitySection}. */
export interface FirmIdentityInjected {
  hooks: {
    /** The section state. */
    identity: ObservableSnapshot<IdentityState>
    /** The shortcut catalog, for the keycaps of Try again. */
    catalog: ObservableSnapshot<readonly ShortcutCatalogEntry[]>
    /** The UI language, which formats the read time. */
    language: ObservableSnapshot<LocaleId>
  }
  model: FirmIdentityModel
}

/** Shell owner props, the framework `t` seat of the Add client namespace, and this section's injected face. */
export type FirmIdentitySectionProps =
  PropsRuntime<'settings.section'> & PropsLocale<'flowleapAddClient'> & InjectFace<FirmIdentityInjected>

/**
 * The section as the settings shell renders it; it reads the identity each time it opens.
 * @param props - shell owner props, the copy and the injected stores.
 * @returns the section.
 */
export function FirmIdentitySection(props: FirmIdentitySectionProps): ReactNode {
  const { model, useIdentity, useCatalog, useLanguage } = props
  const state = useIdentity(snapshot => snapshot)
  const catalog = useCatalog(rows => rows)
  const locale = useLanguage(language => language)
  useEffect(() => {
    void model.load()
    return () => { model.close() }
  }, [model])
  return <FirmIdentityView t={props.t} state={state} model={model} locale={locale} retryKeycaps={identityRetryKeycaps(catalog)} />
}

/** What the view of the section gets. */
export interface FirmIdentityViewProps {
  readonly t: AddClientTranslate
  readonly state: IdentityState
  readonly model: FirmIdentityModel
  readonly locale: LocaleId
  readonly retryKeycaps: readonly KeycapBox[]
}

/**
 * The section: the head with **Save**, the line on what FlowLeap sends, the docket, and the three lists.
 * @param props - the copy, the state, the acts and the keycaps.
 * @returns the section.
 */
export function FirmIdentityView({ t, state, model, locale, retryKeycaps }: FirmIdentityViewProps): ReactNode {
  const saveEnabled = state.status === 'ready' && state.busy === null && changed(state)
  return (
    <section className={css.section} aria-labelledby="flowleap-firm-identity-title" data-shortcut-scope={IDENTITY_SCOPE} tabIndex={-1}>
      <div className={css.head}>
        <h2 id="flowleap-firm-identity-title" className={css.title}>{t('identity.title')}</h2>
        {state.status === 'ready' && state.canSave && (
          <Button variant="primary" size="sm" disabled={!saveEnabled} onClick={() => { void model.save() }}>{t('identity.save')}</Button>
        )}
      </div>
      <p className={css.lede}>{t('identity.lede')}</p>
      <p className={css.privacy}><IconShieldOutlineRegular size={16} /><span>{t('identity.privacy')}</span></p>
      {state.status === 'ready' && (
        <p className={css.privacy}>
          <IconInfoOutlineRegular size={16} /><span>{t(state.canSave ? 'identity.savedWins' : 'identity.adminOnly')}</span>
        </p>
      )}
      <Body t={t} state={state} model={model} locale={locale} retryKeycaps={retryKeycaps} />
    </section>
  )
}

function Body({ t, state, model, locale, retryKeycaps }: FirmIdentityViewProps): ReactNode {
  switch (state.status) {
    case 'loading':
      return <div className={css.loading} role="status" aria-label={t('identity.loading')}><IconLoadingOutlineRegular size={20} /></div>
    case 'failed':
      return (
        <Notice tone="bad" lead={t('identity.loadFailed')} rest={hostText(t, state.error)}
          act={<RetryButton t={t} keycaps={retryKeycaps} onClick={() => { void model.load() }} />} />
      )
    case 'ready': {
      const { failure } = state
      return (
        <>
          {failure !== null && (
            <Notice tone="bad" lead={t(failure.act === 'save' ? 'identity.saveFailed' : 'identity.readFailed')} rest={hostText(t, failure.error)} />
          )}
          <Docket t={t} answer={state.docket} busy={state.busy !== null} model={model} locale={locale} retryKeycaps={retryKeycaps} />
          {IDENTITY_LISTS.map(list => (
            <Entries key={list} t={t} list={list} entries={state.draft[list]} readOnly={!state.canSave} disabled={state.busy === 'save'} model={model} />
          ))}
        </>
      )
    }
  }
}

/** The docket states that a person can read again in full, unless a read again of the docket runs. */
const READ_AGAIN: ReadonlySet<DocketState['state']> = new Set(['ready', 'stale', 'interrupted'])

/** The firm docket: its state with its read time, and **Read again** or **Try again**. */
function Docket({ t, answer, busy, model, locale, retryKeycaps }: {
  readonly t: AddClientTranslate
  readonly answer: DocketAnswer
  readonly busy: boolean
  readonly model: FirmIdentityModel
  readonly locale: LocaleId
  readonly retryKeycaps: readonly KeycapBox[]
}) {
  const docket = answer.status === 'docket' ? answer.docket : null
  const readAgain = docket !== null && READ_AGAIN.has(docket.state) && refreshOf(docket)?.state !== 'reading'
  return (
    <section className={css.group} aria-labelledby="flowleap-firm-docket-title">
      <div className={css.groupHead}>
        <h3 id="flowleap-firm-docket-title">{t('docket.title')}</h3>
        {readAgain && (
          <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular size={16} />} disabled={busy} onClick={() => { void model.readAgain('all') }}>
            {t('docket.readAgain')}
          </Button>
        )}
      </div>
      {docket === null
        ? <Line shape="idle" text={t('docket.noPlugin')} />
        : <DocketLine t={t} docket={docket} busy={busy} model={model} locale={locale} retryKeycaps={retryKeycaps} />}
    </section>
  )
}

function DocketLine({ t, docket, busy, model, locale, retryKeycaps }: {
  readonly t: AddClientTranslate
  readonly docket: DocketState
  readonly busy: boolean
  readonly model: FirmIdentityModel
  readonly locale: LocaleId
  readonly retryKeycaps: readonly KeycapBox[]
}) {
  const rows = (count: number) => counted(t, count, 'docket.rows.one', 'docket.rows.many')
  const retry = <RetryButton t={t} keycaps={retryKeycaps} disabled={busy} onClick={() => { void model.readAgain('failed') }} />
  switch (docket.state) {
    case 'no_identity':
      return <Line shape="idle" text={t('docket.none')} />
    case 'reading': {
      const { slicesDone, slices, rows: read } = docket.progress
      return <Line shape="run" text={t('docket.reading', { done: slicesDone, total: slices, rows: rows(read) })} rest={t('docket.reading.rest')} />
    }
    case 'interrupted': {
      const { slicesDone, slices } = docket.progress
      return <Line shape="wait" text={t('docket.interrupted', { done: slicesDone, total: slices })} rest={t('docket.interrupted.rest')} />
    }
    case 'ready':
    case 'stale': {
      const asOf = asOfText(t, docket.asOf, locale)
      const served = docket.state === 'ready'
        ? <Line shape="ok" text={t('docket.ready', { rows: rows(docket.rows) })} rest={t('docket.asOf', { asOf })} />
        : <Line shape="stale" text={t(docket.refresh === undefined ? 'docket.stale' : 'docket.staleKept', { rows: rows(docket.rows), asOf })} />
      return <>{served}{docket.refresh !== undefined && <RefreshLine t={t} refresh={docket.refresh} retry={retry} />}</>
    }
    case 'partial':
      return (
        <Notice tone="warn" lead={t('docket.partial.lead')}
          rest={t('docket.partial.rest', { rows: rows(docket.rows), asOf: asOfText(t, docket.asOf, locale) })} act={retry} />
      )
    case 'failed':
      return <Notice tone="bad" lead={t('docket.failed.lead')} rest={`${t(`docket.reason.${docket.reason}`)} ${t('docket.failed.rest')}`} act={retry} />
  }
}

/** The read again of a complete docket, under the line of the complete docket that stays in use. */
function RefreshLine({ t, refresh, retry }: {
  readonly t: AddClientTranslate
  readonly refresh: RefreshState
  readonly retry: ReactNode
}) {
  switch (refresh.state) {
    case 'reading':
      return <Line shape="run" text={t('docket.refresh.reading', { done: refresh.progress.slicesDone, total: refresh.progress.slices })} rest={t('docket.refresh.kept')} />
    case 'interrupted':
      return <Line shape="wait" text={t('docket.refresh.interrupted', { done: refresh.progress.slicesDone, total: refresh.progress.slices })} rest={t('docket.refresh.kept')} />
    case 'failed':
      return <Notice tone="warn" lead={t('docket.refresh.failed.lead')} rest={t('docket.refresh.failed.rest')} act={retry} />
  }
}

/** The icon of each docket line, as the build steps of Add client show their states. */
const LINE_ICONS = {
  idle: IconInfoOutlineRegular, run: IconLoadingOutlineRegular, wait: IconClockOutlineRegular, ok: IconCheckOutlineRegular,
  stale: IconClockOutlineRegular,
} as const

/** One line of the docket state: its icon, its words, and more words in the secondary colour. */
function Line({ shape, text, rest }: {
  readonly shape: keyof typeof LINE_ICONS
  readonly text: string
  readonly rest?: string
}) {
  const Icon = LINE_ICONS[shape]
  return (
    <p className={css.line} role="status">
      <Icon size={16} className={clsx(css.shape, shape === 'ok' && css.ok)} />
      <span><span className={css.lead}>{text}</span>{rest !== undefined && <> {rest}</>}</span>
    </p>
  )
}

/**
 * One list of the identity: its title, its hint, one field for each entry, and the act that adds an entry. Read-only,
 * for a person who may not save, it shows the saved entries without Add and Remove, and an empty list as one line.
 */
function Entries({ t, list, entries, readOnly, disabled, model }: {
  readonly t: AddClientTranslate
  readonly list: IdentityList
  readonly entries: readonly string[]
  readonly readOnly: boolean
  readonly disabled: boolean
  readonly model: FirmIdentityModel
}) {
  // The field that the person added gets the focus; the fields that load with the section do not.
  const [added, setAdded] = useState<number | null>(null)
  const rows = entries.length === 0 ? [''] : entries
  const field = t(`identity.${list}.field`)
  return (
    <fieldset className={css.group} disabled={disabled}>
      <legend className={css.legend}>{t(`identity.${list}.title`)}</legend>
      <p className={css.hint}>{t(`identity.${list}.hint`)}</p>
      {readOnly && entries.length === 0
        ? <p className={css.none}>{t('identity.none')}</p>
        : (
          <ul className={css.entries}>
            {rows.map((entry, index) => (
              <li key={index} className={css.entry}>
                <Input className={clsx(css.field)} value={entry} placeholder={field} aria-label={`${field} ${String(index + 1)}`}
                  readOnly={readOnly} autoFocus={index === added} onChange={(event) => { model.edit(list, index, event.target.value) }} />
                {!readOnly && (
                  <button type="button" className={css.remove} aria-label={t('identity.remove', { field, number: index + 1 })}
                    onClick={() => { model.remove(list, index) }}>
                    <IconCloseOutlineRegular size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      {!readOnly && <Button variant="ghost" size="sm" icon={<IconPlusOutlineRegular size={16} />} className={css.add}
        onClick={() => {
          setAdded(rows.length)
          // An empty list shows one empty field; Add then adds a second one after it.
          if (entries.length === 0) model.edit(list, 0, '')
          model.add(list)
        }}>
        {t(`identity.${list}.add`)}
      </Button>}
    </fieldset>
  )
}
