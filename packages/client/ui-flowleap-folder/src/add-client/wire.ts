/**
 * The Add client routes that both halves share: their paths, their request fields and their JSON answers. The Host
 * reads the public patent data and builds the client folder; the browser sends every Firm Record command with the
 * person's cookie.
 * @module
 */

import { FOLDER_API, folderNameOf, isEntryName } from '../route.ts'

/**
 * The name of a client's folder in `clientsRoot`: the client name with each separator as `-` ({@link folderNameOf}).
 * The Firm Record and the About file keep the client name as it is. The browser checks it before it records anything,
 * and the `build` route checks it again.
 * @param name - the client name.
 * @returns the folder name, or undefined when no folder can have the name, such as `CON` or `..`.
 */
export function clientFolderName(name: string): string | undefined {
  const folder = folderNameOf(name)
  return isEntryName(folder) ? folder : undefined
}

/** Absolute Host path of the Add client routes. */
export const ADD_CLIENT_API = `${FOLDER_API}/add-client`

/**
 * The nine Add client routes: the applicant names, the review, the build, the status of the builds, the state of the
 * firm docket, a new read of the firm docket, the firm identity with the docket state, a save of the firm identity, and
 * the names of the firm's clients for the opponent index.
 */
export const ADD_CLIENT_ROUTES = {
  find: `${ADD_CLIENT_API}/find`,
  review: `${ADD_CLIENT_API}/review`,
  build: `${ADD_CLIENT_API}/build`,
  status: `${ADD_CLIENT_API}/status`,
  docket: `${ADD_CLIENT_API}/docket`,
  docketRead: `${ADD_CLIENT_API}/docket/read`,
  identity: `${ADD_CLIENT_API}/identity`,
  identitySave: `${ADD_CLIENT_API}/identity/save`,
  clientNames: `${ADD_CLIENT_API}/client-names`,
} as const

/** The firm's names, its current and earlier addresses, and the names of its representatives. */
export interface FirmIdentity {
  /** The firm's names, such as its current and earlier names. */
  names: string[]
  /** The firm's current and earlier addresses, each as one line, such as `Street 1, 12345 Town`. */
  addresses: string[]
  /** The names of the firm's representatives before the EPO, such as `Anna Becker`. */
  representatives: string[]
}

/** Where an applicant name comes from: PATSTAT, or the applicant names of the EP Register search. */
export type NameSource = 'patstat' | 'ep-register'

/** One applicant name of the group, as its source writes it, with its count of applications. */
export interface ApplicantName {
  readonly name: string
  /** Applications with this name in the source: at all offices for PATSTAT, EP applications for the EP Register. */
  readonly applications: number
}

/** The answer of `GET find?name=`. */
export type FindAnswer =
  | {
    readonly status: 'found'
    readonly source: NameSource
    /** The PATSTAT edition, such as `2026 Spring`; absent for the EP Register. */
    readonly edition?: string
    readonly names: readonly ApplicantName[]
    /** ISO-8601 instant of the read. */
    readonly asOf: string
    /** Whether the read stopped at the configured row cap. */
    readonly truncated: boolean
  }
  /** No patent data plugin in this runtime: the page adds the client by name only. */
  | { readonly status: 'no-plugin' }

/** A client that the Firm Record has, as the conflict check compares it. */
export interface KnownClient {
  readonly clientId: string
  /** The client's name and its linked applicant names. */
  readonly names: readonly string[]
}

/** Body of `POST review`. */
export interface ReviewRequest {
  /** The ticked applicant names of the group. */
  readonly names: readonly string[]
  /** The clients that the Firm Record has with the role client; matched on the Host, never sent out. */
  readonly clients: readonly KnownClient[]
}

/** One EP application of the group where the EP Register names your firm as the representative. */
export interface MatterRow {
  /** `EP` and 8 digits, such as `EP23171862`. */
  readonly applicationNumber: string
  /** `EP`, digits and kind, such as `EP4292805A1`; absent while the EP Register names no EP publication. */
  readonly publicationNumber?: string
  readonly title?: string
  readonly applicants: readonly string[]
  /** `YYYY-MM-DD`. */
  readonly filed?: string
  /** The date the current representative block was recorded, `YYYY-MM-DD`. */
  readonly representativeSince?: string
  /** The EP Register status, as the register writes it. */
  readonly status?: string
}

