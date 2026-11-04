/** The signature check and the parse of a Ticket delivery. Pure functions over the raw body. @module */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { brandNumber, brandString } from '@deepseek-ai/dsh-brand'
import type {
  DeadlineId, DocumentSha256, LocalDate, MatterFileNumber, RecordSeq, TicketId,
} from '@deepseek-ai/dsh-flowleap-record'
import { WebhookDeliveryId } from '@deepseek-ai/dsh-webhook'
import { WebhookHttpError } from '@deepseek-ai/dsh-webhook/http'
import { snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import { z } from 'zod'
import type { TicketDelivery } from './types.ts'

const SIGNATURE = /^sha256=([0-9a-f]{64})$/u

/**
 * Whether `X-Flowleap-Signature` is the HMAC-SHA256 of the raw body under the secret.
 * @param body - the raw body text exactly as received.
 * @param header - the header value, `sha256=<lower-case hex>`.
 * @param secret - the shared secret of the runtime's person.
 * @returns whether the signature matches; a malformed header never matches.
 */
export function signatureMatches(body: string, header: string, secret: string): boolean {
  const hex = SIGNATURE.exec(header)?.[1]
  if (hex === undefined) return false
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest()
  return timingSafeEqual(expected, Buffer.from(hex, 'hex'))
}

/** A Ticket id: 1 to 128 letters, digits, dot, underscore, or hyphen, starting with a letter or digit. */
const TICKET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

const seq = z.number().int().nonnegative().transform(value => brandNumber<RecordSeq>(value))
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).transform(value => brandString<LocalDate>(value))

const event = z.object({
  officeEventSeq: seq,
  code: z.string().min(1).max(64),
  documentDate: localDate,
  applicationNumber: z.string().min(1).max(64),
  document: z.string().regex(/^[0-9a-f]{64}$/u).transform(value => brandString<DocumentSha256>(value)),
})

const deliverySchema = z.object({
  ticketId: z.string().regex(TICKET_ID).transform(value => brandString<TicketId>(value)),
  pass: z.number().int().positive(),
  matter: z.object({
    fileNumber: z.string().min(1).max(64).transform(value => brandString<MatterFileNumber>(value)),
    title: z.string().max(500),
  }),
  events: z.tuple([event], event).refine(events => events.length <= 20),
  deadline: z.object({
    id: z.string().min(1).max(128).transform(value => brandString<DeadlineId>(value)),
    state: z.enum(['proposed', 'active', 'rejected']),
    due: localDate,
  }).nullable(),
  recordSeq: seq,
})

/**
 * Parse a verified body into a Ticket delivery.
 * @param body - the verified raw body.
 * @returns the delivery; unknown fields are dropped.
 * @throws {WebhookHttpError} 400 when the body is not JSON or not a Ticket delivery.
 */
export function parseTicketDelivery(body: string): TicketDelivery {
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    // JSON.parse is the only statement in the try; the sender gets no parser detail.
    throw new WebhookHttpError(400, 'request body is not valid JSON')
  }
  const parsed = deliverySchema.safeParse(snapshotJsonValue(value))
  if (!parsed.success) throw new WebhookHttpError(400, 'request body is not a Ticket delivery')
  return parsed.data
}

/**
 * The delivery id that the Work router sends with a delivery.
 * @param delivery - the parsed delivery.
 * @returns `<ticketId>/<pass>`.
 */
export function deliveryIdOf(delivery: TicketDelivery): WebhookDeliveryId {
  return WebhookDeliveryId(`${delivery.ticketId}/${String(delivery.pass)}`)
}
