/**
 * The open letter of Intake: the eyebrow, the title and the lede; the three key properties beside the list from
 * 1366px, or the properties panel on the item page below it; the drawing of the letter from reader 1's fields with
 * the read spans marked; the reasons with their quotes; Activity; and the docked decision bar. Which decision the bar
 * offers follows the letter's atlas state and whether the person may decide (`letterDecision`).
 */

import { useEffect, useState, type ReactNode } from 'react'
import {
  Avatar, Button, IconCheckOutlineRegular, IconCloseOutlineRegular, IconFolderOpenOutlineRegular,
  IconEditOutlineRegular, IconInfoOutlineRegular, IconWarningTriangleOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useActRunner } from '../act-runner.ts'
import type { Command, IntakeDocument, IntakeView, IsoDate, MatterRef, Person, Span } from '../api.ts'
import type { ActsResult } from '../model.ts'
import type { CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import { commandId } from '../keys.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import type { IntakeStep } from '../model.ts'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote } from '../parts/Evidence.tsx'
import { DetailHeader, EvidenceSplit, WorkColumn } from '../parts/Layout.tsx'
import { LetterDrawing, LetterPages, Readings, readTwice } from './evidence.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { formatApplicationNumber, formatDate } from '../format.ts'
import type { FlowleapRecordsKey } from '../locales.ts'
import { avatarOf, fromOffice, letterTitle, listTimeText, personInText, personName } from '../words.ts'
import { actOf, keyedOf, type ScreenContext } from './context.ts'
import { copyLink } from './links.ts'
import { decisionHeading, failureNotice, formNumberAudit, RecordActivity } from './shared.tsx'
import { formatDay } from './detail.tsx'
import css from './Intake.module.css'
import detail from './Detail.module.css'

/** What the decision bar of a letter offers. */
export type LetterDecision =
  /** A proposed matter that the person may accept: Accept and file, Other matter…, Not relevant…. */
  | { readonly kind: 'match'; readonly proposed: NonNullable<IntakeDocument['proposed']> }
  /** No proposal the person may accept: pick a matter, or Not relevant…. */
  | { readonly kind: 'pick' }
  /** The proposal is for another team's matter: the person may file the letter on a matter the person can see. */
  | { readonly kind: 'other-team' }
  /** The reading of an office event waits for a person: record it. */
  | { readonly kind: 'code' }
  /**
   * The scan has no reading: the person reads the page and enters the office event, which also files the scan. The
   * Records API has no command for it yet, so the bar shows the step and blocks its act.
   */
  | { readonly kind: 'hand' }
  /** No act for this person now: the bar says who decides, or that the letter waits. */
  | { readonly kind: 'none'; readonly why: string }
  /**
   * The letter is filed and FlowLeap reads its office event before a person checks it: the person's filing is done,
   * so the bar says so and what comes next.
   */
  | { readonly kind: 'filed'; readonly fileNumber: MatterRef['fileNumber'] }
  /** The letter is filed and its office event recorded: the deadline page has the next decision, so no bar shows. */
  | { readonly kind: 'done' }

/**
 * The decision that the bar of a letter offers.
 * @param ctx - the screen context.
 * @param letter - the letter.
 * @returns the decision.
 */
export function letterDecision(ctx: ScreenContext, letter: IntakeDocument): LetterDecision {
  const may = letter.mayDecide
  if (letter.status.machine === 'deadline' && letter.status.state !== 'code_proposed' && letter.status.state !== 'awaiting_code') return { kind: 'done' }
  if (!may.allowed) {
    if (may.reason === 'not-ready' && letter.filed !== null) return { kind: 'filed', fileNumber: letter.filed.fileNumber }
    if (may.reason === 'not-in-team') return { kind: 'other-team' }
    if (may.reason === 'not-ready') return { kind: 'none', why: ctx.t('intake.decision.notReady') }
    return { kind: 'none', why: may.decider === null ? ctx.t('decision.notYours') : ctx.t('decision.decider', { person: personName(ctx.t, may.decider) }) }
  }
  if (letter.status.machine === 'deadline') return { kind: 'code' }
  // The card offers the hand entry (`entry`) for a scan with no reading, and for a letter whose office event no reader
  // could tell.
  if (letter.entry !== null || letter.status.state === 'unreadable') return { kind: 'hand' }
  return letter.status.state === 'match_proposed' && letter.proposed !== null ? { kind: 'match', proposed: letter.proposed } : { kind: 'pick' }
}

/** One date that a reader read, with the reading it comes from. */
interface DateChoice {
  readonly source: 'text' | 'image'
  readonly date: IsoDate
}

/**
 * The two dates of a letter whose readings differ on its date, so the person chooses the date that the letter bears.
 * @param letter - the letter.
 * @returns the date from the text and the date from the page image, or null when the card has no second reading or
 * the readings agree on the date.
 */
export function differingDates(letter: Pick<IntakeDocument, 'readers'>): readonly [DateChoice, DateChoice] | null {
  const text = letter.readers.code?.result?.documentDate ?? null
  const image = letter.readers.model?.result?.documentDate ?? null
  return text === null || image === null || text === image ? null : [{ source: 'text', date: text }, { source: 'image', date: image }]
}

/**
 * Whether reader 1 could not read the letter (a scan with no text), so any code on the card is a person's entry.
 * @param letter - the letter.
 * @returns true when the record holds the letter's `document/unreadable` event.
 */
function readNothing(letter: Pick<IntakeDocument, 'activity'>): boolean {
  return letter.activity.some(event => event.type === 'document/unreadable')
}

/**
 * Whether reader 1 read the date or the application number of a letter whose office event it could not tell: the
 * record stores such a letter as `unreadable` and keeps the reading, so the hand entry starts from the read values.
 * @param letter - the letter.
 * @returns true when the card quotes the date or the application number.
 */
function readValues(letter: Pick<IntakeDocument, 'fields'>): boolean {
  return letter.fields.documentDate !== undefined || letter.fields.applicationNumber !== undefined
}

/** One reason that FlowLeap gives for its reading or its proposal. */
interface Reason {
  readonly key: string
  readonly ok: boolean
  readonly text: ReactNode
}

/**
 * Render a span as its quote with the page.
 * @param ctx - the screen context.
 * @param span - the span.
 * @returns the quote.
 */
function quote(ctx: ScreenContext, span: Span): ReactNode {
  return <EvidenceQuote span={span} labels={{ page: ctx.t('evidence.page', { page: span.page }), excerpt: ctx.t('evidence.excerpt', { page: span.page }), exact: ctx.t('evidence.exact') }} />
}

/**
 * The reasons of a letter: what reader 1 read, with its quotes, and what the record holds for it.
 * @param ctx - the screen context.
 * @param letter - the letter.
 * @returns the reasons.
 */
export function reasonsOf(ctx: ScreenContext, letter: IntakeDocument): Reason[] {
  const { t } = ctx
  const reasons: Reason[] = []
  if (letter.status.machine === 'intake' && letter.status.state === 'unreadable') {
    reasons.push({ key: 'unreadable', ok: false, text: t(readValues(letter) ? 'intake.reason.noCode' : 'intake.reason.unreadable') })
  }
  const reference = letter.fields.reference
  const number = letter.fields.applicationNumber
  if (letter.proposed?.matchedBy === 'application-number' && number !== undefined) {
    reasons.push({
      key: 'application',
      ok: true,
      text: <>{t('intake.reason.application', { page: number.span.page, number: formatApplicationNumber(number.value) })} {quote(ctx, number.span)}</>,
    })
  } else if (letter.filed !== null) {
    // A filed letter's matter is in the lede; the search for a matter by its reference no longer applies.
  } else if (reference === undefined) {
    if (letter.status.machine === 'intake' && letter.status.state === 'unmatched') reasons.push({ key: 'reference', ok: false, text: t('intake.reason.noReference') })
  } else {
    reasons.push({ key: 'reference', ok: true, text: <>{t('intake.reason.reference', { page: reference.span.page })} {quote(ctx, reference.span)}</> })
    const matters = letter.candidates
    reasons.push({
      key: 'matters',
      ok: matters === 1,
      text: matters === 1 ? t('intake.reason.oneMatter') : matters === 0 ? t('intake.reason.noMatter') : t('intake.reason.matters', { count: matters }),
    })
  }
  // A scan that reader 1 could not read got its code from a person's hand entry, which is no reading of FlowLeap.
  if (letter.code !== null && !readNothing(letter)) {
    const office = letter.office ?? letter.code.replace(/:.*$/u, '')
    const words = { title: letterTitle(t, letter.code), from: fromOffice(t, office) }
    // The title line's span supports the kind; the date has its own. A reading without a title quotes nothing for the
    // kind: the form code is not the person's word (R19) and shows only in Audit.
    const { title, documentDate: date } = letter.fields
    const sentence = letter.documentDate === null
      ? t('intake.reason.kind', words)
      : t('intake.reason.kindOf', { ...words, date: formatDate(letter.documentDate, ctx.locale) })
    // The sentence comes first and each quote under it, so no clause breaks onto a line of its own.
    reasons.push({
      key: 'kind',
      ok: true,
      text: (
        <>
          {sentence}
          {[title, date].flatMap(field => field === undefined ? [] : [<span key={field.span.start}>{quote(ctx, field.span)}</span>])}
        </>
      ),
    })
  } else if (letter.code === null && !readNothing(letter) && letter.status.machine === 'intake' && letter.status.state !== 'unreadable') {
    reasons.push({ key: 'kind', ok: false, text: t('intake.reason.noCode') })
  }
  return reasons
}

/**
 * The title of a letter: its office event, or, for a letter whose office event no reader could tell, the date it
 * bears.
 * @param ctx - the screen context.
 * @param letter - the letter.
 * @returns the title.
 */
function titleOf(ctx: ScreenContext, letter: IntakeDocument): string {
  const date = letter.documentDate ?? isoDateOf(letter.fields.documentDate?.value)
  return letter.code === null && date !== null
    ? ctx.t('letter.titleOf', { date: formatDay(date, ctx.locale) })
    : letterTitle(ctx.t, letter.code, letter.status)
}

/**
 * A date that reader 1 quoted, when it is a calendar date.
 * @param value - the quoted value.
 * @returns the date, or null.
 */
function isoDateOf(value: string | undefined): IsoDate | null {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value as IsoDate : null
}

/**
 * Who the letter waits for, by the bar's decision: the person when the decision is theirs, FlowLeap while it reads a
 * filed letter, nobody once it is done.
 * @param decision - the decision of the bar.
 * @returns the text key of the line after the eyebrow pill.
 */
function sinceKey(decision: LetterDecision): FlowleapRecordsKey {
  switch (decision.kind) {
    case 'filed': return 'letter.waitsFlowLeap'
    case 'done': return 'letter.doneSince'
    case 'match':
    case 'pick':
    case 'code':
    case 'hand': return 'item.sinceYou'
    default: return 'item.since'
  }
}

/**
 * Why the person may decide, at the right of the bar's header: the person's part in the matter, as the mockups word
 * it. The firm role names it; the card names no role of the person in the matter.
 * @param ctx - the screen context.
 * @param decision - the decision of the bar.
 * @param matter - the proposed or filed matter.
 * @returns the line, or undefined when the decision is not this person's.
 */
function whyLine(ctx: ScreenContext, decision: LetterDecision, matter: MatterRef['fileNumber'] | null): string | undefined {
  if (decision.kind === 'none' || decision.kind === 'other-team') return undefined
  if (ctx.me?.role === 'formalities' && matter !== null) return ctx.t('letter.why.formalities', { matter })
  return ctx.t(decision.kind === 'code' ? 'letter.why.record' : 'intake.decision.why')
}

/**
 * The second sentence of the lede: what the record found for the letter.
 * @param ctx - the screen context.
 * @param letter - the letter.
 * @returns the sentence, or null when there is nothing to add.
 */
function ledeOf(ctx: ScreenContext, letter: IntakeDocument): string | null {
  const { t } = ctx
  if (letter.filed !== null) return t('intake.lede.filed', { matter: letter.filed.fileNumber })
  const status = letter.status
  if (status.machine === 'deadline') return status.state === 'code_proposed' ? t('intake.lede.codeProposed') : null
  switch (status.state) {
    case 'match_proposed': return letter.proposed?.matchedBy === 'application-number'
      ? t('intake.lede.matchApplication', { page: letter.fields.applicationNumber?.span.page ?? 1 })
      : t('intake.lede.matchProposed', { page: letter.fields.reference?.span.page ?? 1 })
    case 'unmatched': return t('intake.lede.unmatched')
    case 'ambiguous': return t('intake.lede.ambiguous')
    case 'unreadable': return t(readValues(letter) ? 'intake.lede.noCode' : 'intake.lede.unreadable')
    case 'kind_proposed': return t('intake.lede.kindProposed')
    case 'duplicate_proposed': return t('intake.lede.duplicateProposed')
    case 'not_relevant': return t('intake.lede.notRelevant')
    default: return null
  }
}

/**
 * Render a person or nobody as an avatar and the name: the display name, or the words for a person the os does not
 * name, such as a forwarder outside the team.
 * @param props.ctx - the screen context.
 * @param props.person - the person.
 * @returns the person.
 */
function Who({ ctx, person }: { ctx: ScreenContext; person: Person | null }) {
  return person === null
    ? <>{ctx.t('matter.none')}</>
    : <span className={css.who}><Avatar person={avatarOf(ctx.t, person)} nameShown />{personName(ctx.t, person)}</span>
}


/**
 * Render the matter picker of the Other matter step: only the matters that the person may see, and a footer that
 * says so (product rule 8).
 * @param props.ctx - the screen context.
 * @param props.matters - the matters.
 * @param props.picked - the chosen matter.
 * @param props.open - the menu is open.
 * @param props.onOpenChange - open or close the menu.
 * @param props.onPick - choose a matter.
 * @returns the picker.
 */
function MatterPicker({ ctx, matters, picked, open, onOpenChange, onPick }: {
  ctx: ScreenContext
  matters: readonly MatterRef[]
  picked: MatterRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (matter: MatterRef) => void
}) {
  return (
    <Menu
      open={open}
      side="top"
      align="end"
      portal
      autoFocus
      selectedId={picked?.fileNumber}
      items={matters.map(matter => ({ id: matter.fileNumber, label: `${matter.fileNumber} ${matter.title}` }))}
      footer={[{ type: 'label', id: 'wall', text: ctx.t('intake.pick.wall') }]}
      onSelect={(id) => {
        onOpenChange(false)
        for (const matter of matters) if (matter.fileNumber === id) onPick(matter)
      }}
      onClose={() => { onOpenChange(false) }}
      anchor={(
        <Button variant="outline" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => { onOpenChange(!open) }}>
          {picked === null ? ctx.t('intake.pick.choose') : ctx.t('intake.pick.change')}
        </Button>
      )}
    />
  )
}

