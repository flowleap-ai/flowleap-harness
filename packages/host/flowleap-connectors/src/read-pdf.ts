/**
 * The native `read_pdf` tool (ADR 0019 C3b): one workspace file, read through
 * `ctx.fs` under the session's working directory, sent to Mistral OCR on the
 * firm's own key through the connector library, and returned as Markdown with
 * one `--- page N ---` marker per page. The name matches the IDE's tool so the
 * exported Patent Agent prompt's `read_pdf` references resolve in the harness.
 *
 * Born-digital PDFs go through OCR as well in this slice: text extraction
 * without OCR needs a PDF parser the harness does not carry (mupdf is excluded
 * by licence, see vendor/flowleap-connectors/README.md).
 * @module
 */

import { basename, extname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { ToolDefinition as DshToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-working-directory'
import {
  APIError, OcrConfigurationError, OcrInputError, OcrNotConfiguredError, ProviderKeyInvalidError, RateLimitError,
  type Connectors, type OcrResponse,
} from '@flowleap/connectors'
import type { BoundConnectorHost } from './host.ts'
import { missingCredential, renderText, type MissingCredentialResult } from './tools.ts'

/** The tool name, shared with the IDE's tool of the same name. */
export const READ_PDF_NAME = 'read_pdf'

/** Largest file the tool uploads, in bytes (50 MB). */
export const READ_PDF_MAX_BYTES = 50 * 1024 * 1024

/** Most pages the tool returns from one document. */
export const READ_PDF_MAX_PAGES = 300

/** The extensions the tool accepts: PDF and the image types Mistral OCR reads. */
export const READ_PDF_EXTENSIONS: readonly string[] = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']

/** One sentence the model and the attorney read on every result: who pays for the OCR. */
export const READ_PDF_COST_LINE = 'OCR through the firm\'s Mistral key; pages billed by Mistral.'

/** The model-facing arguments. */
export interface ReadPdfArgs {
  /** The file, absolute or relative to the session's working directory. */
  path: string
  /** Optional 1-based page or inclusive range, `3` or `1-5`. */
  pages?: string
}

/** The canonical value of a successful read. */
export interface ReadPdfValue {
  /** Canonical absolute path in the filesystem execution world. */
  path: string
  /** The OCR model that produced the text. */
  model: string
  /** Pages in the document. */
  pageCount: number
  /** First page returned, 1-based. */
  from: number
  /** Last page returned, 1-based, inclusive. */
  to: number
  /** Whether the OCR came from the 24 h cache rather than a new Mistral call. */
  cached: boolean
  /** The returned pages as Markdown, each under its `--- page N ---` marker. */
  markdown: string
}

/** The JSON Schema the model sees. */
const PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'The PDF or image file to read, absolute or relative to the working directory. Files outside the working directory are refused.',
    },
    pages: {
      type: 'string',
      pattern: '^[1-9][0-9]*(-[1-9][0-9]*)?$',
      description: 'Optional 1-based page or inclusive range to return, e.g. "3" or "1-5". The whole document is OCRed once and cached for 24 hours; the range selects the pages returned.',
    },
  },
  required: ['path'],
  additionalProperties: false,
}

const DESCRIPTION = 'Read a PDF or page image from the workspace as Markdown through Mistral OCR on the firm\'s Mistral key, one "--- page N ---" marker per page. '
  + 'Use it for scanned or born-digital PDFs, office actions, file-wrapper documents and figure pages before analysing them; use `read` for text files and `read_image` to look at an image. '
  + `Accepts ${READ_PDF_EXTENSIONS.join(', ')} under the working directory, up to 50 MB and ${String(READ_PDF_MAX_PAGES)} pages. `
  + 'Every call costs the firm Mistral OCR pages, so read a document once and keep the text; repeated reads of the same file within 24 hours come from the cache.'

const PAGE_RANGE = /^(?<from>[1-9][0-9]*)(?:-(?<to>[1-9][0-9]*))?$/u

