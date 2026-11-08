/**
 * The page's own file viewers: a PDF or an image through a `blob:` URL in the browser's viewer, Markdown through
 * `MarkdownText`, plain text, Word and PowerPoint through the Host's PDF conversion, mail through `postal-mime`, and
 * sheets through SheetJS.
 * They exist because the preview bodies of `ui-sidebar-documentpreview` render only in its own Session sidebar; when
 * that package exports a body the page can render, this module goes away (see the design note's upstream slots).
 * @module
 */

import { useEffect, useState, type ReactNode } from 'react'
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

/** One sheet as the viewer shows it: its name and its first rows as text. */
export interface SheetView {
  readonly name: string
  readonly rows: readonly (readonly string[])[]
  /** Rows or columns past the shown ones were left out. */
  readonly cut: boolean
}

/**
 * Read a workbook: an `.xlsx`, `.xls` or `.csv` file. SheetJS loads only when a sheet opens.
 * @param bytes - the file.
 * @returns each sheet with its first rows as the cells' formatted text.
 */
export async function parseSheets(bytes: Uint8Array): Promise<SheetView[]> {
  const { read, utils } = await import('xlsx')
  const book = read(bytes, { type: 'array', dense: true })
  return book.SheetNames.map((name) => {
    const rows = utils.sheet_to_json<unknown[]>(book.Sheets[name] ?? {}, { header: 1, raw: false, defval: '', blankrows: false })
    const cut = rows.length > SHEET_ROWS || rows.some(row => row.length > SHEET_COLUMNS)
    return { name, cut, rows: rows.slice(0, SHEET_ROWS).map(row => row.slice(0, SHEET_COLUMNS).map(cell => String(cell))) }
  })
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
      return { kind: 'url', as: 'pdf', url: URL.createObjectURL(blobOf(await reads.bytes(path, signal), type)) }
    case 'office':
      return { kind: 'url', as: 'pdf', url: URL.createObjectURL(blobOf(await reads.officePdf(path, signal), type)) }
    case 'image':
      return { kind: 'url', as: 'image', url: URL.createObjectURL(blobOf(await reads.bytes(path, signal), type)) }
    case 'markdown':
    case 'text':
      return { kind, text: new TextDecoder().decode(await reads.bytes(path, signal)) }
    case 'mail':
      return { kind: 'mail', mail: await parseMail(await reads.bytes(path, signal)) }
    case 'sheet':
      return { kind: 'sheet', sheets: await parseSheets(await reads.bytes(path, signal)) }
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
  /** Shown under "no viewer", such as an "Open in the system app" button. */
  readonly fallback?: ReactNode
}

/**
 * Show one file in the middle area: a centred spinner while it loads, the file, or one sentence when it cannot show.
 * @param props - the file, its readers and the copy.
 * @returns the viewer.
 */
export function FileViewer({ path, reads, labels, fallback }: FileViewerProps): ReactNode {
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
  const name = path.slice(path.lastIndexOf('/') + 1)
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
      return <Sheets sheets={loaded.sheets} labels={labels} />
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
function Sheets({ sheets, labels }: { readonly sheets: readonly SheetView[]; readonly labels: ViewerLabels }) {
  const [open, setOpen] = useState(0)
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
                  <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {sheet.cut && <p className={css.note}>{labels.sheetCut}</p>}
          </div>
        )}
    </div>
  )
}
