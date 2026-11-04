/**
 * The matter FL-2026-0001 at record position 7: one R.71(3) communication dated 2025-10-30 and the deadline the engine
 * proposed from it (four months from the day after delivery, the month end of February, the Saturday rolled to Monday
 * 2026-03-02). The view hash is the SHA-256 of the canonical JSON of the view, as the Firm Record computes it.
 */

import { createHash } from 'node:crypto'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type {
  DeadlineId, LocalDate, MatterFileNumber, MatterView, RecordSeq, RuleId, ViewHash,
} from '../../../src/types.ts'

const date = (value: string): LocalDate => brandString<LocalDate>(value)

const unhashed: Omit<MatterView, 'viewHash'> = {
  recordSeq: brandNumber<RecordSeq>(7),
  matter: {
    fileNumber: brandString<MatterFileNumber>('FL-2026-0001'),
    title: 'Heat pump control',
    client: 'Nordwind Energie GmbH',
    responsible: 'A. Novak',
    state: 'open',
  },
  deadlines: [{
    id: brandString<DeadlineId>('0b2d5a8e-4c1f-4e7a-9f31-6d2b8c9e1a57'),
    ruleId: brandString<RuleId>('ep.r71-3.grant-communication'),
    ruleVersion: 1,
    due: date('2026-03-02'),
    state: 'proposed',
    trace: [
      { op: 'delivery', from: date('2025-10-30'), to: date('2025-10-30'), cite: 'R.126(2) EPC, OJ EPO 2023 A29' },
      { op: 'start', from: date('2025-10-30'), to: date('2025-10-31'), cite: 'R.131(2) EPC' },
      { op: 'add-period', from: date('2025-10-31'), to: date('2026-02-28'), cite: 'R.71(3) EPC, R.131(4) EPC' },
      { op: 'closure-roll', from: date('2026-02-28'), to: date('2026-03-02'), cite: 'R.134(1) EPC' },
    ],
  }],
}

/**
 * Canonical JSON: keys sorted at every level, no spaces.
 * @param value - a JSON value.
 * @returns its canonical text.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** The view with its hash. */
export const VIEW: MatterView = {
  ...unhashed,
  viewHash: brandString<ViewHash>(createHash('sha256').update(canonical(unhashed)).digest('hex')),
}
