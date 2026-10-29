/**
 * The native `read_pdf` tool over the REAL local filesystem and a recorded
 * Mistral OCR answer: the working-directory fence, the missing-key answer, the
 * page markers and the cost line, the page range on the cached result, and the
 * pre-upload page cap.
 */

import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import type { ContentBlock, ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { createConnectors } from '@flowleap/connectors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  READ_PDF_COST_LINE, READ_PDF_MAX_BYTES, READ_PDF_MAX_PAGES, createConnectorHost, createCredentialStore, estimatePdfPages,
  registerReadPdfTool,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from './memory-credentials.ts'

/** A three-page PDF skeleton: enough `/Type /Page` dictionaries for the pre-upload estimate; the OCR answer is recorded. */
const PDF_THREE_PAGES = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >> endobj\n'
  + '3 0 obj << /Type /Page /Parent 2 0 R >> endobj\n4 0 obj << /Type /Page /Parent 2 0 R >> endobj\n5 0 obj << /Type /Page /Parent 2 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
)

/** Mistral's `POST /v1/ocr` answer for that document, as the wire carries it. */
const OCR_ANSWER = {
  model: 'mistral-ocr-latest',
  pages: [
    { index: 0, markdown: '# Office Action\n\nClaims 1-5 are rejected under 35 U.S.C. 103.', images: [], dimensions: { width: 612, height: 792, dpi: 72 } },
    { index: 1, markdown: 'Reference A teaches a separator with a ceramic coating.', images: [] },
    { index: 2, markdown: 'Applicant is given three months to reply.', images: [] },
  ],
}

