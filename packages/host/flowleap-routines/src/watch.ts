/**
 * Register watch arithmetic: which register entries are new against the
 * entries already seen, and the instruction a run receives.
 * @module
 */

import type { RegisterApplication, RegisterEntry } from '@deepseek-ai/dsh-flowleap-connectors'

/** Seen entries of one application: entry key to the number of identical entries seen. */
export type SeenEntries = Readonly<Record<string, number>>

/** New entries of one application. */
export interface RegisterReport {
  /** Watched application. */
  readonly application: RegisterApplication
  /** Entries not seen before, in the office's order. */
  readonly entries: readonly RegisterEntry[]
}

/** A register read that failed at a due run. */
export interface RegisterFailure {
  /** Watched application. */
  readonly application: RegisterApplication
  /** The read's error message. */
  readonly message: string
}

/**
 * Identity of one entry: the office repeats identical entries, so identity is the full content.
 * @param entry - one register entry.
 * @returns the key under which its count is saved.
 */
export function entryKey(entry: RegisterEntry): string {
  return JSON.stringify([entry.date, entry.code, entry.description])
}

/**
 * Count the entries of one read by key.
 * @param entries - one read of one application.
 * @returns the count per key.
 */
export function countEntries(entries: readonly RegisterEntry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of entries) {
    const key = entryKey(entry)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

/**
 * Select the entries above the seen count of their key.
 * @param entries - the current read.
 * @param seen - entries already reported or present when the watch started.
 * @returns new entries in the read's order.
 */
export function newEntries(entries: readonly RegisterEntry[], seen: SeenEntries): RegisterEntry[] {
  const remaining: Record<string, number> = { ...seen }
  return entries.filter((entry) => {
    const key = entryKey(entry)
    const left = remaining[key] ?? 0
    remaining[key] = left - 1
    return left <= 0
  })
}

/**
 * Merge a read into the seen entries; a count never decreases, so an entry the office removes and lists again is not new.
 * @param seen - entries seen before.
 * @param entries - the current read.
 * @returns the seen entries after the read.
 */
export function mergeSeen(seen: SeenEntries, entries: readonly RegisterEntry[]): Record<string, number> {
  const merged: Record<string, number> = { ...seen }
  for (const [key, count] of Object.entries(countEntries(entries))) merged[key] = Math.max(merged[key] ?? 0, count)
  return merged
}

/**
 * The line that names the watched applications in a stored task instruction.
 * @param applications - watched applications.
 * @returns the line, for example `Watched applications: EP3456789, US17123456`.
 */
export function watchedLine(applications: readonly RegisterApplication[]): string {
  return `Watched applications: ${applications.join(', ')}`
}

/**
 * The instruction of one run: the stored instruction, then the new entries, then any failed reads.
 * @param prompt - the stored task instruction.
 * @param reports - new entries per application; at least one entry.
 * @param failures - reads that failed at this run.
 * @returns the reminder content the run receives.
 */
export function renderRunInstruction(
  prompt: string, reports: readonly RegisterReport[], failures: readonly RegisterFailure[],
): string {
  const lines = [prompt, '', 'New register events:']
  for (const report of reports) {
    for (const entry of report.entries) {
      lines.push(`- ${entry.date} ${report.application} [${entry.code}] ${entry.description}`)
    }
  }
  if (failures.length > 0) {
    lines.push('', 'Register reads that failed at this run:')
    for (const failure of failures) lines.push(`- ${failure.application}: ${failure.message}`)
  }
  return lines.join('\n')
}
