/**
 * The authenticated upload route of the agent files: `POST /api/flowleap-agents/upload?agent=<id>&name=<file>` with the
 * raw bytes as `application/octet-stream`. The Connection lets only the owner reach it. The answer is JSON with HTTP
 * status 200 after request validation: `{ ok: true, value: AgentFileView }` or `{ ok: false, error }`.
 * @module
 */

import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AgentCatalog } from './catalog.ts'
import { isAgentId } from './definition.ts'
import type { AgentId } from './types.ts'

/**
 * Handle one upload request.
 * @param catalog - the agents.
 * @param request - the authenticated request.
 * @returns the JSON answer, or 405, 415 or 400 for a request this route does not accept.
 */
export async function handleAgentUpload(catalog: AgentCatalog, request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/octet-stream') return new Response('content type must be application/octet-stream', { status: 415 })
  const url = new URL(request.url)
  const agent = url.searchParams.get('agent') ?? ''
  const name = url.searchParams.get('name') ?? ''
  if (!isAgentId(agent) || name === '') return new Response('agent and name are required', { status: 400 })
  let result: object
  try {
    await catalog.ready()
    result = { ok: true, value: await catalog.upload(brandString<AgentId>(agent), name, request.body ?? emptyBody()) }
  } catch (error) {
    const failure = remoteErrorOf(error)
    result = {
      ok: false,
      error: failure === undefined
        ? { code: 'gateway/internal', message: error instanceof Error ? error.message : String(error), details: {} }
        : { code: failure.code, message: failure.message, details: failure.details },
    }
  }
  return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

/** A request without a body is a stream with no chunk. */
async function* emptyBody(): AsyncIterable<Uint8Array> {}
