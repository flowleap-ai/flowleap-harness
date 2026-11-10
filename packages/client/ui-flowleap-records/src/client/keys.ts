/**
 * The shortcut commands of the IPMS acts (`.agents/skills/flowleap-design-language/keys.md`) and the keycaps of a
 * command from the shortcut catalog. The key layer registers the commands; a control names its act's command and
 * shows the command's current keycaps, so a rebound key shows its new keycap everywhere.
 */

import type { ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { KeycapBox } from '@deepseek-ai/dsh-client-ui-primitives'

/** The command of each act, as keys.md names it. */
export const COMMANDS = {
  search: 'session.search',
  record: 'records.decision.record',
  accept: 'records.part.accept',
  reject: 'records.part.reject',
  otherMatter: 'records.intake.otherMatter',
  preview: 'records.work.preview',
  calculation: 'records.deadline.calculation',
  openLetter: 'records.letter.open',
  retry: 'records.retry',
  recordEvent: 'records.event.record',
  showFiled: 'records.intake.showFiled',
  open: 'records.row.open',
  goMatter: 'records.go.matter',
  goIntake: 'records.go.intake',
  next: 'records.list.next',
  previous: 'records.list.previous',
  select: 'records.list.select',
  find: 'records.find',
} as const satisfies Record<string, string>

/** An act with a command. */
export type CommandName = keyof typeof COMMANDS

/**
 * The command id of an act.
 * @param name - the act.
 * @returns the registry command id.
 */
export function commandId(name: CommandName): ShortcutCommandId {
  return COMMANDS[name] as ShortcutCommandId
}

/** The keycaps of a command; none for a command the catalog does not list or that has no binding. */
export type KeycapsOf = (command: ShortcutCommandId) => readonly KeycapBox[]

const NONE: readonly KeycapBox[] = []

/**
 * The keycaps of each command in the shortcut catalogs: a rebindable command's current binding (`entry.keycaps`, one
 * box for a key or a combination, one for each step of a sequence), and a fixed key such as ↵ Open the row. The
 * catalog names keys in English for the whole app; a key with a word in `keyWords` shows that word instead, such as
 * "Leer" for Space on a German page (keys.md).
 * @param rows - the catalog of rebindable commands.
 * @param fixedRows - the catalog of fixed keys.
 * @param keyWords - the UI language's word of a catalog key name.
 * @returns the lookup.
 */
export function keycapsFrom(
  rows: readonly ShortcutCatalogEntry[], fixedRows: readonly ShortcutFixedCatalogEntry[], keyWords: Readonly<Record<string, string>>,
): KeycapsOf {
  const byId = new Map<string, readonly KeycapBox[]>()
  const worded = (box: KeycapBox): KeycapBox => box.map(label => keyWords[label] ?? label)
  for (const row of [...fixedRows, ...rows]) byId.set(row.id, row.keycaps?.map(worded) ?? NONE)
  return command => byId.get(command) ?? NONE
}
