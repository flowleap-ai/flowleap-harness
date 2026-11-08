/**
 * The page's own file viewers: a PDF or an image through a `blob:` URL in the browser's viewer, Markdown through
 * `MarkdownText`, plain text, Word and PowerPoint through the Host's PDF conversion, mail through `postal-mime`, and
 * sheets through SheetJS.
 * They exist because the preview bodies of `ui-sidebar-documentpreview` render only in its own Session sidebar; when
 * that package exports a body the page can render, this module goes away (see the design note's upstream slots).
 * @module
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CellObject } from 'xlsx'
import PostalMime from 'postal-mime'
import { MarkdownText, StateDot, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import css from './Viewer.module.css'

/** How the page shows a file. */
export type ViewerKind = 'pdf' | 'image' | 'markdown' | 'text' | 'office' | 'mail' | 'sheet' | 'none'

/** The viewer of a file kind and the MIME type of its `blob:` URL, by lower-case extension. */
const VIEWERS: Readonly<Record<string, { readonly kind: Exclude<ViewerKind, 'none'>; readonly type: string }>> = {
  pdf: { kind: 'pdf', type: 'application/pdf' },
  png: { kind: 'image', type: 'image/png' },
  jpg: { kind: 'image', type: 'image/jpeg' },
  jpeg: { kind: 'image', type: 'image/jpeg' },
  gif: { kind: 'image', type: 'image/gif' },
  webp: { kind: 'image', type: 'image/webp' },
  md: { kind: 'markdown', type: 'text/markdown' },
  markdown: { kind: 'markdown', type: 'text/markdown' },
  txt: { kind: 'text', type: 'text/plain' },
  log: { kind: 'text', type: 'text/plain' },
  doc: { kind: 'office', type: 'application/pdf' },
  docx: { kind: 'office', type: 'application/pdf' },
  odt: { kind: 'office', type: 'application/pdf' },
  rtf: { kind: 'office', type: 'application/pdf' },
  ppt: { kind: 'office', type: 'application/pdf' },
  pptx: { kind: 'office', type: 'application/pdf' },
  odp: { kind: 'office', type: 'application/pdf' },
  eml: { kind: 'mail', type: 'message/rfc822' },
  xlsx: { kind: 'sheet', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xls: { kind: 'sheet', type: 'application/vnd.ms-excel' },
  csv: { kind: 'sheet', type: 'text/csv' },
}

/** The rows and the columns that the sheet viewer shows of one sheet; the rest is named, not shown. */
export const SHEET_ROWS = 1000
export const SHEET_COLUMNS = 50

/** A date cell: the date and time as the sheet holds them, kept in UTC so that no zone moves them. */
export interface SheetDate {
  readonly at: number
  /** The cell's number format shows a time of day. */
  readonly time: boolean
}

/** One cell as the viewer shows it: the text that the cell holds, or a date that the page formats in its language. */
export type SheetCell = string | SheetDate

/** One sheet as the viewer shows it: its name and its first rows. */
export interface SheetView {
  readonly name: string
  readonly rows: readonly (readonly SheetCell[])[]
  /** Rows or columns past the shown ones were left out. */
  readonly cut: boolean
}

/** The date calls of SheetJS's number format engine; the package types `SSF` as `any`. */
interface DateFormats {
  is_date(format: string): boolean
  parse_date_code(serial: number, options: { readonly date1904: boolean }): DateCode
}

/** A date serial split into its year, month, day, hour, minute and second. */
interface DateCode {
  readonly y: number
  readonly m: number
  readonly d: number
  readonly H: number
  readonly M: number
  readonly S: number
}

/** A number format that shows a time of day: an hour or a second outside its quoted text. */
function showsTime(format: string): boolean {
  return /[hs]/iu.test(format.replace(/"[^"]*"/gu, ''))
}

/**
 * Read a workbook: an `.xlsx`, `.xls` or `.csv` file. SheetJS loads only when a sheet opens. A date cell keeps its
 * serial, which has no zone, and becomes a {@link SheetDate}; a number shows the text of the sheet's own number format;
 * text shows as written. A CSV file is read as text only, so its values show as written.
 * @param bytes - the file.
 * @param csv - the file is CSV.
 * @returns each sheet with its first rows, from the first cell of its used range, with no empty row.
 */
export async function parseSheets(bytes: Uint8Array, csv: boolean): Promise<SheetView[]> {
  const xlsx = await import('xlsx')
  const { read, utils } = xlsx
  const SSF = xlsx.SSF as DateFormats
  const book = read(bytes, { type: 'array', dense: true, cellNF: true, raw: csv })
  const date1904 = book.Workbook?.WBProps?.date1904 === true
  const cellOf = (cell: CellObject | undefined): SheetCell => {
    if (cell === undefined) return ''
    if (cell.t === 'n' && typeof cell.v === 'number' && typeof cell.z === 'string' && SSF.is_date(cell.z)) {
      const code = SSF.parse_date_code(cell.v, { date1904 })
      return { at: Date.UTC(code.y, code.m - 1, code.d, code.H, code.M, code.S), time: showsTime(cell.z) }
    }
    if (cell.t === 's') return String(cell.v)
    // A formula that the file saved with no result has no text.
    return cell.w ?? ''
  }
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]
    const ref = sheet?.['!ref']
    if (sheet === undefined || ref === undefined) return { name, cut: false, rows: [] }
    const range = utils.decode_range(ref)
    const lastColumn = Math.min(range.e.c, range.s.c + SHEET_COLUMNS - 1)
    const rows: SheetCell[][] = []
    let more = range.e.c > lastColumn
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const data = sheet['!data']?.[r] ?? []
      const cells: SheetCell[] = []
      for (let c = range.s.c; c <= lastColumn; c += 1) cells.push(cellOf(data[c]))
      if (cells.every(cell => cell === '')) continue
      if (rows.length === SHEET_ROWS) {
        more = true
        break
      }
      rows.push(cells)
    }
    return { name, cut: more, rows }
  })
}

