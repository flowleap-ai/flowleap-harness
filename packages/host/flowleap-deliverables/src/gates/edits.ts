/**
 * The pure file edits behind the attorney gates: the IDE's
 * `draftingGateLens.ts` (SOURCE.json) without VS Code. `draftingGateEdit`
 * became {@link withGateFlag}, `draftingWaiverEdit` became
 * {@link withWaivers}, and `findingsWaiveChoices` became
 * {@link waiveChoices}, the options of the Waive Errors question card. The
 * CodeLens providers, the WorkspaceEdit builders and the quick-pick items
 * are not ported: the harness has no editor. Every function here takes a
 * file's text and returns the next text, so the question cards (`questions.ts`)
 * and the slash commands (`commands.ts`) write the same bytes.
 * @module
 */

import { findingsWaiverInsertions, isWaivableError, parseFindingsFileItems, type FindingsFileItem } from '../drafting/findings-file.ts'
import { parseDraftingFrontmatter, readGateFlag, writeDraftingFrontmatter, type DraftingGateFlag } from '../drafting/frontmatter.ts'

/** The labels of the two gate actions, the IDE's CodeLens titles. */
export const GATE_LABEL: Readonly<Record<DraftingGateFlag, string>> = { confirmed: 'Confirm Feature List', approved: 'Approve Claims' }

/** The slash command of each gate, typed by the attorney in the chat. */
export const GATE_COMMAND: Readonly<Record<DraftingGateFlag, string>> = { confirmed: 'confirm-features', approved: 'approve-claims' }

/** The slash command that waives Errors of `findings.md`. */
export const WAIVE_COMMAND = 'waive'

/**
 * The gate file with its flag set to `true`, through `writeDraftingFrontmatter` (PRD 0025 S2:
 * the comment lines above the fields stay). A flag line keeps its place; a missing flag is
 * added after the other fields; a file without a frontmatter block gets one.
 * @param text - the gate file.
 * @param flag - the gate flag to set.
 * @returns the next text, or `undefined` when the flag is `true` already or the frontmatter is
 *   not valid YAML (the attorney corrects it by hand; `fieldLine` finds no field in it).
 */
export function withGateFlag(text: string, flag: DraftingGateFlag): string | undefined {
  const { fields, bodyStartLine } = parseDraftingFrontmatter(text)
  if (readGateFlag(fields, flag) === 'set') return undefined
  // A `---` at the top with no parsed block: the YAML is not valid, so nothing is written over it.
  if (bodyStartLine === 1 && text.startsWith('---')) return undefined
  return writeDraftingFrontmatter({ ...fields, [flag]: true }, text)
}

/**
 * `findings.md` with `  - Waived: <reason>` under each item at the 1-based `fileLines`, after
 * the sub-lines of the item (the IDE's `draftingWaiverEdit` applied to the text).
 * @param text - the `findings.md` text.
 * @param fileLines - the 1-based lines of the items to waive.
 * @param reason - the attorney's reason, one line.
 * @returns the next text and the lines waived, or `undefined` when the reason is empty or no
 *   item at those lines is an unwaived Error.
 */
export function withWaivers(
  text: string, fileLines: readonly number[], reason: string,
): { readonly text: string; readonly waived: readonly FindingsFileItem[] } | undefined {
  const insertions = findingsWaiverInsertions(text, fileLines, reason)
  if (!insertions.length) return undefined
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // Later insertions first, so the earlier line numbers stay valid.
  for (const { afterLine, text: waiver } of [...insertions].sort((a, b) => b.afterLine - a.afterLine)) {
    lines.splice(afterLine, 0, waiver)
  }
  const waivable = new Set(fileLines)
  const waived = parseFindingsFileItems(text).filter(item => isWaivableError(item) && waivable.has(item.fileLine))
  return { text: lines.join('\n'), waived }
}

/** One option of the Waive Errors question card: the 1-based lines it waives, and the label the attorney reads. */
export interface WaiveChoice {
  readonly label: string
  readonly description?: string
  readonly fileLines: readonly number[]
}

/**
 * The options of the Waive Errors card over the text of `findings.md`: one per unwaived Error
 * (`line N: rule — message`), then one `All N Errors of rule X` for each rule with more than two.
 * Empty when no Error is open. Inventor Questions are never offered: the inventor answers them.
 * @param text - the `findings.md` text.
 * @returns the options, in the order of the file.
 */
export function waiveChoices(text: string): WaiveChoice[] {
  const errors = parseFindingsFileItems(text).filter(isWaivableError)
  const single = errors.map((item): WaiveChoice => ({
    label: `Line ${String(item.fileLine)}: ${item.finding.rule}`,
    description: item.finding.message,
    fileLines: [item.fileLine],
  }))
  const rules = [...new Set(errors.map(item => item.finding.rule))]
  const bulk = rules.flatMap((rule): WaiveChoice[] => {
    const ofRule = errors.filter(item => item.finding.rule === rule)
    return ofRule.length > 2
      ? [{ label: `All ${String(ofRule.length)} Errors of ${rule}`, description: 'one reason, written under each item', fileLines: ofRule.map(item => item.fileLine) }]
      : []
  })
  return [...single, ...bulk]
}

/**
 * The 1-based lines of `findings.md` a `/waive` argument names: a line number, or a rule name
 * (every unwaived Error of that rule).
 * @param text - the `findings.md` text.
 * @param ruleOrLine - the attorney's argument.
 * @returns the lines, empty when nothing matches.
 */
export function waiveTarget(text: string, ruleOrLine: string): number[] {
  const errors = parseFindingsFileItems(text).filter(isWaivableError)
  if (/^\d+$/.test(ruleOrLine)) {
    const line = Number(ruleOrLine)
    return errors.some(item => item.fileLine === line) ? [line] : []
  }
  return errors.filter(item => item.finding.rule === ruleOrLine).map(item => item.fileLine)
}
