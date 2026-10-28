/**
 * The parse step of one uploaded file, which runs in the extraction Worker: a PDF page is read from its text layer, and
 * the pages without one (scanned pages) are reported, with a PDF of only those pages built with pdfjs `extractPages`
 * when some pages have a text layer. A DOCX file is read by paragraph; a TXT or MD file is one page of UTF-8 text. The
 * Host runs OCR on the scanned pages.
 * @module
 */

import { extname } from 'node:path'
import type { AgentFileFailure, LocationUnit } from './types.ts'

/** The text of one location: a 1-based page or paragraph number. */
export interface LocationText {
  /** 1-based page or paragraph number. */
  readonly at: number
  /** The text, trimmed; never empty. */
  readonly text: string
}

/** What the parse step reads. */
export interface ParseRequest {
  /** The file name; its extension selects the reader. */
  readonly name: string
  /** The file content. */
  readonly bytes: Uint8Array
  /** Most pages a PDF may have; a PDF with more fails before its pages are read. */
  readonly maxPages: number
}

/** A typed failure of one file. */
export interface FileFailure {
  readonly kind: 'failed'
  /** Why. */
  readonly reason: AgentFileFailure
  /** The detail for the log and the form. */
  readonly message: string
}

/** The outcome of the parse step. */
export type ParseResult =
  | {
    readonly kind: 'text'
    readonly unit: LocationUnit
    /** The locations with text, in order. */
    readonly locations: readonly LocationText[]
    /** Location count of the file: the PDF pages, or the paragraphs. */
    readonly count: number
    /** 0-based indexes of the PDF pages without a text layer, in order. */
    readonly scanned: readonly number[]
    /** A PDF of the scanned pages only; absent when no page or every page is scanned. */
    readonly scannedPdf?: Uint8Array
  }
  | FileFailure

/**
 * Read the text of one file.
 * @param request - the file and the page limit.
 * @returns the text by location and the scanned pages, or the typed failure.
 */
export async function parseFile(request: ParseRequest): Promise<ParseResult> {
  const extension = extname(request.name).toLowerCase()
  try {
    if (extension === '.pdf') return await parsePdf(request.bytes, request.maxPages)
    if (extension === '.docx') return await parseDocx(request.bytes)
    return single(new TextDecoder('utf-8').decode(request.bytes))
  } catch (error) {
    /* v8 ignore next -- pdfjs, mammoth and TextDecoder throw Error objects only */
    return { kind: 'failed', reason: 'unreadable', message: error instanceof Error ? error.message : String(error) }
  }
}

function single(text: string): ParseResult {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'failed', reason: 'no-text', message: 'the file holds no text' }
  return { kind: 'text', unit: 'page', locations: [{ at: 1, text: trimmed }], count: 1, scanned: [] }
}

async function parseDocx(bytes: Uint8Array): Promise<ParseResult> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
  const paragraphs = value.split(/\n+/).map(paragraph => paragraph.trim()).filter(paragraph => paragraph !== '')
  if (paragraphs.length === 0) return { kind: 'failed', reason: 'no-text', message: 'the document holds no text' }
  return {
    kind: 'text', unit: 'paragraph', locations: paragraphs.map((text, index) => ({ at: index + 1, text })), count: paragraphs.length, scanned: [],
  }
}

async function parsePdf(bytes: Uint8Array, maxPages: number): Promise<ParseResult> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs transfers the buffer it receives; a copy keeps the caller's bytes intact.
  const task = getDocument({ data: bytes.slice(), verbosity: 0 })
  try {
    const document = await task.promise
    if (document.numPages > maxPages) {
      return { kind: 'failed', reason: 'too-large', message: `the PDF has ${String(document.numPages)} pages; the limit is ${String(maxPages)}` }
    }
    const pages: string[] = []
    for (let number = 1; number <= document.numPages; number++) pages.push(await pageText(document, number))
    const scanned = pages.flatMap((text, index) => text === '' ? [index] : [])
    const locations = pages.flatMap((text, index) => text === '' ? [] : [{ at: index + 1, text }])
    const partial = scanned.length > 0 && scanned.length < pages.length
    return {
      kind: 'text', unit: 'page', locations, count: pages.length, scanned,
      ...partial ? { scannedPdf: await document.extractPages([{ document: null, includePages: scanned }]) } : {},
    }
  } finally {
    await task.destroy()
  }
}

type PdfDocument = Awaited<ReturnType<typeof import('pdfjs-dist/legacy/build/pdf.mjs').getDocument>['promise']>

async function pageText(document: PdfDocument, number: number): Promise<string> {
  const content = await (await document.getPage(number)).getTextContent()
  let text = ''
  for (const item of content.items) {
    /* v8 ignore next -- getTextContent without includeMarkedContent yields text items only */
    if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '')
  }
  return text.trim()
}
