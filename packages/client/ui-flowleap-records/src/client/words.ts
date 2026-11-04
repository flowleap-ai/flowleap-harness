/**
 * The words of the IPMS views for values that the Records API sends as codes: a letter's title from its office
 * event code, an actor's name, an Activity event's text, a due date's days left and a list time. Codes, event
 * types and record positions themselves show only in Audit (R19).
 */

import { createElement, type ReactNode } from 'react'
import {
  IconAgentPresetOutlineRegular, IconEnhanceOutlineRegular, IconPaperPlaneOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActivityEvent, Actor, IsoDate, IsoTime, QueueStatus } from './api.ts'
import { dueDay, listTime } from './format.ts'
import type { FlowleapRecordsKey } from './locales.ts'
import type { ActivityLine, AuditRow } from './parts/Activity.tsx'

/** The translate function of the namespace. */
export type Translate = (key: FlowleapRecordsKey, params?: Record<string, unknown>) => string

/** The title key of each office event code that the views word. */
const CODE_TITLES: Readonly<Record<string, FlowleapRecordsKey>> = {
  'EPO:R71(3)': 'code.epoR71',
  'EPO:ART94(3)': 'code.epoArt94',
  'EPO:EESR': 'code.epoSearchReport',
  'EPO:SUMMONS': 'code.epoSummons',
  'EPO:RENEWAL': 'code.epoRenewal',
  'EPO:R161': 'code.epoR161',
  'EPO:GRANT': 'code.epoGrant',
  'DPMA:EXAM': 'code.dpmaExamination',
  'DPMA:OA': 'code.dpmaOfficeAction',
  'DPMA:RECEIPT': 'code.dpmaReceipt',
  'USPTO:NOA': 'code.usptoAllowance',
  'USPTO:NFOA': 'code.usptoNonFinal',
  'WIPO:ISR': 'code.wipoSearchReport',
  'WIPO:WO': 'code.wipoOpinion',
}

/**
 * A letter's title in the person's words: the office event, or a plain kind when the code is unknown.
 * @param t - the translate function.
 * @param code - the office event code, such as `EPO:R71(3)`.
 * @param status - the letter's state; an unreadable letter has its own title.
 * @returns the title, never the code.
 */
export function letterTitle(t: Translate, code: string | null, status?: QueueStatus): string {
  if (status?.machine === 'intake' && status.state === 'unreadable') return t('code.unreadable')
  const key = code === null ? undefined : CODE_TITLES[code]
  return t(key ?? 'code.unknown')
}

/** The name key of each system actor. */
const SYSTEM_NAMES = { flowleap: 'actor.flowleap', mailbox: 'actor.mailbox', agent: 'actor.agent' } as const

const SYSTEM_ICONS = {
  flowleap: IconEnhanceOutlineRegular,
  mailbox: IconPaperPlaneOutlineRegular,
  agent: IconAgentPresetOutlineRegular,
} as const

/**
 * An actor's name: a person's display name, or the name of FlowLeap, the AI mailbox, or the patent agent.
 * @param t - the translate function.
 * @param actor - the actor.
 * @returns the name.
 */
export function actorName(t: Translate, actor: Actor): string {
  return actor.kind === 'person' ? actor.person.name : t(SYSTEM_NAMES[actor.name])
}

