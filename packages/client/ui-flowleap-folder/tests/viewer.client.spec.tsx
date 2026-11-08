// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CFB as UntypedCfb, utils, write } from 'xlsx'
import {
  extensionOf, FileViewer, mailDate, parseMail, parseSheets, SHEET_COLUMNS, SHEET_ROWS, viewerKind, type ViewerLabels, type ViewerReads,
} from '../src/client/viewer.tsx'

const encode = (text: string) => new TextEncoder().encode(text)

const LABELS: ViewerLabels = {
  loading: 'Loading', failed: 'This file could not be shown.', none: 'No preview', from: 'From', to: 'To', date: 'Date', noSubject: 'No subject',
  sheetTabs: 'Sheets', sheetEmpty: 'This sheet is empty.', sheetCut: 'Only the first rows and columns show.',
  markdown: { code: { copyLabel: 'Copy', copiedLabel: 'Copied', toolbarLabels: { codeLabel: 'Code', wrapLabel: 'Wrap', unwrapLabel: 'Unwrap' } }, footnotes: 'Footnotes' },
  document: name => `Document ${name}`,
}

const TEXT_MAIL = [
  'From: "Dr. Anna Becker" <becker@firm.test>',
  'To: Syntegon <ip@syntegon.test>, office@firm.test',
  'Subject: EP 23 171 862: Rule 71(3)',
  'Date: Fri, 06 Nov 2026 09:30:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Please approve the text by 20 November.',
  '',
].join('\r\n')

const HTML_MAIL = [
  'From: <noreply@epo.test>',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>Your <b>communication</b> is ready.</p><script>alert(1)</script></body></html>',
  '',
].join('\r\n')

let created: Blob[]
let revoked: string[]

beforeEach(() => {
  created = []
  revoked = []
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    if (blob instanceof Blob) created.push(blob)
    return `blob:viewer/${created.length}`
  }
  URL.revokeObjectURL = (url: string) => { revoked.push(url) }
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

/** Readers over fixed bytes; `officePdf` answers the converted PDF. */
function readers(bytes: Uint8Array, overrides: Partial<ViewerReads> = {}): ViewerReads {
  return { bytes: async () => bytes, officePdf: async () => encode('%PDF-converted'), ...overrides }
}

describe('viewerKind', () => {
  it('picks the viewer by the lower-case extension, and none for a file with no viewer or no extension', () => {
    expect(extensionOf('EP 4 292 805 A1.PDF')).toBe('pdf')
    expect(extensionOf('.env')).toBe('')
    expect(extensionOf('Makefile')).toBe('')
    expect(['a.pdf', 'a.JPG', 'a.md', 'a.txt', 'a.docx', 'a.pptx', 'a.eml', 'a.xlsx', 'a.XLS', 'a.csv', 'a.zip', 'README'].map(viewerKind))
      .toEqual(['pdf', 'image', 'markdown', 'text', 'office', 'office', 'mail', 'sheet', 'sheet', 'sheet', 'none', 'none'])
  })
})

/** A date and time as the mail viewer writes it, in the sender's zone. */
function wallTime(year: number, month: number, day: number, hour: number, minute: number, zone: string): string {
  const text = new Date(Date.UTC(year, month - 1, day, hour, minute)).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })
  return `${text} ${zone}`
}

describe('mailDate', () => {
  it('shows the time that the sender wrote, in the zone of the Date header, with that zone', () => {
    expect(mailDate('Sat, 8 Nov 2026 15:40:00 +0100')).toBe(wallTime(2026, 11, 8, 15, 40, '+01:00'))
    expect(mailDate('Fri, 06 Nov 2026 23:30:00 -0500 (EST)')).toBe(wallTime(2026, 11, 6, 23, 30, '-05:00'))
    expect(mailDate('Mon, 9 Nov 2026 00:15:00 +0530')).toBe(wallTime(2026, 11, 9, 0, 15, '+05:30'))
  })

  it('shows a header with no zone or no date as written, and nothing with no header', () => {
    expect(mailDate(undefined)).toBe('')
    expect(mailDate('Fri, 06 Nov 2026 09:30:00 GMT')).toBe('Fri, 06 Nov 2026 09:30:00 GMT')
    expect(mailDate('32 Nov 2026 10:00 +0100')).toBe('32 Nov 2026 10:00 +0100')
    expect(mailDate('8 Nov 2026 25:00 +0100')).toBe('8 Nov 2026 25:00 +0100')
    expect(mailDate('8 Nov 2026 10:60 +0100')).toBe('8 Nov 2026 10:60 +0100')
  })

  it('shows text that is no RFC 5322 date as written, though it ends in a zone that a lenient date parser accepts', () => {
    expect(mailDate('sometime +0100')).toBe('sometime +0100')
  })

  it('reads a date with no weekday and no seconds', () => {
    expect(mailDate('8 nov 2026 15:40 +0100')).toBe(wallTime(2026, 11, 8, 15, 40, '+01:00'))
  })
})

