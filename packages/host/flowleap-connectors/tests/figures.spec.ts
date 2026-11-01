import { Context } from '@deepseek-ai/cordis'
import AttachmentStore, { AttachmentError, AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentLimits, ImageAttachmentRef, SaveImageAttachment, StoredImageAttachment } from '@deepseek-ai/dsh-attachment'
import { LlmAdapter, LlmRuntime, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { createConnectors, type ToolDefinition } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createConnectorHost, createCredentialStore, registerOfficeTools } from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

const PNG_PAGE = Buffer.from('png-page-6').toString('base64')
const PDF_PAGE = Buffer.from('%PDF-page-7').toString('base64')

const RESULT = {
  docId: 'EP4831432',
  totalFigures: 14,
  drawingStartPage: 6,
  availableFormats: ['png', 'pdf', 'tiff'],
  figures: [
    { page: 6, format: 'png', base64: PNG_PAGE },
    { page: 7, format: 'pdf', base64: PDF_PAGE },
  ],
}

const LIMITS: ImageAttachmentLimits = {
  maxImageBytes: 1024,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 2048,
  maxImagePixels: 1024,
  maxImageDimension: 2000,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

class RecordingStore extends AttachmentStore {
  readonly imageLimits = LIMITS
  readonly saved: SaveImageAttachment[] = []

  validateImage(_input: SaveImageAttachment): Promise<void> {
    return Promise.resolve()
  }

  saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    this.saved.push(input)
    return Promise.resolve({ attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`), mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1 })
  }

  readImage(_ref: ImageAttachmentRef): Promise<StoredImageAttachment> {
    throw new Error('not used')
  }
}

class Catalog extends LlmAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model, inputModalities: model === 'vision' ? ['text', 'image'] : ['text'] })
  }

  stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('never streams')
  }
}

/** A `get_patent_image` stand-in that answers `result` without a network call. */
const figureTool = (result: object): ToolDefinition => ({
  name: 'get_patent_image',
  description: 'drawing pages',
  input: z.object({ patent_number: z.string() }),
  access: 'none',
  handler: () => Promise.resolve(result),
})

async function bench(options: { attachments: boolean; result?: object }) {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['visual'], new Catalog())
  if (options.attachments) await ctx.plugin(RecordingStore)
  const store = createCredentialStore(credentials)
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 5, fetch: vi.fn<typeof fetch>() })
  registerOfficeTools(ctx, createConnectors(bound.host), bound, [figureTool(options.result ?? RESULT)])
  return ctx
}

let calls = 0
const call = (ctx: Context, model: string | undefined, routed?: { provider: string; model: string }) => executeModelToolFixture(ctx, {
  callId: ToolCallId(`figure-${String(++calls)}`),
  name: 'get_patent_image',
  arguments: { patent_number: 'EP4831432A1' },
  signal: new AbortController().signal,
  agent: {
    options: model === undefined ? {} : { provider: 'visual', model },
    session: { requestHeader: () => routed === undefined ? undefined : { config: routed } },
  } as never,
})

const notShown = (reason: string): ContentBlock[] => [
  { type: 'text', text: textWithoutPng },
  { type: 'text', text: `[page images not shown: ${reason}]` },
]

const textWithoutPng = JSON.stringify({ ...RESULT, figures: [{ page: 6, format: 'png' }, RESULT.figures[1]] }, null, 2)

describe('get_patent_image pages', () => {
  it('shows each PNG page as a caption and an image block, keeps the base64 in the canonical value, and keeps a PDF page as text', async () => {
    const ctx = await bench({ attachments: true })
    const result = await call(ctx, 'vision')
    expect(result.isError).toBe(false)
    expect(result.value).toEqual(RESULT)
    expect(result.content).toEqual<ContentBlock[]>([
      { type: 'text', text: textWithoutPng },
      { type: 'text', text: 'Page 6 of EP4831432' },
      { type: 'image', attachment: expect.objectContaining({ mediaType: 'image/png' }) as ImageAttachmentRef },
    ])
    expect((ctx.attachments as RecordingStore).saved).toEqual([{ data: Buffer.from('png-page-6'), mediaType: 'image/png' }])
  })

  it('names why the pages are not shown when the model reads no images', async () => {
    const ctx = await bench({ attachments: true })
    const result = await call(ctx, 'text-only')
    expect(result.content).toEqual([
      { type: 'text', text: textWithoutPng },
      { type: 'text', text: '[page images not shown: model "text-only" does not declare image input]' },
    ])
    expect((ctx.attachments as RecordingStore).saved).toEqual([])
  })

  it('names why the pages are not shown when no attachment store is mounted', async () => {
    const ctx = await bench({ attachments: false })
    const result = await call(ctx, 'vision')
    expect(result.content).toEqual([
      { type: 'text', text: textWithoutPng },
      { type: 'text', text: '[page images not shown: no attachment store is mounted]' },
    ])
  })

  it('reads the model route from the request header before the agent options', async () => {
    const ctx = await bench({ attachments: true })
    const result = await call(ctx, 'text-only', { provider: 'visual', model: 'vision' })
    expect(result.content.at(-1)).toMatchObject({ type: 'image' })
  })

  it('names an unresolved or unverifiable model route', async () => {
    const ctx = await bench({ attachments: true })
    expect((await call(ctx, undefined)).content).toEqual(notShown('the current model route could not be resolved'))
    vi.spyOn(ctx.llm, 'resolveModelInfo').mockRejectedValueOnce(new Error('catalog down'))
    expect((await call(ctx, 'vision')).content).toEqual(notShown('the current model route could not be verified'))
  })

  it('names an image admission refusal and a store failure', async () => {
    const ctx = await bench({ attachments: true })
    const save = vi.spyOn(ctx.attachments as RecordingStore, 'saveImages')
    save.mockRejectedValueOnce(new AttachmentError('image is too large', 'IMAGE_TOO_LARGE'))
    expect((await call(ctx, 'vision')).content).toEqual(notShown('image admission rejected the pages: image is too large'))
    save.mockRejectedValueOnce(new Error('disk full'))
    expect((await call(ctx, 'vision')).content).toEqual(notShown('the attachment store rejected the pages'))
  })

  it('answers a metadata call as text alone', async () => {
    const metadata = { docId: 'EP4831432', totalFigures: 14, drawingStartPage: 6, drawingPages: [6, 7] }
    const ctx = await bench({ attachments: true, result: metadata })
    expect((await call(ctx, 'vision')).content).toEqual([{ type: 'text', text: JSON.stringify(metadata, null, 2) }])
  })
})