/** One EP application of the group at another firm: for reference only, named by the town of its representative. */
export interface ReferenceRow {
  readonly applicationNumber: string
  readonly publicationNumber?: string
  readonly title?: string
  readonly applicants: readonly string[]
  readonly filed?: string
  /** The town of the representative of record, never its name; absent when the register names none. */
  readonly town?: string
}

/** One possible conflict: an applicant name of the group on the other side of a client of your firm. */
export interface ConflictHit {
  readonly applicationNumber: string
  readonly publicationNumber?: string
  readonly title?: string
  /** The name of the group, as the source writes it. */
  readonly otherParty: string
  /** The group's role in the application. */
  readonly otherPartyRole: 'opponent' | 'patent-owner' | 'other'
  /** The client of your firm on the other side. */
  readonly existingClientId: string
  /** The client's party as the source writes it. */
  readonly existingClientParty: string
  readonly source: 'firm-record' | 'ep-register'
  /** ISO-8601 instant of the read. */
  readonly asOf: string
  /** `YYYY-MM-DD` the opposition was filed, when the register records it. */
  readonly opposedOn?: string
  /** The EP Register status of the application. */
  readonly status?: string
  /**
   * Whether the EP Register names your firm as the representative of the application; `unknown` while the firm
   * identity names nothing.
   */
  readonly yourFirm: 'named' | 'not-named' | 'unknown'
}

/**
 * How complete one half of the conflict check is. `complete`: every slice of every query was read and its rows sum to
 * its count, as of `asOf` (ISO-8601, the oldest read). `reading`: the opponent index has not read every name yet.
 * `incomplete`: slices failed or did not sum to their count, so hits can be missing.
 */
export type ConflictHalf =
  | { readonly state: 'complete'; readonly asOf: string }
  | { readonly state: 'reading' }
  | { readonly state: 'incomplete'; readonly failed: readonly FailedSlice[]; readonly mismatches: readonly SumMismatch[] }

/** The two halves of the conflict check; Add client as Client waits until both are `complete`. */
export interface ConflictCheck {
  /** The group opposed a client of your firm: date-sliced `op=` reads of the group's names, at the review. */
  readonly groupOpposedClients: ConflictHalf
  /** A client of your firm opposed the group: the group's applications in the opponent index. */
  readonly clientsOpposedGroup: ConflictHalf
}

/** The answer of `POST review`. */
export type ReviewAnswer =
  | {
    readonly status: 'reviewed'
    /** ISO-8601 instant of the read. */
    readonly asOf: string
    /** Every EP application of the group that the register search gave. */
    readonly total: number
    /** Whether the read stopped at the configured row cap. */
    readonly truncated: boolean
    /** Whether the firm identity names anything to match; with none, no matter is at your firm. */
    readonly identity: 'set' | 'missing'
    readonly atFirm: readonly MatterRow[]
    readonly atOtherFirms: readonly ReferenceRow[]
    /** The possible conflicts that the EP Register shows. */
    readonly conflicts: readonly ConflictHit[]
    /** Whether a half of the conflict check is not complete, so that conflicts can be missing. */
    readonly conflictsTruncated: boolean
    readonly conflictCheck: ConflictCheck
  }
  | { readonly status: 'no-plugin' }

/** Body of `POST build`: the client folder of a client that the Firm Record has now. */
export interface BuildRequest {
  /** The client id of the Firm Record (a UUID). */
  readonly clientId: string
  /** The client's name; the client folder's name is {@link clientFolderName} of it. */
  readonly name: string
  /** The ticked applicant names of the group, for the reference file. */
  readonly names: readonly string[]
  /** The EP applications to build a matter folder for: those at your firm, and those a person claimed. */
  readonly applications: readonly string[]
}

/** The steps of a build, in order. */
export const BUILD_STEPS = ['folder', 'matters', 'public-data', 'reference'] as const

/** One step of a build. */
export type BuildStepId = (typeof BUILD_STEPS)[number]

