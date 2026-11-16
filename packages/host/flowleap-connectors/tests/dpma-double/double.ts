/**
 * A double of DPMAconnectPlus (`DPMAregisterPatService`): it answers the calls of the DPMA register connector from a
 * data set of register records, in the XML of the real service. The answers of a refused login, a refused query, a cut
 * hit list and "data not available" have the text of the recorded answers in the library fixtures.
 * @module
 */

import { parseDpmaRegisterRecord, type DpmaRegisterRecord } from '@flowleap/connectors'

/** One register record of the double. */
export interface DpmaDoubleRecord {
  /** The key of the file for `getRegisterInfo`. */
  readonly leadingRegisteredNumber: string
  /** The register record as the DPMA sends it (DPMA extension of WIPO ST.36). */
  readonly xml: string
}

/** The data set of a double. */
export interface DpmaDoubleData {
  /** What the data is, for a log line and the control surface. */
  readonly label: string
  /** The answer of `version`. */
  readonly version: string
  readonly records: readonly DpmaDoubleRecord[]
}

/** The one account of a double. */
export interface DpmaDoubleAccount {
  readonly username: string
  readonly password: string
  /** The most hits of one search: the DPMA gives 1000 to a contract account and 100 to a test access. */
  readonly hitLimit: number
}

/** A double: the `fetch` of the DPMA. */
export interface DpmaDouble {
  /**
   * Answer one request as the DPMA does.
   * @param input - the URL; the path from `/DPMAregisterPatService/` decides the answer, the origin does not.
   * @param init - the request, with its `Authorization` header.
   * @returns the answer of the double.
   */
  fetch(input: string | URL, init?: RequestInit): Promise<Response>
  /** The leading file numbers of the data set, in its order. */
  readonly leadingRegisteredNumbers: readonly string[]
}

const SERVICE = '/DPMAregisterPatService/'
const XML = { 'content-type': 'application/xml;charset=UTF-8' }

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const AUTH_ERROR = `${DECLARATION}<Error Message_DE="Authentifizierung fehlgeschlagen" Message_EN="Authentification failed"/>`

/**
 * The "data not available" answer.
 * @param code - the request path, as the DPMA repeats it in `TransactionCode`.
 * @param at - the time of the answer.
 * @returns the XML.
 */
function notAvailable(code: string, at: Date): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>', '', '<Transaction>',
    `\t<TransactionHeader><SenderDetails><RequestProducerDateTime>${at.toISOString().slice(0, 19)}</RequestProducerDateTime></SenderDetails></TransactionHeader>`,
    '\t<TradeMarkTransactionBody>',
    '\t\t<TransactionErrorDetails><TransactionError><TransactionErrorCode>Error</TransactionErrorCode><TransactionErrorText>Data not available</TransactionErrorText></TransactionError></TransactionErrorDetails>',
    `\t\t<TransactionContentDetails><TransactionIdentifier>00000000-0000-4000-8000-000000000000</TransactionIdentifier><TransactionCode>${escapeXml(code)}</TransactionCode></TransactionContentDetails>`,
    '\t</TradeMarkTransactionBody>', '</Transaction>', '',
  ].join('\n')
}

/**
 * Escape text for an XML element or attribute.
 * @param value - the text.
 * @returns the escaped text.
 */
function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** One condition of a query: a test of one record. */
type Condition = (record: DpmaRegisterRecord) => boolean

/** A query that the double read, or the first character that it cannot read. */
type ParsedQuery =
  | { readonly ok: true; readonly conditions: readonly Condition[] }
  | { readonly ok: false; readonly position: number; readonly text: string }

/**
 * Read `dd.mm.yyyy` as an ISO date.
 * @param value - the date as the expert search writes it.
 * @returns the ISO date, or undefined for any other form.
 */
function isoOfGermanDate(value: string): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value)
  return match === null ? undefined : `${match[3]}-${match[2]}-${match[1]}`
}