/** The zip calls of SheetJS that a test uses to damage a workbook; the package types its CFB library as `any`. */
interface ZipLibrary {
  read(bytes: Uint8Array, options: { type: 'array' }): object
  write(zip: object, options: { type: 'array'; fileType: 'zip' }): ArrayBuffer | number[]
  readonly utils: { cfb_del(zip: object, path: string): boolean }
}
const CFB = UntypedCfb as ZipLibrary

/** A workbook file with one sheet for each entry. */
function workbook(sheets: Record<string, unknown[][]>, bookType: 'xlsx' | 'xls' = 'xlsx'): Uint8Array {
  const book = utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) utils.book_append_sheet(book, utils.aoa_to_sheet(rows), name)
  return new Uint8Array(write(book, { type: 'array', bookType }) as ArrayBuffer)
}

describe('parseSheets', () => {
  it('reads each sheet of a workbook as the text of its cells', async () => {
    expect(await parseSheets(workbook({ Fees: [['Fee', 'EUR'], ['Filing', 135]], Deadlines: [['Rule 71(3)', '2026-11-20']] }))).toEqual([
      { name: 'Fees', cut: false, rows: [['Fee', 'EUR'], ['Filing', '135']] },
      { name: 'Deadlines', cut: false, rows: [['Rule 71(3)', '2026-11-20']] },
    ])
    expect(await parseSheets(workbook({ Old: [['Fee', 7]] }, 'xls'))).toEqual([{ name: 'Old', cut: false, rows: [['Fee', '7']] }])
    expect(await parseSheets(encode('Fee,EUR\nFiling,135\n'))).toEqual([{ name: 'Sheet1', cut: false, rows: [['Fee', 'EUR'], ['Filing', '135']] }])
  })

  it('fills a gap and a short row with empty cells, leaves out blank rows, and reads an empty sheet as no rows', async () => {
    expect(await parseSheets(workbook({ Gaps: [['a', null, 'c'], [], ['d']], Empty: [] }))).toEqual([
      { name: 'Gaps', cut: false, rows: [['a', '', 'c'], ['d', '', '']] },
      { name: 'Empty', cut: false, rows: [] },
    ])
  })

  it('reads a sheet whose part a damaged workbook lacks as no rows', async () => {
    const zip = CFB.read(workbook({ One: [['a']], Two: [['b']] }), { type: 'array' })
    CFB.utils.cfb_del(zip, '/xl/worksheets/sheet2.xml')
    const damaged = new Uint8Array(CFB.write(zip, { type: 'array', fileType: 'zip' }))
    expect(await parseSheets(damaged)).toEqual([{ name: 'One', cut: false, rows: [['a']] }, { name: 'Two', cut: false, rows: [] }])
  })

  it('shows the first rows and columns of a large sheet and says that the rest was left out', async () => {
    const tall = Array.from({ length: SHEET_ROWS + 1 }, (_, index) => [`row ${index + 1}`])
    const [sheet] = await parseSheets(workbook({ Tall: tall }))
    expect([sheet!.cut, sheet!.rows.length, sheet!.rows.at(-1)]).toEqual([true, SHEET_ROWS, [`row ${SHEET_ROWS}`]])
    const [wide] = await parseSheets(workbook({ Wide: [Array.from({ length: SHEET_COLUMNS + 1 }, (_, index) => `c${index + 1}`)] }))
    expect([wide!.cut, wide!.rows[0]!.length, wide!.rows[0]!.at(-1)]).toEqual([true, SHEET_COLUMNS, `c${SHEET_COLUMNS}`])
    const [exact] = await parseSheets(workbook({ Exact: Array.from({ length: SHEET_ROWS }, () => Array.from({ length: SHEET_COLUMNS }, () => 'x')) }))
    expect(exact!.cut).toBe(false)
  })
})

