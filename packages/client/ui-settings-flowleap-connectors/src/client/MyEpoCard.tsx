/**
 * The MyEPO card of the approved mockup (`flowleap/docs/mockups/myepo/`, approved on 2026-11-09): a short intro, two
 * rows that open with one click (the details of the four sources, and the setup at the EPO), the write-only fields,
 * Save and test, the test result, and the compact linked card.
 */

import { useId, useState, type ReactNode } from 'react'
import {
  Button, IconApiOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconEllipsisOutlineRegular,
  IconInfoOutlineRegular, IconRefreshOutlineRegular, IconRightUpOutlineRegular, IconShieldOutlineRegular,
  IconWarningTriangleOutlineRegular, Menu, StateDot, type StatusShape,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MyEpoPortfolioView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectorsLocaleKey } from './locales.ts'
import { myEpoDraftComplete, myEpoMode, type MyEpoField, type MyEpoMode, type MyEpoState } from './myepo-store.ts'
import css from './MyEpoCard.module.css'

/** Translate within this package's namespace. */
type Translate = (key: ConnectorsLocaleKey) => string

/** The EPO's guide to the MyEPO APIs for IP management systems. */
export const MYEPO_GUIDE_URL = 'https://link.epo.org/web/understand-our-services/exchange-data-with-us-using-an-api/en-myepo-feature-guide-apis-for-exchanging-information-with-ip-management-systems.pdf'

/** The acts of the card, bound by the owner. */
export interface MyEpoCardActions {
  edit: (field: MyEpoField, text: string) => void
  link: () => void
  test: () => void
  unlink: () => void
  replace: (replacing: boolean) => void
}

/** Props of the card. */
export interface MyEpoCardProps extends MyEpoCardActions {
  state: MyEpoState
  t: Translate
}

/** The status shape and word of each mode; `form` and `linked` depend on the stored link. */
function statusOf(mode: MyEpoMode, state: MyEpoState): [StatusShape, ConnectorsLocaleKey] {
  switch (mode) {
    case 'testing': return ['run', 'myEpoTesting']
    case 'passed': return ['ok', 'myEpoLinked']
    case 'empty': return ['wait', 'myEpoNoPortfolio']
    case 'refused':
    case 'unreachable':
    case 'failed':
      return ['bad', 'myEpoFailed']
    case 'linked':
    case 'form':
      if (state.link.state === 'not-linked') return ['idle', 'myEpoNotLinked']
      return state.link.portfolios === 0 ? ['wait', 'myEpoNoPortfolio'] : ['ok', 'myEpoLinked']
  }
}

/**
 * Format the time of a test in the page's language.
 * @param iso - ISO 8601.
 * @returns the date and time.
 */
export function formatTested(iso: string): string {
  const lang = document.documentElement.lang
  return new Intl.DateTimeFormat(lang === '' ? undefined : lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

const TYPE_KEY: Readonly<Record<MyEpoPortfolioView['type'], ConnectorsLocaleKey>> = {
  applicant: 'myEpoTypeApplicant', representative: 'myEpoTypeRepresentative', association: 'myEpoTypeAssociation', other: 'myEpoTypeOther',
}

const RIGHTS: readonly (readonly [ConnectorsLocaleKey, ConnectorsLocaleKey, ConnectorsLocaleKey])[] = [
  ['myEpoRightMailbox', 'myEpoYes', 'myEpoWhyMailbox'],
  ['myEpoRightFees', 'myEpoNoRights', 'myEpoWhyFees'],
  ['myEpoRightAdmin', 'myEpoNo', 'myEpoWhyAdmin'],
  ['myEpoRightSigning', 'myEpoNo', 'myEpoWhySigning'],
  ['myEpoRightSending', 'myEpoNo', 'myEpoWhySending'],
]

const SOURCES: readonly (readonly [ConnectorsLocaleKey, ConnectorsLocaleKey])[] = [
  ['myEpoApplications', 'myEpoApplicationsDetail'],
  ['myEpoLetters', 'myEpoLettersDetail'],
  ['myEpoDueDates', 'myEpoDueDatesDetail'],
  ['myEpoFees', 'myEpoFeesDetail'],
]

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }): ReactNode {
  return <div className={css.line}><span className={css.lineIcon} aria-hidden="true">{icon}</span><span>{children}</span></div>
}

function Status({ shape, children }: { shape: StatusShape; children: ReactNode }): ReactNode {
  return <span className={css.status}><StateDot shape={shape} />{children}</span>
}

