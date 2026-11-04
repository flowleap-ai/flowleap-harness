/**
 * Records API answers that match the reference mockups of the IPMS design language, as wire JSON and parsed. The
 * demo date is 2026-11-04. The people are Dr. Anna Becker (responsible attorney), Jonas Weber (attorney) and Lena
 * Hoffmann (formalities); Markus Brandt works in the firm but is outside the wall of every matter here, so no answer
 * names him and no view may show him (review checklist item 24). `createFixtureApi` serves these answers as a
 * `RecordsApi`, for component tests and for a screen without the os.
 */

import { parsers, type Act, type DocumentId, type Fetched, type FileNumber, type IntakeView, type RecordsApi } from '../src/client/api.ts'

/** Today in the fixtures. */
export const TODAY = '2026-11-04'

/** The signed-in person and the team. */
export const PEOPLE = {
  anna: { id: 'p-anna', name: 'Dr. Anna Becker' },
  jonas: { id: 'p-jonas', name: 'Jonas Weber' },
  lena: { id: 'p-lena', name: 'Lena Hoffmann' },
} as const

/** A person of the firm outside every matter's wall; no answer names this person. */
export const OUTSIDE_WALL = { id: 'p-markus', name: 'Markus Brandt' } as const

/**
 * A fixture SHA-256: the number in hex, padded to 64 digits.
 * @param n - the document number.
 * @returns the hex digest.
 */
export const sha = (n: number): string => n.toString(16).padStart(64, '0')

/**
 * A fixture UUID.
 * @param n - the number.
 * @returns the UUID.
 */
export const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** The matters of the fixtures, by file number. */
export const MATTERS = {
  'FL-2026-0001': { title: 'Pressure sensor housing', client: 'Kessler Sensorik GmbH' },
  'FL-2025-0412': { title: 'Brake caliper bracket', client: 'Halberg Automotive SE' },
  'FL-2026-0019': { title: 'Heat pump expansion valve', client: 'Nordwind Energie AG' },
  'FL-2025-0377': { title: 'Seat belt pretensioner', client: 'Halberg Automotive SE' },
  'FL-2024-0981': { title: 'Wiper motor gearbox', client: 'Halberg Automotive SE' },
  'FL-2025-0203': { title: 'Battery cell spacer', client: 'Kessler Sensorik GmbH' },
  'FL-2026-0044': { title: 'Offshore cable clamp', client: 'Nordwind Energie AG' },
  'FL-2023-0610': { title: 'Rotor blade clamp', client: 'Nordwind Energie AG' },
  'FL-2026-0007': { title: 'Valve seat insert', client: 'Kessler Sensorik GmbH' },
} as const

type MatterKey = keyof typeof MATTERS
const ref = (fileNumber: MatterKey) => ({ fileNumber, title: MATTERS[fileNumber].title })

/** A forwarder who never signed in: the os sends the mail address with no person id. */
export const RECEPTION = { id: null, name: 'empfang@kanzlei.test' } as const

type Who = keyof typeof PEOPLE | 'reception'
type IntakeGroup = 'match_proposed' | 'unmatched' | 'ambiguous' | 'kind_proposed' | 'duplicate_proposed' | 'unreadable'

/** One intake letter: group, code, office, matter, matter count, forwarder, received time. */
type Letter = readonly [IntakeGroup, string | null, string | null, MatterKey | null, number, Who, string]