/** Parse a validated `pages` string into a 1-based inclusive range. */
function parsePageRange(pages: string): { from: number; to: number } {
  const match = PAGE_RANGE.exec(pages)
  if (match?.groups === undefined) throw new Error(`${READ_PDF_NAME}: pages must be a page number or a range like "1-5", got ${JSON.stringify(pages)}`)
  const from = Number(match.groups['from'])
  const to = match.groups['to'] === undefined ? from : Number(match.groups['to'])
  if (to < from) throw new Error(`${READ_PDF_NAME}: pages range ${pages} ends before it starts`)
  if (to - from + 1 > READ_PDF_MAX_PAGES) throw new Error(`${READ_PDF_NAME}: pages range ${pages} spans more than ${String(READ_PDF_MAX_PAGES)} pages`)
  return { from, to }
}

/**
 * Count the page objects a PDF declares, from its bytes. Exact for PDFs whose
 * object dictionaries are stored in clear; a PDF that keeps them in compressed
 * object streams reports fewer, so this is a pre-upload guard, not the truth.
 * @param bytes - the file content.
 * @returns the number of `/Type /Page` dictionaries found.
 */
export function estimatePdfPages(bytes: Uint8Array): number {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')
  let count = 0
  for (const _match of text.matchAll(/\/Type\s*\/Page(?!\w)/gu)) count += 1
  return count
}

/**
 * Lay the returned pages out as Markdown with one marker per page.
 * @param response - the library's OCR result.
 * @param from - first page, 1-based.
 * @param to - last page, 1-based, inclusive.
 * @returns the Markdown.
 */
export function pagesMarkdown(response: Pick<OcrResponse, 'pages'>, from: number, to: number): string {
  return response.pages
    .filter(page => page.pageNumber >= from && page.pageNumber <= to)
    .map(page => `--- page ${String(page.pageNumber)} ---\n${page.markdown.trim()}`)
    .join('\n\n')
}

/**
 * Render a read as model-facing text: the path, one header line naming the
 * model and the page count, the cost line, then the pages.
 * @param value - the canonical value.
 * @returns the text.
 */
export function renderReadPdf(value: ReadPdfValue): string {
  const shown = value.from === 1 && value.to === value.pageCount
    ? `all ${String(value.pageCount)} pages returned`
    : `pages ${String(value.from)}-${String(value.to)} of ${String(value.pageCount)} returned`
  const cached = value.cached ? ', from the 24 h cache' : ''
  return `${READ_PDF_NAME}: ${value.path}\nOCR model ${value.model}; ${String(value.pageCount)} ${value.pageCount === 1 ? 'page' : 'pages'} in the document, ${shown}${cached}.\n${READ_PDF_COST_LINE}\n\n${value.markdown}`
}

/** Validate the raw arguments; the registry hands them over as parsed JSON. */
function parseArgs(args: unknown): ReadPdfArgs {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error(`${READ_PDF_NAME}: invalid arguments: expected an object`)
  const record = args as Record<string, unknown>
  const path = record['path']
  if (typeof path !== 'string' || path.trim().length === 0) throw new Error(`${READ_PDF_NAME}: invalid arguments: path must be a non-empty string`)
  const pages = record['pages']
  if (pages !== undefined && typeof pages !== 'string') throw new Error(`${READ_PDF_NAME}: invalid arguments: pages must be a string like "1-5"`)
  return pages === undefined ? { path } : { path, pages }
}

