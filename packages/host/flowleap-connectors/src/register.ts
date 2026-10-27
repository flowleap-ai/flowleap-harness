/**
 * Register events of one EP publication or US application, read on the firm's
 * office keys without a tool call: the `flowleapRegister` service a Host plugin
 * such as the register watch of `dsh-flowleap-routines` consumes.
 * @module
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { unwrapRead, type Connectors, type RegisterEvent } from '@flowleap/connectors'
import { z } from 'zod'
import type { BoundConnectorHost } from './host.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Register events of watched applications on the firm's office keys. */
    flowleapRegister: RegisterSource
  }
}

/** A normalized watched application: `EP` and seven digits (an EP publication), or `US` and eight digits (a US application). */
export type RegisterApplication = Branded<'RegisterApplication'>

/** One register event, office-neutral. */
export interface RegisterEntry {
  /** ISO calendar date `YYYY-MM-DD`. */
  readonly date: string
  /** The office's event code (EPO procedural step code, USPTO event code). */
  readonly code: string
  /** The office's event text. */
  readonly description: string
}

/** Reads the register events of one application. */
export interface RegisterSource {
  /**
   * Read the current register events of one application.
   * @param application - normalized application.
   * @param signal - caller cancellation.
   * @returns every event the office lists, in the office's order.
   * @throws when the office refuses the read or no key is configured.
   */
  read(application: RegisterApplication, signal?: AbortSignal): Promise<readonly RegisterEntry[]>
}

const SEPARATORS = /[\s/,.-]/g
const EP_PUBLICATION = /^EP(\d{7})(?:[AB]\d?)?$/
const US_APPLICATION = /^US(\d{8})$/

/**
 * Normalize an application number as an attorney writes it.
 * @param input - for example `EP 3 456 789`, `EP3456789A1`, or `US 17/123,456`.
 * @returns the normalized application, or undefined for any other office or form.
 */
export function parseRegisterApplication(input: string): RegisterApplication | undefined {
  const compact = input.toUpperCase().replace(SEPARATORS, '')
  const ep = EP_PUBLICATION.exec(compact)
  if (ep !== null) return brandString<RegisterApplication>(`EP${ep[1]}`)
  const us = US_APPLICATION.exec(compact)
  if (us !== null) return brandString<RegisterApplication>(`US${us[1]}`)
  return undefined
}

/**
 * Format an OPS `YYYYMMDD` date as `YYYY-MM-DD`; other forms pass through.
 * @param date - the OPS date.
 * @returns the ISO calendar date.
 */
function isoDate(date: string): string {
  return /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : date
}

/**
 * Map EP Register events to office-neutral entries.
 * @param events - events the library extracted from the OPS register document.
 * @returns one entry per event.
 */
export function entriesFromOps(events: readonly RegisterEvent[]): RegisterEntry[] {
  return events.map(event => ({ date: isoDate(event.date), code: event.code, description: event.description ?? '' }))
}

const odpTransactionsSchema = z.object({
  patentFileWrapperDataBag: z.array(z.object({
    eventDataBag: z.array(z.object({
      eventCode: z.string(),
      eventDescriptionText: z.string().optional(),
      eventDate: z.string(),
    })).default([]),
  })),
})

/**
 * Map a USPTO ODP transactions response to office-neutral entries.
 * @param response - the ODP `/transactions` response body.
 * @returns one entry per event of the first file wrapper.
 * @throws when the body does not carry the ODP transaction fields.
 */
export function entriesFromOdp(response: unknown): RegisterEntry[] {
  const parsed = odpTransactionsSchema.parse(response)
  return (parsed.patentFileWrapperDataBag[0]?.eventDataBag ?? []).map(event => ({
    date: event.eventDate, code: event.eventCode, description: event.eventDescriptionText ?? '',
  }))
}

/** Options of the provider. */
export interface FlowleapRegisterOptions {
  /** The shared library instance. */
  connectors: Connectors
  /** The host's signal carrier. */
  bound: BoundConnectorHost
}

/** Provider of `ctx.flowleapRegister` over the EPO OPS and USPTO ODP clients. */
export class FlowleapRegister extends Service implements RegisterSource {
  private readonly connectors: Connectors
  private readonly bound: BoundConnectorHost

  /**
   * @param ctx - Host context.
   * @param options - the library instance and its signal carrier.
   */
  constructor(ctx: Context, options: FlowleapRegisterOptions) {
    super(ctx, 'flowleapRegister')
    this.connectors = options.connectors
    this.bound = options.bound
  }

  async read(application: RegisterApplication, signal?: AbortSignal): Promise<readonly RegisterEntry[]> {
    const number = application.slice(2)
    return this.bound.withSignal(signal, async () => {
      if (application.startsWith('EP')) {
        return entriesFromOps(unwrapRead(await this.connectors.ops.getRegisterEvents(application)).events)
      }
      const result = await this.connectors.odp.getODPApplicationTransactions(number)
      if (!result.ok) throw new Error(`USPTO ODP: ${result.error.message}`)
      return entriesFromOdp(result.data)
    })
  }
}
