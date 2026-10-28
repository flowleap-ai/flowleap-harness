import { Document, Packer, Paragraph } from 'docx'
import { describe, expect, it } from 'vitest'
import { extractText } from '../src/index.ts'
import { makePdf, ocrDouble } from './harness.ts'

describe('extractText', () => {
  it('reads each PDF page from its text layer without OCR', async () => {
    const ocr = ocrDouble(() => ({ kind: 'not-configured' }))
    expect(await extractText('a.pdf', makePdf([['First line', 'second line'], ['Page two']]), ocr)).toEqual({
      kind: 'text', unit: 'page', locations: [{ at: 1, text: 'First line\nsecond line' }, { at: 2, text: 'Page two' }],
    })
    expect(ocr.pages).not.toHaveBeenCalled()
  })

  it('fills a page without a text layer from OCR and keeps the text-layer pages', async () => {
    const ocr = ocrDouble(() => ({ kind: 'read', pages: [{ page: 1, text: 'ocr one' }, { page: 2, text: ' ocr two ' }] }))
    expect(await extractText('a.pdf', makePdf([['Typed page'], null]), ocr)).toEqual({
      kind: 'text', unit: 'page', locations: [{ at: 1, text: 'Typed page' }, { at: 2, text: 'ocr two' }],
    })
    expect(ocr.pages).toHaveBeenCalledTimes(1)
  })

  it('keeps the text-layer pages when OCR fails, and fails an all-scanned PDF', async () => {
    const failing = { pages: () => Promise.reject(new Error('Mistral 500')) }
    expect(await extractText('a.pdf', makePdf([['Typed'], null]), failing)).toMatchObject({ kind: 'text', locations: [{ at: 1 }] })
    expect(await extractText('a.pdf', makePdf([null]), failing)).toEqual({ kind: 'failed', reason: 'ocr-failed', message: 'Mistral 500' })
    expect(await extractText('a.pdf', makePdf([null]), undefined)).toMatchObject({ kind: 'failed', reason: 'ocr-unavailable' })
  })

  it('reads a DOCX by paragraph', async () => {
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Claim style.'), new Paragraph(''), new Paragraph('Use active voice.')] }] }))
    expect(await extractText('guide.docx', new Uint8Array(docx), undefined)).toEqual({
      kind: 'text', unit: 'paragraph', locations: [{ at: 1, text: 'Claim style.' }, { at: 2, text: 'Use active voice.' }],
    })
  })

  it('reads TXT and MD as one page, and fails an empty or broken file', async () => {
    const encode = (text: string) => new TextEncoder().encode(text)
    expect(await extractText('n.md', encode('# Notes\n\nText.\n'), undefined)).toEqual({ kind: 'text', unit: 'page', locations: [{ at: 1, text: '# Notes\n\nText.' }] })
    expect(await extractText('n.txt', encode('  \n'), undefined)).toMatchObject({ kind: 'failed', reason: 'no-text' })
    expect(await extractText('n.docx', encode('not a zip'), undefined)).toMatchObject({ kind: 'failed', reason: 'unreadable' })
  })
})