/**
 * The Intl locale of the page's language. English dates read in the order of the firm's region (01/12/2026), not the
 * US order, as on the Records pages.
 * @param locale - the page's language.
 * @returns the Intl locale.
 */
function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale
}

/** The last part of a `/`-separated path. */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The lower-case extension of a file name, without the dot. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * The viewer of a file.
 * @param name - the file's name.
 * @returns the viewer kind; `none` for a kind with no viewer.
 */
export function viewerKind(name: string): ViewerKind {
  return VIEWERS[extensionOf(name)]?.kind ?? 'none'
}

/** How the viewers read a file. */
export interface ViewerReads {
  /** The complete file. */
  readonly bytes: (path: string, signal: AbortSignal) => Promise<Uint8Array>
  /** A Word or PowerPoint file converted to PDF by the Host. */
  readonly officePdf: (path: string, signal: AbortSignal) => Promise<Uint8Array>
}

/** The viewers' localized copy. */
export interface ViewerLabels {
  readonly loading: string
  readonly failed: string
  readonly none: string
  readonly from: string
  readonly to: string
  readonly date: string
  readonly noSubject: string
  readonly sheetTabs: string
  readonly sheetEmpty: string
  readonly sheetCut: string
  readonly markdown: MarkdownLabels
  /** The accessible name of a PDF or an image. */
  readonly document: (name: string) => string
}

/** A mail as the viewer shows it. */
export interface MailView {
  readonly subject: string
  readonly from: string
  readonly to: string
  readonly date: string
  readonly text: string
}

/** One address as text: "Name <address>" or the address. */
function addressText(value: { readonly name: string; readonly address?: string | undefined } | undefined): string {
  if (value === undefined) return ''
  const name = value.name
  const address = value.address ?? ''
  return name !== '' && address !== '' ? `${name} <${address}>` : name || address
}

