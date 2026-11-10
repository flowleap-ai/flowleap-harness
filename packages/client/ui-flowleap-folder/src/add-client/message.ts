/**
 * The message of a thrown value for the Host log, which the Add client routes, the firm docket, the opponent index and
 * the firm identity store write.
 * @module
 */

/**
 * The message of a thrown value, for the Host log.
 * @param error - the thrown value.
 * @returns its message, or its text when it is not an `Error`.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