/** One row that opens with a click: its title, its one-line summary, and its content when open. */
function Disclosure({ title, summary, children }: { title: string; summary: string; children: ReactNode }): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <div className={css.disc}>
      <button type="button" className={css.discHead} aria-expanded={open} onClick={() => { setOpen(v => !v) }}>
        <span className={css.discChevron} aria-hidden="true">{open ? <IconChevronDownOutlineRegular /> : <IconChevronRightOutlineRegular />}</span>
        <span className={css.discTitle}>{title}</span>
        <span className={css.discSummary}>{summary}</span>
      </button>
      {open ? <div className={css.discBody}>{children}</div> : null}
    </div>
  )
}

function GuideLink({ t }: { t: Translate }): ReactNode {
  return (
    <a className={css.ext} href={MYEPO_GUIDE_URL} target="_blank" rel="noreferrer">
      <IconRightUpOutlineRegular aria-hidden="true" />{t('myEpoGuide')}
    </a>
  )
}

function Rows({ t, details }: { t: Translate; details: boolean }): ReactNode {
  return (
    <div className={css.discs}>
      {details && (
        <Disclosure title={t('myEpoDetailsTitle')} summary={t('myEpoDetailsSummary')}>
          <ul className={css.reads}>
            {SOURCES.map(([name, detail]) => (
              <li key={name}><div className={css.w}>{t(name)}</div><div className={css.d}>{t(detail)}</div></li>
            ))}
          </ul>
          <Line icon={<IconShieldOutlineRegular />}>{t('myEpoSecretStays')}</Line>
        </Disclosure>
      )}
      <Disclosure title={t('myEpoSetupTitle')} summary={t('myEpoSetupSummary')}>
        <ol className={css.guide}>
          <li><div className={css.w}>{t('myEpoStep1Title')}</div><div className={css.d}>{t('myEpoStep1')}</div></li>
          <li>
            <div className={css.w}>{t('myEpoStep2Title')}</div>
            <div className={css.d}>{t('myEpoStep2')}</div>
            <table className={css.table}>
              <thead><tr><th>{t('myEpoRightColumn')}</th><th>{t('myEpoSettingColumn')}</th><th>{t('myEpoWhyColumn')}</th></tr></thead>
              <tbody>
                {RIGHTS.map(([right, setting, why]) => (
                  <tr key={right}><td>{t(right)}</td><td>{t(setting)}</td><td className={css.secondary}>{t(why)}</td></tr>
                ))}
              </tbody>
            </table>
          </li>
          <li><div className={css.w}>{t('myEpoStep3Title')}</div><div className={css.d}>{t('myEpoStep3')}</div></li>
        </ol>
        <GuideLink t={t} />
      </Disclosure>
    </div>
  )
}

function Intro({ t }: { t: Translate }): ReactNode {
  return (
    <div className={css.body}>
      <p className={css.text}>{t('myEpoIntro')}</p>
      <div className={css.chips}>{SOURCES.map(([name]) => <span key={name} className={css.chip}>{t(name)}</span>)}</div>
      <Line icon={<IconShieldOutlineRegular />}>{t('myEpoReadOnly')}</Line>
      <Line icon={<IconInfoOutlineRegular />}>{t('myEpoReadFlag')}</Line>
    </div>
  )
}

function Fields({ state, t, edit, disabled }: { state: MyEpoState; t: Translate; edit: MyEpoCardActions['edit']; disabled: boolean }): ReactNode {
  const id = useId()
  const fields: readonly (readonly [MyEpoField, ConnectorsLocaleKey])[] = [['clientId', 'myEpoClientId'], ['clientSecret', 'myEpoClientSecret']]
  return (
    <div className={css.part}>
      <div className={css.label}>{t('myEpoCredentials')}</div>
      {fields.map(([field, label]) => (
        <div key={field} className={css.field}>
          <label className={css.fieldLabel} htmlFor={`${id}-${field}`}>{t(label)}</label>
          <input
            id={`${id}-${field}`}
            className={css.input}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            disabled={disabled}
            value={state.draft[field]}
            onChange={(event) => { edit(field, event.target.value) }}
          />
        </div>
      ))}
      <p className={css.hint}>{t('myEpoFieldHint')}</p>
    </div>
  )
}

function Notice({ tone, lead, children }: { tone: 'bad' | 'wait'; lead: string; children: ReactNode }): ReactNode {
  return (
    <div className={css.notice} data-tone={tone} role={tone === 'bad' ? 'alert' : 'status'}>
      <IconWarningTriangleOutlineRegular aria-hidden="true" />
      <div><span className={css.lead}>{lead}</span> {children}</div>
    </div>
  )
}