describe('parseMail', () => {
  it('reads the subject, the people, the date and the plain text of a mail', async () => {
    const mail = await parseMail(encode(TEXT_MAIL))
    expect(mail).toMatchObject({
      subject: 'EP 23 171 862: Rule 71(3)',
      from: 'Dr. Anna Becker <becker@firm.test>',
      to: 'Syntegon <ip@syntegon.test>, office@firm.test',
      text: 'Please approve the text by 20 November.',
    })
    expect(mail.date).toBe(wallTime(2026, 11, 6, 9, 30, '+00:00'))
  })

  it('shows the text content of an HTML-only mail, never its markup, and leaves out what it does not have', async () => {
    expect(await parseMail(encode(HTML_MAIL))).toEqual({ subject: '', from: 'noreply@epo.test', to: '', date: '', text: 'Your communication is ready.alert(1)' })
    expect(await parseMail(encode('Subject: Empty\r\n\r\n'))).toEqual({ subject: 'Empty', from: '', to: '', date: '', text: '' })
    expect((await parseMail(encode('To: Undisclosed recipients:;\r\n\r\nx\r\n'))).to).toBe('Undisclosed recipients')
  })
})

describe('FileViewer', () => {
  it('shows a PDF in the browser\'s viewer through a blob URL, and revokes the URL when it goes', async () => {
    const view = render(<FileViewer path="Search/D1.pdf" reads={readers(encode('%PDF-1.7'))} labels={LABELS} />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    const frame = await screen.findByTitle('Document D1.pdf')
    expect(frame.getAttribute('src')).toBe('blob:viewer/1')
    expect(created[0]!.type).toBe('application/pdf')
    view.unmount()
    expect(revoked).toEqual(['blob:viewer/1'])
  })

  it('shows a Word file as the PDF that the Host converts', async () => {
    const officePdf = vi.fn(async () => encode('%PDF-converted'))
    render(<FileViewer path="Letter.docx" reads={readers(encode('docx'), { officePdf })} labels={LABELS} />)
    expect((await screen.findByTestId('folder-pdf')).getAttribute('src')).toBe('blob:viewer/1')
    expect(officePdf).toHaveBeenCalledWith('Letter.docx', expect.any(AbortSignal))
    expect(await created[0]!.text()).toBe('%PDF-converted')
  })

  it('shows an image with its MIME type', async () => {
    const view = render(<FileViewer path="Drawings/Fig 1.PNG" reads={readers(encode('png'))} labels={LABELS} />)
    expect((await screen.findByRole('img', { name: 'Document Fig 1.PNG' })).getAttribute('src')).toBe('blob:viewer/1')
    expect(created[0]!.type).toBe('image/png')
    view.unmount()
  })

  it('shows Markdown as a page and plain text as it is', async () => {
    const view = render(<FileViewer path="Office/EP-Register.md" reads={readers(encode('# Register\n\nGrant intended.'))} labels={LABELS} />)
    expect(await screen.findByRole('heading', { name: 'Register' })).toBeTruthy()
    view.unmount()
    render(<FileViewer path="log.txt" reads={readers(encode('line 1\nline 2'))} labels={LABELS} />)
    expect((await screen.findByText(/line 1/u)).textContent).toBe('line 1\nline 2')
  })

  it('shows a mail with its people and date, and No subject for a mail with none', async () => {
    const view = render(<FileViewer path="Mail/approval.eml" reads={readers(encode(TEXT_MAIL))} labels={LABELS} />)
    const mail = await screen.findByTestId('folder-mail')
    expect(mail.querySelector('h2')?.textContent).toBe('EP 23 171 862: Rule 71(3)')
    expect(mail.textContent).toContain('Dr. Anna Becker <becker@firm.test>')
    expect(mail.textContent).toContain('Please approve the text by 20 November.')
    view.unmount()
    render(<FileViewer path="Mail/notice.eml" reads={readers(encode(HTML_MAIL))} labels={LABELS} />)
    expect((await screen.findByTestId('folder-mail')).querySelector('h2')?.textContent).toBe('No subject')
  })

  it('shows a workbook with one sheet as a table with no tabs, and says when rows were left out', async () => {
    const rows = [['Fee', 'EUR'], ...Array.from({ length: SHEET_ROWS }, (_, index) => [`Fee ${index + 1}`, index])]
    render(<FileViewer path="Fees.xlsx" reads={readers(workbook({ Fees: rows }))} labels={LABELS} />)
    const sheet = await screen.findByTestId('folder-sheet')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(sheet.querySelectorAll('tr')).toHaveLength(SHEET_ROWS)
    expect([...sheet.querySelectorAll('tr')[0]!.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['Fee', 'EUR'])
    expect(screen.getByText(LABELS.sheetCut)).toBeTruthy()
  })

  it('shows a tab for each sheet of a workbook, switches the sheet on a tab, and says when a sheet is empty', async () => {
    render(<FileViewer path="Docket.xlsx" reads={readers(workbook({ Fees: [['Filing', 135]], Deadlines: [['Rule 71(3)']], Notes: [] }))} labels={LABELS} />)
    const tabs = within(await screen.findByRole('tablist', { name: LABELS.sheetTabs })).getAllByRole('tab')
    expect(tabs.map(tab => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['Fees', 'true'], ['Deadlines', 'false'], ['Notes', 'false']])
    expect(screen.getByRole('tabpanel').textContent).toBe('Filing135')
    expect(screen.queryByText(LABELS.sheetCut)).toBeNull()
    fireEvent.click(tabs[1]!)
    expect(screen.getByRole('tabpanel').textContent).toBe('Rule 71(3)')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(tabs[2]!)
    expect(screen.queryByRole('tabpanel')).toBeNull()
    expect(screen.getByText(LABELS.sheetEmpty)).toBeTruthy()
  })

  it('reads a CSV file as one sheet', async () => {
    render(<FileViewer path="Export.CSV" reads={readers(encode('Matter,Due\nEP 23 171 862,2026-11-20\n'))} labels={LABELS} />)
    expect((await screen.findByTestId('folder-sheet')).textContent).toBe('MatterDueEP 23 171 8622026-11-20')
  })

  it('says in one sentence that a file has no viewer, with the fallback, and reads nothing', () => {
    const bytes = vi.fn(async () => encode(''))
    render(<FileViewer path="Fees.zip" reads={readers(encode(''), { bytes })} labels={LABELS} fallback={<button type="button">Open in the system app</button>} />)
    expect(screen.getByRole('status').textContent).toBe('No previewOpen in the system app')
    expect(bytes).not.toHaveBeenCalled()
  })

  it('says the file could not be shown when the read fails', async () => {
    render(<FileViewer path="D1.pdf" reads={readers(encode(''), { bytes: async () => { throw new Error('gone') } })} labels={LABELS} fallback={<span>fallback</span>} />)
    expect((await screen.findByRole('alert')).textContent).toBe(`${LABELS.failed}fallback`)
  })

  it('drops the answer of a file the person left, and revokes its URL', async () => {
    const answers: ((bytes: Uint8Array) => void)[] = []
    const failures: ((error: Error) => void)[] = []
    const reads = readers(encode(''), {
      bytes: (path: string) => new Promise<Uint8Array>((resolve, reject) => {
        if (path.endsWith('.txt')) failures.push(reject)
        else answers.push(resolve)
      }),
    })
    const view = render(<FileViewer path="D1.pdf" reads={reads} labels={LABELS} />)
    view.rerender(<FileViewer path="note.txt" reads={reads} labels={LABELS} />)
    view.rerender(<FileViewer path="D2.pdf" reads={reads} labels={LABELS} />)
    answers[0]!(encode('%PDF-1'))
    failures[0]!(new Error('gone'))
    await waitFor(() => { expect(revoked).toEqual(['blob:viewer/1']) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    answers[1]!(encode('%PDF-2'))
    expect((await screen.findByTitle('Document D2.pdf')).getAttribute('src')).toBe('blob:viewer/2')
  })

  it('drops the text of a file the person left', async () => {
    let answer: (bytes: Uint8Array) => void = () => {}
    const reads = readers(encode(''), { bytes: (path: string) => path === 'a.md' ? new Promise<Uint8Array>((resolve) => { answer = resolve }) : Promise.resolve(encode('b')) })
    const view = render(<FileViewer path="a.md" reads={reads} labels={LABELS} />)
    view.rerender(<FileViewer path="b.txt" reads={reads} labels={LABELS} />)
    expect(await screen.findByText('b')).toBeTruthy()
    answer(encode('# a'))
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('heading')).toBeNull()
    expect(revoked).toEqual([])
  })
})