/**
 * Whether a text has a term, without case. The wildcard `?` of the expert search ends a term here.
 * @param text - the register text.
 * @param term - the term of the query.
 * @returns true when the text has the term.
 */
function has(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.replace(/\?+$/, '').toLowerCase())
}

/**
 * Read the part of the expert search that the double knows: conditions `FIELD=value` joined by `UND` or `AND`, with the
 * fields TI (title), INH (applicant), VTR (representative), AKZ (file number) and AT (filing date, also `>=` and `<=`).
 * @param query - the expert query.
 * @returns the conditions, or the position of the first character the double cannot read.
 */
function parseQuery(query: string): ParsedQuery {
  const conditions: Condition[] = []
  let position = 1
  for (const part of query.split(/\s+(?:UND|AND)\s+/i)) {
    const match = /^(TI|INH|VTR|AKZ|AT)\s*(>=|<=|=)\s*"?([^"]+?)"?$/i.exec(part.trim())
    if (match === null) return { ok: false, position, text: part.trim().slice(0, 1) || query.slice(0, 1) }
    const field = match[1] ?? ''
    const operator = match[2] ?? ''
    const value = match[3] ?? ''
    // An operator that the double does not know stays in the value: refuse it, do not search for it as text.
    if (/(?:^|\s)(?:ODER|OR|NICHT|NOT)(?:\s|$)|[=(){}]/i.test(value)) return { ok: false, position, text: value.slice(0, 1) }
    switch (field.toUpperCase()) {
      case 'TI': conditions.push(record => has(record.title ?? '', value)); break
      case 'INH': conditions.push(record => record.applicants.some(party => has(party.text, value))); break
      case 'VTR': conditions.push(record => record.agents.some(party => has(party.text, value))); break
      case 'AKZ': conditions.push(record => record.applicationNumber.replace(/\D/g, '') === value.replace(/\D/g, '')); break
      default: {
        const date = isoOfGermanDate(value)
        if (date === undefined) return { ok: false, position, text: value.slice(0, 1) }
        conditions.push((record) => {
          const filed = record.applicationDate
          if (filed === undefined) return false
          return operator === '>=' ? filed >= date : operator === '<=' ? filed <= date : filed === date
        })
      }
    }
    if (operator !== '=' && field.toUpperCase() !== 'AT') return { ok: false, position, text: operator }
    position += part.length + 5
  }
  return { ok: true, conditions }
}

const STATUS_TEXT: Readonly<Record<string, string>> = {
  'anhaengig-in-kraft': 'Pending/in force',
  'nicht-anhaengig-erloschen': 'Not pending/lapsed',
}

/**
 * One hit of the hit list, from a register record.
 * @param leadingRegisteredNumber - the key of the file.
 * @param record - the parsed register record.
 * @returns the `PatentHitListRecord` element.
 */
function hitXml(leadingRegisteredNumber: string, record: DpmaRegisterRecord): string {
  const tag = (name: string, value: string | undefined): string => value === undefined ? '' : `<${name}>${escapeXml(value)}</${name}>`
  const list = (outer: string, inner: string, values: readonly string[]): string =>
    values.length === 0 ? '' : `<${outer}>${values.map(value => tag(inner, value)).join('')}</${outer}>`
  return [
    '<PatentHitListRecord>',
    tag('leading-registered-number', leadingRegisteredNumber),
    tag('registered-number', record.applicationNumber),
    tag('type', record.ipRightType === 'gebrauchsmuster' ? 'Utility model' : 'Patent'),
    tag('legalstatus', STATUS_TEXT[record.status ?? ''] ?? record.status ?? ''),
    tag('invention-title', record.title ?? ''),
    tag('applicationDate', record.applicationDate),
    tag('publicationDate', record.firstPublicationDate),
    list('applicants', 'applicant', record.applicants.map(party => party.text)),
    list('inventors', 'inventor', record.inventors.map(party => party.text)),
    `<agent>${escapeXml(record.agents[0]?.text ?? '')}</agent>`,
    '</PatentHitListRecord>',
  ].join('')
}