/** The progress of one build step. */
export interface BuildStep {
  readonly state: 'waiting' | 'running' | 'done' | 'failed'
  readonly done: number
  readonly total: number
  /** The items that failed, such as publication numbers. */
  readonly failed: readonly string[]
}

/** What one build made. */
export interface BuildAdded {
  /** True when this build made the client folder. */
  readonly client: boolean
  /** The new family folders. */
  readonly families: number
  /** The new matter folders. */
  readonly matters: number
  /** The new dated files of public data and reference lists. */
  readonly files: number
}

/** The status of one client's build; the `status` route answers every build. */
export interface BuildStatus {
  readonly clientId: string
  readonly name: string
  /** `interrupted` when a Host stop ended the build; a new build adds only what is missing. */
  readonly state: 'running' | 'done' | 'failed' | 'interrupted'
  /** ISO-8601 instants. */
  readonly startedAt: string
  readonly finishedAt?: string
  /** The workspace of the client folder, once it exists. */
  readonly workspace?: string
  /** The client folder relative to `clientsRoot`. */
  readonly folder?: string
  /** The family and matter folders of the client folder that this build found or made, without those in Trash. */
  readonly families: number
  readonly matters: number
  /** What this build made; each count is 0 when the client folder had everything and no data changed. */
  readonly added: BuildAdded
  readonly steps: Readonly<Record<BuildStepId, BuildStep>>
}

/** The answer of `GET status`. */
export interface StatusAnswer {
  readonly builds: readonly BuildStatus[]
}

/**
 * Why a date slice of a register read failed: a failed EP Register read (`no-key`, `unreachable`, `malformed`, as the
 * patent data Service names them), more rows on one day than one query can read (`day-over-limit`), or a fault of the
 * Host (`internal`).
 */
export type SliceFailureCode = 'no-key' | 'unreachable' | 'malformed' | 'day-over-limit' | 'internal'

/** A date slice of a register read that failed. */
export interface FailedSlice {
  /** The register CQL of the slice, with its dates. */
  readonly query: string
  readonly reason: SliceFailureCode
}

/** A register query whose slices do not sum to its count. */
export interface SumMismatch {
  /** The register CQL without dates. */
  readonly query: string
  /** The EPO count of the query; the EPO stops counting at 10,000. */
  readonly total: number
  /** The rows that its slices read. */
  readonly counted: number
  /** The rows that the read misses: the count less the rows read, at least 10,000 less the rows read at the cap. */
  readonly missing: number
}

/** The progress of a sliced register read. */
export interface SliceProgress {
  /** The date slices that a read ended, read or failed. */
  readonly slicesDone: number
  /** Every date slice known now; a slice with too many rows splits, so this count can grow. */
  readonly slices: number
  /** The rows kept so far. */
  readonly rows: number
}

/**
 * A read again of a complete read, which runs beside it. The complete read stays the served data until the read again
 * ends complete; then the read again takes its place at once. `reading` and `interrupted` give the progress of the
 * read again. `failed` is a read again that ended partial or failed: its failed slices and wrong sums, while its rows
 * are not used.
 */
export type RefreshState =
  | { readonly state: 'reading'; readonly progress: SliceProgress }
  /** A Host stop ended the read again; the next start reads only its unread slices. */
  | { readonly state: 'interrupted'; readonly progress: SliceProgress }
  | { readonly state: 'failed'; readonly failed: readonly FailedSlice[]; readonly mismatches: readonly SumMismatch[] }

/**
 * The state of a register read in date slices that the Host keeps and refreshes: the firm docket or the opponent
 * index. `rows` counts the rows kept; `asOf` is the ISO-8601 time of the oldest slice that a read ended. `ready` and
 * `stale` are a complete read, with `refresh` while a read again of it runs or after the read again did not end
 * complete. The other states are a read that did not end complete, with no complete read to serve.
 */
