/**
 * A bounded read of an HTTP answer body, shared by the FlowLeap Host packages that read a firm service with a token.
 * @module
 */

/**
 * Read a body up to a size limit.
 * @param response - the answer.
 * @param maxBytes - most bytes the body may have.
 * @returns the text, or `undefined` when the body is larger than the limit; the rest is not read.
 * @throws when the read fails, for example at the read deadline.
 */
export async function readBoundedText(response: Response, maxBytes: number): Promise<string | undefined> {
  if (response.body === null) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > maxBytes) return undefined
    chunks.push(chunk)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
