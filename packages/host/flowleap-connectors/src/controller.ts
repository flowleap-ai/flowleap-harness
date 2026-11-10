/**
 * Host owner of the `flowleapConnectors` Remote namespace: the connector
 * records as a settings card reads and writes them, plus one cheap
 * authenticated call per connector as a connection test, and the MyEPO link
 * of the MyEPO card. Secret values cross the wire in one direction only; no
 * method here returns one.
 * @module
 */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Connectors } from '@flowleap/connectors'
import { z } from 'zod'
import { CONNECTOR_LABELS, type ConnectorCredentialStore } from './credentials.ts'
import type { BoundConnectorHost } from './host.ts'
import { validateMyEpoFields, type MyEpoLink } from './myepo.ts'
import {
  CONNECTOR_IDS, isConnectorId,
  type ConnectorId, type ConnectorPresence, type ConnectorTestResult, type MyEpoLinkView, type MyEpoTestOutcome,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `flowleapConnectors` Remote namespace. */
    flowleapConnectors: FlowleapConnectorsController
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The credential store refused a connector write; the details name the connector only. */
    'flowleap-connectors/rejected': { readonly id: string }
  }
}

/** What the controller needs from the plugin. */
export interface FlowleapConnectorsControllerOptions {
  /** The connector records. */
  store: ConnectorCredentialStore
  /** The shared library instance. */
  connectors: Connectors
  /** The host's signal carrier. */
  bound: BoundConnectorHost
  /** The MyEPO link. */
  myEpo: MyEpoLink
}

/** A granted US application whose file wrapper ODP always serves: US 10,000,000 B2. */
const ODP_PROBE_APPLICATION = '15043224'

const valuesSchema = z.record(z.string(), z.string())

/** Parse one connector id off the wire. */
function parseId(method: string, value: string): ConnectorId {
  if (!isConnectorId(value)) {
    throw new RemoteError('gateway/bad-request', `invalid payload for ${method}: unknown connector "${value}"`, {})
  }
  return value
}

/** Host service backing the generated `ctx.remote.flowleapConnectors` namespace. */
export class FlowleapConnectorsController extends TypertRemoteService {
  private readonly store: ConnectorCredentialStore
  private readonly connectors: Connectors
  private readonly bound: BoundConnectorHost
  private readonly myEpo: MyEpoLink

  /**
   * @param ctx - Host context.
   * @param options - the records, the library instance, and its signal carrier.
   */
  constructor(ctx: Context, options: FlowleapConnectorsControllerOptions) {
    super(ctx, 'flowleapConnectors')
    this.store = options.store
    this.connectors = options.connectors
    this.bound = options.bound
    this.myEpo = options.myEpo
  }

  /**
   * Presence of every connector, for the settings cards and the first-run wizard.
   * @returns one view per connector id; never a value.
   */
  @Remote
  async describe(): Promise<Record<string, ConnectorPresence>> {
    const entries = await Promise.all(CONNECTOR_IDS.map(async id => [id, await this.store.describe(id)] as const))
    return Object.fromEntries(entries)
  }

  /**
   * Store one connector's fields. The values cross the wire in this direction only.
   * @param id - the connector.
   * @param values - its fields, each non-empty.
   * @throws RemoteError `gateway/bad-request` for an unknown connector or field, `flowleap-connectors/rejected` when the store refuses.
   */
  @Remote
  async set(id: string, values: Record<string, string>): Promise<void> {
    const connector = parseId('flowleapConnectors.set', id)
    const parsed = valuesSchema.safeParse(values)
    if (!parsed.success) {
      throw new RemoteError('gateway/bad-request', 'invalid payload for flowleapConnectors.set', { issues: parsed.error.issues })
    }
    await this.write(connector, () => this.store.write(connector, parsed.data))
  }

  /**
   * Remove one connector's record; removing an absent record is a no-op.
   * @param id - the connector.
   * @throws RemoteError `gateway/bad-request` for an unknown connector, `flowleap-connectors/rejected` when the store refuses.
   */
  @Remote
  async unset(id: string): Promise<void> {
    const connector = parseId('flowleapConnectors.unset', id)
    await this.write(connector, () => this.store.remove(connector))
  }

