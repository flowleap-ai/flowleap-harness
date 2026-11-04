/** A Ticket delivery as the Work router of the Firm Record posts it, and its signature. */

import { createHmac } from 'node:crypto'

/** The shared secret of the test person. */
export const SECRET = 'ticket-secret-of-the-test-person'

/** The body of the R.71(3) Ticket of FL-2026-0001, pass 1. */
export const DELIVERY = {
  ticketId: 'tk-1',
  pass: 1,
  matter: { fileNumber: 'FL-2026-0001', title: 'Heat pump control' },
  events: [{
    officeEventSeq: 5,
    code: 'EPO:R71(3)',
    documentDate: '2025-10-30',
    applicationNumber: 'EP23812345.6',
    document: '5f2c8a1e9b7d4c3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a',
  }],
  deadline: { id: 'd-1', state: 'proposed', due: '2026-03-02' },
  recordSeq: 7,
} as const

/**
 * The signature header of a body.
 * @param body - the raw body.
 * @param secret - the key.
 * @returns `sha256=<hex>`.
 */
export function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}
