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
 * The six Add client routes: the applicant names, the review, the build, the status of the builds, the state of the
 * firm docket, and a new read of the firm docket.
 */
export const ADD_CLIENT_ROUTES = {
  find: `${ADD_CLIENT_API}/find`,
  review: `${ADD_CLIENT_API}/review`,
  build: `${ADD_CLIENT_API}/build`,
  status: `${ADD_CLIENT_API}/status`,
  docket: `${ADD_CLIENT_API}/docket`,
  docketRead: `${ADD_CLIENT_API}/docket/read`,
} as const

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
    /** Whether the read of the oppositions stopped at the configured row cap, so that conflicts can be missing. */
    readonly conflictsTruncated: boolean
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
 * Why a slice of the firm docket failed: a failed EP Register read (`no-key`, `unreachable`, `malformed`, as the
 * patent data Service names them), more rows on one day than one query can read (`day-over-limit`), or a fault of the
 * Host (`internal`).
 */
export type DocketFailureCode = 'no-key' | 'unreachable' | 'malformed' | 'day-over-limit' | 'internal'

/** A date slice of the firm docket that failed. */
export interface DocketFailedSlice {
  /** The register CQL of the slice, with its dates. */
  readonly query: string
  readonly reason: DocketFailureCode
}

/** A query of the firm docket whose slices do not sum to its count. */
export interface DocketSumMismatch {
  /** The register CQL without dates. */
  readonly query: string
  /** The EPO count of the query; the EPO stops counting at 10,000. */
  readonly total: number
  /** The rows that its slices read. */
  readonly counted: number
  /** The rows that the read misses: the count less the rows read, at least 10,000 less the rows read at the cap. */
  readonly missing: number
}

/** The progress of a firm docket read. */
export interface DocketProgress {
  /** The date slices that a read ended, read or failed. */
  readonly slicesDone: number
  /** Every date slice known now; a slice with too many rows splits, so this count can grow. */
  readonly slices: number
  /** The firm's EP applications read so far. */
  readonly rows: number
}

/**
 * The state of the firm docket: every EP application where the EP Register names the firm as the representative.
 * `rows` counts these applications; `asOf` is the ISO-8601 time of the oldest slice that a read ended.
 */
export type DocketState =
  /** The firm identity names nothing: the firm's matters cannot be found until it is set. */
  | { readonly state: 'no_identity' }
  | { readonly state: 'reading'; readonly progress: DocketProgress }
  /** A Host stop ended the read; the next start reads only the unread slices. */
  | { readonly state: 'interrupted'; readonly progress: DocketProgress }
  | { readonly state: 'ready'; readonly rows: number; readonly asOf: string }
  /** Older than `docketRefreshAge`. */
  | { readonly state: 'stale'; readonly rows: number; readonly asOf: string }
  /** Some slices failed, or the slices of a query do not sum to its count; the rows can be incomplete. */
  | {
    readonly state: 'partial'
    readonly rows: number
    readonly asOf: string
    readonly failed: readonly DocketFailedSlice[]
    readonly mismatches: readonly DocketSumMismatch[]
  }
  /** No slice could be read; the firm's matters are unknown, not absent. */
  | { readonly state: 'failed'; readonly reason: DocketFailureCode; readonly failed: readonly DocketFailedSlice[] }

/** The answer of `GET docket`, and of `POST docket/read`. */
export type DocketAnswer =
  | { readonly status: 'docket'; readonly docket: DocketState }
  /** No patent data plugin in this runtime: the docket cannot be read. */
  | { readonly status: 'no-plugin' }

/** Body of `POST docket/read`: read every slice again, or only the failed slices and the queries whose sum was wrong. */
export interface DocketReadRequest {
  readonly slices: 'all' | 'failed'
}

/**
 * Why an Add client act failed; each code is one localized sentence in the client. `no-key`: the runtime has no EPO
 * OPS key; `unreachable`: the EPO did not answer or answered with data that the Service refused.
 */
export type AddClientFailureCode = 'bad-request' | 'invalid-name' | 'no-key' | 'unreachable' | 'stopped' | 'internal'

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
  'internal': 500,
}