function Checks({ t, portfolios, mailbox }: { t: Translate; portfolios: number; mailbox: boolean }): ReactNode {
  return (
    <div className={css.checks}>
      <Status shape="ok">{t('myEpoCheckToken')}</Status>
      {portfolios === 0 ? <Status shape="wait">{t('myEpoCheckNoPortfolio')}</Status> : <Status shape="ok">{t('myEpoCheckPortfolios')}</Status>}
      {mailbox ? <Status shape="ok">{t('myEpoCheckMailbox')}</Status> : <Status shape="wait">{t('myEpoCheckNoMailbox')}</Status>}
    </div>
  )
}

function count(t: Translate, n: number): string {
  return `${n} ${t(n === 1 ? 'myEpoPortfolioOne' : 'myEpoPortfolioMany')}`
}

function Footer({ note, children }: { note?: string | undefined; children: ReactNode }): ReactNode {
  return (
    <div className={css.footer}>
      {note === undefined ? null : <span className={css.note}>{note}</span>}
      <div className={css.acts}>{children}</div>
    </div>
  )
}

/** Test, and the menu with Replace credentials and Unlink, in the header of a linked card. */
function HeadActs({ state, t, test, unlink, replace }: Pick<MyEpoCardProps, 'state' | 't' | 'test' | 'unlink' | 'replace'>): ReactNode {
  const [open, setOpen] = useState(false)
  const busy = state.busy !== 'idle'
  return (
    <>
      <Button variant="outline" size="sm" icon={<IconRefreshOutlineRegular />} disabled={busy} onClick={test}>{t('myEpoTest')}</Button>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={[{ id: 'replace', label: t('myEpoReplace') }, { id: 'unlink', label: t('myEpoUnlink') }]}
        onSelect={(id) => {
          setOpen(false)
          if (id === 'replace') replace(true)
          else unlink()
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.more}
            aria-label={t('myEpoMore')}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={busy || !state.link.writable}
            onClick={() => { setOpen(v => !v) }}
          ><IconEllipsisOutlineRegular aria-hidden="true" /></button>
        )}
      />
    </>
  )
}

/**
 * Render the MyEPO card.
 * @param props - the card state, copy and acts.
 * @returns the card.
 */
