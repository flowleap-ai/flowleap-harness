/**
 * The firm identity and the name matching of Add client. The firm's matters are the EP applications whose
 * representative of record matches the firm identity. The match runs on the Host; only the firm docket sends the
 * identity's words to the EP Register, in queries that never hold a client name. Company keys compare applicant names
 * across sources (the EP Register writes `Syntegon Technology GmbH`,
 * PATSTAT writes `SYNTEGON TECHNOLOGY`).
 * @module
 */

import { normalizeName, type RegisterParty } from '@deepseek-ai/dsh-flowleap-connectors'
import type { FirmIdentity } from './wire.ts'

export type { FirmIdentity } from './wire.ts'

/** Legal-form words that a source adds or leaves out; a company key drops them. */
const LEGAL_FORMS = new Set([
  'ab', 'ag', 'aps', 'as', 'bv', 'co', 'corp', 'corporation', 'gmbh', 'inc', 'incorporated', 'kg', 'kgaa', 'kk',
  'limited', 'llc', 'ltd', 'mbh', 'nv', 'oy', 'plc', 'sa', 'sas', 'se', 'spa', 'srl', 'ug',
])

/**
 * The words of a name, as the normalized name writes them.
 * @param name - a name or an address line.
 * @returns the words.
 */
export function wordsOf(name: string): string[] {
  const normalized = normalizeName(name)
  return normalized === '' ? [] : normalized.split(' ')
}

/**
 * The company key of a name: its words without legal forms and single letters, so `Syntegon Packaging Systems AG`
 * and `SYNTEGON PACKAGING SYSTEMS` have one key.
 * @param name - an applicant or party name.
 * @returns the key; empty when no word is left.
 */
export function companyKey(name: string): string {
  return wordsOf(name).filter(word => word.length > 1 && !LEGAL_FORMS.has(word)).join(' ')
}

/** Whether every word of `part` is in `whole`. */
function within(part: readonly string[], whole: ReadonlySet<string>): boolean {
  return part.length > 0 && part.every(word => whole.has(word))
}

/** Whether two word lists hold the same words in any order. */
function sameWords(left: readonly string[], right: readonly string[]): boolean {
  return left.length > 0 && left.length === right.length && within(left, new Set(right))
}

/**
 * Whether the firm identity names anything to match.
 * @param identity - the firm identity.
 * @returns false when it has no name, address or representative.
 */
export function identitySet(identity: FirmIdentity): boolean {
  return [...identity.names, ...identity.addresses, ...identity.representatives].some(entry => wordsOf(entry).length > 0)
}

/**
 * Whether two firm identities hold the same entries in the same order.
 * @param left - one identity.
 * @param right - the other identity.
 * @returns true when every list is the same.
 */
export function sameFirmIdentity(left: FirmIdentity, right: FirmIdentity): boolean {
  const key = (value: FirmIdentity) => JSON.stringify([value.names, value.addresses, value.representatives])
  return key(left) === key(right)
}

/**
 * The firm identity as the Host keeps it: each entry trimmed, without the entries that have no word and without an
 * entry that is already in its list.
 * @param identity - the identity as a person or the row config wrote it.
 * @returns the normalized identity.
 */
export function normalizeIdentity(identity: FirmIdentity): FirmIdentity {
  const clean = (entries: readonly string[]) => [...new Set(entries.map(entry => entry.trim()).filter(entry => wordsOf(entry).length > 0))]
  return { names: clean(identity.names), addresses: clean(identity.addresses), representatives: clean(identity.representatives) }
}

/** How a representative of record matches the firm identity. `address`: only a firm address matches. */
export type FirmMatch = 'name' | 'representative' | 'address'

/**
 * How a representative of record matches the firm: every word of a firm name is in its name or in its address lines
 * (the register often names a person and puts the firm in the address), its name is a representative's name in any
 * order (`Becker, Anna` is `Anna Becker`), or its address holds every word of a firm address. Two firms can share an
 * address, so a match by address only is the weakest.
 * @param party - the representative as the EP Register names it.
 * @param identity - the firm identity.
 * @returns the strongest match, or undefined when the party is not the firm.
 */
export function firmMatch(party: RegisterParty, identity: FirmIdentity): FirmMatch | undefined {
  const name = wordsOf(party.name)
  const nameWords = new Set(name)
  const addressWords = new Set(party.address.flatMap(wordsOf))
  if (identity.names.some(firm => within(wordsOf(firm), nameWords) || within(wordsOf(firm), addressWords))) return 'name'
  if (identity.representatives.some(person => sameWords(wordsOf(person), name))) return 'representative'
  if (identity.addresses.some(address => within(wordsOf(address), addressWords))) return 'address'
  return undefined
}

/**
 * Whether a representative of record is the firm ({@link firmMatch}).
 * @param party - the representative as the EP Register names it.
 * @param identity - the firm identity.
 * @returns true for a match.
 */
export function isFirm(party: RegisterParty, identity: FirmIdentity): boolean {
  return firmMatch(party, identity) !== undefined
}

/**
 * The town of a representative, from the address line with a postal code, else the last address line. The reference
 * list names the town, never the firm.
 * @param party - the representative.
 * @returns the town, or undefined for no address.
 */
export function townOf(party: RegisterParty): string | undefined {
  for (const line of party.address) {
    const match = /^(?:[A-Z]{1,2}-)?\d{4,5}\s+(.+)$/u.exec(line.trim())
    if (match?.[1] !== undefined) return match[1].trim()
  }
  return party.address.at(-1)?.trim() || undefined
}
