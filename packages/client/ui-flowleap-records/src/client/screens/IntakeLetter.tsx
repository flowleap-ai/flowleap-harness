/**
 * The open letter of Intake: the eyebrow, the title and the lede; the three key properties beside the list from
 * 1366px, or the properties panel on the item page below it; the drawing of the letter from reader 1's fields with
 * the read spans marked; the reasons with their quotes; Activity; and the docked decision bar. Which decision the bar
 * offers follows the letter's atlas state and whether the person may decide (`letterDecision`).
 */

import { useState, type ReactNode } from 'react'
import {
  Avatar, Button, IconCheckOutlineRegular, IconCloseOutlineRegular, IconFolderOpenOutlineRegular,
  IconInfoOutlineRegular, IconPaperclipOutlineRegular, IconRightUpOutlineRegular, IconWarningTriangleOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useActRunner } from '../act-runner.ts'
import type { Command, IntakeDocument, IntakeView, MatterRef, Person, Span } from '../api.ts'
import type { ActsResult } from '../model.ts'
import type { CommandMenuItem } from '@deepseek-ai/dsh-client-ui-commands/client'
import { commandId } from '../keys.ts'
import { useCommandItem, useKeyActs } from '../key-layer.ts'
import type { IntakeStep } from '../model.ts'
import { ActButton } from '../parts/Act.tsx'
import { DecisionBar, DecisionPart } from '../parts/Decision.tsx'
import { EvidenceQuote } from '../parts/Evidence.tsx'
import { DetailHeader, KeyProperties, PropertiesPanel, WorkColumn, type Property } from '../parts/Layout.tsx'
import { AtlasPill, atlasWord } from '../parts/Status.tsx'
import { formatApplicationNumber, formatDate } from '../format.ts'
import { avatarOf, fromOffice, letterTitle, listTimeText, officeName, personName } from '../words.ts'
import { actOf, keyedOf, type ScreenContext } from './context.ts'
import { letterLines } from '../letter-text.ts'
import { copyLink } from './links.ts'
import { decisionHeading, failureNotice, formNumberAudit, RecordActivity } from './shared.tsx'
import css from './Intake.module.css'

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
  /** No act for this person now: the bar says who decides, or that the letter waits. */
  | { readonly kind: 'none'; readonly why: string }

/**
 * The decision that the bar of a letter offers.
 * @param ctx - the screen context.
 * @param letter - the letter.
 * @returns the decision.
 */
