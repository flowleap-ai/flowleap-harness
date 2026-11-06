/**
 * The Firm Record with one matter as the `flowleapRecord` service: FL-2026-0001 at record position 7, with the R.71(3)
 * deadline the engine proposed from a communication dated 2025-10-30 (four months from the day after delivery, the
 * month end of February, the Saturday rolled to Monday 2026-03-02), the client rules, the event's running Ticket, and the
 * letter in the e-file. The view hash is the SHA-256 of the canonical JSON
 * of the view, as the Firm Record computes it.
 */

import { createHash } from 'node:crypto'

/** Cordis plugin name. */
export const name = 'flowleap-record-fixture'

/** SHA-256 of the forwarded R.71(3) communication. */
const LETTER_SHA256 = '5f2c8a1e9b7d4c3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a'

const VIEW = {
  recordSeq: 7,
  matter: {
    fileNumber: 'FL-2026-0001',
    title: 'Heat pump control',
    client: 'Nordwind Energie GmbH',
    responsible: 'A. Novak',
    applicationNumber: 'EP24166597',
    state: 'open',
  },
  deadlines: [{
    id: '0b2d5a8e-4c1f-4e7a-9f31-6d2b8c9e1a57',
    ruleId: 'ep.r71-3.grant-communication',
    ruleVersion: 1,
    due: '2026-03-02',
    state: 'proposed',
    trace: [
      { op: 'delivery', from: '2025-10-30', to: '2025-10-30', cite: 'R.126(2) EPC, OJ EPO 2023 A29' },
      { op: 'start', from: '2025-10-30', to: '2025-10-31', cite: 'R.131(2) EPC' },
      { op: 'add-period', from: '2025-10-31', to: '2026-02-28', cite: 'R.71(3) EPC, R.131(4) EPC' },
      { op: 'closure-roll', from: '2026-02-28', to: '2026-03-02', cite: 'R.134(1) EPC' },
    ],
  }],
  clientRules: {
    seq: 3,
    aiUse: 'allowed',
    aiLetters: 'allowed',
    reportEvents: 'all-office-actions',
    language: 'en',
    text: 'Report every office action in English to the IP department, never to the inventor directly.',
  },
  officeEvents: [{
    id: 'oe-1',
    seq: 5,
    code: 'EPO:R71(3)',
    documentDate: '2025-10-30',
    applicationNumber: 'EP23812345.6',
    document: LETTER_SHA256,
    state: 'observed',
  }],
  tickets: [{ id: 'tk-1', pass: 1, state: 'running', routedTo: 'A. Novak' }],
  documents: [{ sha256: LETTER_SHA256, fileName: 'R71-3-communication.pdf', mediaType: 'application/pdf', source: 'mail' }],
}

/** Canonical JSON: keys sorted at every level, no spaces. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const view = Object.freeze({ ...VIEW, viewHash: createHash('sha256').update(canonical(VIEW)).digest('hex') })

/** Provide the recorded Firm Record; any other file number is not found. */
export function apply(ctx) {
  ctx.provide('flowleapRecord', {
    matterView: async fileNumber => fileNumber === view.matter.fileNumber ? view : { error: 'not_found' },
  })
}
