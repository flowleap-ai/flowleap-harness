/**
 * The public sample data set of the MyEPO double: the seed firm's real public EP files from the pinned
 * `flowleap-seed-firm` package, in MyEPO wire form. Applications, bibliographic data and letters come from the seed's
 * register snapshots and register PDFs. The due dates and pending fees are FlowLeap's own: no public source gives them
 * for an application, so each value in {@link DERIVED} names the letter that states it or the rule that computes it.
 * @module
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { loadSeed, type Matter, type Seed, type SeedDocument } from 'flowleap-seed-firm'
import type { DoubleLetter, MyEpoDoubleData, WireApplication, WireCommunication, WirePortfolio } from './double.ts'

/** The marker that every portfolio name carries, so no screen can read the data as a live MyEPO account. */
export const SAMPLE_MARKER = 'public sample data, not a live MyEPO account'

/** The EPO document code list that {@link DOCUMENT_CODES} copies, read on 2026-11-10. */
export const DOCUMENT_CODE_SOURCE = 'https://api.apps.epo.org/dev-portal/document-codes'

/**
 * The MyEPO document code of each EPO form that a seed letter carries, with the code list's titles. The list has no
 * bare `2001`; `2001A` has the title of the form's communication.
 */
export const DOCUMENT_CODES: Readonly<Record<string, { readonly code: string; readonly en: string; readonly de: string }>> = {
  1081: { code: '1081', en: 'Reminder period for payment of examination fee/designation fee and correction of deficiencies in Written Opinion/amendment', de: 'Erinnerung Frist zur Zahlung der Prüfungs-/Benennungsgebühr und Beseitigung von Mängeln im schriftlichen Bescheid/Änderung' },
  1503: { code: '1503', en: 'European search report', de: 'Europäischer Recherchenbericht' },
  2001: { code: '2001A', en: 'Communication from the Examining Division', de: 'Bescheid der Prüfungsabteilung' },
  '2004C': { code: '2004C', en: 'Communication about intention to grant a European patent (from 01-04-2012)', de: 'Mitteilung über die beabsichtigte Erteilung eines europäischen Patents (ab 01-04-2012)' },
  '2006A': { code: '2006A', en: 'Decision to grant a European patent', de: 'Entscheidung über die Erteilung eines europäischen Patents' },
  '2015C': { code: '2015C', en: 'Application deemed to be withdrawn ( translations of claims/payment missing)', de: 'Anmeldung gilt als zurückgenommen (fehlende Anspruchsübersetzungen/Zahlung)' },
  '2317A': { code: '2317A', en: 'Communication of a notice of opposition and request to file observations', de: 'Mitteilung eines Einspruchs und Aufforderung zur Stellungnahme' },
}

/**
 * Seed documents that are no Mailbox letter of their own: the annex to an Article 94(3) communication and the text
 * intended for grant travel with their communication, and the double's download ZIP holds one PDF.
 */
const ANNEX_KINDS = new Set(['art94-3-annex', 'text-intended-for-grant'])

/** The letter that {@link MyEpoDouble.arrive} delivers: the Rule 71(3) communication of the first demo's matter. */
export const ARRIVAL = { application: 'EP23771920', row: 18 }

/** Letters dispatched before this date are read and handled at the start: the firm has worked on them. */
export const HANDLED_BEFORE = '2026-06-01'

/** A real public EP application outside the seed firm's portfolios (the parent of `EP22213933`): its reads answer `403 ERR_20`. */
export const RESTRICTED_APPLICATION = 'EP14724725'

/** A derived due date, in the fields of `GET …/dueDates`. */
export interface DerivedDueDate { readonly termKey: string; readonly dueDate: string; readonly actor: string }

/** A derived pending fee, in the fields of `GET …/fees`. */
export interface DerivedFee { readonly feeCode: string; readonly amount: number; readonly dueDate: string }

/** One due date or fee of the double that FlowLeap derived, and where it came from. */
export interface Derived {
  readonly application: string
  readonly kind: 'due-date' | 'fee'
  readonly value: DerivedDueDate | DerivedFee
  readonly source: string
}