export function MyEpoCard(props: MyEpoCardProps): ReactNode {
  const { state, t } = props
  const mode = myEpoMode(state)
  const [shape, word] = statusOf(mode, state)
  const linked = state.link.state === 'linked'
  const lastPassed = state.link.state === 'linked' ? state.link.testedAt : undefined
  const failure = state.outcome?.kind === 'failed' ? state.outcome.message : undefined
  const headActs = mode === 'passed' || mode === 'linked'
  const saveTest = (
    <Button variant="primary" size="sm" disabled={!myEpoDraftComplete(state) || state.busy !== 'idle' || !state.link.writable} onClick={props.link}>
      {t('myEpoSaveTest')}
    </Button>
  )
  const cancel = state.replacing ? <Button variant="ghost" size="sm" onClick={() => { props.replace(false) }}>{t('myEpoCancel')}</Button> : null
  const tryAgain = (
    <Button variant="primary" size="sm" icon={<IconRefreshOutlineRegular />} onClick={linked && !state.replacing ? props.test : props.link}>
      {t('myEpoTryAgain')}
    </Button>
  )
  return (
    <div className={css.card}>
      <div className={css.head}>
        <span className={css.mark} aria-hidden="true"><IconApiOutlineRegular /></span>
        <span className={css.name}>{t('myEpoName')}</span>
        <Status shape={shape}>{t(word)}</Status>
        {headActs ? <span className={css.headActs}><HeadActs {...props} /></span> : null}
      </div>
      {state.error === undefined ? null : <p className={css.error} role="alert">{state.error}</p>}
      {mode === 'form' && (
        <>
          {state.replacing ? null : <Intro t={t} />}
          <Rows t={t} details={!state.replacing} />
          <Fields state={state} t={t} edit={props.edit} disabled={!state.link.writable} />
          <Footer note={t('myEpoStaysHere')}>{cancel}{saveTest}</Footer>
        </>
      )}
      {mode === 'testing' && (
        <>
          <Fields state={state} t={t} edit={props.edit} disabled />
          <div className={css.part}>
            <div className={css.label}>{t('myEpoTestSection')}</div>
            <ul className={css.run}>
              {(['myEpoStepToken', 'myEpoStepPortfolios', 'myEpoStepMailbox'] as const).map(step => <li key={step}><Status shape="run">{t(step)}</Status></li>)}
            </ul>
          </div>
          <Footer><Button variant="primary" size="sm" disabled>{t('myEpoTestingButton')}</Button></Footer>
        </>
      )}
      {mode === 'passed' && state.outcome?.kind === 'passed' && (
        <>
          <div className={css.part}>
            <div className={css.label}>{t('myEpoTestPassed')}</div>
            <div className={css.fact}>
              <span className={css.big}>{count(t, state.outcome.portfolios.length)}</span>
              <span>{t('myEpoMayRead')}</span>
              <span className={css.when}>{t('myEpoTested')} {formatTested(state.outcome.testedAt)}</span>
            </div>
            <table className={css.table}>
              <thead><tr><th>{t('myEpoPortfolioColumn')}</th><th>{t('myEpoTypeColumn')}</th><th>{t('myEpoAccessColumn')}</th></tr></thead>
              <tbody>
                {state.outcome.portfolios.map((portfolio, index) => (
                  <tr key={`${index}:${portfolio.name}`}>
                    <td>{portfolio.name}</td>
                    <td className={css.secondary}>{t(TYPE_KEY[portfolio.type])}</td>
                    <td className={css.secondary}>{t(portfolio.fullAccess ? 'myEpoAccessFull' : 'myEpoAccessLimited')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Checks t={t} portfolios={state.outcome.portfolios.length} mailbox={state.outcome.mailbox} />
            <Line icon={<IconInfoOutlineRegular />}>{t('myEpoReadFlag')}</Line>
          </div>
          <Rows t={t} details />
        </>
      )}
      {mode === 'empty' && state.outcome?.kind === 'passed' && (
        <>
          <div className={css.part}>
            <div className={css.label}>{t('myEpoTested')} {formatTested(state.outcome.testedAt)}</div>
            <Notice tone="wait" lead={t('myEpoEmptyLead')}>{t('myEpoEmptyBody')}</Notice>
            <Checks t={t} portfolios={0} mailbox={state.outcome.mailbox} />
          </div>
          <Rows t={t} details />
          <Footer>
            <Button variant="ghost" size="sm" disabled={!state.link.writable} onClick={props.unlink}>{t('myEpoUnlink')}</Button>
            <Button variant="outline" size="sm" disabled={!state.link.writable} onClick={() => { props.replace(true) }}>{t('myEpoReplace')}</Button>
            <Button variant="primary" size="sm" icon={<IconRefreshOutlineRegular />} onClick={props.test}>{t('myEpoTestAgain')}</Button>
          </Footer>
        </>
      )}
      {mode === 'refused' && (
        <>
          <div className={css.part}><Notice tone="bad" lead={t('myEpoRefusedLead')}>{t('myEpoRefusedBody')}</Notice></div>
          <Rows t={t} details />
          <Fields state={state} t={t} edit={props.edit} disabled={!state.link.writable} />
          <Footer note={t('myEpoStaysHere')}>{cancel}{saveTest}</Footer>
        </>
      )}
      {(mode === 'unreachable' || mode === 'failed') && (
        <>
          <div className={css.part}>
            {mode === 'unreachable'
              ? <Notice tone="bad" lead={t('myEpoOfflineLead')}>{t(linked ? 'myEpoOfflineBody' : 'myEpoOfflineBodyNew')}</Notice>
              : <Notice tone="bad" lead={t('myEpoFailedLead')}>{t('myEpoFailedBody')} {failure}</Notice>}
          </div>
          {lastPassed !== undefined && !state.replacing
            ? (
              <Footer note={`${t('myEpoLastPassed')} ${formatTested(lastPassed)}`}>
                <Button variant="outline" size="sm" disabled={!state.link.writable} onClick={() => { props.replace(true) }}>{t('myEpoReplace')}</Button>
                {tryAgain}
              </Footer>
            )
            : (
              <>
                <Fields state={state} t={t} edit={props.edit} disabled={!state.link.writable} />
                <Footer note={t('myEpoStaysHere')}>{cancel}{myEpoDraftComplete(state) ? tryAgain : saveTest}</Footer>
              </>
            )}
        </>
      )}
      {mode === 'linked' && state.link.state === 'linked' && (
        <>
          <div className={css.summary}>
            <span className={css.strong}>{count(t, state.link.portfolios)}</span>
            <span>{t(state.link.mailbox ? 'myEpoCheckMailbox' : 'myEpoCheckNoMailbox')}</span>
            <span>{t('myEpoLastTest')} {formatTested(state.link.testedAt)}</span>
          </div>
          <Rows t={t} details={false} />
        </>
      )}
    </div>
  )
}