/** The 22 letters that wait for a person, in six groups, as the intake mockup lists them. */
const LETTERS: readonly Letter[] = [
  ['match_proposed', 'EPO:R71(3)', 'EPO', 'FL-2026-0001', 1, 'jonas', '2026-11-04T14:16:00Z'],
  ['match_proposed', 'EPO:ART94(3)', 'EPO', 'FL-2025-0412', 1, 'jonas', '2026-11-04T13:52:00Z'],
  ['match_proposed', 'EPO:EESR', 'EPO', 'FL-2026-0019', 1, 'lena', '2026-11-04T12:30:00Z'],
  ['match_proposed', 'DPMA:EXAM', 'DPMA', 'FL-2025-0377', 1, 'lena', '2026-11-04T11:05:00Z'],
  ['match_proposed', 'EPO:SUMMONS', 'EPO', 'FL-2024-0981', 1, 'anna', '2026-11-04T10:41:00Z'],
  ['match_proposed', 'USPTO:NOA', 'USPTO', 'FL-2025-0203', 1, 'jonas', '2026-11-04T09:58:00Z'],
  ['match_proposed', 'WIPO:ISR', 'WIPO', 'FL-2026-0044', 1, 'lena', '2026-11-04T09:12:00Z'],
  ['match_proposed', 'EPO:RENEWAL', 'EPO', 'FL-2023-0610', 1, 'lena', '2026-11-03T16:40:00Z'],
  ['match_proposed', 'EPO:R161', 'EPO', 'FL-2026-0007', 1, 'jonas', '2026-11-03T15:02:00Z'],
  ['unmatched', 'EPO:ART94(3)', 'EPO', null, 0, 'lena', '2026-11-04T14:02:00Z'],
  ['unmatched', 'DPMA:OA', 'DPMA', null, 0, 'anna', '2026-11-04T12:11:00Z'],
  ['unmatched', 'USPTO:NFOA', 'USPTO', null, 0, 'jonas', '2026-11-03T14:20:00Z'],
  ['unmatched', 'DPMA:RECEIPT', 'DPMA', null, 0, 'lena', '2026-11-03T11:45:00Z'],
  ['ambiguous', 'EPO:R71(3)', 'EPO', null, 2, 'jonas', '2026-11-04T13:40:00Z'],
  ['ambiguous', 'EPO:GRANT', 'EPO', null, 2, 'lena', '2026-11-04T11:47:00Z'],
  ['ambiguous', 'WIPO:WO', 'WIPO', null, 3, 'lena', '2026-11-03T10:15:00Z'],
  ['kind_proposed', null, null, 'FL-2025-0377', 1, 'anna', '2026-11-04T10:02:00Z'],
  ['kind_proposed', null, null, 'FL-2024-0981', 1, 'jonas', '2026-11-04T09:30:00Z'],
  ['kind_proposed', null, null, 'FL-2026-0044', 1, 'lena', '2026-11-03T09:05:00Z'],
  ['duplicate_proposed', 'EPO:R71(3)', 'EPO', 'FL-2026-0001', 1, 'lena', '2026-11-04T14:20:00Z'],
  ['duplicate_proposed', 'EPO:EESR', 'EPO', 'FL-2026-0019', 1, 'jonas', '2026-11-04T12:44:00Z'],
  ['unreadable', null, 'DPMA', null, 0, 'reception', '2026-11-04T08:51:00Z'],
]

/** The wire rows of the waiting list, in the order of the mockup. */
export const intakeRowsWire = LETTERS.map(([state, code, office, matter, matterCount, who, receivedAt], index) => ({
  document: sha(index + 1),
  machine: 'intake',
  state,
  code,
  office,
  matter: matter === null ? null : ref(matter),
  matterCount,
  forwarder: who === 'reception' ? RECEPTION : PEOPLE[who],
  receivedAt,
  since: receivedAt,
}))

/** The document of the first letter, the Rule 71(3) communication on FL-2026-0001. */
export const R71_DOCUMENT = sha(1)

/** `GET intake?view=waiting`. */
export const intakeWaitingWire = {
  asOf: '2026-11-04T14:16:30Z',
  counts: { waiting: 22, filedToday: 6, notRelevant: 1 },
  rows: intakeRowsWire,
}

const span = (quote: string, start: number, before: string, after: string) => ({
  page: 1, start, end: start + quote.length, quote, excerpt: { before, after },
})