const RENEWAL = 'due on the last day of the month of the anniversary of the filing date (Art. 86(1), Rule 51(1) EPC); amount from OJ EPO 2026, A2 (payments from 2026-04-01); fee code assumed as 030 plus the year, not checked against an EPO fee code list'

/**
 * The due dates and pending fees of the double, at the seed clock `fetch` (2026-11-05): each open period of a seed
 * letter and the next renewal fee of each pending application. A period end is the dispatch date plus the period that
 * the letter states (Rules 126(2), 131(2) and (4) EPC), moved to the next working day only for a weekend (Rule 134(1)
 * EPC; EPO closing days are not applied). The `actor` words are FlowLeap's: the sandbox shows only placeholders.
 */
export const DERIVED: readonly Derived[] = [
  { application: 'EP23771920', kind: 'due-date', value: { termKey: 'DUE_TERM_21', dueDate: '2027-01-29', actor: 'applicant' }, source: 'row 18, Rule 71(3) communication of 2026-09-29: "within a non-extendable period of four months"' },
  { application: 'EP23771920', kind: 'fee', value: { feeCode: '007', amount: 1135, dueDate: '2027-01-29' }, source: 'row 18 states fee code 007, EUR 1135.00, payable within the same four months' },
  { application: 'EP23771920', kind: 'fee', value: { feeCode: '035', amount: 1050, dueDate: '2027-09-30' }, source: `renewal fee for the 5th year, filing date 2023-09-06: ${RENEWAL}` },
  { application: 'EP24166597', kind: 'due-date', value: { termKey: 'DUE_TERM_11', dueDate: '2027-01-18', actor: 'applicant' }, source: 'row 6, Article 94(3) communication of 2026-09-18: "innerhalb einer Frist von 4 Monaten"' },
  { application: 'EP24166597', kind: 'fee', value: { feeCode: '034', amount: 885, dueDate: '2027-03-31' }, source: `renewal fee for the 4th year, filing date 2024-03-27: ${RENEWAL}` },
  { application: 'EP23755468', kind: 'fee', value: { feeCode: '035', amount: 1050, dueDate: '2027-08-31' }, source: `renewal fee for the 5th year, filing date 2023-08-07: ${RENEWAL}` },
  { application: 'EP22213933', kind: 'fee', value: { feeCode: '044', amount: 1865, dueDate: '2027-05-31' }, source: `renewal fee for the 14th year of the divisional application, filing date 2014-05-15: ${RENEWAL}` },
  { application: 'EP21810318', kind: 'due-date', value: { termKey: 'DUE_TERM_37', dueDate: '2027-02-15', actor: 'proprietor' }, source: 'row 15, Rule 79(1) communication of 2026-10-14: "innerhalb einer Frist von vier Monaten"; 2027-02-14 is a Sunday, so Rule 134(1) EPC moves it to Monday' },
]

interface RegisterBiblio {
  readonly title: string
  readonly applicants: readonly string[]
  readonly representatives: readonly { readonly name: string; readonly country: string; readonly address: readonly string[] }[]
  readonly dates: { readonly filing: string; readonly publication: string }
}

interface Bibliography {
  readonly inventors: readonly string[]
  readonly ipc: readonly string[]
  readonly cpc: readonly string[]
  readonly dates: {
    readonly priority: readonly { readonly date: string; readonly country: string; readonly originalApplication: string | null }[]
  }
}

