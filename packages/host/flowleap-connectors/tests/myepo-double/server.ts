/**
 * The MyEPO double on a loopback HTTP port: the login service at `/token`, the API at `/latest/…`, and the control
 * surface at `/_double/…`, which no MyEPO path starts with. The control surface reads the Mailbox state
 * (`GET /_double/state`), restores it (`POST /_double/reset`), and delivers the next arrival (`POST /_double/arrive`).
 * @module
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createMyEpoDouble, type DoubleClient, type MyEpoDouble, type MyEpoDoubleData } from './double.ts'

/** A running double. */
export interface MyEpoDoubleServer {
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string
  /** The API base, `<origin>/latest`. */
  readonly baseUrl: string
  /** The token URL, `<origin>/token`. */
  readonly tokenUrl: string
  readonly double: MyEpoDouble
  /** Stops listening and closes open connections. */
  close(): Promise<void>
}

/** The control surface's path prefix. */
export const CONTROL_PREFIX = '/_double/'

/**
 * Start the double on 127.0.0.1.
 * @param options - the port (0 picks a free one), the data set for the API base that the server gets, and the client.
 * @returns the running server.
 */
export async function startMyEpoDoubleServer(options: {
  readonly port: number
  readonly data: (baseUrl: string) => MyEpoDoubleData
  readonly client: DoubleClient
}): Promise<MyEpoDoubleServer> {
  let handle: (request: IncomingMessage, response: ServerResponse) => void = () => { /* replaced once the port is known */ }
  const server = createServer((request, response) => { handle(request, response) })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => { resolve() })
  })
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const baseUrl = `${origin}/latest`
  const tokenUrl = `${origin}/token`
  const data = options.data(baseUrl)
  const double = createMyEpoDouble(data, { baseUrl, tokenUrl }, options.client)

  const control = (method: string, path: string): Response => {
    if (method === 'GET' && path === 'state') return Response.json({ data: data.label, ...double.state() })
    if (method === 'POST' && path === 'reset') {
      double.reset()
      return Response.json({ data: data.label, ...double.state() })
    }
    if (method === 'POST' && path === 'arrive') {
      const arrived = double.arrive()
      return arrived === undefined ? Response.json({ error: 'every arrival has arrived; POST /_double/reset first' }, { status: 409 }) : Response.json({ arrived })
    }
    return Response.json({ error: `no control ${method} ${CONTROL_PREFIX}${path}` }, { status: 404 })
  }

  handle = (request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const path = request.url ?? '/'
      const method = request.method ?? 'GET'
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(name, value)
      const answer = path.startsWith(CONTROL_PREFIX)
        ? Promise.resolve(control(method, path.slice(CONTROL_PREFIX.length)))
        : double.fetch(`${origin}${path}`, { method, headers, ...chunks.length === 0 ? {} : { body: Buffer.concat(chunks) } })
      void answer.then(async (result) => {
        response.writeHead(result.status, { 'content-type': result.headers.get('content-type') ?? 'application/octet-stream' })
        response.end(Buffer.from(await result.arrayBuffer()))
      }).catch((error: unknown) => {
        // A failed answer is the double's own defect: the caller gets a 500 and the log names it.
        console.error('MyEPO double: answer failed', error)
        if (!response.headersSent) response.writeHead(500)
        response.end()
      })
    })
  }

  return {
    origin, baseUrl, tokenUrl, double,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => { resolve() })
    }),
  }
}
