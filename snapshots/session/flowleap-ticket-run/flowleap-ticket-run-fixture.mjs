/**
 * One Ticket run over fixtures. The Firm Record fixture provides `flowleapRecord`: the matter FL-2026-0001 at record
 * position 7 with its Ticket tk-1 running, the two-page text layer of the forwarded letter, and each run command it
 * receives written as JSON under firm-record/ in the working directory, so workspace.expected/ shows what the Firm Record
 * received. Like the Firm Record, the fixture refuses a report whose source has no span, whose quote is not in the text of
 * its page, or whose quote is in it more than once, and it stores the offsets of each quote. The Office fixture provides
 * `flowleapOffice` and writes the letter as UTF-8 text that names the template, the fields, and the blocks.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Cordis plugin name. */
export const name = 'flowleap-ticket-run-fixture'

/** SHA-256 of the forwarded R.71(3) communication. */
const LETTER_SHA256 = '5f2c8a1e9b7d4c3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a'

/** The text layer of the letter, one string per page; a quote of a report must be in the text of its page exactly once. */
const LETTER_PAGES = [
  [
    'Communication under Rule 71(3) EPC',
    'Application No.: EP23812345.6          Date: 30.10.2025',
    'You are informed that the examining division intends to grant a European patent on the basis of the text indicated above.',
  ].join('\n'),
  [
    'Within four months of this communication you must pay the fees for grant and publishing and file a translation of the claims',
    'in the two other official languages. The period under Rule 71(3) EPC cannot be extended.',
  ].join('\n'),
]

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

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** Write one received command under firm-record/ in the working directory. */
function received(file, value) {
  const dir = join(process.cwd(), 'firm-record')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`)
}

/** The run Session id changes with each run; the file records that the command named one. */
const sessionMark = session => typeof session === 'string' && session !== '' ? 'the run Session' : 'none'

const decode = bytes => new TextDecoder().decode(bytes).trim()

/**
 * Check the span of one evidence item the way the Firm Record does.
 * @returns the evidence with the offsets of its quote, or the refusal.
 */
function locate({ document, span }) {
  if (span === undefined) return { error: 'statement_without_span' }
  const page = document === LETTER_SHA256 ? LETTER_PAGES[span.page - 1] : undefined
  const start = page === undefined ? -1 : page.indexOf(span.quote)
  if (start < 0) return { error: 'quote_not_in_letter' }
  if (page.indexOf(span.quote, start + 1) >= 0) return { error: 'quote_ambiguous' }
  return { document, span: { page: span.page, start, end: start + span.quote.length, quote: span.quote } }
}

/** Provide both fixture services. */
export function apply(ctx) {
  ctx.provide('flowleapRecord', {
    matterView: async fileNumber => fileNumber === view.matter.fileNumber ? view : { error: 'not_found' },
    runStarted: async () => ({ recordSeq: 8 }),
    documentText: async document => document === LETTER_SHA256 ? { pages: LETTER_PAGES } : { error: 'not_found' },
    proposeReport: async (ticket, command) => {
      const { content, session, statements, ...rest } = command
      const located = statements.map(statement => ({ text: statement.text, evidence: statement.evidence.map(locate) }))
      const refusal = located.flatMap(statement => statement.evidence).find(item => 'error' in item)
      if (refusal !== undefined) return refusal
      received('report.json', {
        ticket, ...rest, statements: located, session: sessionMark(session), content: { sha256: sha256(content), bytes: content.byteLength },
      })
      return { proposalId: 'p-1', document: sha256(content), recordSeq: 10 }
    },
    finishRun: async (ticket, command) => {
      received('finish.json', { ticket, ...command, session: sessionMark(command.session) })
      return { recordSeq: 12, outbox: { id: 'o-1', state: 'queued' } }
    },
  })
  ctx.provide('flowleapOffice', {
    letter: async request => new TextEncoder().encode(`${[
      `letter on: ${decode(request.template)}`,
      ...Object.entries(request.fields).map(([key, value]) => `field ${key}: ${value}`),
      ...request.blocks.map(block => `${block.kind}: ${block.text}`),
    ].join('\n')}\n`),
  })
}
