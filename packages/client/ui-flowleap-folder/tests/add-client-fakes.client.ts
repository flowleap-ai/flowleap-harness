/**
 * Doubles of the two services of Add client: a Firm Record in memory that applies each command as flowleap-os does
 * (a repeat records nothing twice), and the Host routes with answers a test sets. The data are public EP Register data
 * of 2026-11-08, as in the approved mockups.
 */

import { vi } from 'vitest'
import type { BuildStatus, ConflictHit, FindAnswer, MatterRow, ReferenceRow, ReviewAnswer } from '../src/add-client/wire.ts'
import type { AddClientApi, HostResult } from '../src/client/add-client/api.ts'
import {
  hitsHash, normalizeName,
  type ClientDetail, type ClientId, type FirmClient, type FirmRecord, type LinkedName, type PartyId, type RecordAnswer, type RecordCommand,
  type RecordedApplication,
  type RecordedRole, type RecordError, type RecordResult,
} from '../src/client/add-client/records.ts'

/** A client as the double keeps it, which its commands change. */
interface Kept {
  client: FirmClient
  names: LinkedName[]
  applications: (Omit<RecordedApplication, 'roles'> & { roles: RecordedRole[] })[]
  conflictChecks: string[]
}

export const SYNTEGON_ID = '6f1c2a40-1b2c-4d3e-8f90-a1b2c3d4e5f6' as ClientId
export const SCHUBERT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' as ClientId
export const AS_OF = '2026-11-08T14:02:00.000Z'

/** A client of the `clients` read. */
export function firmClient(clientId: ClientId, name: string, role: FirmClient['role'] = 'client', names: string[] = []): FirmClient {
  return {
    clientId, name, role, addedAt: '2026-11-01T09:00:00.000Z', addedBy: { id: 'p-1', name: 'Dr. Anna Becker' },
    names: names.map(item => ({ name: item, source: 'ep-register' as const })), applications: 0,
  }
}

/** The Firm Record in memory: what it has, every command it got, and the failures a test sets. */
export function fakeRecord(start: { readonly clients?: readonly FirmClient[]; readonly details?: readonly ClientDetail[] } = {}) {
  const details = new Map<string, Kept>()
  for (const detail of start.details ?? []) {
    details.set(detail.client.clientId, {
      client: detail.client,
      names: [...detail.names],
      applications: detail.applications.map(item => ({ ...item, roles: [...item.roles] })),
      conflictChecks: [...detail.conflictChecks],
    })
  }
  const given = start.clients ?? []
  const kept = [...details.values()].map(item => item.client)
  const listed: FirmClient[] = [...given, ...kept.filter(client => !given.some(item => item.clientId === client.clientId))]
  const parties = new Map<string, PartyId>()
  const pendingChecks = new Map<string, string[]>()
  const sent: RecordCommand[] = []
  const state = {
    /** The failure of the next command, by kind; it applies once. */
    failNext: new Map<RecordCommand['kind'], RecordError>(),
    /** The failure of every `clients` read while set. */
    clientsError: null as RecordError | null,
    /** The failure of every `clients/<id>` read of these ids while set. */
    detailErrors: new Map<string, RecordError>(),
  }
  const ok = <T>(value: T): RecordResult<T> => ({ ok: true, value })
  const recorded = ok({ kind: 'recorded' as const })
  const clients = vi.fn<FirmRecord['clients']>(async () => state.clientsError === null
    ? ok(listed.map(client => ({ ...client, names: details.get(client.clientId)?.names ?? client.names })))
    : { ok: false, error: state.clientsError })
  const client = vi.fn<FirmRecord['client']>(async (clientId: ClientId) => {
    const error = state.detailErrors.get(clientId)
    if (error !== undefined) return { ok: false, error }
    const detail = details.get(clientId)
    return detail === undefined ? { ok: false, error: { kind: 'refused', status: 404, code: null } } : ok<ClientDetail>(structuredClone(detail))
  })
  const apply = async (command: RecordCommand): Promise<RecordResult<RecordAnswer>> => {
    switch (command.kind) {
      case 'conflict-check': {
        const hash = await hitsHash(command.hits)
        const detail = details.get(command.clientId)
        if (detail !== undefined && !detail.conflictChecks.includes(hash)) detail.conflictChecks.push(hash)
        pendingChecks.set(command.clientId, [...pendingChecks.get(command.clientId) ?? [], hash])
        return recorded
      }
      case 'client': {
        const added = { ...firmClient(command.clientId, command.name, command.role), addedAt: AS_OF }
        listed.push(added)
        const conflictChecks = pendingChecks.get(command.clientId) ?? []
        details.set(command.clientId, { client: added, names: [], applications: [], conflictChecks })
        return recorded
      }
      case 'name':
        details.get(command.clientId)?.names.push(command.name)
        return recorded
      case 'party': {
        const key = normalizeName(command.name)
        const partyId = parties.get(key) ?? `party-${parties.size + 1}` as PartyId
        parties.set(key, partyId)
        return ok({ kind: 'party', partyId })
      }
      case 'application':
        details.get(command.clientId)?.applications.push({ applicationNumber: command.application.applicationNumber, roles: [] })
        return recorded
      case 'role': {
        const party = [...parties].find(([, id]) => id === command.partyId)?.[0] ?? ''
        const applications = [...details.values()].flatMap(detail => detail.applications)
        for (const application of applications.filter(item => item.applicationNumber === command.applicationNumber)) {
          application.roles.push({ partyId: command.partyId, party, role: command.role })
        }
        return recorded
      }
    }
  }
  const send = vi.fn<FirmRecord['send']>(async (command: RecordCommand) => {
    sent.push(command)
    const failure = state.failNext.get(command.kind)
    if (failure === undefined) return apply(command)
    state.failNext.delete(command.kind)
    return { ok: false, error: failure }
  })
  const record: FirmRecord = { clients, client, send }
  return { record, mock: { clients, client, send }, sent, state, details, listed }
}