/** `GET intake/documents/<R71_DOCUMENT>`. */
export const intakeDocumentWire = {
  document: R71_DOCUMENT,
  fileName: 'r71-3-FL-2026-0001.pdf',
  mediaType: 'application/pdf',
  pages: 1,
  machine: 'intake',
  state: 'match_proposed',
  since: '2026-11-04T14:16:00Z',
  mail: { forwarder: PEOPLE.jonas, receivedAt: '2026-11-04T14:16:00Z', subject: 'Fwd: EPO communication' },
  code: 'EPO:R71(3)',
  office: 'EPO',
  documentDate: '2026-10-30',
  applicationNumber: '24 123 456.7',
  fields: {
    reference: { value: 'FL-2026-0001', span: span('FL-2026-0001', 64, 'European Patent Office. Your reference ', '. Application No. 24 123 456.7') },
    documentDate: { value: '2026-10-30', span: span('30.10.2026', 30, 'Form 2004C. Date ', '. Your reference FL-2026-0001') },
    formNumber: { value: '2004C', span: span('2004C', 19, 'European Patent Office. EPO Form ', '. Date 30.10.2026') },
    applicationNumber: { value: '24 123 456.7', span: span('24 123 456.7', 94, 'Your reference FL-2026-0001. Application No. ', ' - 1203') },
  },
  proposed: { fileNumber: 'FL-2026-0001', title: MATTERS['FL-2026-0001'].title, client: MATTERS['FL-2026-0001'].client, responsible: PEOPLE.anna, matchedBy: 'reference' },
  candidates: 1,
  filed: null,
  officeEvent: null,
  matters: (Object.keys(MATTERS) as MatterKey[]).map(ref),
  mayDecide: { allowed: true },
  activity: [
    { seq: 101, at: '2026-11-04T14:16:00Z', type: 'document/stored', actor: { kind: 'system', name: 'mailbox' }, for: PEOPLE.jonas, detail: {} },
    { seq: 102, at: '2026-11-04T14:16:10Z', type: 'document/read', actor: { kind: 'system', name: 'flowleap' }, for: null, detail: { code: 'EPO:R71(3)' } },
    { seq: 103, at: '2026-11-04T14:16:20Z', type: 'document/match-proposed', actor: { kind: 'system', name: 'flowleap' }, for: null, detail: { fileNumber: 'FL-2026-0001' } },
  ],
}

/** `GET me`: Dr. Anna Becker. */
export const meWire = { person: PEOPLE.anna, admin: false }

/** `GET matters`. */
export const mattersWire = {
  rows: (Object.keys(MATTERS) as MatterKey[]).map((fileNumber, index) => ({
    fileNumber,
    title: MATTERS[fileNumber].title,
    client: MATTERS[fileNumber].client,
    responsible: [PEOPLE.anna, PEOPLE.jonas, PEOPLE.lena][index % 3],
    state: 'open',
    openDeadlines: index === 0 ? 1 : index % 2,
    nextDue: index === 0 ? '2027-03-01' : null,
  })),
}

const DEADLINE_ID = uuid(1)
const OFFICE_EVENT_ID = uuid(2)
const TICKET_ID = uuid(3)

