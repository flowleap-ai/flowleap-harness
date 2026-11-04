/** The Ticket ingress: one exact route that verifies, parses, deduplicates, and dispatches a Ticket delivery. @module */

import type { Context } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { WebhookDeliveryId, WebhookSourceId, type VerifiedWebhookDelivery } from '@deepseek-ai/dsh-webhook'
import {
  readJsonPostBody, requiredHeader, respond, WebhookHttpError,
} from '@deepseek-ai/dsh-webhook/http'
import { deliveryIdOf, parseTicketDelivery, signatureMatches } from './delivery.ts'
import type { DeliveryLedger } from './ledger.ts'
import { serverWarn } from './log.ts'
import { taskTypeOf } from './mandate.ts'
import type { TicketDeliveryKind } from './types.ts'

/** Handler values validated once at plugin load. */
export interface TicketHandlerConfig {
  readonly source: string
  readonly secretRef: CredentialRef
  readonly maxBodyBytes: number
}

/**
 * Create the Ticket route handler.
 * @param ctx - context with `credentials` and `webhookRuntime`.
 * @param config - the source, the secret reference, and the body ceiling.
 * @param ledger - the delivery ledger of this plugin instance.
 * @returns a handler that answers after the in-memory dispatch, before the Session exists.
 */
export function createTicketHandler(ctx: Context, config: TicketHandlerConfig, ledger: DeliveryLedger): WebRoute['handler'] {
  return async (request, response) => {
    try {
      const body = await readJsonPostBody(request, response, config.maxBodyBytes)
      const signature = requiredHeader(request, 'x-flowleap-signature')
      const deliveryId = WebhookDeliveryId(requiredHeader(request, 'x-flowleap-delivery'))
      const credential = await ctx.credentials.resolve(config.secretRef)
      if (credential === undefined || credential.value === '') {
        throw new WebhookHttpError(503, 'Ticket secret is unavailable')
      }
      if (!signatureMatches(body, signature, credential.value)) {
        serverWarn('refused a Ticket delivery with a wrong signature')
        throw new WebhookHttpError(401, 'invalid signature')
      }
      const delivery = parseTicketDelivery(body)
      if (deliveryIdOf(delivery) !== deliveryId) {
        throw new WebhookHttpError(400, 'X-Flowleap-Delivery is not <ticketId>/<pass> of the body')
      }
      if (taskTypeOf(delivery) === undefined) {
        throw new WebhookHttpError(422, 'no task type for the office event codes of the Ticket')
      }
      const state = await ledger.claim(deliveryId)
      if (state !== 'new') {
        respond(response, 200, 'delivery already accepted')
        return
      }
      const verified: VerifiedWebhookDelivery<TicketDeliveryKind> = {
        kind: 'flowleap-ticket',
        source: WebhookSourceId(config.source),
        deliveryId,
        event: delivery,
        receivedAt: Date.now(),
      }
      try {
        ctx.webhookRuntime.dispatch(verified)
      } catch {
        // dispatch throws only while the runtime closes or for a malformed delivery; neither opened a Session.
        ledger.release(deliveryId)
        serverWarn('dispatch unavailable')
        throw new WebhookHttpError(503, 'webhook runtime is unavailable')
      }
      respond(response, 202)
    } catch (error: unknown) {
      if (error instanceof WebhookHttpError) {
        respond(response, error.status, error.message)
        return
      }
      serverWarn('request failed')
      respond(response, 503, 'Ticket ingress is unavailable')
    }
  }
}
