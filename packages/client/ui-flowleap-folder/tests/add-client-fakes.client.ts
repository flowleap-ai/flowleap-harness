/**
 * Doubles of the two services of Add client: a Firm Record in memory that applies each command as flowleap-os does
 * (a repeat records nothing twice), and the Host routes with answers a test sets. The data are public EP Register data
 * of 2026-11-08, as in the approved mockups. Also a wizard view with its fields, for the pages.
 */

import { vi } from 'vitest'
import type { ConflictCheck, ConflictCheckAnswer, ConflictHit, DocketMatter, DocketState, FindAnswer, MattersAnswer, OthersAnswer } from '../src/add-client/wire.ts'
import type { AddClientApi, HostResult } from '../src/client/add-client/api.ts'
import type { WizardView } from '../src/client/add-client/wizard.ts'
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

/**
 * The Firm Record in memory: what it has, every command it got, and the failures a test sets. A batch is atomic as in
 * flowleap-os: an application of another client refuses the whole batch, and a batch over `batchMax` is refused with
 * that maximum.
 */
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
    /** The most applications of one batch that the double takes. */
    batchMax: Number.POSITIVE_INFINITY,
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
  const addRole = (application: Kept['applications'][number], partyId: PartyId, role: RecordedRole['role']): void => {
    if (application.roles.some(item => item.partyId === partyId && item.role === role)) return
    application.roles.push({ partyId, party: [...parties].find(([, id]) => id === partyId)?.[0] ?? '', role })
  }
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
      case 'applications': {
        if (command.applications.length > state.batchMax) return { ok: false, error: { kind: 'refused', status: 413, code: 'batch-too-large', max: state.batchMax } }
        for (const { application } of command.applications) {
          const owner = [...details.values()].find(detail => detail.client.clientId !== command.clientId
            && detail.applications.some(item => item.applicationNumber === application.applicationNumber))
          if (owner !== undefined) {
            return { ok: false, error: { kind: 'refused', status: 409, code: 'application-other-client', clientId: owner.client.clientId, applicationNumber: application.applicationNumber } }
          }
        }
        const detail = details.get(command.clientId)
        for (const { application, roles } of command.applications) {
          let kept = detail?.applications.find(item => item.applicationNumber === application.applicationNumber)
          if (kept === undefined) {
            kept = { applicationNumber: application.applicationNumber, roles: [] }
            detail?.applications.push(kept)
          }
          for (const role of roles) addRole(kept, role.partyId, role.role)
        }
        return recorded
      }
      case 'role': {
        const applications = [...details.values()].flatMap(detail => detail.applications)
        for (const application of applications.filter(item => item.applicationNumber === command.applicationNumber)) {
          addRole(application, command.partyId, command.role)
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

/** A row of the firm docket: an EP application of Syntegon where the EP Register names the firm. */
export const docketRow = (applicationNumber: string, extra: Changes<DocketMatter> = {}): DocketMatter => changed<DocketMatter>({
  applicationNumber, publicationNumber: 'EP4292805A1', title: 'Method and apparatus for producing a packaging element',
  applicants: ['Syntegon Technology GmbH'], status: 'Examination is in progress', representativeSince: '2024-07-24', addressOnly: false,
  names: ['SYNTEGON TECHNOLOGY'],
}, extra)

/** A register conflict: the group is the patent owner, a company of your client the opponent. */
export const registerHit = (existingClientId: string, extra: Changes<ConflictHit> = {}): ConflictHit => changed<ConflictHit>({
  applicationNumber: 'EP16188900', publicationNumber: 'EP3296081B1', title: 'Method and device for producing tubular bags',
  otherParty: 'Gerhard Schubert GmbH', otherPartyRole: 'patent-owner', existingClientId, existingClientParty: 'Syntegon Packaging Systems AG',
  source: 'ep-register', asOf: AS_OF, opposedOn: '2025-01-08', status: 'Patent revoked', yourFirm: 'not-named',
}, extra)

/** The `found` answer of `find`. */
type Found = Extract<FindAnswer, { status: 'found' }>

/** The answer of `find` with the names of a group and their counts of matching EP applications. */
export const found = (names: readonly [string, number][], extra: Changes<Found> = {}): Found => changed<Found>({
  status: 'found', source: 'patstat', edition: '2026 Spring', asOf: AS_OF, truncated: false, omitted: 0, sampleRows: 5000,
  names: names.map(([name, matching]) => ({ name, matching })),
}, extra)

/** A complete firm docket of `rows` EP applications. */
export const READY: DocketState = { state: 'ready', rows: 412, asOf: AS_OF }

/** The `matters` answer of `matters`. */
type Matters = Extract<MattersAnswer, { status: 'matters' }>

/** The answer of `matters`: the docket state, the rows, and the count at your firm of each name, from the rows. */
export const matters = (names: readonly string[], rows: readonly DocketMatter[] = [], docket: DocketState = READY): Matters => ({
  status: 'matters', docket, rows,
  counts: names.map(name => ({ name, atFirm: rows.filter(row => !row.addressOnly && row.names.includes(name)).length })),
})

/** The `counted` answer of `others`. */
type Counted = Extract<OthersAnswer, { status: 'counted' }>

/** The answer of `others`. */
export const others = (count: number, extra: Changes<Counted> = {}): Counted => changed<Counted>({
  status: 'counted', count, capped: false, atLeast: false, asOf: AS_OF,
}, extra)

/** Both halves of the conflict check complete. */
export const COMPLETE: ConflictCheck = { groupOpposedClients: { state: 'complete', asOf: AS_OF }, clientsOpposedGroup: { state: 'complete', asOf: AS_OF } }

/** The `checked` answer of `conflictCheck`. */
type Checked = Extract<ConflictCheckAnswer, { status: 'checked' }>

/** The answer of `conflictCheck` with its register conflicts. */
export const checked = (conflicts: readonly ConflictHit[] = [], conflictCheck: ConflictCheck = COMPLETE): Checked => ({
  status: 'checked', asOf: AS_OF, conflicts, conflictCheck,
})

const okHost = <T>(value: T): HostResult<T> => ({ ok: true, value })

/** The Host routes with answers a test sets; each is a mock. By default every route answers with no data. */
export function fakeHost() {
  const api = {
    find: vi.fn<AddClientApi['find']>(async () => okHost(found([]))),
    matters: vi.fn<AddClientApi['matters']>(async names => okHost(matters(names))),
    others: vi.fn<AddClientApi['others']>(async () => okHost(others(0))),
    conflictCheck: vi.fn<AddClientApi['conflictCheck']>(async () => okHost(checked())),
    readDocket: vi.fn<AddClientApi['readDocket']>(async () => okHost({ status: 'docket', docket: READY })),
    clientFolder: vi.fn<AddClientApi['clientFolder']>(async request => okHost({ workspace: `ws-${request.clientId.slice(0, 8)}`, folder: request.name, made: true })),
    settings: vi.fn<AddClientApi['settings']>(async () => okHost({ recordBatchSize: 100 })),
    clientNames: vi.fn<AddClientApi['clientNames']>(async () => okHost({ status: 'index', index: { state: 'no_clients' } })),
  } satisfies AddClientApi
  return api
}

/**
 * A wizard of Syntegon with its group confirmed and every read done, on the step `at`: the fields that a test sets
 * replace these.
 */
export function wizardView(fields: Partial<WizardView> = {}): WizardView {
  return {
    page: 'wizard', at: 'company', reached: 'review', editing: false, query: 'Syntegon',
    find: { status: 'found', source: 'patstat', edition: '2026 Spring', asOf: AS_OF, truncated: false, sampleRows: 5000, omitted: 0, names: [{ name: 'SYNTEGON TECHNOLOGY', matching: 600, ticked: true }] },
    docket: { status: 'read', docket: READY, counts: [{ name: 'SYNTEGON TECHNOLOGY', atFirm: 0 }], rows: [] },
    existing: null,
    group: { name: 'Syntegon', names: [{ name: 'SYNTEGON TECHNOLOGY', source: 'patstat', applications: 600, edition: '2026 Spring' }], byName: false },
    ticks: {}, others: { status: 'counted', answer: others(0) }, role: 'client', check: { status: 'checked', answer: checked() },
    firm: { status: 'ready', details: [], asOf: AS_OF }, conflict: { checked: false, reason: '' }, other: { applicationNumber: null, role: 'opponent' },
    newId: '11111111-2222-4333-8444-555555555555' as ClientId, recording: { status: 'idle' },
    ...fields,
  }
}

export { okHost }