/**
 * Build a double over one data set.
 * @param data - the register records and the version text.
 * @param account - the one account that the double accepts, with its hit limit.
 * @param now - the clock of the answers; defaults to the system clock.
 * @returns the double.
 * @throws when a record of the data set is not a register record of the DPMA schema.
 */
export async function createDpmaDouble(
  data: DpmaDoubleData, account: DpmaDoubleAccount, now: () => Date = () => new Date(),
): Promise<DpmaDouble> {
  const records = new Map<string, { readonly xml: string; readonly parsed: DpmaRegisterRecord }>()
  for (const record of data.records) {
    const parsed = await parseDpmaRegisterRecord(record.xml)
    if (!parsed.ok) throw new Error(`DPMA double: record ${record.leadingRegisteredNumber} of "${data.label}": ${parsed.error.message}`)
    records.set(record.leadingRegisteredNumber, { xml: record.xml, parsed: parsed.data })
  }
  const expected = `Basic ${Buffer.from(`${account.username}:${account.password}`, 'utf8').toString('base64')}`

  const search = (query: string): Response => {
    const parsed = parseQuery(query)
    if (!parsed.ok) {
      const { position, text } = parsed
      const de = `Die eingegebene Zeichenkette '${text}' ist an dieser Stelle (Zeichenposition ${position}) nicht erlaubt.`
      const en = `Submitted character string '${text}' not admissible at this place (character position ${position})`
      return new Response(`${DECLARATION}<PatentHitList HitCount="0" Message_DE="${escapeXml(de)}" Message_EN="${escapeXml(en)}"/>`, { headers: XML })
    }
    const hits = [...records].filter(([, record]) => parsed.conditions.every(condition => condition(record.parsed)))
    const shown = hits.slice(0, account.hitLimit).map(([key, record]) => hitXml(key, record.parsed)).join('')
    if (hits.length > account.hitLimit) {
      return new Response(
        `${DECLARATION}<PatentHitList HitCount="${hits.length}" maxHitsReached="true" `
        + 'Message_DE="Trefferliste wurde begrenzt  - Nicht alle Ergebnisse wurden zurückgeliefert." Message_EN="Result list is limited  - Not all results are returned">'
        + `${shown}</PatentHitList>`, { headers: XML })
    }
    return new Response(
      `${DECLARATION}<PatentHitList HitCount="${hits.length}"><Counter><DocumentHits>${hits.length}</DocumentHits>`
      + `<DatabaseHits>${hits.length}</DatabaseHits></Counter>${shown}</PatentHitList>`, { headers: XML })
  }

  return {
    leadingRegisteredNumbers: [...records.keys()],
    fetch(input, init) {
      const url = new URL(String(input))
      const at = url.pathname.indexOf(SERVICE)
      if (at < 0) return Promise.resolve(new Response('', { status: 404 }))
      if ((init?.method ?? 'GET') !== 'GET') return Promise.resolve(new Response('', { status: 405 }))
      if (new Headers(init?.headers).get('authorization') !== expected) return Promise.resolve(new Response(AUTH_ERROR, { status: 401, headers: XML }))
      const [call = '', ...rest] = url.pathname.slice(at + SERVICE.length).split('/').map(part => decodeURIComponent(part))
      const code = url.pathname.slice(at)
      switch (call) {
        case 'version':
          return Promise.resolve(new Response(data.version, { headers: { 'content-type': 'text/plain' } }))
        case 'search':
          return Promise.resolve(search(rest.join('/')))
        case 'getRegisterInfo': {
          const record = records.get(rest[0] ?? '')
          return Promise.resolve(new Response(record === undefined ? notAvailable(code, now()) : record.xml, { headers: XML }))
        }
        case 'getRegisterabzuege':
          // The double has no register extracts: each period answers as a period for which the DPMA made no file.
          return Promise.resolve(new Response(notAvailable(code, now()), { headers: XML }))
        default:
          return Promise.resolve(new Response('', { status: 404 }))
      }
    },
  }
}
