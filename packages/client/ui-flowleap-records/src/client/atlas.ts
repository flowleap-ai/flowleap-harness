/**
 * The process atlas states that the Records API sends, with the status shape of each, as
 * `.agents/skills/flowleap-design-language/status-map.md` gives them. The words of each state live in the locale
 * dictionaries under `atlas.<machine>.<state>`; a state never shows by its shape alone.
 */

import type { StatusShape } from '@deepseek-ai/dsh-client-ui-primitives'

/** Every atlas machine that the IPMS screens show, each state with its status shape. */
export const ATLAS = {
  intake: {
    stored: 'run', read: 'run', matched: 'run', unreadable: 'wait', kind_proposed: 'wait', duplicate_proposed: 'wait',
    match_proposed: 'wait', ambiguous: 'wait', unmatched: 'wait', filed: 'ok', duplicate: 'idle', replaced: 'idle',
    not_relevant: 'idle',
  },
  deadline: {
    awaiting_code: 'run', recorded: 'run', code_proposed: 'wait', deadline_proposed: 'wait', manual_proposed: 'wait',
    engine_refused: 'bad', active: 'ok', to_docket: 'ok', rejected: 'bad', stale: 'stale', disputed: 'stale',
    no_event: 'idle', no_period: 'idle', closed_without_act: 'idle',
  },
  ticket: {
    opened: 'run', routed: 'run', waking: 'run', running: 'run', no_person: 'wait', proposals_ready: 'wait',
    decided: 'ok', run_failed: 'bad', observed: 'idle', by_hand: 'idle', cancelled: 'idle',
  },
  report: {
    checking_rule: 'run', proposed: 'wait', approved: 'wait', send_unconfirmed: 'wait', sent: 'ok', rejected: 'bad',
    flagged: 'stale', stale: 'stale', not_needed: 'idle', by_hand: 'idle', withdrawn: 'idle',
  },
  outbox: {
    composed: 'run', queued: 'run', drafted: 'run', send_requested: 'run', retrying: 'run', sent: 'ok', refused: 'bad',
    dead: 'bad',
  },
} as const satisfies Record<string, Record<string, StatusShape>>

/** An atlas machine. */
export type AtlasMachine = keyof typeof ATLAS

/** A state of one atlas machine. */
export type AtlasState<M extends AtlasMachine> = keyof (typeof ATLAS)[M] & string

/** States of the intake machine. */
export type IntakeState = AtlasState<'intake'>
/** States of the deadline machine. */
export type DeadlineState = AtlasState<'deadline'>
/** States of the ticket (work) machine. */
export type TicketState = AtlasState<'ticket'>
/** States of the client report machine. */
export type ReportState = AtlasState<'report'>
/** States of the outbox (reply) machine. */
export type OutboxState = AtlasState<'outbox'>

/** One atlas state with its machine. */
export type AtlasRef = { [M in AtlasMachine]: { readonly machine: M; readonly state: AtlasState<M> } }[AtlasMachine]

/**
 * The status shape of an atlas state.
 * @param ref - the machine and the state.
 * @returns the shape that status-map.md gives the state.
 */
export function shapeOf(ref: AtlasRef): StatusShape {
  switch (ref.machine) {
    case 'intake': return ATLAS.intake[ref.state]
    case 'deadline': return ATLAS.deadline[ref.state]
    case 'ticket': return ATLAS.ticket[ref.state]
    case 'report': return ATLAS.report[ref.state]
    case 'outbox': return ATLAS.outbox[ref.state]
  }
}

/**
 * The locale key of an atlas state's word.
 * @param ref - the machine and the state.
 * @returns `atlas.<machine>.<state>`.
 */
export function atlasKey<R extends AtlasRef>(ref: R): `atlas.${R['machine']}.${R['state']}` {
  return `atlas.${ref.machine}.${ref.state}`
}