/** Fields that a test sets, where `undefined` takes an optional field away. */
type Changes<T> = { readonly [K in keyof T]?: T[K] | undefined }

/** A fixture with its changes, without the fields that a change took away. */
function changed<T extends object>(base: T, changes: Changes<T>): T {
  // Dropping the undefined fields leaves the fields of T, each with its type.
  return Object.fromEntries(Object.entries({ ...base, ...changes }).filter(([, value]) => value !== undefined)) as T
}

/** A matter of your firm. */
export const matter = (applicationNumber: string, extra: Changes<MatterRow> = {}): MatterRow => changed<MatterRow>({
  applicationNumber, publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element',
  applicants: ['Syntegon Technology GmbH'], filed: '2023-05-05', representativeSince: '2024-07-24', status: 'Examination is in progress',
}, extra)

/** An application at another firm. */
export const reference = (applicationNumber: string, extra: Changes<ReferenceRow> = {}): ReferenceRow => changed<ReferenceRow>({
  applicationNumber, title: 'Isolator system', applicants: ['Syntegon Technology GmbH'], filed: '2023-03-29', town: 'Onex',
}, extra)

/** A register conflict: the group is the patent owner, a company of your client the opponent. */
export const registerHit = (existingClientId: string, extra: Changes<ConflictHit> = {}): ConflictHit => changed<ConflictHit>({
  applicationNumber: 'EP16188900', publicationNumber: 'EP3296081B1', title: 'Method and device for producing tubular bags',
  otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'patent-owner', existingClientId, existingClientParty: 'Syntegon Packaging Systems AG',
  source: 'ep-register', asOf: AS_OF, opposedOn: '2025-01-08', status: 'Patent revoked',
}, extra)

/** The `found` answer of `find`. */
type Found = Extract<FindAnswer, { status: 'found' }>

/** The answer of `find` with the names of a group. */
export const found = (names: readonly [string, number][], extra: Changes<Found> = {}): Found => changed<Found>({
  status: 'found', source: 'patstat', edition: '2026 Spring', asOf: AS_OF, truncated: false,
  names: names.map(([name, applications]) => ({ name, applications })),
}, extra)

/** The `reviewed` answer of `review`. */
type Reviewed = Extract<ReviewAnswer, { status: 'reviewed' }>

/** The answer of `review`. */
export const reviewed = (extra: Changes<Reviewed> = {}): Reviewed => changed<Reviewed>({
  status: 'reviewed', asOf: AS_OF, total: 272, truncated: false, identity: 'set', atFirm: [], atOtherFirms: [], conflicts: [], conflictsTruncated: false,
}, extra)

/** A build status. */
export function buildStatus(clientId: string, name: string, extra: Partial<BuildStatus> = {}): BuildStatus {
  const step = (state: BuildStatus['steps']['folder']['state'], done = 0, total = 0, failed: string[] = []) => ({ state, done, total, failed })
  return {
    clientId, name, state: 'running', startedAt: AS_OF, families: 15, matters: 16,
    steps: { 'folder': step('done', 1, 1), 'matters': step('running', 9, 16), 'public-data': step('waiting'), 'reference': step('waiting') },
    ...extra,
  }
}

const okHost = <T>(value: T): HostResult<T> => ({ ok: true, value })

/** The Host routes with answers a test sets; each is a mock. */
export function fakeHost() {
  const api = {
    find: vi.fn<AddClientApi['find']>(async () => okHost(found([]))),
    review: vi.fn<AddClientApi['review']>(async () => okHost(reviewed())),
    build: vi.fn<AddClientApi['build']>(async request => okHost(buildStatus(request.clientId, request.name))),
    status: vi.fn<AddClientApi['status']>(async () => okHost({ builds: [] })),
  } satisfies AddClientApi
  return api
}

export { okHost }