/** Map a library failure to the missing-credential answer or a plain tool error. */
function toolFailure(error: unknown): MissingCredentialResult | Error {
  if (error instanceof OcrNotConfiguredError) return missingCredential('mistral')
  if (error instanceof ProviderKeyInvalidError && error.provider === 'mistral') return missingCredential('mistral', true)
  if (error instanceof OcrInputError || error instanceof OcrConfigurationError
    || error instanceof RateLimitError || error instanceof APIError) {
    return new Error(`${READ_PDF_NAME}: ${error.message}`, { cause: error })
  }
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Build the `read_pdf` definition over the mounted `fs` and `workingDirectory`
 * services and the shared connector library.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param connectors - the shared library instance.
 * @param bound - the host's signal carrier.
 * @returns the unregistered dsh definition.
 */
export function readPdfTool(ctx: Context, connectors: Connectors, bound: BoundConnectorHost): DshToolDefinition {
  return {
    name: READ_PDF_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: isReadPdfValue(value) ? renderReadPdf(value) : renderText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args: unknown, exec: ToolRunContext): Promise<JsonValue> {
      const parsed = parseArgs(args)
      const range = parsed.pages === undefined ? undefined : parsePageRange(parsed.pages)
      const extension = extname(parsed.path).toLowerCase()
      if (!READ_PDF_EXTENSIONS.includes(extension)) {
        throw new Error(`${READ_PDF_NAME}: cannot read "${parsed.path}": ${extension === '' ? 'no file extension' : `the ${extension} extension`} is not one of ${READ_PDF_EXTENSIONS.join(', ')}`)
      }
      // The key before any file I/O: a missing key is the same plain answer the office tools give.
      if ((await connectors.host.credentials('mistral')).status !== 'available') return missingCredential('mistral')

      const cwd = exec.agent === undefined
        ? ctx.workingDirectory.defaultDirectory
        : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      const root = await ctx.fs.resolve(cwd, { signal: exec.signal })
      const target = await ctx.fs.resolve(parsed.path, { cwd, signal: exec.signal })
      if (!ctx.fs.contains(root, target)) {
        throw new Error(
          `${READ_PDF_NAME}: cannot read "${target.displayPath}": outside the working directory ${cwd}; ${READ_PDF_NAME} reads files under the working directory only`,
        )
      }
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) throw new FsError(`${READ_PDF_NAME}: cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND')
      if (info.type !== 'file') throw new FsError(`${READ_PDF_NAME}: cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      if (info.size !== undefined && info.size > READ_PDF_MAX_BYTES) {
        throw new Error(`${READ_PDF_NAME}: cannot read "${target.displayPath}": ${String(info.size)} bytes exceeds the 50 MB limit; split the document first`)
      }
      const bytes = await ctx.fs.readBytes(target, exec.signal, READ_PDF_MAX_BYTES)
      if (extension === '.pdf') {
        const declared = estimatePdfPages(bytes)
        if (declared > READ_PDF_MAX_PAGES) {
          throw new Error(`${READ_PDF_NAME}: cannot read "${target.displayPath}": the PDF declares ${String(declared)} pages, more than the ${String(READ_PDF_MAX_PAGES)}-page limit; split the document first`)
        }
      }

      let response: OcrResponse
      try {
        response = await bound.withSignal(exec.signal, () => connectors.ocr.runOcr({
          file: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
          filename: basename(target.displayPath),
        }))
      } catch (error) {
        const failure = toolFailure(error)
        if (failure instanceof Error) throw failure
        return failure
      }
      const pageCount = response.pageCount
      const from = Math.min(range?.from ?? 1, Math.max(pageCount, 1))
      const to = Math.min(range?.to ?? pageCount, pageCount, from + READ_PDF_MAX_PAGES - 1)
      const value: ReadPdfValue = {
        path: ctx.fs.processPath(target),
        model: response.model,
        pageCount,
        from,
        to,
        cached: response.cached === true,
        markdown: pagesMarkdown(response, from, to),
      }
      return { ...value }
    },
  }
}

/** Whether a canonical value is a successful read rather than a missing-credential answer. */
function isReadPdfValue(value: JsonValue): value is ReadPdfValue & JsonValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value['markdown'] === 'string' && typeof value['pageCount'] === 'number'
}

/**
 * Register `read_pdf` on `ctx.tools`.
 * @param ctx - a context whose `tools`, `fs` and `workingDirectory` are active.
 * @param connectors - the shared library instance.
 * @param bound - the host's signal carrier.
 * @returns the disposer unregistering the tool.
 */
export function registerReadPdfTool(ctx: Context, connectors: Connectors, bound: BoundConnectorHost): () => void {
  return ctx.tools.register(readPdfTool(ctx, connectors, bound))
}
