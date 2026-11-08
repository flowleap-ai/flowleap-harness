// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CFB as UntypedCfb, utils, write } from 'xlsx'
import {
  extensionOf, FileViewer, mailDate, parseMail, parseSheets, SHEET_COLUMNS, SHEET_ROWS, titledPdf, viewerKind, type ViewerLabels,
  type ViewerReads,
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

/** A one-page PDF with a classic cross-reference table, as the Office conversion writes it; `trailerExtra` goes into its trailer. */
function classicPdf(trailerExtra = '', id = '/ID [ <AB> <AB> ]'): Uint8Array {
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>', '<</Producer(LibreOffice)>>']
  let text = '%PDF-1.7\n'
  const offsets = objects.map((body, index) => {
    const at = text.length
    text += `${index + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = text.length
  text += `xref\n0 5\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  text += `trailer\n<</Size 5/Root 1 0 R\n/Info 4 0 R\n${id}${trailerExtra}>>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(text)
}

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('titledPdf', () => {
  it('appends an update whose information dictionary holds the title, with offsets that point at its object and its table', () => {
    const before = classicPdf()
    const after = titledPdf(before, 'Instruction letter.docx')
    expect(text(after.subarray(0, before.length))).toBe(text(before))
    const update = text(after.subarray(before.length))
    const objectAt = Number(/\n(\d{10}) 00000 n \n/u.exec(update)![1])
    const xrefAt = Number(/startxref\n(\d+)\n%%EOF\n$/u.exec(update)![1])
    expect(text(after.subarray(objectAt, objectAt + 8))).toBe('5 0 obj\n')
    expect(text(after.subarray(xrefAt, xrefAt + 10))).toBe('xref\n5 1\n0')
    expect(update).toContain('<</Title <FEFF0049006E0073007400720075006300740069006F006E0020006C00650074007400650072002E0064006F00630078>>>')
    const firstXref = text(before).indexOf('xref\n0 5')
    expect(update).toContain(`<</Size 6/Root 1 0 R/Info 5 0 R/Prev ${firstXref}/ID [ <AB> <AB> ]>>`)
  })

  it('writes a trailer with no file identifier when the PDF has none', () => {
    expect(text(titledPdf(classicPdf('', ''), 'x'))).toMatch(/<<\/Size 6\/Root 1 0 R\/Info 5 0 R\/Prev \d+>>\nstartxref\n/u)
  })

  it('writes a title outside Latin-1 as UTF-16 code units, an emoji as its two surrogates', () => {
    expect(text(titledPdf(classicPdf(), 'Ü🙂'))).toContain('<</Title <FEFF00DCD83DDE42>>>')
  })

  it('keeps the bytes of an encrypted PDF, of a PDF with a cross-reference stream, and of bytes that are no PDF', () => {
    const encrypted = classicPdf('/Encrypt 9 0 R')
    expect(titledPdf(encrypted, 'x')).toBe(encrypted)
    const stream = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<</Type/XRef/Size 1/Root 1 0 R>>\nstream\nendstream\nendobj\nstartxref\n9\n%%EOF\n')
    expect(titledPdf(stream, 'x')).toBe(stream)
    const pointsAway = new TextEncoder().encode('%PDF-1.7\ntrailer\n<</Size 1/Root 1 0 R>>\nstartxref\n0\n%%EOF\n')
    expect(titledPdf(pointsAway, 'x')).toBe(pointsAway)
    const noRoot = new TextEncoder().encode('xref\ntrailer\n<</Size 1>>\nstartxref\n0\n%%EOF\n')
    expect(titledPdf(noRoot, 'x')).toBe(noRoot)
    const garbage = new TextEncoder().encode('not a pdf')
    expect(titledPdf(garbage, 'x')).toBe(garbage)
  })
})

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
function workbook(sheets: Record<string, unknown[][]>, bookType: 'xlsx' | 'xls' = 'xlsx', date1904 = false): Uint8Array {
  const book = utils.book_new()
  if (date1904) book.Workbook = { WBProps: { date1904 } }
  for (const [name, rows] of Object.entries(sheets)) utils.book_append_sheet(book, utils.aoa_to_sheet(rows), name)
  return new Uint8Array(write(book, { type: 'array', bookType }) as ArrayBuffer)
}

describe('parseSheets', () => {
  it('reads each sheet of a workbook as the text of its cells', async () => {
    expect(await parseSheets(workbook({ Fees: [['Fee', 'EUR'], ['Filing', 135]], Deadlines: [['Rule 71(3)', '2026-11-20']] }), false)).toEqual([
      { name: 'Fees', cut: false, rows: [['Fee', 'EUR'], ['Filing', '135']] },
      { name: 'Deadlines', cut: false, rows: [['Rule 71(3)', '2026-11-20']] },
    ])
    expect(await parseSheets(workbook({ Old: [['Fee', 7]] }, 'xls'), false)).toEqual([{ name: 'Old', cut: false, rows: [['Fee', '7']] }])
    expect(await parseSheets(encode('Fee,EUR\nFiling,135\n'), true)).toEqual([{ name: 'Sheet1', cut: false, rows: [['Fee', 'EUR'], ['Filing', '135']] }])
  })

  it('fills a gap and a short row with empty cells, leaves out blank rows, and reads an empty sheet as no rows', async () => {
    expect(await parseSheets(workbook({ Gaps: [['a', null, 'c'], [], ['d']], Empty: [] }), false)).toEqual([
      { name: 'Gaps', cut: false, rows: [['a', '', 'c'], ['d', '', '']] },
      { name: 'Empty', cut: false, rows: [] },
    ])
  })

  it('reads a sheet whose part a damaged workbook lacks as no rows', async () => {
    const zip = CFB.read(workbook({ One: [['a']], Two: [['b']] }), { type: 'array' })
    CFB.utils.cfb_del(zip, '/xl/worksheets/sheet2.xml')
    const damaged = new Uint8Array(CFB.write(zip, { type: 'array', fileType: 'zip' }))
    expect(await parseSheets(damaged, false)).toEqual([{ name: 'One', cut: false, rows: [['a']] }, { name: 'Two', cut: false, rows: [] }])
  })

  it('reads a date cell from its serial, with the time when its format shows one, and a number as its format shows it', async () => {
    const day = { t: 'n', v: 46357, z: 'm/d/yy' }
    const noon = { t: 'n', v: 46357.5, z: 'yyyy-mm-dd hh:mm' }
    const quoted = { t: 'n', v: 46357, z: 'd "hours" mmm yyyy' }
    const fee = { t: 'n', v: 1234.5, z: '#,##0.00' }
    for (const bookType of ['xlsx', 'xls'] as const) {
      expect(await parseSheets(workbook({ Dates: [[day, noon, quoted, fee, '12/1/26']] }, bookType), false)).toEqual([{
        name: 'Dates', cut: false,
        rows: [[{ at: Date.UTC(2026, 11, 1), time: false }, { at: Date.UTC(2026, 11, 1, 12), time: true }, { at: Date.UTC(2026, 11, 1), time: false }, '1,234.50', '12/1/26']],
      }])
    }
  })

  it('shows a boolean and an error as the sheet writes them, and a formula saved with no result as an empty cell', async () => {
    const [sheet] = await parseSheets(workbook({ Checks: [['Paid', { t: 'b', v: true }, { t: 'e', v: 7 }, { t: 'n', f: '1+1' }]] }), false)
    expect(sheet!.rows).toEqual([['Paid', 'TRUE', '#DIV/0!', '']])
  })

  it('reads a date of a workbook in the 1904 date system', async () => {
    const [sheet] = await parseSheets(workbook({ Mac: [[{ t: 'n', v: 0, z: 'm/d/yy' }]] }, 'xlsx', true), false)
    expect(sheet!.rows).toEqual([[{ at: Date.UTC(1904, 0, 1), time: false }]])
  })

  it('reads every value of a CSV file as the text it holds', async () => {
    expect(await parseSheets(encode('Due,Annuity,Fee\n2027-06-30,4,1.000\n'), true)).toEqual([
      { name: 'Sheet1', cut: false, rows: [['Due', 'Annuity', 'Fee'], ['2027-06-30', '4', '1.000']] },
    ])
  })

  it('shows the first rows and columns of a large sheet and says that the rest was left out', async () => {
    const tall = Array.from({ length: SHEET_ROWS + 1 }, (_, index) => [`row ${index + 1}`])
    const [sheet] = await parseSheets(workbook({ Tall: tall }), false)
    expect([sheet!.cut, sheet!.rows.length, sheet!.rows.at(-1)]).toEqual([true, SHEET_ROWS, [`row ${SHEET_ROWS}`]])
    const [wide] = await parseSheets(workbook({ Wide: [Array.from({ length: SHEET_COLUMNS + 1 }, (_, index) => `c${index + 1}`)] }), false)
    expect([wide!.cut, wide!.rows[0]!.length, wide!.rows[0]!.at(-1)]).toEqual([true, SHEET_COLUMNS, `c${SHEET_COLUMNS}`])
    const [exact] = await parseSheets(workbook({ Exact: Array.from({ length: SHEET_ROWS }, () => Array.from({ length: SHEET_COLUMNS }, () => 'x')) }), false)
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
    const view = render(<FileViewer path="Search/D1.pdf" reads={readers(encode('%PDF-1.7'))} labels={LABELS} locale="en" />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
    const frame = await screen.findByTitle('Document D1.pdf')
    expect(frame.getAttribute('src')).toBe('blob:viewer/1')
    expect(created[0]!.type).toBe('application/pdf')
    view.unmount()
    expect(revoked).toEqual(['blob:viewer/1'])
  })

  it('shows a Word file as the PDF that the Host converts', async () => {
    const officePdf = vi.fn(async () => encode('%PDF-converted'))
    render(<FileViewer path="Letter.docx" reads={readers(encode('docx'), { officePdf })} labels={LABELS} locale="en" />)
    expect((await screen.findByTestId('folder-pdf')).getAttribute('src')).toBe('blob:viewer/1')
    expect(officePdf).toHaveBeenCalledWith('Letter.docx', expect.any(AbortSignal))
    expect(await created[0]!.text()).toBe('%PDF-converted')
  })

  it('shows an image with its MIME type', async () => {
    const view = render(<FileViewer path="Drawings/Fig 1.PNG" reads={readers(encode('png'))} labels={LABELS} locale="en" />)
    expect((await screen.findByRole('img', { name: 'Document Fig 1.PNG' })).getAttribute('src')).toBe('blob:viewer/1')
    expect(created[0]!.type).toBe('image/png')
    view.unmount()
  })

  it('shows Markdown as a page and plain text as it is', async () => {
    const view = render(<FileViewer path="Office/EP-Register.md" reads={readers(encode('# Register\n\nGrant intended.'))} labels={LABELS} locale="en" />)
    expect(await screen.findByRole('heading', { name: 'Register' })).toBeTruthy()
    view.unmount()
    render(<FileViewer path="log.txt" reads={readers(encode('line 1\nline 2'))} labels={LABELS} locale="en" />)
    expect((await screen.findByText(/line 1/u)).textContent).toBe('line 1\nline 2')
  })

  it('shows a mail with its people and date, and No subject for a mail with none', async () => {
    const view = render(<FileViewer path="Mail/approval.eml" reads={readers(encode(TEXT_MAIL))} labels={LABELS} locale="en" />)
    const mail = await screen.findByTestId('folder-mail')
    expect(mail.querySelector('h2')?.textContent).toBe('EP 23 171 862: Rule 71(3)')
    expect(mail.textContent).toContain('Dr. Anna Becker <becker@firm.test>')
    expect(mail.textContent).toContain('Please approve the text by 20 November.')
    view.unmount()
    render(<FileViewer path="Mail/notice.eml" reads={readers(encode(HTML_MAIL))} labels={LABELS} locale="en" />)
    expect((await screen.findByTestId('folder-mail')).querySelector('h2')?.textContent).toBe('No subject')
  })

  it('shows a workbook with one sheet as a table with no tabs, and says when rows were left out', async () => {
    const rows = [['Fee', 'EUR'], ...Array.from({ length: SHEET_ROWS }, (_, index) => [`Fee ${index + 1}`, index])]
    render(<FileViewer path="Fees.xlsx" reads={readers(workbook({ Fees: rows }))} labels={LABELS} locale="en" />)
    const sheet = await screen.findByTestId('folder-sheet')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(sheet.querySelectorAll('tr')).toHaveLength(SHEET_ROWS)
    expect([...sheet.querySelectorAll('tr')[0]!.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['Fee', 'EUR'])
    expect(screen.getByText(LABELS.sheetCut)).toBeTruthy()
  })

  it('shows a tab for each sheet of a workbook, switches the sheet on a tab, and says when a sheet is empty', async () => {
    render(<FileViewer path="Docket.xlsx" reads={readers(workbook({ Fees: [['Filing', 135]], Deadlines: [['Rule 71(3)']], Notes: [] }))} labels={LABELS} locale="en" />)
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

  it('shows a date in the order of the page language, English in the firm\'s order, never the US order', async () => {
    const book = workbook({ Deadlines: [[{ t: 'n', v: 46357, z: 'm/d/yy' }, { t: 'n', v: 46357.5, z: 'yyyy-mm-dd hh:mm' }]] })
    const view = render(<FileViewer path="Deadlines.xlsx" reads={readers(book)} labels={LABELS} locale="de" />)
    const cells = async () => [...(await screen.findByTestId('folder-sheet')).querySelectorAll('td')].map(cell => cell.textContent)
    expect(await cells()).toEqual(['01.12.2026', '01.12.2026, 12:00'])
    view.rerender(<FileViewer path="Deadlines.xlsx" reads={readers(book)} labels={LABELS} locale="en" />)
    expect(await cells()).toEqual(['01/12/2026', '01/12/2026, 12:00'])
  })

  it('reads a CSV file as one sheet', async () => {
    render(<FileViewer path="Export.CSV" reads={readers(encode('Matter,Due\nEP 23 171 862,2026-11-20\n'))} labels={LABELS} locale="en" />)
    expect((await screen.findByTestId('folder-sheet')).textContent).toBe('MatterDueEP 23 171 8622026-11-20')
  })

  it('says in one sentence that a file has no viewer, with the fallback, and reads nothing', () => {
    const bytes = vi.fn(async () => encode(''))
    render(<FileViewer path="Fees.zip" reads={readers(encode(''), { bytes })} labels={LABELS} locale="en" fallback={<button type="button">Open in the system app</button>} />)
    expect(screen.getByRole('status').textContent).toBe('No previewOpen in the system app')
    expect(bytes).not.toHaveBeenCalled()
  })

  it('says the file could not be shown when the read fails', async () => {
    render(<FileViewer path="D1.pdf" reads={readers(encode(''), { bytes: async () => { throw new Error('gone') } })} labels={LABELS} locale="en" fallback={<span>fallback</span>} />)
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
    const view = render(<FileViewer path="D1.pdf" reads={reads} labels={LABELS} locale="en" />)
    view.rerender(<FileViewer path="note.txt" reads={reads} labels={LABELS} locale="en" />)
    view.rerender(<FileViewer path="D2.pdf" reads={reads} labels={LABELS} locale="en" />)
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
    const view = render(<FileViewer path="a.md" reads={reads} labels={LABELS} locale="en" />)
    view.rerender(<FileViewer path="b.txt" reads={reads} labels={LABELS} locale="en" />)
    expect(await screen.findByText('b')).toBeTruthy()
    answer(encode('# a'))
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
    expect(screen.queryByRole('heading')).toBeNull()
    expect(revoked).toEqual([])
  })
})