/** `20230906` as `2023-09-06`. */
const isoDate = (compact: string): string => `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
const phrase = (text: string): { contact: { contactText: { phraseType: { $: string } } } } =>
  ({ contact: { contactText: { phraseType: { $: text } } } })

function snapshot(matter: Matter, tool: string): unknown {
  const found = matter.register[tool]
  if (found === undefined) throw new Error(`flowleap-seed-firm: ${matter.application} has no ${tool} register snapshot`)
  return found.body
}

/** The check digit printed on the matter's letters, for example `8` of `23 771 920.8 - 1001`. */
function checkDigit(matter: Matter): string {
  for (const document of matter.documents) {
    const found = /(\d[\d ]{6,})\.(\d)/.exec(document.applicationNumberPrinted ?? '')
    if (found !== null && found[1]!.replace(/ /g, '') === matter.application.slice(2)) return found[2]!
  }
  throw new Error(`flowleap-seed-firm: no letter of ${matter.application} prints the check digit`)
}

/**
 * The seed data set.
 * @param baseUrl - the API base that the hypermedia links of the answers name.
 * @param seed - the seed firm; the pinned package by default.
 * @returns the data set, with {@link ARRIVAL} as its one arrival.
 */
export function seedData(baseUrl: string, seed: Seed = loadSeed()): MyEpoDoubleData {
  const clock = seed.clocks.clocks[seed.clocks.default]
  const portfolios = seed.clients.map((client, index): WirePortfolio => ({
    id: String(index + 1),
    name: `${client.publishedNames[0]} (${SAMPLE_MARKER})`,
    type: 'representative',
    hasFullAccess: true,
    links: [{ href: `${baseUrl}/applications?portfolioId=${index + 1}`, title: 'Applications', media: 'application/json', type: 'GET', rel: 'applications' }],
  }))
  const portfolioOf = (matter: Matter): WirePortfolio => portfolios[seed.clients.findIndex(client => client.id === matter.client)]!
  const applications: WireApplication[] = []
  const biblio: Record<string, unknown> = {}
  const dueDates: Record<string, unknown> = {}
  const fees: Record<string, unknown> = {}
  const letters: DoubleLetter[] = []
  const arrivals: DoubleLetter[] = []

  for (const matter of seed.matters) {
    const register = snapshot(matter, 'get_register_biblio') as RegisterBiblio
    const bibliography = snapshot(matter, 'get_bibliography') as Bibliography
    const key = `EPC/${matter.application}`
    const myEpoNumber = `${matter.application}.${checkDigit(matter)}`
    const filingDate = isoDate(register.dates.filing)
    const identification = { procedure: 'EPC', ipOfficeCode: 'EP', applicationNumber: matter.application.slice(2), applicationNumberMyEPO: myEpoNumber, filingDate }
    const portfolio = portfolioOf(matter)
    applications.push({
      bibliographicData: { applicationIdentification: { procedure: 'EPC', ipOfficeCode: 'EP', applicationNumber: matter.application, applicationNumberMyEpo: myEpoNumber, filingDate } },
      applicantFileReference: matter.fileNumber,
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      procedure: 'EPC',
      links: [
        { href: `${baseUrl}/biblio-data/${key.replace('/', '/applications/')}`, title: 'Get Biblio', media: 'application/json', type: 'GET', rel: 'getBiblioData' },
        { href: `${baseUrl}/EPC/applications/${matter.application}/dueDates`, title: 'Get due dates', media: 'application/json', type: 'GET', rel: 'getDueDates' },
        { href: `${baseUrl}/EPC/applications/${matter.application}/fees`, title: 'Get pending fees', media: 'application/json', type: 'GET', rel: 'getFees' },
      ],
    })
    const publication = /^EP(\d+)([A-Z]\d?)$/.exec(matter.firstPublication)!
    biblio[key] = {
      application: {
        bibliographicData: {
          applicationIdentification: identification,
          publicationBag: { patentPublicationIdentification: [{ ipOfficeCode: 'EP', publicationNumber: publication[1], patentDocumentKindCode: publication[2], publicationDate: isoDate(register.dates.publication) }] },
          priorityClaimBag: {
            priorityClaim: bibliography.dates.priority
              .filter(claim => claim.date < register.dates.filing && claim.originalApplication !== null)
              .map((claim, index) => ({ sequenceNumber: String(index + 1).padStart(2, '0'), ipOfficeCode: claim.country, applicationNumber: claim.originalApplication, filingDate: isoDate(claim.date) })),
          },
        },
        patentClassificationBag: {
          ipcClassificationBag: { ipcrClassification: bibliography.ipc.map((symbol, index) => ({ sequenceNumber: String(index + 1).padStart(3, '0'), patentClassificationSymbolText: symbol })) },
          cpcClassificationsBag: { cpcClassification: bibliography.cpc.map((symbol, index) => ({ sequenceNumber: String(index + 1).padStart(3, '0'), patentClassificationSymbolText: symbol })) },
        },
        inventionTitleBag: { inventionTitle: [{ languageCode: 'EN', phraseType: { $: register.title } }] },
        partyBag: {
          applicantBag: register.applicants.map((name, index) => ({ applicant: { sequenceNumber: String(index + 1).padStart(3, '0'), ...phrase(name) } })),
          // OPS lists each inventor twice: as `SURNAME GIVEN [CC]` and as published, `SURNAME, Given`.
          inventorBag: bibliography.inventors.filter(name => name.includes(', ')).map((name, index) => ({ inventor: { sequenceNumber: String(index + 1).padStart(3, '0'), ...phrase(name) } })),
          representativeBag: register.representatives.map((agent, index) => ({ sequenceNumber: String(index + 1).padStart(3, '0'), ...phrase([agent.name, ...agent.address, agent.country].join(', ')) })),
        },
      },
    }
    const derived = DERIVED.filter(entry => entry.application === matter.application && entry.value.dueDate >= clock!)
    dueDates[key] = { applicationIdentification: identification, dueDates: derived.flatMap(entry => entry.kind === 'due-date' ? [entry.value] : []) }
    fees[key] = derived.flatMap(entry => entry.kind === 'fee' ? [{ ...entry.value, currency: null }] : [])

    for (const document of matter.documents) {
      if (ANNEX_KINDS.has(document.kind)) continue
      const letter = letterOf(matter, document, myEpoNumber, register, baseUrl)
      const arrives = matter.application === ARRIVAL.application && document.row === ARRIVAL.row
      ;(arrives ? arrivals : letters).push(letter)
    }
  }
  return {
    label: `the seed firm's real public EP files (${SAMPLE_MARKER})`,
    portfolios,
    applications,
    restricted: [`EPC/${RESTRICTED_APPLICATION}`],
    biblio,
    dueDates,
    fees,
    terms: (JSON.parse(readFileSync(new URL('../fixtures/myepo/terms.json', import.meta.url), 'utf8')) as { body: unknown }).body,
    folders: { folders: [{ folderId: FOLDERS.inbox, folderName: 'Inbox' }, { folderId: FOLDERS.done, folderName: 'Done' }] },
    letters,
    arrivals,
  }
}