  /**
   * Run one cheap authenticated call with the stored key: an OPS access-token
   * mint, an ODP lookup of a known grant, or a one-paper Semantic Scholar
   * search, or the library's Mistral key verification (one authenticated GET).
   * @param id - the connector.
   * @param signal - cancels the upstream call.
   * @returns whether the call succeeded and a human-readable message.
   * @throws RemoteError `gateway/bad-request` for an unknown connector.
   */
  @Remote
  async test(id: string, signal: AbortSignal): Promise<ConnectorTestResult> {
    const connector = parseId('flowleapConnectors.test', id)
    const label = CONNECTOR_LABELS[connector]
    if ((await this.store.read(connector)) === undefined) {
      return { ok: false, message: `${label} key not configured` }
    }
    try {
      return await this.bound.withSignal(signal, () => this.probe(connector))
    } catch (error) {
      return { ok: false, message: `${label}: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  /**
   * The MyEPO link for the MyEPO card.
   * @returns not linked, or linked with the facts of the last passed test; never a credential value.
   */
  @Remote
  myEpoDescribe(): Promise<MyEpoLinkView> {
    return this.myEpo.describe()
  }

  /**
   * Test new MyEPO credentials, and store them only when the test passed. The values cross the wire in this direction only.
   * @param values - `clientId` and `clientSecret`, each non-empty.
   * @param signal - cancels the test.
   * @returns the test outcome; `passed` means the link is stored.
   * @throws RemoteError `gateway/bad-request` for a missing, empty or unknown field, `flowleap-connectors/rejected` when the store refuses.
   */
  @Remote
  async myEpoLink(values: Record<string, string>, signal: AbortSignal): Promise<MyEpoTestOutcome> {
    const parsed = valuesSchema.safeParse(values)
    if (!parsed.success) {
      throw new RemoteError('gateway/bad-request', 'invalid payload for flowleapConnectors.myEpoLink', { issues: parsed.error.issues })
    }
    try {
      validateMyEpoFields(parsed.data)
    } catch (error) {
      throw new RemoteError('gateway/bad-request', (error as TypeError).message, {})
    }
    return this.write('myepo', () => this.myEpo.link(parsed.data, signal))
  }

  /**
   * Test the stored MyEPO link: a token, the portfolios, and the Mailbox. A passed test stores its facts.
   * @param signal - cancels the test.
   * @returns the test outcome; the stored credentials do not change.
   */
  @Remote
  myEpoTest(signal: AbortSignal): Promise<MyEpoTestOutcome> {
    return this.myEpo.test(signal)
  }

  /**
   * Remove the stored MyEPO link; removing an absent link is a no-op.
   * @throws RemoteError `flowleap-connectors/rejected` when the store refuses.
   */
  @Remote
  async myEpoUnlink(): Promise<void> {
    await this.write('myepo', () => this.myEpo.unlink())
  }

  private async probe(connector: ConnectorId): Promise<ConnectorTestResult> {
    const label = CONNECTOR_LABELS[connector]
    switch (connector) {
      case 'epo-ops': {
        await this.connectors.ops.getAccessToken()
        return { ok: true, message: `${label}: access token issued` }
      }
      case 'uspto-odp': {
        const result = await this.connectors.odp.getODPApplicationByNumber(ODP_PROBE_APPLICATION)
        return result.ok
          ? { ok: true, message: `${label}: application ${ODP_PROBE_APPLICATION} answered` }
          : { ok: false, message: `${label}: ${result.error.message}` }
      }
      case 'semantic-scholar': {
        const result = await this.connectors.academic.runAcademicSearch({ query: 'patent', sources: ['scholar'], maxResults: 1 })
        // With one requested source, a failed source fails the whole search, so a success means Semantic Scholar answered.
        return result.ok
          ? { ok: true, message: `${label}: search answered` }
          : { ok: false, message: `${label}: ${result.body.error.message}` }
      }
      case 'mistral': {
        const verdict = await this.connectors.ocr.verifyKey()
        return { ok: verdict.ok, message: `${label}: ${verdict.message}` }
      }
    }
  }

  /** Run one write and report every refusal as `flowleap-connectors/rejected` carrying the store's own message. */
  private async write<T>(id: ConnectorId | 'myepo', write: () => Promise<T>): Promise<T> {
    try {
      return await write()
    } catch (error: unknown) {
      throw new RemoteError(
        'flowleap-connectors/rejected',
        error instanceof Error ? error.message : String(error),
        { id },
        { cause: error },
      )
    }
  }
}

export default FlowleapConnectorsController
