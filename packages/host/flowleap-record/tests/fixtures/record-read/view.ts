/**
 * The matter FL-2026-0001 at record position 7: one R.71(3) communication dated 2025-10-30 and the deadline the engine
 * proposed from it (four months from the day after delivery, the month end of February, the Saturday rolled to Monday
 * 2026-03-02), the client rules that allow AI letters, the Ticket of the event while its run runs, and the letter in
 * the e-file. The view hash is the SHA-256 of the canonical JSON of the view, as the Firm Record computes it.
 */

import { createHash } from 'node:crypto'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type {
  DeadlineId, DocumentSha256, LocalDate, MatterFileNumber, MatterViewBase, MatterViewR1, OfficeEventId, RecordSeq, RuleId,
  TicketId, ViewHash,
} from '../../../src/types.ts'

const date = (value: string): LocalDate => brandString<LocalDate>(value)

/** SHA-256 of the forwarded R.71(3) communication. */
export const LETTER_SHA256 = brandString<DocumentSha256>('5f2c8a1e9b7d4c3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a')

const unhashed: Omit<MatterViewBase, 'viewHash'> & MatterViewR1 = {
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
  clientRules: {
    seq: brandNumber<RecordSeq>(3),
    aiUse: 'allowed',
    aiLetters: 'allowed',
    reportEvents: 'all-office-actions',
    language: 'en',
    text: 'Report every office action in English to the IP department, never to the inventor directly.',
  },
  officeEvents: [{
    id: brandString<OfficeEventId>('oe-1'),
    seq: brandNumber<RecordSeq>(5),
    code: 'EPO:R71(3)',
    documentDate: date('2025-10-30'),
    applicationNumber: 'EP23812345.6',
    document: LETTER_SHA256,
    state: 'observed',
  }],
  tickets: [{ id: brandString<TicketId>('tk-1'), pass: 1, state: 'running', routedTo: 'A. Novak' }],
  documents: [{ sha256: LETTER_SHA256, fileName: 'R71-3-communication.pdf', mediaType: 'application/pdf', source: 'mail' }],
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
export const VIEW: MatterViewBase & MatterViewR1 = {
  ...unhashed,
  viewHash: brandString<ViewHash>(createHash('sha256').update(canonical(unhashed)).digest('hex')),
}