/** What the person enters from the page of a scan with no reading. */
export interface HandValues {
  readonly fileNumber: string
  readonly applicationNumber: string
  readonly code: string
  readonly documentDate: string
}

/**
 * The filing act of a hand entry, or null while a value is missing.
 * @param letter - the letter.
 * @param values - what the person entered.
 * @returns the command.
 */
export function handCommand(letter: Pick<IntakeDocument, 'document' | 'matters'>, values: HandValues): Command | null {
  const matter = letter.matters.find(item => item.fileNumber === values.fileNumber)
  const applicationNumber = values.applicationNumber.trim()
  if (matter === undefined || applicationNumber === '' || values.code === '' || !/^\d{4}-\d{2}-\d{2}$/u.test(values.documentDate)) return null
  return {
    kind: 'intake.file', document: letter.document, fileNumber: matter.fileNumber, code: values.code,
    documentDate: values.documentDate as IsoDate, applicationNumber,
  }
}

/**
 * Render the fields of the hand entry of a scan with no reading: the matter, the application number, the office
 * event and the date of the letter, read from the page by the person. Filing the scan and recording its office event
 * are one act of the decision bar.
 * @param props.ctx - the screen context.
 * @param props.letter - the letter.
 * @param props.values - what the person entered.
 * @param props.onChange - a field changed.
 * @returns the fields.
 */