/** Month names of RFC 5322 dates, in calendar order. */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** An RFC 5322 date with a numeric zone: `[Sat, ]8 Nov 2026 15:40[:00] +0100`, with an optional comment after it. */
const RFC5322_DATE = new RegExp(String.raw`^\s*(?:[a-z]{3},\s*)?(\d{1,2})\s+(${MONTHS.join('|')})\s+(\d{4})\s+(\d{2}):(\d{2})`
  + String.raw`(?::(\d{2}))?\s+([+-])(\d{2})(\d{2})\s*(?:\([^)]*\))?\s*$`, 'iu')

/**
 * The time of a mail as its sender wrote it: the date and time in the zone of its `Date` header, then that zone, such
 * as "Friday, 6 November 2026, 09:14 +01:00". A header with no zone or one that is not a date shows as written.
 * @param header - the raw `Date` header, or undefined.
 * @returns the time to show; empty with no header.
 */
export function mailDate(header: string | undefined): string {
  if (header === undefined) return ''
  const match = RFC5322_DATE.exec(header)
  if (match === null) return header
  const [, day, month, year, hours, minutes, seconds, sign, zoneHours, zoneMinutes] = match
  const monthIndex = MONTHS.indexOf(String(month).toLowerCase())
  // The wall-clock time as written, held in UTC so that the viewer's own zone does not move it.
  const written = new Date(Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes), Number(seconds ?? 0)))
  const rolled = written.getUTCDate() !== Number(day) || written.getUTCHours() !== Number(hours)
    || written.getUTCMinutes() !== Number(minutes)
  if (rolled) return header
  const text = written.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })
  return `${text} ${sign}${zoneHours}:${zoneMinutes}`
}

/**
 * Parse a mail.
 * @param bytes - the `.eml` file.
 * @returns its subject, people, date and plain text; HTML-only mail shows its text content, never its markup.
 */
export async function parseMail(bytes: Uint8Array): Promise<MailView> {
  const mail = await PostalMime.parse(bytes)
  const htmlText = mail.html === undefined ? '' : new DOMParser().parseFromString(mail.html, 'text/html').body.textContent
  return {
    subject: mail.subject ?? '',
    from: addressText(mail.from),
    to: (mail.to ?? []).map(addressText).filter(text => text !== '').join(', '),
    date: mailDate(mail.headers.find(header => header.key === 'date')?.value),
    text: (mail.text ?? htmlText).trim(),
  }
}

/** What a viewer shows once its read settles. */
type Loaded =
  | { readonly kind: 'url'; readonly url: string; readonly as: 'pdf' | 'image' }
  | { readonly kind: 'markdown' | 'text'; readonly text: string }
  | { readonly kind: 'mail'; readonly mail: MailView }
  | { readonly kind: 'sheet'; readonly sheets: readonly SheetView[] }

/** The bytes as a `Blob`; a copy, because a `SharedArrayBuffer` cannot back a `Blob`. */
function blobOf(bytes: Uint8Array, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

/** The end of a PDF that holds its last trailer: the `trailer` keyword, its dictionary, `startxref` and `%%EOF`. */
const PDF_TAIL_BYTES = 64 * 1024

/**
 * Give a PDF the title that the browser's PDF viewer shows in its bar, where a `blob:` URL has no file name. An
 * incremental update appends a new document information dictionary with the title and a cross-reference section for
 * it; the earlier bytes stay as they are. A PDF whose last cross-reference is not a classic table (a cross-reference
 * stream), or that is encrypted, keeps its bytes.
 * @param bytes - the PDF.
 * @param title - the title, such as the source file's name.
 * @returns the PDF with the title, or the same bytes.
 */
export function titledPdf(bytes: Uint8Array, title: string): Uint8Array {
  const latin1 = (from: number, to: number) => new TextDecoder('latin1').decode(bytes.subarray(from, to))
  const tailStart = Math.max(0, bytes.length - PDF_TAIL_BYTES)
  const tail = latin1(tailStart, bytes.length)
  const end = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(tail)
  const trailerAt = tail.lastIndexOf('trailer')
  if (end === null || trailerAt < 0) return bytes
  const trailer = tail.slice(trailerAt, end.index)
  const prev = Number(end[1])
  const size = /\/Size\s+(\d+)/u.exec(trailer)
  const root = /\/Root\s+(\d+\s+\d+\s+R)/u.exec(trailer)
  if (size === null || root === null || /\/Encrypt\b/u.test(trailer) || latin1(prev, prev + 4) !== 'xref') return bytes
  const id = /\/ID\s*\[[^\]]*\]/u.exec(trailer)?.[0] ?? ''
  const number = Number(size[1])
  // A UTF-16BE text string: the byte order mark, then each code unit as four hex digits.
  const hex = Array.from({ length: title.length }, (_, index) => title.charCodeAt(index).toString(16).padStart(4, '0')).join('')
  const object = `\n${number} 0 obj\n<</Title <FEFF${hex.toUpperCase()}>>>\nendobj\n`
  const objectAt = bytes.length + 1
  const xrefAt = bytes.length + object.length
  const update = `${object}xref\n${number} 1\n${String(objectAt).padStart(10, '0')} 00000 n \ntrailer\n`
    + `<</Size ${number + 1}/Root ${root[1]}/Info ${number} 0 R/Prev ${prev}${id}>>\nstartxref\n${xrefAt}\n%%EOF\n`
  const added = new TextEncoder().encode(update)
  const out = new Uint8Array(bytes.length + added.length)
  out.set(bytes)
  out.set(added, bytes.length)
  return out
}