/** The Mailbox folders of the double; their names are FlowLeap's. */
export const FOLDERS = { inbox: 'sfinbox00000001', done: 'sfdone000000001' }

function letterOf(matter: Matter, document: SeedDocument, myEpoNumber: string, register: RegisterBiblio, baseUrl: string): DoubleLetter {
  const code = DOCUMENT_CODES[document.formCode ?? '']
  if (code === undefined) throw new Error(`flowleap-seed-firm: ${matter.application} row ${document.row} has form ${document.formCode}, which has no MyEPO document code here`)
  const id = createHash('sha256').update(`${matter.application}/${document.row}`).digest('hex').slice(0, 15)
  const handled = document.registerListDate < HANDLED_BEFORE
  const communication: WireCommunication = {
    id,
    applicantName: register.applicants[0] ?? null,
    title: document.language === 'de' ? code.de : code.en,
    dispatchDate: document.registerListDate,
    applicationNumber: myEpoNumber,
    recipientName: register.representatives[0]?.name ?? register.applicants[0] ?? null,
    userReference: document.reference,
    document: `${baseUrl}/communications/download/${id}`,
    digitalFile: null,
    documentCode: code.code,
    read: handled,
    handled,
    folderId: handled ? FOLDERS.done : FOLDERS.inbox,
    links: [
      { href: `${baseUrl}/communications/download/${id}`, title: 'Download communication', media: 'application/zip', type: 'GET', rel: 'download' },
      { href: `${baseUrl}/communications/handle/${id}`, title: 'Handle communication', media: 'application/json', type: 'POST', rel: 'handle' },
    ],
  }
  const filename = [document.reference, document.registerListDate.replace(/-/g, '.'), matter.application, code.code]
    .filter(part => part !== null).join('-').replace(/[/\\]/g, '_')
  return { communication, filename: `${filename}.pdf`, pdf: () => readFileSync(document.path) }
}

/** The one test client of the double. The values are public: the double serves only public sample data. */
export const DOUBLE_CLIENT = { clientId: 'flowleap-myepo-double', clientSecret: 'public-sample-data' }