export type SlicedReadState =
  | { readonly state: 'reading'; readonly progress: SliceProgress }
  /** A Host stop ended the read; the next start reads only the unread slices. */
  | { readonly state: 'interrupted'; readonly progress: SliceProgress }
  | { readonly state: 'ready'; readonly rows: number; readonly asOf: string; readonly refresh?: RefreshState }
  /** Older than `docketRefreshAge`. */
  | { readonly state: 'stale'; readonly rows: number; readonly asOf: string; readonly refresh?: RefreshState }
  /** Some slices failed, or the slices of a query do not sum to its count; the rows can be incomplete. */
  | {
    readonly state: 'partial'
    readonly rows: number
    readonly asOf: string
    readonly failed: readonly FailedSlice[]
    readonly mismatches: readonly SumMismatch[]
  }
  /** No slice could be read; the rows are unknown, not absent. */
  | { readonly state: 'failed'; readonly reason: SliceFailureCode; readonly failed: readonly FailedSlice[] }

/**
 * The state of the firm docket: every EP application where the EP Register names the firm as the representative.
 * `rows` counts these applications.
 */
export type DocketState =
  /** The firm identity names nothing: the firm's matters cannot be found until it is set. */
  | { readonly state: 'no_identity' }
  | SlicedReadState

/**
 * The state of the opponent index: the EP applications that the names of the firm's clients opposed, by `op=` reads.
 * `rows` counts the opposed applications of each name.
 */
export type OpponentIndexState =
  /** No client name was sent, or the firm has no client: the index has nothing to read. */
  | { readonly state: 'no_clients' }
  | SlicedReadState

/**
 * Body of `POST client-names`: the names of every client of the Firm Record with the role client, and their linked
 * applicant names. The Host keeps them and reads the opponent index for them; a name that is no longer in the list
 * leaves the index.
 */
export interface ClientNamesRequest {
  readonly names: readonly string[]
}

/** The answer of `POST client-names`. */
export type OpponentIndexAnswer =
  | { readonly status: 'index'; readonly index: OpponentIndexState }
  /** No patent data plugin in this runtime: the names are kept, and the index is read when the plugin comes. */
  | { readonly status: 'no-plugin' }

/** The answer of `GET docket`, and of `POST docket/read`. */
export type DocketAnswer =
  | { readonly status: 'docket'; readonly docket: DocketState }
  /** No patent data plugin in this runtime: the docket cannot be read. */
  | { readonly status: 'no-plugin' }

/** The answer of `GET identity`, and of `POST identity/save`. */
export interface FirmIdentityAnswer {
  /** The firm identity now: the saved one, else the `firmIdentity` of the row config. */
  readonly identity: FirmIdentity
  readonly docket: DocketAnswer
  /**
   * Whether this request may save the firm identity: true only for a firm administrator, whose request carries an
   * `X-Flowleap-Admin` header that the starter signed (the `flowleapAdmin` Service says so).
   */
  readonly canSave: boolean
}

/**
 * Body of `POST identity/save`: the whole new firm identity. Only a firm administrator may save; the Host refuses any
 * other request with `not-admin` before it reads the body. The Host trims each entry and drops the entries with no
 * word and the repeated entries; lists with no entry left mean no identity.
 */
export interface FirmIdentitySaveRequest {
  readonly identity: FirmIdentity
}

/** Body of `POST docket/read`: read every slice again, or only the failed slices and the queries whose sum was wrong. */
export interface DocketReadRequest {
  readonly slices: 'all' | 'failed'
}

/**
 * Why an Add client act failed; each code is one localized sentence in the client. `no-key`: the runtime has no EPO
 * OPS key; `unreachable`: the EPO did not answer or answered with data that the Service refused; `not-admin`: the
 * request is not of a firm administrator, so a save of the firm identity changed nothing.
 */
export type AddClientFailureCode = 'bad-request' | 'invalid-name' | 'no-key' | 'unreachable' | 'stopped' | 'not-admin' | 'internal'

/** The JSON body of a failed Add client act. */
export interface AddClientFailure {
  readonly error: AddClientFailureCode
}

/** HTTP status of each failure code. */
export const ADD_CLIENT_STATUS: Readonly<Record<AddClientFailureCode, number>> = {
  'bad-request': 400,
  'invalid-name': 422,
  'no-key': 424,
  'unreachable': 502,
  'stopped': 503,
  'not-admin': 403,
  'internal': 500,
}