/**
 * Read a file for its viewer.
 * @param path - the file.
 * @param kind - its viewer kind; never `none`.
 * @param reads - the readers.
 * @param signal - aborted when the viewer changes file.
 * @returns what the viewer shows.
 */
async function load(path: string, viewer: (typeof VIEWERS)[string], reads: ViewerReads, signal: AbortSignal): Promise<Loaded> {
  const { kind, type } = viewer
  switch (kind) {
    case 'pdf':
      return { kind: 'url', as: 'pdf', url: URL.createObjectURL(blobOf(titledPdf(await reads.bytes(path, signal), nameOf(path)), type)) }
    case 'office':
      return { kind: 'url', as: 'pdf', url: URL.createObjectURL(blobOf(titledPdf(await reads.officePdf(path, signal), nameOf(path)), type)) }
    case 'image':
      return { kind: 'url', as: 'image', url: URL.createObjectURL(blobOf(await reads.bytes(path, signal), type)) }
    case 'markdown':
    case 'text':
      return { kind, text: new TextDecoder().decode(await reads.bytes(path, signal)) }
    case 'mail':
      return { kind: 'mail', mail: await parseMail(await reads.bytes(path, signal)) }
    case 'sheet':
      return { kind: 'sheet', sheets: await parseSheets(await reads.bytes(path, signal), extensionOf(path) === 'csv') }
    /* v8 ignore next 2 -- closed union: VIEWERS holds only the kinds above. */
    default:
      return assertNever(kind, 'viewer kind')
  }
}

/** The file viewer's props. */
export interface FileViewerProps {
  /** The file relative to the client folder. */
  readonly path: string
  readonly reads: ViewerReads
  readonly labels: ViewerLabels
  /** The page's language, which formats the dates of a sheet. */
  readonly locale: string
  /** Shown under "no viewer", such as an "Open in the system app" button. */
  readonly fallback?: ReactNode
}

/**
 * Show one file in the middle area: a centred spinner while it loads, the file, or one sentence when it cannot show.
 * @param props - the file, its readers and the copy.
 * @returns the viewer.
 */