/** The text key of each Activity event type that the views word. */
const EVENT_TEXTS: Readonly<Record<string, FlowleapRecordsKey>> = {
  'document/stored': 'event.intakeStored',
  'document/read': 'event.intakeRead',
  'document/match-proposed': 'event.intakeMatchProposed',
  'document/filed': 'event.intakeFiled',
  'document/not-relevant': 'event.intakeNotRelevant',
  'document/unreadable': 'intake.event.unreadable',
  'document/unmatched': 'intake.event.unmatched',
  'document/duplicate': 'intake.event.duplicate',
  'document/matched': 'intake.event.matched',
  'office-event/observed': 'intake.event.observed',
  'office-event/code-proposed': 'intake.event.codeProposed',
  'deadline/proposed': 'event.deadlineProposed',
  'deadline/confirmed': 'event.deadlineConfirmed',
  'deadline/rejected': 'event.deadlineRejected',
  'ticket/routed': 'event.ticketRouted',
  'ticket/decided': 'event.ticketDecided',
  'report/proposed': 'event.reportProposed',
  'outbox/sent': 'event.replySent',
  'matter/opened': 'event.matterOpened',
  'ticket/opened': 'event.ticketOpened',
  'ticket/wake-started': 'event.ticketWakeStarted',
  'ticket/run-started': 'event.ticketRunStarted',
  'ticket/proposals-ready': 'event.ticketProposalsReady',
  'ticket/run-failed': 'event.ticketRunFailed',
  'ticket/by-hand': 'event.ticketByHand',
  'report/approved': 'event.reportApproved',
  'report/rejected': 'event.reportRejected',
  'outbox/composed': 'event.replyComposed',
  'outbox/queued': 'event.replyQueued',
  'outbox/drafted': 'event.replyDrafted',
  'outbox/send-requested': 'event.replySendRequested',
  'office-event/recorded': 'event.officeEventRecorded',
  'deadline/engine-refused': 'event.deadlineEngineRefused',
  'client/rules-recorded': 'event.clientRulesRecorded',
  'firm/model-provider-recorded': 'event.modelProviderRecorded',
  'ticket/event-joined': 'event.ticketEventJoined',
  'ticket/cancelled': 'event.ticketCancelled',
  'outbox/refused': 'event.replyRefused',
  'outbox/retrying': 'event.replyRetrying',
  'outbox/dead': 'event.replyDead',
}

/** The text key of an event type whose text names the person it is for, when the event names no person. */
const WITHOUT_PERSON: Readonly<Partial<Record<FlowleapRecordsKey, FlowleapRecordsKey>>> = {
  'event.ticketRouted': 'event.ticketRoutedPlain',
}

/** How the views write times and dates. */
export interface WordContext {
  readonly t: Translate
  /** The UI language. */
  readonly locale: string
  /** The time now, epoch milliseconds. */
  readonly now: number
  /** The time zone; the browser's when absent. */
  readonly timeZone?: string | undefined
}

/**
 * A time as a list writes it: `14:16` today, "Yesterday", or a short date.
 * @param words - the word context.
 * @param time - the time.
 * @returns the text.
 */
export function listTimeText(words: WordContext, time: IsoTime): string {
  const shown = listTime(time, words.now, words.locale, words.timeZone)
  return shown.kind === 'yesterday' ? words.t('time.yesterday') : shown.text
}

/**
 * Days left to a due date, written out (R11): "117 days left", "Due tomorrow", "Due today", "Overdue by 3 days".
 * @param words - the word context.
 * @param due - the due date.
 * @returns the text.
 */
export function dueText(words: WordContext, due: IsoDate): string {
  const day = dueDay(due, words.now, words.timeZone)
  switch (day.kind) {
    case 'overdue': return day.days === 1 ? words.t('due.overdueOne') : words.t('due.overdue', { count: day.days })
    case 'today': return words.t('due.today')
    case 'tomorrow': return words.t('due.tomorrow')
    case 'left': return words.t('due.left', { count: day.days })
  }
}

/**
 * The Activity lines of a record's events, oldest first.
 * @param words - the word context.
 * @param events - the events.
 * @returns the worded lines.
 */
export function activityLines(words: WordContext, events: readonly ActivityEvent[]): ActivityLine[] {
  return events.map((event) => {
    const params = { person: event.for?.name ?? '' }
    const text = EVENT_TEXTS[event.type] ?? 'event.other'
    const key = event.for === null ? WITHOUT_PERSON[text] ?? text : text
    const actor = event.actor.kind === 'person'
      ? { kind: 'person' as const, person: event.actor.person }
      : { kind: 'system' as const, name: actorName(words.t, event.actor), icon: systemIcon(event.actor.name) }
    return { key: String(event.seq), actor, text: words.t(key, params), time: listTimeText(words, event.at) }
  })
}

/**
 * The 12px glyph of a system actor.
 * @param name - the system actor.
 * @returns the glyph.
 */
function systemIcon(name: keyof typeof SYSTEM_ICONS): ReactNode {
  return createElement(SYSTEM_ICONS[name], { size: 12 })
}

/**
 * The Audit rows of a record's events: the record position, the event type and the time, verbatim.
 * @param events - the events.
 * @returns the rows.
 */
export function auditRows(events: readonly ActivityEvent[]): AuditRow[] {
  return events.map(event => ({ key: String(event.seq), cells: [String(event.seq), event.type, event.at] }))
}
