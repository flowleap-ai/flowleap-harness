/**
 * Drawing pages of `get_patent_image` as model-visible images. The tool's
 * canonical value keeps the library result (`figures[]` with base64 pages); its
 * text drops every base64 string, and each PNG or JPEG page reaches the model as
 * a caption plus an image block stored in the attachment store. A model route
 * without image input, or a composition without an attachment store, gets the
 * text and one line that names why the pages are not shown.
 * @module
 */

import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { isImageAdmissionError } from '@deepseek-ai/dsh-attachment'
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** The office tool whose pages become image blocks. */
export const FIGURE_TOOL = 'get_patent_image'

/** The page formats a model reads as images, with their media types. */
const IMAGE_MEDIA_TYPE_OF_FORMAT: Readonly<Record<string, ImageMediaType>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
}

/** One page that carries an image the model can read. */
interface FigurePage {
  readonly page: string
  readonly image: SaveImageAttachment
}

/** The content prepared at execution, installed by `projectContent`. */
export interface PreparedFigures {
  readonly value: JsonValue
  readonly content: ContentBlock[]
}

type JsonObject = { [key: string]: JsonValue }

/** The `figures[]` entries of a `get_patent_image` result; a metadata result has none. */
function figuresOf(value: JsonValue): JsonObject[] {
  const figures = (value as JsonObject)['figures']
  return Array.isArray(figures) ? figures as JsonObject[] : []
}

/** The media type of a page the model reads as an image (a PNG or JPEG page); every fetched page carries its base64. */
function mediaTypeOf(figure: JsonObject): ImageMediaType | undefined {
  return IMAGE_MEDIA_TYPE_OF_FORMAT[figure['format'] as string]
}

/**
 * The result without the base64 of its PNG and JPEG pages; a TIFF or PDF page keeps its base64.
 * @param value - a `get_patent_image` result.
 * @returns the value the text block shows.
 */
export function withoutPageImages(value: JsonValue): JsonValue {
  const figures = figuresOf(value)
  if (figures.length === 0) return value
  return {
    ...value as JsonObject,
    figures: figures.map((figure) => {
      if (mediaTypeOf(figure) === undefined) return figure
      const { base64: _image, ...rest } = figure
      return rest
    }),
  }
}

function pagesOf(value: JsonValue): FigurePage[] {
  return figuresOf(value).flatMap((figure) => {
    const mediaType = mediaTypeOf(figure)
    if (mediaType === undefined) return []
    return [{ page: `${figure['page'] as number}`, image: { data: Buffer.from(figure['base64'] as string, 'base64'), mediaType } }]
  })
}

/**
 * Resolve the attachment store after proof that the current model route reads images.
 * @throws Error naming the missing store, the unresolved route, or the model without image input.
 */
/* jscpd:ignore-start -- the same route proof as dsh-mcp-client resolveImageAdmission; neither package owns a shared one. */
async function imageStore(ctx: Context, exec: ToolRunContext): Promise<AttachmentStore> {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) throw new Error('no attachment store is mounted')
  const routed = exec.agent?.session.requestHeader()?.config
  const provider = routed?.provider ?? exec.agent?.options.provider
  const model = routed?.model ?? exec.agent?.options.model
  const llm = ctx.get('llm')
  if (provider === undefined || model === undefined || llm === undefined) throw new Error('the current model route could not be resolved')
  let info: Awaited<ReturnType<typeof llm.resolveModelInfo>>
  try {
    info = await llm.resolveModelInfo(provider, model, exec.signal)
  } catch {
    // The provider's failure is not model-relevant; the route is simply unproven.
    throw new Error('the current model route could not be verified')
  }
  if (info.inputModalities?.includes('image') !== true) throw new Error(`model "${model}" does not declare image input`)
  return attachments
}
/* jscpd:ignore-end */

/**
 * Store the PNG and JPEG pages of one result and build the content that shows them.
 * @param ctx - the plugin context with the optional `attachments` and `llm` services.
 * @param exec - the tool execution, for the model route and the signal.
 * @param value - the canonical result.
 * @param fallback - the rendered text content, which the pages follow.
 * @returns the prepared content, or `undefined` when the result holds no readable page.
 */
export async function prepareFigures(
  ctx: Context,
  exec: ToolRunContext,
  value: JsonValue,
  fallback: ContentBlock[],
): Promise<PreparedFigures | undefined> {
  const pages = pagesOf(value)
  if (pages.length === 0) return undefined
  const docId = (value as JsonObject)['docId'] as string
  const notShown = (reason: string): PreparedFigures => ({
    value,
    content: [...fallback, { type: 'text', text: `[page images not shown: ${reason}]` }],
  })
  let attachments: AttachmentStore
  try {
    attachments = await imageStore(ctx, exec)
  } catch (error: unknown) {
    // imageStore throws Error only.
    return notShown((error as Error).message)
  }
  try {
    const refs = await attachments.saveImages(pages.map(page => page.image))
    return {
      value,
      content: [
        ...fallback,
        ...pages.flatMap((page, index): ContentBlock[] => [
          { type: 'text', text: `Page ${page.page} of ${docId}` },
          // saveImages answers one reference per input, in input order.
          { type: 'image', attachment: refs[index] as ImageAttachmentRef },
        ]),
      ],
    }
  } catch (error: unknown) {
    return notShown(isImageAdmissionError(error) ? `image admission rejected the pages: ${error.message}` : 'the attachment store rejected the pages')
  }
}

/**
 * The prepared content for a result whose value is the one the pages were prepared for.
 * @param prepared - the content prepared at execution.
 * @param result - the normalized result.
 * @returns the content with images, or `undefined` to keep the result's content.
 */
export function installFigures(prepared: PreparedFigures, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined {
  /* v8 ignore next -- only a tools/execute wrapper that replaces the body's value reaches this; its content stays */
  if (result.isError || !isDeepStrictEqual(result.value, prepared.value)) return undefined
  return prepared.content
}