/** `GET matters/FL-2026-0001`. */
export const matterWire = {
  recordSeq: 140,
  matter: { fileNumber: 'FL-2026-0001', title: MATTERS['FL-2026-0001'].title, client: MATTERS['FL-2026-0001'].client, state: 'open', applicationNumber: 'EP 24 123 456.7' },
  responsible: PEOPLE.anna,
  team: [PEOPLE.anna, PEOPLE.jonas, PEOPLE.lena],
  deadlines: [{ id: DEADLINE_ID, due: '2027-03-01', state: 'deadline_proposed', code: 'EPO:R71(3)', officeEventId: OFFICE_EVENT_ID }],
  work: [{ id: TICKET_ID, state: 'proposals_ready', code: 'EPO:R71(3)', routedTo: PEOPLE.anna, updatedAt: '2026-11-04T14:17:00Z', report: { state: 'proposed' }, reply: { state: 'sent' } }],
  officeEvents: [{ id: OFFICE_EVENT_ID, code: 'EPO:R71(3)', documentDate: '2026-10-30', state: 'deadline_proposed', document: R71_DOCUMENT, receivedAt: null }],
  documents: [{ sha256: R71_DOCUMENT, fileName: 'r71-3-FL-2026-0001.pdf', mediaType: 'application/pdf', source: 'mail', at: '2026-11-04T14:16:00Z' }],
  activity: [
    { seq: 120, at: '2026-11-04T14:16:00Z', type: 'intake/filed', actor: { kind: 'person', person: PEOPLE.jonas }, for: null, detail: {} },
    { seq: 121, at: '2026-11-04T14:17:00Z', type: 'deadline/proposed', actor: { kind: 'system', name: 'flowleap' }, for: null, detail: { due: '2027-03-01' } },
    { seq: 122, at: '2026-11-04T14:17:10Z', type: 'ticket/routed', actor: { kind: 'system', name: 'flowleap' }, for: PEOPLE.anna, detail: {} },
    { seq: 123, at: '2026-11-04T14:17:40Z', type: 'report/proposed', actor: { kind: 'system', name: 'agent' }, for: PEOPLE.anna, detail: {} },
    { seq: 124, at: '2026-11-04T14:18:00Z', type: 'outbox/sent', actor: { kind: 'system', name: 'mailbox' }, for: null, detail: {} },
  ],
}

const reading = { code: 'EPO:R71(3)', documentDate: '2026-10-30', applicationNumber: '24 123 456.7' }

/** `GET deadlines/<id>` of the Rule 71(3) deadline: proposed, Jonas Weber may confirm. */
export const deadlineWire = {
  recordSeq: 141,
  deadline: {
    id: DEADLINE_ID, due: '2027-03-01', state: 'deadline_proposed', ruleId: 'ep.r71-3.grant-communication', ruleVersion: 1,
    trace: [
      { op: 'delivery', from: '2026-10-30', to: '2026-10-30', cite: 'Rule 126(2) EPC; Rule 127(2) EPC; OJ EPO 2023, A29' },
      { op: 'start', from: '2026-10-30', to: '2026-10-31', cite: 'Rule 131(2) EPC' },
      { op: 'month-end', from: '2026-10-30', to: '2027-02-28', cite: 'Rule 71(3) EPC; Rule 131(4) EPC, last day of the month' },
      { op: 'closure-roll', from: '2027-02-28', to: '2027-03-01', cite: 'Rule 134(1) EPC; EPO calendar 2027' },
    ],
    notes: [],
    sources: [
      { cite: 'Rule 71 EPC', url: 'https://www.epo.org/en/legal/epc/2020/r71.html' },
      { cite: 'Rule 126 EPC', url: 'https://www.epo.org/en/legal/epc/2020/r126.html' },
      { cite: 'Rule 127 EPC', url: 'https://www.epo.org/en/legal/epc/2020/r127.html' },
      { cite: 'Rule 131 EPC', url: 'https://www.epo.org/en/legal/epc/2020/r131.html' },
      { cite: 'Rule 134 EPC', url: 'https://www.epo.org/en/legal/epc/2020/r134.html' },
      { cite: 'OJ EPO 2022, A101', url: 'https://www.epo.org/en/legal/official-journal/2022/11/a101' },
      { cite: 'OJ EPO 2023, A29', url: 'https://www.epo.org/en/legal/official-journal/2023/03/a29' },
    ],
  },
  matter: ref('FL-2026-0001'),
  responsible: PEOPLE.anna,
  officeEvent: { id: OFFICE_EVENT_ID, code: 'EPO:R71(3)', documentDate: '2026-10-30', applicationNumber: '24 123 456.7', document: R71_DOCUMENT, fileName: 'r71-3-FL-2026-0001.pdf', state: 'deadline_proposed' },
  readers: {
    code: { result: reading, fields: intakeDocumentWire.fields },
    model: { result: reading, model: 'Claude Haiku 5.5' },
    agree: true,
  },
  proposer: null, confirmer: null, rejecter: null, reason: null,
  mayConfirm: { allowed: true },
  activity: [
    { seq: 130, at: '2026-11-04T14:17:00Z', type: 'office-event/code-proposed', actor: { kind: 'system', name: 'mailbox' }, for: null, detail: {} },
    { seq: 131, at: '2026-11-04T14:17:05Z', type: 'deadline/proposed', actor: { kind: 'system', name: 'flowleap' }, for: null, detail: { due: '2027-03-01' } },
  ],
}

