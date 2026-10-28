/**
 * Text of one uploaded file by location, read once at upload. A PDF page is read from its text layer; a page without a
 * text layer (a scanned page) is read through Mistral OCR when `flowleapOcr` is mounted and a key is stored. A DOCX file
 * is read by paragraph; a TXT or MD file is one page of UTF-8 text.
 * @module
 */

import { extname } from 'node:path'
import type { OcrSource } from '@deepseek-ai/dsh-flowleap-connectors'
import type { AgentFileFailure, LocationUnit } from './types.ts'

/** The text of one location: a 1-based page or paragraph number. */
export interface LocationText {
  /** 1-based page or paragraph number. */
  readonly at: number
  /** The text, trimmed; never empty. */
  readonly text: string
}

/** The outcome of one read. */
export type Extraction =
  | { readonly kind: 'text'; readonly unit: LocationUnit; readonly locations: readonly LocationText[] }
  | { readonly kind: 'failed'; readonly reason: AgentFileFailure; readonly message: string }

/**
 * Read the text of one file.
 * @param name - the file name; its extension selects the reader.
 * @param bytes - the file content.
 * @param ocr - the OCR service, or undefined when the composition has none.
 * @param signal - cancels an OCR call.
 * @returns the text by location, or the typed failure.
 */
export async function extractText(
  name: string, bytes: Uint8Array, ocr: OcrSource | undefined, signal?: AbortSignal,
): Promise<Extraction> {
  const extension = extname(name).toLowerCase()
  try {
    if (extension === '.pdf') return await extractPdf(name, bytes, ocr, signal)
    if (extension === '.docx') return await extractDocx(bytes)
    return single(new TextDecoder('utf-8').decode(bytes))
  } catch (error) {
    return { kind: 'failed', reason: 'unreadable', message: error instanceof Error ? error.message : String(error) }
  }
}

function single(text: string): Extraction {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'failed', reason: 'no-text', message: 'the file holds no text' }
  return { kind: 'text', unit: 'page', locations: [{ at: 1, text: trimmed }] }
}

async function extractDocx(bytes: Uint8Array): Promise<Extraction> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  const paragraphs = value.split(/\n+/).map(paragraph => paragraph.trim()).filter(paragraph => paragraph !== '')
  if (paragraphs.length === 0) return { kind: 'failed', reason: 'no-text', message: 'the document holds no text' }
  return { kind: 'text', unit: 'paragraph', locations: paragraphs.map((text, index) => ({ at: index + 1, text })) }
}

async function extractPdf(name: string, bytes: Uint8Array, ocr: OcrSource | undefined, signal?: AbortSignal): Promise<Extraction> {
  const pages = await pdfTextLayer(bytes)
  const scanned = pages.flatMap((text, index) => text === '' ? [index + 1] : [])
  const filled = new Map<number, string>()
  if (scanned.length > 0) {
    const read = ocr === undefined ? { kind: 'not-configured' as const } : await ocrPages(name, bytes, ocr, signal)
    if (read.kind === 'failed' && scanned.length === pages.length) return read
    if (read.kind === 'not-configured' && scanned.length === pages.length) {
      return { kind: 'failed', reason: 'ocr-unavailable', message: 'the PDF has no text layer and no Mistral key is stored for OCR' }
    }
    if (read.kind === 'read') for (const page of read.pages) filled.set(page.page, page.text.trim())
  }
  const locations = pages
    .map((text, index) => ({ at: index + 1, text: text === '' ? filled.get(index + 1) ?? '' : text }))
    .filter(location => location.text !== '')
  if (locations.length === 0) return { kind: 'failed', reason: 'no-text', message: 'the PDF holds no text' }
  return { kind: 'text', unit: 'page', locations }
}

type OcrOutcome =
  | { readonly kind: 'read'; readonly pages: readonly { readonly page: number; readonly text: string }[] }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'failed'; readonly reason: 'ocr-failed'; readonly message: string }

async function ocrPages(name: string, bytes: Uint8Array, ocr: OcrSource, signal?: AbortSignal): Promise<OcrOutcome> {
  try {
    return await ocr.pages(bytes, name, signal)
  } catch (error) {
    return { kind: 'failed', reason: 'ocr-failed', message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Read the text layer of each page of a PDF.
 * @param bytes - the PDF.
 * @returns one trimmed text per page; an empty string for a page without a text layer.
 */
export async function pdfTextLayer(bytes: Uint8Array): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs transfers the buffer it receives; a copy keeps the caller's bytes intact.
  const task = getDocument({ data: bytes.slice(), verbosity: 0 })
  try {
    const document = await task.promise
    const pages: string[] = []
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '')
      }
      pages.push(text.trim())
    }
    return pages
  } finally {
    await task.destroy()
  }
}
