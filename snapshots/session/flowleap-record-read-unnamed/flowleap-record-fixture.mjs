/**
 * The Firm Record with one matter as the `flowleapRecord` service: FL-2026-0002 at record position 9, whose responsible
 * attorney has no display name yet (`responsible: null`), with one letter that the intake filed before its event code
 * was decided and its date was read (`code: null`, `documentDate: null`, state `awaiting_code`), and no deadline yet.
 * The view hash is the SHA-256 of the canonical JSON of the view, as the Firm Record computes it.
 */

import { createHash } from 'node:crypto'

/** Cordis plugin name. */
export const name = 'flowleap-record-fixture'

/** SHA-256 of the filed letter. */
const LETTER_SHA256 = '7c1d9e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d'

const VIEW = {
  recordSeq: 9,
  matter: {
    fileNumber: 'FL-2026-0002',
    title: 'Pump seal',
    client: 'Nordwind Energie GmbH',
    responsible: null,
    applicationNumber: null,
    state: 'open',
  },
  deadlines: [],
  clientRules: {
    seq: 3,
    aiUse: 'allowed',
    aiLetters: 'allowed',
    reportEvents: 'all-office-actions',
    language: 'en',
    text: 'Report every office action in English to the IP department, never to the inventor directly.',
  },
  officeEvents: [{
    id: 'oe-2',
    seq: 9,
    code: null,
    documentDate: null,
    applicationNumber: 'EP24812345.1',
    document: LETTER_SHA256,
    state: 'awaiting_code',
  }],
  tickets: [],
  documents: [{ sha256: LETTER_SHA256, fileName: 'scan-2026-11-06.pdf', mediaType: 'application/pdf', source: 'mail' }],
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