/**
 * Who confirms the deadline of a hand entry on the matter that the person picked: before the filing the card names
 * nobody, so this asks the record for the picked matter, and forgets the answer when the pick changes.
 * @param ctx - the screen context.
 * @param letter - the scan.
 * @param fileNumber - the picked matter, or empty.
 * @returns the next confirmer, or null before an answer or for no pick.
 */
function useHandConfirmer(ctx: ScreenContext, letter: IntakeDocument, fileNumber: string): IntakeDocument['nextConfirmer'] {
  const [next, setNext] = useState<IntakeDocument['nextConfirmer']>(null)
  const read = ctx.nextConfirmer
  const picked = letter.entry === null ? undefined : letter.matters.find(matter => matter.fileNumber === fileNumber)?.fileNumber
  useEffect(() => {
    setNext(null)
    if (picked === undefined) return undefined
    const controller = new AbortController()
    void read(letter.document, picked, controller.signal).then((result) => {
      if (!controller.signal.aborted && result.ok) setNext(result.value)
    })
    return () => { controller.abort() }
  }, [read, letter.document, picked])
  return next
}

function HandEntryFields({ ctx, letter, values, onChange }: {
  ctx: ScreenContext
  letter: IntakeDocument
  values: HandValues
  onChange: (values: HandValues) => void
}) {
  const { t } = ctx
  const codes = letter.entry?.codes ?? []
  const set = (field: keyof HandValues) => (event: { currentTarget: { value: string } }) => {
    onChange({ ...values, [field]: event.currentTarget.value })
  }
  return (
    <section aria-label={t('letter.hand.heading')}>
      <h2 className={css.subHeading}>{t('letter.hand.heading')}</h2>
      <div className={css.fields}>
        <label className={css.field}>
          <span className={css.fieldKey}>{t('prop.matter')}</span>
          <select className={css.input} name="fileNumber" value={values.fileNumber} onChange={set('fileNumber')}>
            <option value="">{t('letter.hand.chooseMatter')}</option>
            {letter.matters.map(matter => <option key={matter.fileNumber} value={matter.fileNumber}>{`${matter.fileNumber} ${matter.title}`}</option>)}
          </select>
        </label>
        <label className={css.field}>
          <span className={css.fieldKey}>{t('prop.application')}</span>
          <input className={css.input} name="applicationNumber" autoComplete="off" value={values.applicationNumber} onChange={set('applicationNumber')} />
        </label>
        <label className={css.field}>
          <span className={css.fieldKey}>{t('letter.hand.event')}</span>
          <select className={css.input} name="code" value={values.code} onChange={set('code')} disabled={codes.length === 0}>
            {codes.map(item => <option key={item.code} value={item.code}>{ctx.locale === 'de' ? item.title.de : item.title.en}</option>)}
          </select>
        </label>
        <label className={css.field}>
          <span className={css.fieldKey}>{t('letter.hand.date')}</span>
          <input className={css.input} name="documentDate" type="date" value={values.documentDate} onChange={set('documentDate')} />
          <span className={css.fieldHint}>{t('letter.hand.dateHint')}</span>
        </label>
      </div>
    </section>
  )
}

