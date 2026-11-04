/**
 * HTTP intake that every signed webhook adapter shares: bounded raw body text for signature verification, single
 * headers, the JSON media type, and plain-text answers whose message carries no request data.
 * @module @deepseek-ai/dsh-webhook/http
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** HTTP refusal whose message is safe to return without request data. */
export class WebhookHttpError extends Error {
  override readonly name = 'WebhookHttpError'

  /**
   * @param status - the answer status.
   * @param message - the answer text; it never contains request data.
   */
  constructor(
    readonly status: 400 | 401 | 405 | 413 | 415 | 422 | 503,
    message: string,
  ) {
    super(message)
  }
}

/** Parse a decimal Content-Length or reject an ambiguous header. */
function contentLength(request: IncomingMessage): number | undefined {
  const value = request.headers['content-length']
  if (value === undefined) return undefined
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new WebhookHttpError(400, 'invalid Content-Length')
  }
  const length = Number(value)
  if (!Number.isSafeInteger(length)) throw new WebhookHttpError(413, 'request body is too large')
  return length
}

/**
 * Read one request body as exact, bounded UTF-8 text.
 * @param request - incoming request before any parser consumes it.
 * @param maxBodyBytes - positive byte ceiling.
 * @returns the decoded body after EOF.
 * @throws {WebhookHttpError} for invalid length, excessive bytes, invalid UTF-8, or an aborted stream.
 */
export async function readBoundedUtf8Body(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<string> {
  const declared = contentLength(request)
  if (declared !== undefined && declared > maxBodyBytes) {
    request.resume()
    throw new WebhookHttpError(413, 'request body is too large')
  }

  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const raw of request) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as string)
      size += chunk.byteLength
      if (size > maxBodyBytes) {
        request.resume()
        throw new WebhookHttpError(413, 'request body is too large')
      }
      chunks.push(chunk)
    }
  } catch (error: unknown) {
    if (error instanceof WebhookHttpError) throw error
    throw new WebhookHttpError(400, 'request body was aborted')
  }
  if (!request.complete) throw new WebhookHttpError(400, 'request body was aborted')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))
  } catch {
    // TextDecoder is the only statement in the try; signed JSON must be valid UTF-8.
    throw new WebhookHttpError(400, 'request body is not valid UTF-8')
  }
}

/**
 * Require one unambiguous non-empty request header.
 * @param request - incoming request.
 * @param name - lower-case header name.
 * @returns the header value.
 * @throws {WebhookHttpError} 400 when the header is absent, empty, or repeated.
 */
export function requiredHeader(request: IncomingMessage, name: string): string {
  const values = request.headersDistinct[name]
  const value = values?.[0]
  if (values?.length !== 1 || value === undefined || value.trim() === '') {
    throw new WebhookHttpError(400, `missing ${name} header`)
  }
  return value
}

/**
 * Whether Content-Type names JSON with at most one UTF-8 charset parameter.
 * @param value - the Content-Type header.
 * @returns whether the media type is UTF-8 JSON.
 */
export function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false
  const parts = value.split(';').map(part => part.trim())
  const [mediaType, parameter, ...extra] = parts
  if (mediaType?.toLowerCase() !== 'application/json') return false
  if (parameter === undefined) return true
  return extra.length === 0 && /^charset=(?:utf-8|"utf-8")$/i.test(parameter)
}

/**
 * Send one empty or plain-text response exactly once.
 * @param response - the response to end.
 * @param status - the answer status.
 * @param message - optional plain-text body.
 */
export function respond(response: ServerResponse, status: number, message?: string): void {
  if (message === undefined) {
    response.writeHead(status)
    response.end()
    return
  }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(message)
}

/**
 * Read the body of a JSON `POST` for signature verification: the method, the media type, then the bounded body.
 * @param request - incoming request before any parser consumes it.
 * @param response - the response; a wrong method sets its `Allow` header.
 * @param maxBodyBytes - positive byte ceiling.
 * @returns the exact UTF-8 body text.
 * @throws {WebhookHttpError} 405 for another method, 415 for another media type, or a body error of
 * {@link readBoundedUtf8Body}.
 */
export async function readJsonPostBody(request: IncomingMessage, response: ServerResponse, maxBodyBytes: number): Promise<string> {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST')
    throw new WebhookHttpError(405, 'method not allowed')
  }
  if (!isJsonContentType(request.headers['content-type'])) {
    throw new WebhookHttpError(415, 'content type must be application/json')
  }
  return readBoundedUtf8Body(request, maxBodyBytes)
}
