/**
 * The `X-Flowleap-Admin` header check and the public-key read. The starter signs the header with a private key that
 * only it holds; this module holds only the public key, so it can check a header but never make one.
 * @module
 */

import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/** Name of the header that the starter adds to each request of a firm administrator (lower case, as Fetch reads it). */
export const ADMIN_HEADER = 'x-flowleap-admin'

/** Longest accepted lifetime of a header, in seconds; a header that expires later than this is refused. */
export const MAX_HEADER_LIFETIME_SECONDS = 300

/** Prefix of the signed ASCII text; the expiry digits follow it. */
const SIGNED_PREFIX = 'flowleap-admin-link.v1.'

/** Byte length of an Ed25519 signature. */
const SIGNATURE_BYTES = 64

/** `v1.<expiry digits>.<base64url signature without padding>`; a comma (two joined values) or a space does not match. */
const HEADER_FORM = /^v1\.(?<expiry>[0-9]+)\.(?<signature>[A-Za-z0-9_-]+)$/u

/** Why a header does not show the link. */
export type AdminHeaderRefusal =
  /** No header, or an empty value. */
  | 'missing'
  /** Not exactly one `v1.<digits>.<base64url>` value. */
  | 'malformed'
  /** The expiry is not later than now. */
  | 'expired'
  /** The expiry is later than now plus {@link MAX_HEADER_LIFETIME_SECONDS}. */
  | 'lifetime'
  /** The signature is not a valid Ed25519 signature of the configured key. */
  | 'signature'

/** Result of {@link verifyAdminHeader}. */
export type AdminHeaderCheck =
  | { readonly admin: true }
  | { readonly admin: false; readonly reason: AdminHeaderRefusal }

const ADMIN: AdminHeaderCheck = { admin: true }

function refuse(reason: AdminHeaderRefusal): AdminHeaderCheck {
  return { admin: false, reason }
}

/**
 * Check one `X-Flowleap-Admin` value against the starter's public key.
 * @param value - the header value as the request carries it; Node joins two values with ", ", which is refused.
 * @param publicKey - the starter's Ed25519 public key.
 * @param nowSeconds - the current Unix time in seconds.
 * @returns `admin: true` only for one well-formed value that expires within the accepted lifetime and carries a valid
 * signature; otherwise the first rule that refused it.
 */
export function verifyAdminHeader(value: string | undefined, publicKey: KeyObject, nowSeconds: number): AdminHeaderCheck {
  if (value === undefined || value === '') return refuse('missing')
  const groups = HEADER_FORM.exec(value)?.groups
  const digits = groups?.expiry
  const encoded = groups?.signature
  if (digits === undefined || encoded === undefined) return refuse('malformed')
  const signature = Buffer.from(encoded, 'base64url')
  if (signature.byteLength !== SIGNATURE_BYTES || signature.toString('base64url') !== encoded) return refuse('malformed')
  const expiry = Number(digits)
  if (expiry <= nowSeconds) return refuse('expired')
  if (expiry > nowSeconds + MAX_HEADER_LIFETIME_SECONDS) return refuse('lifetime')
  return verify(null, Buffer.from(`${SIGNED_PREFIX}${digits}`, 'ascii'), publicKey, signature) ? ADMIN : refuse('signature')
}

/** Result of {@link readAdminKey}. */
export type AdminKeyRead =
  /** The file does not exist: this firm has no administrator sign-in, so no request shows the link. */
  | { readonly state: 'absent' }
  /** The starter's public key. */
  | { readonly state: 'present'; readonly key: KeyObject }

/** Why the key file cannot be used. */
export type AdminKeyProblem =
  /** The file exists but the read failed. */
  | 'unreadable'
  /** The file is not one SPKI PEM Ed25519 public key. */
  | 'malformed'

/** The key file exists but cannot be used; no request shows the link until an operator replaces the file. */
export class AdminLinkKeyError extends Error {
  override readonly name = 'AdminLinkKeyError'

  /**
   * @param problem - the stable discriminant.
   * @param path - the configured key file.
   * @param detail - what is wrong, for the log.
   * @param options - the cause, when one exists.
   */
  constructor(readonly problem: AdminKeyProblem, readonly path: string, detail: string, options?: ErrorOptions) {
    super(`ui-flowleap-admin-link: the public key file ${path} is ${problem}: ${detail}`, options)
  }
}

const SPKI_PEM_BEGIN = '-----BEGIN PUBLIC KEY-----'

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * Read the starter's public key. Each call reads the file again, so a key rotation needs no restart.
 * @param path - absolute path of the SPKI PEM file.
 * @returns `absent` when the file does not exist, else the key.
 * @throws {AdminLinkKeyError} when the file cannot be read, or is not one SPKI PEM Ed25519 public key; a private key
 * file is refused, because the runtime must never be able to sign a header.
 */
export async function readAdminKey(path: string): Promise<AdminKeyRead> {
  let pem: string
  try {
    pem = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return { state: 'absent' }
    throw new AdminLinkKeyError('unreadable', path, String(error), { cause: error })
  }
  if (!pem.trimStart().startsWith(SPKI_PEM_BEGIN)) throw new AdminLinkKeyError('malformed', path, `the file does not start with ${SPKI_PEM_BEGIN}`)
  let key: KeyObject
  try {
    key = createPublicKey({ key: pem, format: 'pem' })
  } catch (error) {
    throw new AdminLinkKeyError('malformed', path, String(error), { cause: error })
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new AdminLinkKeyError('malformed', path, `the key type is ${String(key.asymmetricKeyType)}, not ed25519`)
  return { state: 'present', key }
}
