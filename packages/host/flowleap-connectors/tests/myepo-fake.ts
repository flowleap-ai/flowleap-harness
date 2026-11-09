/** A double of the EPO for the MyEPO specs: the login service and the API, answering with the recorded sandbox fixtures. */
import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import type { MyEpoEndpoint } from '@deepseek-ai/dsh-flowleap-connectors'

/** The sandbox client of the fixtures; the values are not the founder's credentials. */
export const CREDENTIALS = { clientId: 'sandbox-client', clientSecret: 'sandbox-secret' }

export const ENDPOINT: MyEpoEndpoint = {
  baseUrl: 'https://myepo.test/latest', tokenUrl: 'https://login.test/token', requestsPerSecond: 1000, timeoutSeconds: 5,
}

/** One recorded answer: the status and the body. */
export interface Recorded {
  status: number
  body: unknown
  contentType?: string | null
}

/**
 * Read one fixture of `fixtures/myepo/`.
 * @param name - the file name without `.json`.
 * @returns the recorded answer.
 */
export function fixture(name: string): Recorded {
  return JSON.parse(readFileSync(new URL(`./fixtures/myepo/${name}.json`, import.meta.url), 'utf8')) as Recorded
}

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
export function zipOf(files: Record<string, string> = { 'P79105WO1-2023.05.30-SE2023123456-I1015.pdf': '%PDF-1.4 dummy' }): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))
}

/** The recorded answer of each API path, without the base. */
const ROUTES: Record<string, string> = {
  '/portfolios': 'portfolios',
  '/applications': 'applications',
  '/applications?page=1&size=2': 'applications-page',
  '/applications?portfolioId=999': 'applications-portfolio-999',
  '/biblio-data/EPC/applications/EP00000001': 'biblio-EPC-EP00000001',
  '/biblio-data/EPC/applications/EP99999999': 'biblio-unknown',
  '/communications': 'communications',
  '/communications/unhandled': 'communications-unhandled',
  '/communications/folders': 'folders',
  '/EPC/applications/EP00000001/dueDates': 'due-dates-EPC-EP00000001',
  '/terms': 'terms',
  '/EPC/applications/EP00000001/fees': 'fees-EPC-EP00000001',
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
  /** The tokens the login service issued. */
  tokens: number
}

/**
 * Create the double. The login service accepts {@link CREDENTIALS} only and issues `token-<n>` for 3,600 s; the API
 * accepts the last issued token only.
 * @returns the double.
 */
export function fakeEpo(): FakeEpo {
  const overrides = new Map<string, (call: Call) => Response | Promise<Response>>()
  const state: FakeEpo = {
    calls: [],
    tokens: 0,
    answer(path, respond) { overrides.set(path, respond) },
    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString()
      const headers = new Headers(init?.headers)
      const body = typeof init?.body === 'string' ? init.body : null
      const call: Call = { url, method: init?.method ?? 'GET', authorization: headers.get('authorization'), body }
      state.calls.push(call)
      const path = url.startsWith(ENDPOINT.baseUrl) ? url.slice(ENDPOINT.baseUrl.length) : url
      const override = overrides.get(path)
      if (override !== undefined) return override(call)
      if (url === ENDPOINT.tokenUrl) {
        const expected = `Basic ${Buffer.from(`${CREDENTIALS.clientId}:${CREDENTIALS.clientSecret}`).toString('base64')}`
        if (call.authorization !== expected) return json(401, fixture('token-refused').body)
        state.tokens += 1
        return json(200, { token_type: 'Bearer', expires_in: 3600, access_token: `token-${state.tokens}`, scope: 'mailboxapi' })
      }
      if (call.authorization !== `Bearer token-${state.tokens}`) {
        return new Response(String(fixture('api-401').body), { status: 401, headers: { 'content-type': 'text/plain' } })
      }
      if (path.startsWith('/communications/download/')) {
        return new Response(zipOf(), { status: 200, headers: { 'content-type': 'application/octet-stream' } })
      }
      const name = ROUTES[path]
      if (name === undefined) return json(404, { code: 'ERR_404', message: `no fixture for ${path}` })
      const recorded = fixture(name)
      return json(recorded.status, recorded.body)
    },
  }
  return state
}
