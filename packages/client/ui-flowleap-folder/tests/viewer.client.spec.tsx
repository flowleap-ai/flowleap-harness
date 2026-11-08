// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extensionOf, FileViewer, parseMail, viewerKind, type ViewerLabels, type ViewerReads } from '../src/client/viewer.tsx'

const encode = (text: string) => new TextEncoder().encode(text)

const LABELS: ViewerLabels = {
  loading: 'Loading', failed: 'This file could not be shown.', none: 'No preview', from: 'From', to: 'To', date: 'Date', noSubject: 'No subject',
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
    expect(['a.pdf', 'a.JPG', 'a.md', 'a.csv', 'a.docx', 'a.pptx', 'a.eml', 'a.xlsx', 'README'].map(viewerKind))
      .toEqual(['pdf', 'image', 'markdown', 'text', 'office', 'office', 'mail', 'none', 'none'])
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
    expect(mail.date).toContain('2026')
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

  it('says in one sentence that a file has no viewer, with the fallback, and reads nothing', () => {
    const bytes = vi.fn(async () => encode(''))
    render(<FileViewer path="Fees.xlsx" reads={readers(encode(''), { bytes })} labels={LABELS} fallback={<button type="button">Open in the system app</button>} />)
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