/** The board's work: two assigned, one running, three with proposals ready, two decided. */
export const ticketsWire = {
  rows: ([
    [4, 'routed', 'EPO:ART94(3)', 'FL-2025-0412', ['anna'], '2027-01-12', 'active', null],
    [5, 'routed', 'EPO:EESR', 'FL-2026-0019', ['lena'], null, 'active', null],
    [6, 'running', 'DPMA:EXAM', 'FL-2025-0377', ['lena'], '2027-02-15', 'active', null],
    [3, 'proposals_ready', 'EPO:R71(3)', 'FL-2026-0001', ['anna', 'jonas'], '2027-03-01', 'active', 'proposed'],
    [7, 'proposals_ready', 'EPO:SUMMONS', 'FL-2024-0981', ['anna'], '2027-04-20', 'active', 'proposed'],
    [8, 'proposals_ready', 'USPTO:NOA', 'FL-2025-0203', ['jonas'], '2027-02-02', 'active', 'proposed'],
    [9, 'decided', 'EPO:RENEWAL', 'FL-2023-0610', ['lena'], null, 'to_docket', 'sent'],
    [10, 'decided', 'EPO:R161', 'FL-2026-0007', ['jonas'], null, 'to_docket', 'sent'],
  ] as const).map(([n, state, code, matter, team, due, deadline, report]) => ({
    id: uuid(n), state, code, matter: ref(matter), team: team.map(who => PEOPLE[who]), routedTo: PEOPLE[team[0]], due,
    deadline: { state: deadline }, report: report === null ? null : { state: report }, reply: null, updatedAt: '2026-11-04T14:17:00Z',
  })),
}

/** `GET tickets/<id>` of the Rule 71(3) work: the client report with five statements, the fifth without a span. */
export const ticketWire = {
  recordSeq: 142,
  ticket: { id: TICKET_ID, pass: 1, state: 'proposals_ready', since: '2026-11-04T14:17:00Z', routedTo: PEOPLE.anna, decidedBy: null, decidedAt: null },
  matter: ref('FL-2026-0001'),
  responsible: PEOPLE.anna,
  team: [PEOPLE.anna, PEOPLE.jonas, PEOPLE.lena],
  letter: { document: R71_DOCUMENT, fileName: 'r71-3-FL-2026-0001.pdf', pages: 1, code: 'EPO:R71(3)', documentDate: '2026-10-30', applicationNumber: '24 123 456.7' },
  reports: [{
    proposalId: 'proposal-1', document: sha(100), fileName: 'report-FL-2026-0001-r71-3.docx', state: 'proposed',
    templateName: 'Firm template', language: 'en', pages: 1,
    statements: [
      { text: 'The EPO issued a communication under Rule 71(3) EPC on EP 24 123 456.7, dated 30 October 2026.', evidence: [
        { document: R71_DOCUMENT, span: span('Communication under Rule 71(3) EPC', 120, 'Application No. 24 123 456.7 - 1203. ', '. You are informed that') },
        { document: R71_DOCUMENT, span: span('Date 30.10.2026', 25, 'EPO Form 2004C. ', '. Your reference') },
      ] },
      { text: 'The examining division intends to grant the patent on the text on file.', evidence: [
        { document: R71_DOCUMENT, span: span('intends to grant a European patent', 200, 'You are informed that the examining division ', ' on the basis of the above application') },
      ] },
      { text: 'To go on, the client must approve the text, pay the fee for grant and publishing, and file the translations of the claims.', evidence: [
        { document: R71_DOCUMENT, span: span('pay the fee for grant and publishing', 320, 'you are requested to ', ' and to file') },
        { document: R71_DOCUMENT, span: span('file a translation of the claims', 368, 'and to ', ' in the two official languages') },
      ] },
      { text: 'The time limit for this ends on Monday, 1 March 2027.', evidence: [
        { document: R71_DOCUMENT, span: span('Within a period of four months', 290, '', ' of notification of this communication') },
      ] },
      { text: 'The fee for grant and publishing is EUR 1,050.', evidence: [{ document: R71_DOCUMENT, span: null }] },
    ],
  }],
  deadline: { id: DEADLINE_ID, due: '2027-03-01', state: 'active', confirmer: PEOPLE.jonas },
  reply: { state: 'sent', to: [PEOPLE.jonas, PEOPLE.anna] },
  run: { model: 'openrouter', steps: null, finishedAt: '2026-11-04T14:17:40Z', session: 'ses_r71work' },
  mayDecide: { allowed: true, as: 'responsible' },
  activity: [
    { seq: 150, at: '2026-11-04T14:17:00Z', type: 'ticket/routed', actor: { kind: 'system', name: 'flowleap' }, for: PEOPLE.anna, detail: {} },
    { seq: 151, at: '2026-11-04T14:17:05Z', type: 'ticket/run-started', actor: { kind: 'system', name: 'agent' }, for: PEOPLE.anna, detail: {} },
    { seq: 152, at: '2026-11-04T14:17:40Z', type: 'report/proposed', actor: { kind: 'system', name: 'agent' }, for: PEOPLE.anna, detail: {} },
    { seq: 153, at: '2026-11-04T14:18:00Z', type: 'outbox/sent', actor: { kind: 'system', name: 'mailbox' }, for: null, detail: {} },
    { seq: 154, at: '2026-11-04T14:18:30Z', type: 'deadline/confirmed', actor: { kind: 'person', person: PEOPLE.jonas }, for: null, detail: {} },
  ],
}