export function letterDecision(ctx: ScreenContext, letter: IntakeDocument): LetterDecision {
  const may = letter.mayDecide
  if (!may.allowed) {
    if (may.reason === 'not-in-team') return { kind: 'other-team' }
    if (may.reason === 'not-ready') return { kind: 'none', why: ctx.t('intake.decision.notReady') }
    return { kind: 'none', why: may.decider === null ? ctx.t('decision.notYours') : ctx.t('decision.decider', { person: personName(ctx.t, may.decider) }) }
  }
  if (letter.status.machine === 'deadline') return { kind: 'code' }
  return letter.status.state === 'match_proposed' && letter.proposed !== null ? { kind: 'match', proposed: letter.proposed } : { kind: 'pick' }
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
    reasons.push({ key: 'unreadable', ok: false, text: t('intake.reason.unreadable') })
  }
  const reference = letter.fields.reference
  if (reference === undefined) {
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
  if (letter.code !== null) {
    const office = letter.office ?? letter.code.replace(/:.*$/u, '')
    const words = { title: letterTitle(t, letter.code), from: fromOffice(t, office) }
    // The title line's span supports the kind; the date has its own. A reading without a title quotes nothing for the
    // kind: the form code is not the person's word (R19) and shows only in Audit.
    const { title, documentDate: date } = letter.fields
    const dated = date === undefined ? null : <>{t('intake.reason.dated')} {quote(ctx, date.span)}</>
    reasons.push({
      key: 'kind',
      ok: true,
      text: title !== undefined
        ? <>{t('intake.reason.kindQuoted', words)} {quote(ctx, title.span)}{dated}</>
        : date === undefined
          ? t('intake.reason.kind', words)
          : <>{t('intake.reason.kindDated', words)} {quote(ctx, date.span)}</>,
    })
  }
  return reasons
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
    case 'match_proposed': return t('intake.lede.matchProposed', { page: letter.fields.reference?.span.page ?? 1 })
    case 'unmatched': return t('intake.lede.unmatched')
    case 'ambiguous': return t('intake.lede.ambiguous')
    case 'unreadable': return t('intake.lede.unreadable')
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
 * Render a drawing of the letter from what reader 1 read: the lines of the page that hold the read values, in the
 * letter's own words and in every UI language, with each read value marked (`letterLines`). It is a picture of the
 * source, so its text is exempt from the deny-list (`data-verbatim`); it never translates or names the letter.
 * @param props.ctx - the screen context.
 * @param props.letter - the letter.
 * @param props.onOpen - open the PDF.
 * @returns the drawing with its page caption and Open the letter.
 */
export function LetterDrawing({ ctx, letter, onOpen }: { ctx: ScreenContext; letter: IntakeDocument; onOpen: () => void }) {
  const { t } = ctx
  const { title, formNumber, documentDate, applicationNumber, reference } = letter.fields
  const read = [title, formNumber, documentDate, reference, applicationNumber].flatMap(field => field === undefined ? [] : [field.span])
  const page = reference?.span.page ?? title?.span.page ?? formNumber?.span.page ?? 1
  return (
    <figure className={css.paper}>
      <div className={css.letter} data-fdl-part="letter" data-verbatim="" aria-label={t('intake.letter.label', { page })} role="img">
        <div className={css.logo} />
        {letterLines(read).map(line => (
          <div key={line.key} className={css.letterLine}>
            {line.cells.map((cell, index) => (
              <span key={index}>
                {cell.map((run, place) => run.read ? <mark key={place} className={css.hl}>{run.text}</mark> : run.text)}
              </span>
            ))}
          </div>
        ))}
        <div className={css.line} />
        <div className={css.line} />
      </div>
      <figcaption className={css.paperCap}>
        <span>{letter.pages === null ? t('intake.letter.pageUnknown', { page }) : t('intake.letter.page', { page, count: letter.pages })}</span>
        <ActButton act={actOf(ctx, 'openLetter', t('intake.act.openLetter'), onOpen, { icon: <IconRightUpOutlineRegular size={16} /> })} rank="tertiary" />
      </figcaption>
    </figure>
  )
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
  const canClose = decision.kind === 'match' || decision.kind === 'pick'
  const [reasonOpen, setReasonOpenState] = useState(step === 'reason' && canClose)
  const [picking, setPicking] = useState((step === 'other-matter' && canPick) || decision.kind === 'pick')
  const [pickerOpen, setPickerOpen] = useState(step === 'other-matter' && canPick)
  const [picked, setPickedState] = useState<MatterRef | null>(null)
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
  const title = letterTitle(t, letter.code, letter.status)
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
    if (decision.kind === 'code') {
      const event = letter.officeEvent
      const { code, documentDate, applicationNumber } = letter
      if (event === null || code === null || documentDate === null || applicationNumber === null) return null
      return () => { decide({ kind: 'officeEvent.decide', id: event.id, code, documentDate, applicationNumber }) }
    }
    return null
  })()
  const primaryLabel = decision.kind === 'code'
    ? t('intake.act.recordEvent')
    : picking && picked !== null ? t('intake.act.fileOn', { matter: picked.fileNumber }) : t('act.acceptFile')
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
  const parts = (() => {
    switch (decision.kind) {
      case 'match': return picking
        ? pickPart
        : <DecisionPart icon={<IconCheckOutlineRegular size={16} />} title={`${decision.proposed.fileNumber} ${decision.proposed.title}`} detail={agree === 1 ? t('intake.decision.agreeOne', { page: agreePage }) : t('intake.decision.agree', { count: agree, page: agreePage })} />
      case 'pick':
      case 'other-team': return picking ? pickPart : undefined
      case 'code': return (
        <DecisionPart
          icon={<IconCheckOutlineRegular size={16} />}
          title={letter.documentDate === null ? title : t('intake.decision.eventTitle', { title, date: formatDate(letter.documentDate, ctx.locale) })}
          detail={letter.applicationNumber === null ? undefined : t('intake.decision.eventApplication', { number: formatApplicationNumber(letter.applicationNumber) })}
          missing={record === null ? t('intake.decision.eventMissing') : null}
        />
      )
      case 'none': return undefined
    }
  })()
  const showPrimary = decision.kind === 'match' || decision.kind === 'code' || picking
  const bar = ctx.me === null
    ? null
    : (
      <DecisionBar
        heading={decisionHeading(ctx, ctx.me.person, picking ? { allowed: true } : letter.mayDecide)}
        question={decision.kind === 'code' ? t('intake.decision.whatLetter') : t('decision.whichMatter')}
        why={decision.kind === 'none' ? undefined : t('intake.decision.why')}
        labels={{ more: t('decision.more') }}
        decider={decision.kind === 'none' ? decision.why : decision.kind === 'other-team' && !picking ? t('intake.decision.otherTeam') : null}
        parts={parts}
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
  const keyRows: Property[] = proposed !== null
    ? [
      { label: t('prop.proposedMatter'), value: <><span className={css.key}>{proposed.fileNumber}</span>{proposed.title}</> },
      { label: t('prop.client'), value: proposed.client },
      { label: t('prop.responsible'), value: <Who ctx={ctx} person={proposed.responsible} /> },
    ]
    : [
      { label: t('prop.matter'), value: letter.filed === null ? t('matter.none') : <><span className={css.key}>{letter.filed.fileNumber}</span>{letter.filed.title}</> },
      { label: t('intake.prop.office'), value: letter.office === null ? t('matter.none') : officeName(t, letter.office) },
      { label: t('intake.prop.received'), value: listTimeText(ctx, letter.mail.receivedAt) },
    ]
  const received: Property = { label: t('intake.prop.received'), value: listTimeText(ctx, letter.mail.receivedAt) }
  const subject: Property = { label: t('intake.prop.subject'), value: letter.mail.subject, title: letter.mail.subject }
  const pages: Property = {
    label: t('intake.prop.document'),
    value: <span className={css.who}><IconPaperclipOutlineRegular size={16} />{letter.pages === null ? letter.fileName : letter.pages === 1 ? t('intake.prop.onePage') : t('intake.prop.pages', { count: letter.pages })}</span>,
    title: letter.fileName,
  }
  const groups = [
    {
      heading: t('intake.prop.letter'),
      rows: [
        { label: t('intake.prop.office'), value: letter.office === null ? t('matter.none') : officeName(t, letter.office) },
        { label: t('intake.prop.type'), value: title },
        { label: t('prop.application'), value: letter.applicationNumber === null ? t('matter.none') : formatApplicationNumber(letter.applicationNumber) },
        pages,
      ],
    },
    {
      heading: t('intake.prop.forward'),
      rows: [
        { label: t('intake.prop.from'), value: <Who ctx={ctx} person={forwarder} /> },
        received,
        subject,
      ],
    },
    ...(proposed === null ? [] : [{
      heading: t('prop.proposedMatter'),
      rows: [
        { label: t('prop.matter'), value: proposed.fileNumber },
        { label: t('prop.client'), value: proposed.client },
        { label: t('prop.responsible'), value: <Who ctx={ctx} person={proposed.responsible} /> },
      ],
    }]),
  ]
  return (
    <div className={css.item}>
      <WorkColumn decision={bar}>
        <DetailHeader
          eyebrow={<><AtlasPill status={letter.status} word={atlasWord(t, letter.status)} /><span className={css.since}>{t('item.since', { time: listTimeText(ctx, letter.since) })}</span></>}
          title={title}
          lede={(
            <>
              {forwarder !== null && t('item.forwarded', { person: personName(t, forwarder) })}
              {lede !== null && ` ${lede}`}
            </>
          )}
        />
        <div className={css.wideOnly}><KeyProperties rows={keyRows} /></div>
        <div className={css.match}>
          <LetterDrawing ctx={ctx} letter={letter} onOpen={openLetter} />
          <div>
            {proposed !== null && (
              <div className={css.narrowOnly}>
                <div className={css.label}>{t('prop.proposedMatter')}</div>
                <div className={css.matterCard}>
                  <div className={css.key}>{proposed.fileNumber}</div>
                  <div className={css.matterName}>{proposed.title}</div>
                  <div className={css.matterMeta}>{proposed.client}<span aria-hidden="true">·</span><Who ctx={ctx} person={proposed.responsible} /></div>
                </div>
              </div>
            )}
            <ul className={css.reasons} aria-label={t('intake.reason.label')}>
              {reasons.map(reason => (
                <li key={reason.key} className={css.reason} data-ok={reason.ok || undefined}>
                  {reason.ok ? <IconCheckOutlineRegular size={16} /> : <IconWarningTriangleOutlineRegular size={16} />}
                  <div>{reason.text}</div>
                </li>
              ))}
            </ul>
            {decision.kind === 'match' && <p className={css.note}><IconInfoOutlineRegular size={16} />{t('intake.note.confirm')}</p>}
          </div>
        </div>
        <section className={css.letterFacts} aria-label={t('intake.prop.letter')}><KeyProperties rows={[received, subject, pages]} /></section>
        <RecordActivity ctx={ctx} events={letter.activity} audit={formNumberAudit(ctx, letter.fields)} />
      </WorkColumn>
      <div className={css.itemProps}>
        <PropertiesPanel label={t('prop.label')} groups={groups} />
      </div>
    </div>
  )
}
