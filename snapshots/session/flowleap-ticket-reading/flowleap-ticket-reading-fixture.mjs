/**
 * One Art. 94(3) reading run over fixtures. The Firm Record fixture provides `flowleapRecord`: the seed firm's matter
 * SF-2023-0042 (EP23755468, Renishaw plc) at record position 7 with its Ticket tk-1 running, and a text layer of real
 * lines of the EPO Form 2001 of 09.06.2026 with its Form 2906 reasons. flowleap-deadlines has no rule for Art. 94(3) yet,
 * so the view has no deadline. Like the Firm Record, the fixture finds each passage of a reading on its page, where a run
 * of whitespace counts as one space in the page and in the quote, refuses a quote that is not on its page or is on it
 * more than once, and stores the place of each quote. It writes the reading and the finish it receives as JSON under
 * firm-record/ in the working directory, so workspace.expected/ shows what the Firm Record received.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Cordis plugin name. */
export const name = 'flowleap-ticket-reading-fixture'

/** SHA-256 of the forwarded Art. 94(3) communication, a fixture value. */
const LETTER_SHA256 = '975704f3e86280baae5bd94410692e46c0549ae5e18a2ff53d8e3485fa7fa101'

/** The text layer of the letter, one string per page. */
const LETTER_PAGES = [
  [
    'Communication pursuant to Article 94(3) EPC',
    'Application No. 23 755 468.8 - 1001    Ref. 1203/EPw/0    Date 09.06.2026',
    'correct the indicated deficiencies within a period',
    'of 4 months',
  ].join('\n'),
  'Application No.: 23 755 468.8',
  [
    'D1 DE 196 11 983 C1 (ZEISS CARL JENA GMBH [DE]) 31 July 1997 (1997-07-31)',
    'D2 US 2011/067255 A1 (KUMMETZ JENS [DE] ET AL) 24 March 2011 (2011-03-24)',
    '1.2 However, the following objections remain.',
  ].join('\n'),
  [
    '2 Clarity',
    '2.1 Claim 1',
    '2.1.1 Claim defines in lines 7-8 a second thermal displacement relief layer. However, the location',
    'of said second thermal displacement relief layer is not defined.',
  ].join('\n'),
  'EPO Form 2906 01.91TRI',
]

const VIEW = {
  recordSeq: 7,
  matter: {
    fileNumber: 'SF-2023-0042',
    title: 'Scale',
    client: 'Renishaw plc',
    responsible: 'Lena Hoffmann',
    applicationNumber: 'EP23755468',
    state: 'open',
  },
  deadlines: [],
  clientRules: {
    seq: 3,
    aiUse: 'allowed',
    aiLetters: 'allowed',
    reportEvents: 'all-office-actions',
    language: 'en',
    text: 'Report every office action in English to the patent department.',
  },
  officeEvents: [{
    id: 'oe-1',
    seq: 5,
    code: 'EPO:A94(3)',
    documentDate: '2026-06-09',
    applicationNumber: 'EP23755468.8',
    document: LETTER_SHA256,
    state: 'observed',
  }],
  tickets: [{ id: 'tk-1', pass: 1, state: 'running', routedTo: 'Lena Hoffmann' }],
  documents: [{ sha256: LETTER_SHA256, fileName: 'A94-3-communication.pdf', mediaType: 'application/pdf', source: 'mail' }],
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

/** Write one received command under firm-record/ in the working directory. */
function received(file, value) {
  const dir = join(process.cwd(), 'firm-record')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`)
}

/** The run Session id changes with each run; the file records that the command named one. */
const sessionMark = session => typeof session === 'string' && session !== '' ? 'the run Session' : 'none'

/**
 * A page with each run of whitespace folded to one space, and the page offset of each folded character, so a match in
 * the folded page maps back to the page.
 */
function fold(page) {
  let text = ''
  const offsets = []
  for (const match of page.matchAll(/\s+|\S/gu)) {
    text += /\s/u.test(match[0]) ? ' ' : match[0]
    offsets.push(match.index)
  }
  offsets.push(page.length)
  return { text, offsets }
}

/**
 * Find one passage on its page the way the Firm Record does.
 * @returns the passage with the page offsets and the page's own text of it, or the refusal.
 */
function locate(document, { page, quote }) {
  const text = document === LETTER_SHA256 ? LETTER_PAGES[page - 1] : undefined
  if (text === undefined) return { error: 'quote_not_in_letter' }
  const folded = fold(text)
  const needle = quote.replace(/\s+/gu, ' ')
  const at = folded.text.indexOf(needle)
  if (at < 0) return { error: 'quote_not_in_letter' }
  if (folded.text.indexOf(needle, at + 1) >= 0) return { error: 'quote_ambiguous' }
  const start = folded.offsets[at]
  const end = folded.offsets[at + needle.length]
  return { page, start, end, quote, pageText: text.slice(start, end) }
}

/** Provide both fixture services. */
export function apply(ctx) {
  ctx.provide('flowleapRecord', {
    matterView: async fileNumber => fileNumber === view.matter.fileNumber ? view : { error: 'not_found' },
    runStarted: async () => ({ recordSeq: 8 }),
    documentText: async document => document === LETTER_SHA256 ? { pages: LETTER_PAGES } : { error: 'not_found' },
    proposeReport: async () => ({ error: 'no_proposals' }),
    proposeReading: async (ticket, command) => {
      if (command.document !== LETTER_SHA256) return { error: 'evidence_outside_matter' }
      const withPlaces = entry => ({ ...entry, evidence: entry.evidence.map(span => locate(command.document, span)) })
      const items = command.items.map(withPlaces)
      const documents = command.documents.map(withPlaces)
      const refusal = [...items, ...documents].flatMap(entry => entry.evidence).find(span => 'error' in span)
      if (refusal !== undefined) return refusal
      received('reading.json', { ticket, ...command, items, documents, session: sessionMark(command.session) })
      return { readingId: 'r-1', recordSeq: 9 }
    },
    finishRun: async (ticket, command) => {
      received('finish.json', { ticket, ...command, session: sessionMark(command.session) })
      return { recordSeq: 10, outbox: { id: 'o-1', state: 'queued' } }
    },
  })
  ctx.provide('flowleapOffice', {
    letter: async () => {
      throw new Error('a reading run writes no letter')
    },
  })
}