/**
 * Render one open letter with its decision.
 * @param props.ctx - the screen context.
 * @param props.list - the open list.
 * @param props.letter - the letter.
 * @param props.step - the step that opened with the letter.
 * @param props.onDecided - the decision's act succeeded: the queue opens the next letter.
 * @returns the work column, and the properties panel of the item page.
 */
export function IntakeLetter({ ctx, list, letter, step, onDecided }: {
  ctx: ScreenContext
  list: IntakeView
  letter: IntakeDocument
  step: IntakeStep | undefined
  onDecided: () => void
}) {
  const { t } = ctx
  const decision = letterDecision(ctx, letter)
  const canPick = decision.kind === 'match' || decision.kind === 'pick' || decision.kind === 'other-team'
  const canClose = decision.kind === 'match' || decision.kind === 'pick' || decision.kind === 'hand'
  const [reasonOpen, setReasonOpenState] = useState(step === 'reason' && canClose)
  const [picking, setPicking] = useState((step === 'other-matter' && canPick) || decision.kind === 'pick')
  const [pickerOpen, setPickerOpen] = useState(step === 'other-matter' && canPick)
  const [picked, setPickedState] = useState<MatterRef | null>(null)
  const dates = differingDates(letter)
  const [hand, setHandState] = useState<HandValues>({
    fileNumber: '',
    applicationNumber: letter.applicationNumber ?? letter.fields.applicationNumber?.value ?? '',
    code: letter.entry?.codes[0]?.code ?? '',
    documentDate: letter.documentDate ?? isoDateOf(letter.fields.documentDate?.value) ?? '',
  })
  const handAct = decision.kind === 'hand' ? handCommand(letter, hand) : null
  const handConfirmer = useHandConfirmer(ctx, letter, hand.fileNumber)
  const [chosenDate, setChosenDate] = useState<IsoDate | null>(null)
  const runner = useActRunner(ctx.perform)
  const busy = runner.run.phase === 'running'
  const settle = (sent: Promise<ActsResult | null>) => {
    void sent.then((result) => { if (result !== null && result.failed.length === 0) onDecided() })
  }
  const decide = (command: Command) => { settle(runner.submit([command])) }
  const retry = () => { settle(runner.retry()) }
  // Each change of the decision is a new act: the failure of the last one no longer applies.
  const setReasonOpen = (open: boolean) => {
    setReasonOpenState(open)
    if (open) runner.clear()
  }
  const setPicked = (matter: MatterRef) => {
    setPickedState(matter)
    runner.clear()
  }
  const title = titleOf(ctx, letter)
  const reasons = reasonsOf(ctx, letter)
  const agree = reasons.filter(reason => reason.ok).length
  const agreePage = letter.fields.reference?.span.page ?? 1
  const route = { view: 'intake', list, open: letter.document } as const
  const openLetter = () => { window.open(ctx.contentHref(letter.document), '_blank', 'noopener') }
  const match = (fileNumber: MatterRef['fileNumber']) => { decide({ kind: 'intake.match', document: letter.document, fileNumber }) }
  const startPicking = () => {
    setPicking(true)
    setPickerOpen(true)
    runner.clear()
  }
  const record = (() => {
    if (decision.kind === 'match' && !picking) return () => { match(decision.proposed.fileNumber) }
    if (canPick && picked !== null) return () => { match(picked.fileNumber) }
    if (handAct !== null) return () => { decide(handAct) }
    if (decision.kind === 'code') {
      const event = letter.officeEvent
      const { code, applicationNumber } = letter
      const documentDate = dates === null ? letter.documentDate : chosenDate
      if (event === null || code === null || documentDate === null || applicationNumber === null) return null
      return () => { decide({ kind: 'officeEvent.decide', id: event.id, code, documentDate, applicationNumber }) }
    }
    return null
  })()
  const primaryLabel = decision.kind === 'code'
    ? t(dates === null ? 'intake.act.recordEvent' : 'act.recordDecision')
    : decision.kind === 'hand'
      ? t('letter.hand.act')
      : picking && picked !== null ? t('intake.act.fileOn', { matter: picked.fileNumber }) : t('act.file')
  const matterOf = decision.kind === 'match' ? decision.proposed.fileNumber : letter.filed?.fileNumber ?? null
  useKeyActs(ctx, {
    openLetter,
    ...(record === null ? {} : { record }),
    ...(decision.kind === 'match' && !picking && record !== null ? { accept: record } : {}),
    ...(decision.kind === 'code' && record !== null ? { recordEvent: record } : {}),
    ...(canClose ? { reject: () => { setReasonOpen(true) } } : {}),
    ...(canPick ? { otherMatter: startPicking } : {}),
    ...(matterOf === null ? {} : { goMatter: () => { ctx.navigate({ view: 'matter', fileNumber: matterOf }) } }),
    ...(runner.run.phase === 'failed' ? { retry } : {}),
  }, { failed: runner.run.phase === 'failed' })
  const menuItem: CommandMenuItem = {
    label: title,
    groups: [
      {
        id: 'letter',
        label: t('intake.menu.letter'),
        acts: [
          ...(record === null ? [] : [{
            id: 'record',
            label: decision.kind === 'match' && !picking ? t('act.acceptOn', { matter: decision.proposed.fileNumber }) : primaryLabel,
            commandId: commandId('record'),
            disabled: busy,
            run: record,
          }]),
          ...(canPick ? [{ id: 'other-matter', label: t('act.otherMatterMenu'), commandId: commandId('otherMatter'), run: startPicking }] : []),
          ...(canClose ? [{ id: 'reject', label: t('act.notRelevant'), commandId: commandId('reject'), run: () => { setReasonOpen(true) } }] : []),
          { id: 'open-letter', label: t('intake.act.openLetter'), commandId: commandId('openLetter'), run: openLetter },
          { id: 'copy-link', label: t('intake.act.copyLink'), run: () => { void copyLink(ctx.linkOf(route)) } },
        ],
      },
      {
        id: 'go',
        label: t('intake.menu.go'),
        acts: [
          ...(matterOf === null ? [] : [{ id: 'matter', label: t('intake.menu.goMatter', { matter: matterOf }), commandId: commandId('goMatter'), run: () => { ctx.navigate({ view: 'matter', fileNumber: matterOf }) } }]),
          { id: 'intake', label: t('tab.intake'), commandId: commandId('goIntake'), run: () => { ctx.navigate({ view: 'intake', list: 'waiting', open: null }) } },
        ],
      },
    ],
  }
  useCommandItem(ctx, menuItem)

  const pickPart = (
    <DecisionPart
      icon={<IconFolderOpenOutlineRegular size={16} />}
      title={picked === null ? t('intake.pick.none') : `${picked.fileNumber} ${picked.title}`}
      detail={t('intake.pick.detail')}
      control={(
        <MatterPicker
          ctx={ctx}
          matters={letter.matters}
          picked={picked}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={setPicked}
        />
      )}
    />
  )
  // Who gets Confirm the deadline when this person decides the date or enters the event now (the two-person rule), as
  // the mockups name it: in the part of the two dates when the readings differ, else in the note. Filing decides
  // neither, so its bar names nobody.
  const next = decision.kind === 'hand' ? handConfirmer : decision.kind === 'code' ? letter.nextConfirmer : null
  const nextNote = next === null || (decision.kind === 'code' && dates !== null)
    ? undefined
    : t(next.queued ? 'letter.next.queued' : decision.kind === 'hand' ? 'letter.next.entered' : 'letter.next.decide', { person: personInText(t, next.person) })
  const parts = (() => {
    switch (decision.kind) {
      case 'match': return picking
        ? pickPart
        : <DecisionPart icon={<IconCheckOutlineRegular size={16} />} title={`${decision.proposed.fileNumber} ${decision.proposed.title}`} detail={agree === 1 ? t('intake.decision.agreeOne', { page: agreePage }) : t('intake.decision.agree', { count: agree, page: agreePage })} />
      case 'pick':
      case 'other-team': return picking ? pickPart : undefined
      case 'code': return dates !== null
        ? (
          <>
            <DecisionPart
              icon={<IconCheckOutlineRegular size={16} />}
              title={t('letter.differ.part')}
              detail={chosenDate === null ? t('letter.differ.notChosen') : t('letter.differ.chosen', { date: formatDate(chosenDate, ctx.locale) })}
              control={(
                <span className={detail.segment} data-fdl-part="seg" role="group" aria-label={t('letter.differ.part')}>
                  {dates.map(choice => (
                    <Button
                      key={choice.source}
                      variant="ghost"
                      size="sm"
                      aria-pressed={chosenDate === choice.date}
                      className={chosenDate === choice.date ? detail.on : undefined}
                      onClick={() => { setChosenDate(choice.date); runner.clear() }}
                    >
                      {t(`letter.differ.${choice.source}`, { date: formatDay(choice.date, ctx.locale) })}
                    </Button>
                  ))}
                </span>
              )}
            />
            <DecisionPart
              icon={<IconInfoOutlineRegular size={16} />}
              title={next === null || next.queued ? t('letter.differ.second') : t('letter.next.part', { person: personInText(t, next.person) })}
              detail={next?.queued === true ? t('letter.next.queued', { person: personInText(t, next.person) }) : t('letter.differ.secondWhy')}
            />
          </>
        )
        : (
          <DecisionPart
            icon={<IconCheckOutlineRegular size={16} />}
            title={letter.documentDate === null ? title : t('intake.decision.eventTitle', { title, date: formatDate(letter.documentDate, ctx.locale) })}
            detail={letter.applicationNumber === null ? undefined : t('intake.decision.eventApplication', { number: formatApplicationNumber(letter.applicationNumber) })}
            missing={record === null ? t('intake.decision.eventMissing') : null}
          />
        )
      case 'hand': return (
        <DecisionPart
          icon={<IconEditOutlineRegular size={16} />}
          title={t('letter.hand.part')}
          detail={t('letter.hand.detail')}
          missing={letter.entry === null ? t('letter.hand.unavailable') : handAct === null ? t('letter.hand.incomplete') : null}
        />
      )
      case 'filed': return (
        <DecisionPart
          icon={<IconCheckOutlineRegular size={16} />}
          title={t('letter.done.filed', { matter: decision.fileNumber })}
          detail={t('letter.done.reading')}
        />
      )
      case 'done': return (
        <DecisionPart
          icon={<IconCheckOutlineRegular size={16} />}
          title={letter.filed === null ? t('letter.done.recorded') : t('letter.done.filedRecorded', { matter: letter.filed.fileNumber })}
          detail={t('letter.done.confirm')}
        />
      )
      case 'none': return undefined
    }
  })()
  const showPrimary = decision.kind === 'match' || decision.kind === 'code' || decision.kind === 'hand' || picking
  const finished = decision.kind === 'filed' || decision.kind === 'done'
  const doneActs = matterOf === null ? [] : [actOf(ctx, 'goMatter', t('deadline.goMatter', { matter: matterOf }), () => { ctx.navigate({ view: 'matter', fileNumber: matterOf }) }, { icon: <IconFolderOpenOutlineRegular size={16} /> })]
  const bar = ctx.me === null
    ? null
    : finished
      ? (
        <DecisionBar
          heading={{ person: null, text: t('letter.done.heading') }}
          question={t(decision.kind === 'filed' ? 'letter.done.questionFiled' : 'letter.done.question')}
          labels={{ more: t('decision.more') }}
          parts={parts}
          secondary={doneActs}
          primary={null}
        />
      )
      : (
        <DecisionBar
          heading={decisionHeading(ctx, ctx.me.person, picking ? { allowed: true } : letter.mayDecide)}
          question={decision.kind === 'code' ? t(dates === null ? 'intake.decision.whatLetter' : 'letter.differ.question') : decision.kind === 'hand' ? t('letter.hand.question') : t('decision.whichMatter')}
          why={whyLine(ctx, decision, matterOf)}
          labels={{ more: t('decision.more') }}
          decider={decision.kind === 'none' ? decision.why : decision.kind === 'other-team' && !picking ? t('intake.decision.otherTeam') : null}
          parts={parts}
          note={nextNote}
          failure={failureNotice(ctx, runner.run, retry)}
          negative={canClose
            ? {
              ...keyedOf(ctx, 'reject'),
              label: t('act.notRelevant'),
              icon: <IconCloseOutlineRegular size={16} />,
              open: reasonOpen,
              onOpenChange: setReasonOpen,
              reasonLabel: t('reason.notRelevant'),
              confirmLabel: t('act.markNotRelevant'),
              cancelLabel: t('act.cancel'),
              onConfirm: (reason) => {
                setReasonOpenState(false)
                decide({ kind: 'intake.notRelevant', document: letter.document, reason })
              },
            }
            : undefined}
          secondary={canPick && !picking ? [actOf(ctx, 'otherMatter', t('act.otherMatter'), startPicking, { icon: <IconFolderOpenOutlineRegular size={16} /> })] : []}
          primary={showPrimary
            ? { ...actOf(ctx, 'record', primaryLabel, () => { record?.() }, { icon: <IconCheckOutlineRegular size={16} />, disabled: record === null }), busy }
            : null}
        />
      )

  const lede = ledeOf(ctx, letter)
  const forwarder = letter.mail.forwarder
  const proposed = letter.proposed
  const unreadable = letter.status.machine === 'intake' && letter.status.state === 'unreadable'
  // A scan filed by hand has no reading: the values on the card are the entry, which Activity names.
  const read = !readNothing(letter) || readValues(letter)
  const { readers } = letter
  return (
    <div className={css.item}>
      <WorkColumn decision={bar}>
        <DetailHeader
          eyebrow={(
            <>
              <AtlasPill status={letter.status} word={atlasWord(t, letter.status)} />
              <span className={css.since}>{t(sinceKey(decision), { time: listTimeText(ctx, letter.since) })}</span>
            </>
          )}
          title={title}
          lede={(
            <>
              {forwarder !== null && t('item.forwarded', { person: personName(t, forwarder) })}
              {lede !== null && ` ${lede}`}
            </>
          )}
        />
        <EvidenceSplit evidence={(
          <LetterPages
            ctx={ctx}
            images={letter.pageImages}
            marks={letter.marks}
            fallback={<LetterDrawing ctx={ctx} letter={letter} onOpen={openLetter} />}
            onOpen={openLetter}
          />
        )}>
          {read && (
            <section aria-label={t('letter.read')}>
              <h2 className={css.subHeading}>{t('letter.read')}<span className={css.since}>{` · ${t(readTwice(readers) ? 'letter.readTwice' : 'letter.readOnce')}`}</span></h2>
              <Readings ctx={ctx} readers={readers} />
            </section>
          )}
          {(decision.kind === 'hand' || unreadable) && (
            <HandEntryFields
              ctx={ctx}
              letter={letter}
              values={hand}
              onChange={(next) => {
                setHandState(next)
                runner.clear()
              }}
            />
          )}
          {proposed !== null && (
            <section className={css.found} aria-label={t('prop.proposedMatter')}>
              <h2 className={css.subHeading}>{t('prop.proposedMatter')}</h2>
              <div className={css.matterCard}>
                <div className={css.key}>{proposed.fileNumber}</div>
                <div className={css.matterName}>{proposed.title}</div>
                <div className={css.matterMeta}>
                  {proposed.client}
                  {proposed.responsible !== null && <><span aria-hidden="true">·</span>{t('prop.responsible')}<Who ctx={ctx} person={proposed.responsible} /></>}
                </div>
              </div>
            </section>
          )}
          {reasons.length > 0 && (
            <ul className={css.reasons} aria-label={t('intake.reason.label')}>
              {reasons.map(reason => (
                <li key={reason.key} className={css.reason} data-ok={reason.ok || undefined}>
                  {reason.ok ? <IconCheckOutlineRegular size={16} /> : <IconWarningTriangleOutlineRegular size={16} />}
                  <div>{reason.text}</div>
                </li>
              ))}
            </ul>
          )}
          {decision.kind === 'match' && <p className={css.note}><IconInfoOutlineRegular size={16} />{t(proposed?.matchedBy === 'application-number' ? 'intake.note.confirmApplication' : 'intake.note.confirm')}</p>}
          {decision.kind === 'match' && (
            <section className={css.found} aria-label={t('letter.whenFile')}>
              <h2 className={css.subHeading}>{t('letter.whenFile')}</h2>
              {letter.code === null
                ? <p className={css.reason}><IconWarningTriangleOutlineRegular size={16} /><span>{t('letter.whenFile.noCode')}</span></p>
                : <p className={css.reason} data-ok=""><IconCheckOutlineRegular size={16} /><span>{t('letter.whenFile.deadline')}</span></p>}
            </section>
          )}
        </EvidenceSplit>
        <RecordActivity ctx={ctx} events={letter.activity} audit={formNumberAudit(ctx, letter.fields)} />
      </WorkColumn>
    </div>
  )
}
