/**
 * The EPO for the MyEPO specs: the MyEPO double over the recorded sandbox answers, with a call log and per-URL answers
 * that a spec replaces.
 */
import { strToU8, zipSync } from 'fflate'
import type { MyEpoEndpoint } from '@deepseek-ai/dsh-flowleap-connectors'
import { createMyEpoDouble } from './myepo-double/double.ts'
import { recorded, SANDBOX_PDF_NAME, sandboxData, type Recorded } from './myepo-double/sandbox-data.ts'

export type { Recorded }

/** The sandbox client of the fixtures; the values are not the founder's credentials. */
export const CREDENTIALS = { clientId: 'sandbox-client', clientSecret: 'sandbox-secret' }

export const ENDPOINT: MyEpoEndpoint = {
  baseUrl: 'https://myepo.test/latest', tokenUrl: 'https://login.test/token', requestsPerSecond: 1000, timeoutSeconds: 5,
}

/**
 * Read one fixture of `fixtures/myepo/`.
 * @param name - the file name without `.json`.
 * @returns the recorded answer.
 */
export const fixture = recorded

/** A JSON answer. */
export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * A ZIP of the layout the EPO sends: one PDF named after the reference, the dispatch date, the application and the
 * document code (the sandbox ZIP of 2026-11-09 held `P79105WO1-2023.05.30-SE2023123456-I1015.pdf`, 620,983 bytes).
 * @param files - the files of the ZIP; one small PDF when absent.
 * @returns the ZIP bytes.
 */
export function zipOf(files: Record<string, string> = { [SANDBOX_PDF_NAME]: '%PDF-1.4 dummy' }): Uint8Array<ArrayBuffer> {
  return new Uint8Array(zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))))
}

/** A request the double received. */
export interface Call {
  url: string
  method: string
  authorization: string | null
  body: string | null
}

/** The double: its `fetch`, the calls it received, and the answers a spec replaces. */
export interface FakeEpo {
  fetch: typeof fetch
  calls: Call[]
  /** Replace the answer of one URL (token URL or API path); the function runs for each matching call. */
  answer(path: string, respond: (call: Call) => Response | Promise<Response>): void
  /** The tokens the login service issued; the API accepts `token-<tokens>` only. */
  tokens: number
}

/**
 * Create the double. The login service accepts {@link CREDENTIALS} only and issues `token-<n>` for 3,600 s; the API
 * accepts the last issued token only.
 * @returns the double.
 */
export function fakeEpo(): FakeEpo {
  const overrides = new Map<string, (call: Call) => Response | Promise<Response>>()
  const double = createMyEpoDouble(sandboxData(), ENDPOINT, CREDENTIALS)
  const calls: Call[] = []
  return {
    calls,
    get tokens() { return double.tokens },
    set tokens(value) { double.tokens = value },
    answer(path, respond) { overrides.set(path, respond) },
    async fetch(input, init) {
      const url = input instanceof Request ? input.url : input.toString()
      const headers = new Headers(init?.headers)
      const body = typeof init?.body === 'string' ? init.body : null
      const call: Call = { url, method: init?.method ?? 'GET', authorization: headers.get('authorization'), body }
      calls.push(call)
      const override = overrides.get(url.startsWith(ENDPOINT.baseUrl) ? url.slice(ENDPOINT.baseUrl.length) : url)
      if (override !== undefined) return override(call)
      return double.fetch(url, { method: call.method, headers, ...body === null ? {} : { body } })
    },
  }
}
