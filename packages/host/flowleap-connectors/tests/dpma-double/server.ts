/**
 * The DPMA double on a loopback HTTP port. The base that a deployment sets as `dpma.baseUrl` is
 * `<origin>/dpmaws/rest-services`.
 * @module
 */

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createDpmaDouble, type DpmaDouble, type DpmaDoubleAccount, type DpmaDoubleData } from './double.ts'

/** A running double. */
export interface DpmaDoubleServer {
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string
  /** The base of the REST services, `<origin>/dpmaws/rest-services`. */
  readonly baseUrl: string
  readonly double: DpmaDouble
  /** Stops listening and closes open connections. */
  close(): Promise<void>
}

/**
 * Start the double on 127.0.0.1.
 * @param options - the port (0 picks a free one), the data set and the account.
 * @returns the running server.
 */
export async function startDpmaDoubleServer(options: {
  readonly port: number
  readonly data: DpmaDoubleData
  readonly account: DpmaDoubleAccount
}): Promise<DpmaDoubleServer> {
  const double = await createDpmaDouble(options.data, options.account)
  const server = createServer((request, response) => {
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(name, value)
    void double.fetch(`http://127.0.0.1${request.url ?? '/'}`, { method: request.method ?? 'GET', headers }).then(async (answer) => {
      response.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/octet-stream' })
      response.end(Buffer.from(await answer.arrayBuffer()))
    }).catch((error: unknown) => {
      // A failed answer is the double's own defect: the caller gets a 500 and the log names it.
      console.error('DPMA double: answer failed', error)
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => { resolve() })
  })
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    origin, baseUrl: `${origin}/dpmaws/rest-services`, double,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => { resolve() })
    }),
  }
}
