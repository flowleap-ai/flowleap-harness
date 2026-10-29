/**
 * The connector credentials as stored records of the `ctx.credentials` seam:
 * one `flowleap-connectors/<id>` record per connector, written by the settings
 * card and read per call by the connector host. The record is a `grant` whose
 * payload is the field map the connector needs (`{ consumerKey, consumerSecret }`
 * for EPO OPS, `{ apiKey }` for the others, plus an optional Mistral `baseUrl`); the payload is validated on every
 * read because it crosses the durable-storage boundary.
 * @module
 */

import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { ConnectorCredentialMap, ConnectorProvider, CredentialLookup } from '@flowleap/connectors'
import { z } from 'zod'
import { CONNECTOR_FIELDS, CONNECTOR_OPTIONAL_FIELDS, type ConnectorId, type ConnectorPresence } from './types.ts'

/** The record scope: this plugin's registered name. */
export const CREDENTIAL_SCOPE = 'flowleap-connectors'

/** The connector id behind each library provider. */
export const CONNECTOR_OF_PROVIDER: Readonly<Record<ConnectorProvider, ConnectorId>> = {
  epoOps: 'epo-ops',
  usptoOdp: 'uspto-odp',
  semanticScholar: 'semantic-scholar',
  mistral: 'mistral',
}

/** The library provider behind each connector id. */
export const PROVIDER_OF_CONNECTOR: Readonly<Record<ConnectorId, ConnectorProvider>> = {
  'epo-ops': 'epoOps',
  'uspto-odp': 'usptoOdp',
  'semantic-scholar': 'semanticScholar',
  mistral: 'mistral',
}

/** Display names used in results and test messages. */
export const CONNECTOR_LABELS: Readonly<Record<ConnectorId, string>> = {
  'epo-ops': 'EPO OPS',
  'uspto-odp': 'USPTO ODP',
  'semantic-scholar': 'Semantic Scholar',
  mistral: 'Mistral',
}

const payloadSchema = z.record(z.string(), z.string())

/** Durable connector credentials: read, describe, write, and remove per connector. */
export interface ConnectorCredentialStore {
  /**
   * Read one connector's complete field map.
   * @param id - the connector.
   * @returns the fields, or `undefined` while no complete record is stored.
   */
  read(id: ConnectorId): Promise<Record<string, string> | undefined>
  /**
   * Describe one connector for a settings card without exposing values.
   * @param id - the connector.
   * @returns presence, source, writability, and the expected fields.
   */
  describe(id: ConnectorId): Promise<ConnectorPresence>
  /**
   * Store one connector's fields, replacing any stored record.
   * @param id - the connector.
   * @param values - every field of {@link CONNECTOR_FIELDS} for `id`, and any of {@link CONNECTOR_OPTIONAL_FIELDS}, each non-empty.
   * @throws TypeError when a field is missing, empty, or not one of the connector's fields.
   */
  write(id: ConnectorId, values: Record<string, string>): Promise<void>
  /**
   * Remove one connector's record; removing an absent record is a no-op.
   * @param id - the connector.
   */
  remove(id: ConnectorId): Promise<void>
}

/**
 * Check a field map against the connector's declared fields.
 * @param id - the connector.
 * @param values - candidate fields.
 * @returns the same fields, trimmed, with nothing else attached.
 * @throws TypeError naming the first missing, empty, or unexpected field; an optional field that is present must be non-empty.
 */
export function validateConnectorFields(id: ConnectorId, values: Record<string, string>): Record<string, string> {
  const expected = CONNECTOR_FIELDS[id]
  const result: Record<string, string> = {}
  for (const field of expected) {
    const value = values[field]?.trim()
    if (value === undefined || value.length === 0) {
      throw new TypeError(`${CONNECTOR_LABELS[id]}: field "${field}" is required`)
    }
    result[field] = value
  }
  for (const field of CONNECTOR_OPTIONAL_FIELDS[id]) {
    const value = values[field]?.trim()
    if (value === undefined) continue
    if (value.length === 0) throw new TypeError(`${CONNECTOR_LABELS[id]}: field "${field}" is empty`)
    result[field] = value
  }
  for (const field of Object.keys(values)) {
    if (!expected.includes(field) && !CONNECTOR_OPTIONAL_FIELDS[id].includes(field)) {
      throw new TypeError(`${CONNECTOR_LABELS[id]}: unknown field "${field}"`)
    }
  }
  return result
}

/**
 * Bind the connector records to one credential provider.
 * @param credentials - the mounted credential seam.
 * @returns the store.
 */
export function createCredentialStore(credentials: CredentialProvider): ConnectorCredentialStore {
  const keyOf = (id: ConnectorId) => credentialKey(CREDENTIAL_SCOPE, id)
  const read = async (id: ConnectorId): Promise<Record<string, string> | undefined> => {
    const record = await credentials.readRecord(keyOf(id))
    if (record === undefined || record.kind !== 'grant') return undefined
    const payload = payloadSchema.safeParse(record.payload)
    if (!payload.success) return undefined
    try {
      return validateConnectorFields(id, payload.data)
    } catch {
      // A record written by an older field set reads as not configured rather than as a half key.
      return undefined
    }
  }
  return {
    read,
    async describe(id) {
      const [info, fields] = await Promise.all([credentials.describeRecord(keyOf(id)), read(id)])
      const configured = fields !== undefined
      return {
        configured,
        ...configured ? { source: 'stored' as const } : {},
        writable: info.writable,
        fields: [...CONNECTOR_FIELDS[id]],
      }
    },
    async write(id, values) {
      const payload = validateConnectorFields(id, values)
      await credentials.modifyRecord(keyOf(id), () => Promise.resolve({ kind: 'grant', payload }))
    },
    remove(id) {
      return credentials.deleteRecord(keyOf(id))
    },
  }
}

/**
 * Answer the library's per-call credential question from the store. A stored
 * record is the user's own key (`owner: 'user'`, `stored: true`); nothing
 * stored is `missing`. The `required` answer belongs to the backend's plan
 * gate and never arises in this host.
 * @param store - the connector records.
 * @param provider - the library provider asking.
 * @returns the lookup the library expects for that provider.
 */
export async function lookupCredentials<P extends ConnectorProvider>(
  store: ConnectorCredentialStore,
  provider: P,
): Promise<CredentialLookup<P>> {
  const fields = await store.read(CONNECTOR_OF_PROVIDER[provider])
  if (fields === undefined) return { status: 'missing' }
  return { status: 'available', credentials: CREDENTIAL_BUILDERS[provider](fields), owner: 'user', stored: true }
}

/**
 * The library's credential object for each provider, from a validated field map:
 * `validateConnectorFields` guarantees every required field present and non-empty, so each builder reads them as strings.
 */
const CREDENTIAL_BUILDERS: { readonly [K in ConnectorProvider]: (fields: Record<string, string>) => ConnectorCredentialMap[K] } = {
  epoOps: (fields) => {
    const { consumerKey, consumerSecret } = fields as Record<'consumerKey' | 'consumerSecret', string>
    return { consumerKey, consumerSecret }
  },
  usptoOdp: fields => ({ apiKey: (fields as Record<'apiKey', string>).apiKey }),
  semanticScholar: fields => ({ apiKey: (fields as Record<'apiKey', string>).apiKey }),
  mistral: fields => ({
    apiKey: (fields as Record<'apiKey', string>).apiKey,
    ...fields['baseUrl'] === undefined ? {} : { baseUrl: fields['baseUrl'] },
  }),
}
