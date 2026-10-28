/**
 * Text of one uploaded file by location, read once at upload. The parse step (normally in the extraction Worker) reads
 * the PDF text layer, DOCX and TXT or MD; the pages without a text layer (scanned pages) are then read here, in the
 * Host, through Mistral OCR when `flowleapOcr` is mounted and a key is stored. Only the scanned pages are sent: the
 * parse step's PDF of those pages, or the whole PDF when every page is scanned.
 * @module
 */

import type { OcrSource } from '@deepseek-ai/dsh-flowleap-connectors'
import type { FileFailure, LocationText, ParseResult } from './parse.ts'
import type { LocationUnit } from './types.ts'

/** The outcome of one read. */
export type Extraction =
  | { readonly kind: 'text'; readonly unit: LocationUnit; readonly locations: readonly LocationText[] }
  | FileFailure

/**
 * The parse step of one file.
 * @param name - the file name.
 * @param bytes - the file content.
 * @returns the parse result.
 */
export type ParseStep = (name: string, bytes: Uint8Array) => Promise<ParseResult>

/**
 * Read the text of one file.
 * @param name - the file name; its extension selects the reader.
 * @param bytes - the file content.
 * @param parse - the parse step.
 * @param ocr - the OCR service, or undefined when the composition has none.
 * @param signal - cancels an OCR call.
 * @returns the text by location, or the typed failure.
 * @throws what `parse` throws (the abort reason of the Worker parse).
 */
export async function extractText(
  name: string, bytes: Uint8Array, parse: ParseStep, ocr: OcrSource | undefined, signal?: AbortSignal,
): Promise<Extraction> {
  const parsed = await parse(name, bytes)
  if (parsed.kind === 'failed') return parsed
  const { unit, scanned, count } = parsed
  const locations = new Map(parsed.locations.map(location => [location.at, location.text]))
  if (scanned.length > 0) {
    const all = scanned.length === count
    const read = ocr === undefined ? { kind: 'not-configured' as const } : await ocrPages(name, ocr, signal, all ? bytes : parsed.scannedPdf)
    if (read.kind === 'failed' && all) return read
    if (read.kind === 'not-configured' && all) {
      return { kind: 'failed', reason: 'ocr-unavailable', message: 'the PDF has no text layer and no Mistral key is stored for OCR' }
    }
    if (read.kind === 'read') {
      // Page k of the document sent to OCR is the k-th scanned page.
      for (const page of read.pages) {
        const index = scanned[page.page - 1]
        const text = page.text.trim()
        if (index !== undefined && text !== '') locations.set(index + 1, text)
      }
    }
  }
  if (locations.size === 0) return { kind: 'failed', reason: 'no-text', message: 'the PDF holds no text' }
  return { kind: 'text', unit, locations: [...locations].sort(([a], [b]) => a - b).map(([at, text]) => ({ at, text })) }
}

type OcrOutcome =
  | { readonly kind: 'read'; readonly pages: readonly { readonly page: number; readonly text: string }[] }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'failed'; readonly reason: 'ocr-failed'; readonly message: string }

async function ocrPages(
  name: string, ocr: OcrSource, signal: AbortSignal | undefined, source: Uint8Array | undefined,
): Promise<OcrOutcome> {
  /* v8 ignore next -- the parse step builds a scanned-page PDF whenever some but not all pages are scanned */
  if (source === undefined) return { kind: 'failed', reason: 'ocr-failed', message: 'no PDF of the scanned pages' }
  try {
    return await ocr.pages(source, name, signal)
  } catch (error) {
    /* v8 ignore next -- the OCR service rejects with Error objects only */
    return { kind: 'failed', reason: 'ocr-failed', message: error instanceof Error ? error.message : String(error) }
  }
}