/** The ids of the fixture records. */
export const FIXTURE_IDS = { deadline: DEADLINE_ID, officeEvent: OFFICE_EVENT_ID, ticket: TICKET_ID } as const

/** The parsed fixtures, as the views receive them. */
export const fixtures = {
  me: parsers.me(meWire, 'me'),
  matters: parsers.mattersList(mattersWire, 'matters'),
  matter: parsers.matterDetail(matterWire, 'matter'),
  deadline: parsers.deadlineDetail(deadlineWire, 'deadline'),
  intake: parsers.intakeList(intakeWaitingWire, 'intake'),
  intakeDocument: parsers.intakeDocument(intakeDocumentWire, 'intakeDocument'),
  tickets: parsers.ticketsList(ticketsWire, 'tickets'),
  ticket: parsers.ticketDetail(ticketWire, 'ticket'),
}

/** The empty intake lists of filed today and not relevant. */
const emptyIntake = (view: IntakeView) => ({ ...fixtures.intake, rows: view === 'waiting' ? fixtures.intake.rows : [] })

/**
 * A `RecordsApi` that answers from the fixtures and records each act.
 * @returns the API and the acts it received.
 */
export function createFixtureApi(): { api: RecordsApi; acts: Act[] } {
  const acts: Act[] = []
  const ok = <T>(value: T): Promise<Fetched<T>> => Promise.resolve({ ok: true, value })
  const document = (id: DocumentId) => id === fixtures.intakeDocument.document
    ? fixtures.intakeDocument
    : { ...fixtures.intakeDocument, document: id }
  return {
    acts,
    api: {
      me: () => ok(fixtures.me),
      matters: () => ok(fixtures.matters),
      matter: (fileNumber: FileNumber) => ok({ ...fixtures.matter, matter: { ...fixtures.matter.matter, fileNumber } }),
      deadline: () => ok(fixtures.deadline),
      intake: view => ok(emptyIntake(view)),
      intakeDocument: id => ok(document(id)),
      tickets: () => ok(fixtures.tickets),
      ticket: () => ok(fixtures.ticket),
      perform: (act) => {
        acts.push(act)
        return ok(null)
      },
      contentHref: id => `records/api/documents/${id}/content`,
    },
  }
}
