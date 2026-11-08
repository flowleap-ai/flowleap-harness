/**
 * The Add client routes that both halves share: their paths, their request fields and their JSON answers. The Host
 * reads the public patent data and builds the client folder; the browser sends every Firm Record command with the
 * person's cookie.
 * @module
 */

import { FOLDER_API } from '../route.ts'

/** Absolute Host path of the Add client routes. */
export const ADD_CLIENT_API = `${FOLDER_API}/add-client`

/** The four Add client routes: the applicant names, the review, the build, and the status of the builds. */
export const ADD_CLIENT_ROUTES = {
  find: `${ADD_CLIENT_API}/find`,
  review: `${ADD_CLIENT_API}/review`,
  build: `${ADD_CLIENT_API}/build`,
  status: `${ADD_CLIENT_API}/status`,
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
  }
  | { readonly status: 'no-plugin' }

/** Body of `POST build`: the client folder of a client that the Firm Record has now. */
export interface BuildRequest {
  /** The client id of the Firm Record (a UUID). */
  readonly clientId: string
  /** The client's name, which is also the client folder's name. */
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
  readonly families: number
  readonly matters: number
  readonly steps: Readonly<Record<BuildStepId, BuildStep>>
}

/** The answer of `GET status`. */
export interface StatusAnswer {
  readonly builds: readonly BuildStatus[]
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
