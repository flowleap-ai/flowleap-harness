import { Document, Packer, Paragraph } from 'docx'
import { describe, expect, it } from 'vitest'
import { extractText } from '../src/index.ts'
import { inThread, makePdf, ocrDouble } from './harness.ts'

describe('extractText', () => {
  it('reads each PDF page from its text layer without OCR', async () => {
    const ocr = ocrDouble(() => ({ kind: 'not-configured' }))
    expect(await extractText('a.pdf', makePdf([['First line', 'second line'], ['Page two']]), inThread, ocr)).toEqual({
      kind: 'text', unit: 'page', locations: [{ at: 1, text: 'First line\nsecond line' }, { at: 2, text: 'Page two' }],
    })
    expect(ocr.pages).not.toHaveBeenCalled()
  })

  it('sends only the pages without a text layer to OCR and maps its pages back', async () => {
    const sent: number[] = []
    const ocr = ocrDouble((bytes) => {
      sent.push(new TextDecoder().decode(bytes).match(/\/Type\s*\/Page\b/g)?.length ?? 0)
      return { kind: 'read', pages: [{ page: 1, text: ' ocr two ' }, { page: 2, text: 'ocr four' }, { page: 3, text: 'no such page' }] }
    })
    expect(await extractText('a.pdf', makePdf([['Typed page'], null, ['Page three'], null]), inThread, ocr)).toEqual({
      kind: 'text', unit: 'page', locations: [{ at: 1, text: 'Typed page' }, { at: 2, text: 'ocr two' }, { at: 3, text: 'Page three' }, { at: 4, text: 'ocr four' }],
    })
    expect(sent).toEqual([2])
  })

  it('sends an all-scanned PDF to OCR as it is', async () => {
    const pdf = makePdf([null, null])
    const ocr = ocrDouble(() => ({ kind: 'read', pages: [{ page: 2, text: 'second' }] }))
    expect(await extractText('a.pdf', pdf, inThread, ocr)).toEqual({ kind: 'text', unit: 'page', locations: [{ at: 2, text: 'second' }] })
    expect(ocr.pages.mock.calls[0]?.[0]).toEqual(pdf)
  })

  it('keeps the text-layer pages when OCR fails, and fails an all-scanned PDF', async () => {
    const failing = { pages: () => Promise.reject(new Error('Mistral 500')) }
    expect(await extractText('a.pdf', makePdf([['Typed'], null]), inThread, failing)).toMatchObject({ kind: 'text', locations: [{ at: 1 }] })
    expect(await extractText('a.pdf', makePdf([null]), inThread, failing)).toEqual({ kind: 'failed', reason: 'ocr-failed', message: 'Mistral 500' })
    expect(await extractText('a.pdf', makePdf([null]), inThread, undefined)).toMatchObject({ kind: 'failed', reason: 'ocr-unavailable' })
  })

  it('reads a DOCX by paragraph', async () => {
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Claim style.'), new Paragraph(''), new Paragraph('Use active voice.')] }] }))
    expect(await extractText('guide.docx', new Uint8Array(docx), inThread, undefined)).toEqual({
      kind: 'text', unit: 'paragraph', locations: [{ at: 1, text: 'Claim style.' }, { at: 2, text: 'Use active voice.' }],
    })
  })

  it('reads TXT and MD as one page, and fails an empty or broken file', async () => {
    const encode = (text: string) => new TextEncoder().encode(text)
    expect(await extractText('n.md', encode('# Notes\n\nText.\n'), inThread, undefined)).toEqual({ kind: 'text', unit: 'page', locations: [{ at: 1, text: '# Notes\n\nText.' }] })
    expect(await extractText('n.txt', encode('  \n'), inThread, undefined)).toMatchObject({ kind: 'failed', reason: 'no-text' })
    expect(await extractText('n.docx', encode('not a zip'), inThread, undefined)).toMatchObject({ kind: 'failed', reason: 'unreadable' })
  })
})