let dir: string
let outside: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dsh-read-pdf-'))
  outside = await mkdtemp(join(tmpdir(), 'dsh-read-pdf-outside-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

async function bench() {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  provideWorkingDirectoryFixture(ctx, dir)
  const store = createCredentialStore(credentials)
  const fetchSpy = vi.fn<typeof fetch>(() => Promise.reject(new Error('no network in this spec')))
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
  const connectors = createConnectors(bound.host)
  registerReadPdfTool(ctx, connectors, bound)
  let calls = 0
  const call = (args: unknown, withAgent = true) => executeModelToolFixture(ctx, {
    callId: `call-${String(++calls)}` as ToolCallId, name: 'read_pdf', arguments: args, signal: new AbortController().signal,
    ...withAgent ? { agent: { session: { header: { cwd: dir } } } as never } : {},
  })
  return { ctx, credentials, store, fetchSpy, call }
}

/** The text of a model-facing content block, or the block's type when it carries no text. */
function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : String(block?.type)
}

describe('read_pdf', () => {
  it('registers under the IDE\'s name with path and pages, and refuses a file outside the working directory before any upload', async () => {
    const { ctx, store, fetchSpy, call } = await bench()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['read_pdf'])
    expect(Object.keys((ctx.tools.schemas()[0]!.parameters as { properties: object }).properties)).toEqual(['path', 'pages'])
    await store.write('mistral', { apiKey: 'mk' })
    const away = join(outside, 'scan.pdf')
    await writeFile(away, PDF_THREE_PAGES)
    const absolute = await call({ path: away })
    expect(absolute.isError).toBe(true)
    expect(textOf(absolute.content[0])).toContain('outside the working directory')
    const relative = await call({ path: `../${basename(outside)}/scan.pdf` })
    expect(relative.isError).toBe(true)
    expect(textOf(relative.content[0])).toContain('outside the working directory')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers without a Mistral key with the text that names the Mistral card, touching neither the file nor the network', async () => {
    const { fetchSpy, call } = await bench()
    const result = await call({ path: 'missing.pdf' })
    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      error: 'missing_credentials',
      connector: 'mistral',
      message: 'Mistral key not configured. Add it in Settings > Patent data connectors > Mistral, then call this tool again.',
    })
    expect(result.content).toEqual([{ type: 'text', text: 'Mistral key not configured. Add it in Settings > Patent data connectors > Mistral, then call this tool again.' }])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends the workspace file to Mistral OCR on the stored key and returns page markers, the model and page count, and the cost line; a page range reads the cached result', async () => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await writeFile(join(dir, 'office-action.pdf'), PDF_THREE_PAGES)
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(OCR_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } })))

    const result = await call({ path: 'office-action.pdf' })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ model: 'mistral-ocr-latest', pageCount: 3, from: 1, to: 3, cached: false })
    expect((result.value as { path: string }).path.endsWith(`${sep}office-action.pdf`)).toBe(true)
    const text = textOf(result.content[0])
    expect(text.split('\n').slice(1, 3)).toEqual([
      'OCR model mistral-ocr-latest; 3 pages in the document, all 3 pages returned.',
      READ_PDF_COST_LINE,
    ])
    expect(text).toContain('--- page 1 ---\n# Office Action')
    expect(text).toContain('--- page 2 ---\nReference A teaches')
    expect(text).toContain('--- page 3 ---\nApplicant is given')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://api.mistral.ai/v1/ocr')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer mk')
    const body = JSON.parse(init?.body as string) as { model: string; document: { type: string; document_url: string } }
    expect(body.model).toBe('mistral-ocr-latest')
    expect(body.document.type).toBe('document_url')
    expect(body.document.document_url).toBe(`data:application/pdf;base64,${PDF_THREE_PAGES.toString('base64')}`)

    const second = await call({ path: './office-action.pdf', pages: '2' })
    expect(second.isError).toBe(false)
    expect(second.value).toMatchObject({ pageCount: 3, from: 2, to: 2, cached: true, markdown: '--- page 2 ---\nReference A teaches a separator with a ceramic coating.' })
    expect(textOf(second.content[0])).toContain('pages 2-2 of 3 returned, from the 24 h cache.')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects an unsupported extension, a malformed range, and a PDF declaring more than the page cap, before any upload', async () => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await writeFile(join(dir, 'notes.txt'), 'plain text')
    const txt = await call({ path: 'notes.txt' })
    expect(txt.isError).toBe(true)
    expect(textOf(txt.content[0])).toContain('the .txt extension is not one of .pdf, .png')
    const range = await call({ path: 'notes.pdf', pages: '5-2' })
    expect(textOf(range.content[0])).toContain('ends before it starts')
    const pages = Array.from({ length: READ_PDF_MAX_PAGES + 1 }, (_, index) => `${String(index + 3)} 0 obj << /Type /Page >> endobj`).join('\n')
    const big = Buffer.from(`%PDF-1.4\n${pages}\n%%EOF\n`)
    expect(estimatePdfPages(big)).toBe(READ_PDF_MAX_PAGES + 1)
    expect(estimatePdfPages(PDF_THREE_PAGES)).toBe(3)
    await writeFile(join(dir, 'big.pdf'), big)
    const capped = await call({ path: 'big.pdf' })
    expect(capped.isError).toBe(true)
    expect(textOf(capped.content[0])).toContain(`declares ${String(READ_PDF_MAX_PAGES + 1)} pages, more than the ${String(READ_PDF_MAX_PAGES)}-page limit`)
    const absent = await call({ path: 'nowhere.pdf' })
    expect(textOf(absent.content[0])).toContain('not found')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports an invalid Mistral baseUrl as a read_pdf error naming the base URL, not as a missing key, before any upload', async () => {
    const { credentials, fetchSpy, call } = await bench()
    credentials.records.set(parseCredentialKey('flowleap-connectors/mistral'), {
      kind: 'grant', payload: { apiKey: 'virtual', baseUrl: 'http://gateway.example.com' },
    })
    await writeFile(join(dir, 'scan.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    const result = await call({ path: 'scan.png' })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toContain('read_pdf: The Mistral base URL "http://gateway.example.com" is not allowed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('folds a key Mistral rejects into the replace-the-key answer', async () => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'stale' })
    await writeFile(join(dir, 'scan.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    fetchSpy.mockImplementation(() => Promise.resolve(new Response('Unauthorized', { status: 401 })))
    const result = await call({ path: 'scan.png' })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ error: 'missing_credentials', connector: 'mistral' })
    expect(textOf(result.content[0])).toBe('Mistral rejected the stored key. Replace it in Settings > Patent data connectors > Mistral.')
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string) as { document: { type: string; image_url: string } }
    expect(body.document.type).toBe('image_url')
    expect(body.document.image_url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it.each([
    ['a value that is not an object', 'scan.pdf', 'invalid arguments: expected an object'],
    ['a blank path', { path: ' ' }, 'invalid arguments: path must be a non-empty string'],
    ['a pages value that is not a string', { path: 'scan.pdf', pages: 2 }, 'invalid arguments: pages must be a string like "1-5"'],
    ['a pages value that is not a range', { path: 'scan.pdf', pages: 'first' }, 'pages must be a page number or a range like "1-5", got "first"'],
    ['a range wider than the page cap', { path: 'scan.pdf', pages: `1-${String(READ_PDF_MAX_PAGES + 1)}` }, `spans more than ${String(READ_PDF_MAX_PAGES)} pages`],
    ['a path without an extension', { path: 'README' }, 'cannot read "README": no file extension is not one of .pdf'],
  ])('refuses %s before any key check or upload', async (_case, args, message) => {
    const { fetchSpy, call } = await bench()
    const result = await call(args)
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toContain(message)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a directory and a file above the byte limit before any upload', async () => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await mkdir(join(dir, 'folder.pdf'))
    const folder = await call({ path: 'folder.pdf' })
    expect(folder.isError).toBe(true)
    expect(textOf(folder.content[0])).toContain('not a regular file')
    await writeFile(join(dir, 'huge.pdf'), '')
    await truncate(join(dir, 'huge.pdf'), READ_PDF_MAX_BYTES + 1)
    const huge = await call({ path: 'huge.pdf' })
    expect(huge.isError).toBe(true)
    expect(textOf(huge.content[0])).toContain(`${String(READ_PDF_MAX_BYTES + 1)} bytes exceeds the 50 MB limit`)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reads from the default working directory without an agent, and names one page in the singular', async () => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await writeFile(join(dir, 'figure.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    fetchSpy.mockImplementation(() => Promise.resolve(Response.json({ model: 'mistral-ocr-latest', pages: [{ index: 0, markdown: 'FIG. 1' }] })))
    const result = await call({ path: 'figure.png' }, false)
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ model: 'mistral-ocr-latest', pageCount: 1, from: 1, to: 1 })
    expect(textOf(result.content[0]).split('\n')[1]).toBe('OCR model mistral-ocr-latest; 1 page in the document, all 1 pages returned.')
  })

  it.each([
    ['a Mistral rate limit', () => new Response('slow down', { status: 429 }), 'read_pdf: Mistral rate limit exceeded'],
    ['a Mistral server failure', () => new Response('down', { status: 500 }), 'read_pdf: Mistral OCR failed (HTTP 500)'],
  ])('reports %s as a read_pdf error', async (_case, answer, message) => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await writeFile(join(dir, 'scan.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    fetchSpy.mockImplementation(() => Promise.resolve(answer()))
    const result = await call({ path: 'scan.png' })
    expect(result.isError).toBe(true)
    expect(textOf(result.content[0])).toContain(message)
  })

  it('passes another failure through unchanged, and wraps a failure that is not an Error', async () => {
    const { store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await writeFile(join(dir, 'scan.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    fetchSpy.mockImplementation(() => Promise.reject(new Error('socket closed')))
    const closed = await call({ path: 'scan.png' })
    expect(closed.isError).toBe(true)
    expect(textOf(closed.content[0])).toContain('socket closed')
    expect(textOf(closed.content[0])).not.toContain('read_pdf: socket closed')
    fetchSpy.mockImplementation(async () => {
      throw 'offline'
    })
    const offline = await call({ path: 'scan.png' })
    expect(offline.isError).toBe(true)
    expect(textOf(offline.content[0])).toContain('offline')
  })

  it('answers with the missing-key text when the key disappears between the key check and the upload', async () => {
    const { credentials, store, fetchSpy, call } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await writeFile(join(dir, 'scan.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
    const readRecord = credentials.readRecord.bind(credentials)
    let reads = 0
    credentials.readRecord = async (key) => {
      if (++reads > 1) return undefined
      return readRecord(key)
    }
    const result = await call({ path: 'scan.png' })
    expect(result.isError).toBe(false)
    expect(textOf(result.content[0])).toBe('Mistral key not configured. Add it in Settings > Patent data connectors > Mistral, then call this tool again.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
