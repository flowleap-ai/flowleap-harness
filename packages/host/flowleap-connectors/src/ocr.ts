/**
 * Page text of one document through Mistral OCR on the firm's key, for Host plugins that index files without a tool
 * call: the `flowleapOcr` service the agent builder of `dsh-flowleap-agent-builder` consumes for scanned PDF pages.
 * @module
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { OcrNotConfiguredError, ProviderKeyInvalidError, type Connectors } from '@flowleap/connectors'
import type { BoundConnectorHost } from './host.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Page text of one document through Mistral OCR on the firm's key. */
    flowleapOcr: OcrSource
  }
}

/** The text of one page. */
export interface OcrPageText {
  /** 1-based page number. */
  readonly page: number
  /** The page as Markdown. */
  readonly text: string
}

/** One OCR read: the pages, or no usable Mistral key (absent or refused upstream). */
export type OcrRead =
  | { readonly kind: 'read'; readonly pages: readonly OcrPageText[] }
  | { readonly kind: 'not-configured' }

/** What a consumer needs from the service. */
export interface OcrSource {
  /**
   * Read the page text of one document.
   * @param bytes - the document (PDF or image).
   * @param filename - the file name Mistral receives.
   * @param signal - cancels the upstream call.
   * @returns the pages, or `not-configured` without a usable key.
   * @throws Error for an upstream failure other than a missing or refused key.
   */
  pages(bytes: Uint8Array, filename: string, signal?: AbortSignal): Promise<OcrRead>
}

/** Options of the provider. */
export interface FlowleapOcrOptions {
  /** The shared library instance. */
  connectors: Connectors
  /** The host's signal carrier. */
  bound: BoundConnectorHost
}

/** Provider of `ctx.flowleapOcr` over the library's Mistral OCR client. */
export class FlowleapOcr extends Service implements OcrSource {
  private readonly connectors: Connectors
  private readonly bound: BoundConnectorHost

  /**
   * @param ctx - Host context.
   * @param options - the library instance and its signal carrier.
   */
  constructor(ctx: Context, options: FlowleapOcrOptions) {
    super(ctx, 'flowleapOcr')
    this.connectors = options.connectors
    this.bound = options.bound
  }

  async pages(bytes: Uint8Array, filename: string, signal?: AbortSignal): Promise<OcrRead> {
    try {
      const response = await this.bound.withSignal(signal, () => this.connectors.ocr.runOcr({
        file: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
        filename,
      }))
      return { kind: 'read', pages: response.pages.map(page => ({ page: page.pageNumber, text: page.markdown })) }
    } catch (error) {
      if (error instanceof OcrNotConfiguredError) return { kind: 'not-configured' }
      if (error instanceof ProviderKeyInvalidError && error.provider === 'mistral') return { kind: 'not-configured' }
      throw error
    }
  }
}