export function FileViewer({ path, reads, labels, locale, fallback }: FileViewerProps): ReactNode {
  const viewer = VIEWERS[extensionOf(path)]
  const [state, setState] = useState<{ readonly path: string; readonly loaded?: Loaded; readonly failed?: true } | null>(null)
  useEffect(() => {
    if (viewer === undefined) return undefined
    const controller = new AbortController()
    let url: string | undefined
    setState({ path })
    load(path, viewer, reads, controller.signal).then((loaded) => {
      if (loaded.kind === 'url') url = loaded.url
      if (controller.signal.aborted) {
        if (url !== undefined) URL.revokeObjectURL(url)
        return
      }
      setState({ path, loaded })
    }, (_error: unknown) => {
      // The read or the conversion failed; the viewer says so in one sentence and the list stays usable.
      if (!controller.signal.aborted) setState({ path, failed: true })
    })
    return () => {
      controller.abort()
      if (url !== undefined) URL.revokeObjectURL(url)
    }
  }, [path, viewer, reads])
  const name = nameOf(path)
  if (viewer === undefined) return <div className={css.message} role="status"><p>{labels.none}</p>{fallback}</div>
  if (state?.path !== path || (state.loaded === undefined && state.failed === undefined)) {
    return <div className={css.message} role="status" aria-label={labels.loading}><StateDot state="ongoing" size={24} /></div>
  }
  if (state.failed === true || state.loaded === undefined) return <div className={css.message} role="alert"><p>{labels.failed}</p>{fallback}</div>
  const loaded = state.loaded
  switch (loaded.kind) {
    case 'url':
      return loaded.as === 'pdf'
        ? <iframe className={css.pdf} src={loaded.url} title={labels.document(name)} data-testid="folder-pdf" />
        : <div className={css.scroll}><img className={css.image} src={loaded.url} alt={labels.document(name)} /></div>
    case 'markdown':
      return (
        <div className={css.scroll}>
          <article className={css.page}><MarkdownText text={loaded.text} labels={labels.markdown} omitHtml /></article>
        </div>
      )
    case 'text':
      return <div className={css.scroll}><pre className={css.text}>{loaded.text}</pre></div>
    case 'mail':
      return (
        <div className={css.scroll}>
          <article className={css.page} data-testid="folder-mail">
            <h2 className={css.subject}>{loaded.mail.subject || labels.noSubject}</h2>
            <dl className={css.facts}>
              <dt>{labels.from}</dt><dd>{loaded.mail.from}</dd>
              <dt>{labels.to}</dt><dd>{loaded.mail.to}</dd>
              <dt>{labels.date}</dt><dd>{loaded.mail.date}</dd>
            </dl>
            <div className={css.body}>{loaded.mail.text}</div>
          </article>
        </div>
      )
    case 'sheet':
      return <Sheets sheets={loaded.sheets} labels={labels} locale={locale} />
    /* v8 ignore next 2 -- closed union: load returns only the shapes above. */
    default:
      return assertNever(loaded, 'loaded file')
  }
}

/**
 * The sheets of a workbook: a tab for each sheet and the open sheet's first rows as a read-only table.
 * @param props - the sheets and the copy.
 * @returns the viewer.
 */
function Sheets({ sheets, labels, locale }: {
  readonly sheets: readonly SheetView[]
  readonly labels: ViewerLabels
  readonly locale: string
}) {
  const [open, setOpen] = useState(0)
  const dates = useMemo(() => {
    const day = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' } as const
    return {
      day: new Intl.DateTimeFormat(intlLocale(locale), day),
      time: new Intl.DateTimeFormat(intlLocale(locale), { ...day, hour: '2-digit', minute: '2-digit' }),
    }
  }, [locale])
  const textOf = (cell: SheetCell) => typeof cell === 'string' ? cell : (cell.time ? dates.time : dates.day).format(cell.at)
  const sheet = sheets[open]
  return (
    <div className={css.scroll}>
      {sheets.length > 1 && (
        <div className={css.tabs} role="tablist" aria-label={labels.sheetTabs}>
          {sheets.map((item, index) => (
            <button key={item.name} type="button" role="tab" aria-selected={index === open} className={css.tab}
              onClick={() => { setOpen(index) }}>
              {item.name}
            </button>
          ))}
        </div>
      )}
      {sheet === undefined || sheet.rows.length === 0
        ? <p className={css.note}>{labels.sheetEmpty}</p>
        : (
          <div className={css.sheet} role="tabpanel" data-testid="folder-sheet">
            <table>
              <tbody>
                {sheet.rows.map((row, index) => (
                  <tr key={index}>{row.map((cell, column) => <td key={column}>{textOf(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {sheet.cut && <p className={css.note}>{labels.sheetCut}</p>}
          </div>
        )}
    </div>
  )
}
