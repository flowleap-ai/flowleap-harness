/**
 * Sample data of the look-first dashboard (flowleap-harness#60). Every surface that reads this module shows the
 * "Sample data" tag. Replace each value with its real source: the register events of the watched cases (#44) and the
 * gateway budget read method (#32).
 */

/** One register event of a watched case. */
export interface SampleRegisterEvent {
  /** Publication or application number of the case. */
  readonly caseRef: string
  /** Short case name. */
  readonly title: string
  /** Register event or deadline text. */
  readonly event: string
  /** Due day, ISO date. */
  readonly due: string
}

/** The month's spend of one attorney, in euro cents. */
export interface SampleBudget {
  readonly usedCents: number
  readonly limitCents: number
  readonly byAgent: readonly { readonly name: string; readonly usedCents: number }[]
}

/** Register events of watched cases, nearest first. */
export const SAMPLE_COMING_UP: readonly SampleRegisterEvent[] = [
  { caseRef: 'EP 4 123 456', title: 'Battery separator', event: 'Reply to the communication under Art. 94(3) EPC', due: '2026-11-04' },
  { caseRef: 'US 18/234,567', title: 'Wireless charging coil', event: 'Response to the non-final office action', due: '2026-11-12' },
  { caseRef: 'EP 3 987 654', title: 'Drug delivery patch', event: 'Renewal fee, year 6', due: '2026-11-30' },
]

/** Number of cases the register watch reads. */
export const SAMPLE_CASES_WATCHED = 12

/** The attorney's spend this month. */
export const SAMPLE_BUDGET: SampleBudget = {
  usedCents: 18_640,
  limitCents: 50_000,
  byAgent: [
    { name: 'Patent Agent', usedCents: 11_210 },
    { name: 'Office action drafter', usedCents: 5_030 },
    { name: 'Register watch', usedCents: 2_400 },
  ],
}
