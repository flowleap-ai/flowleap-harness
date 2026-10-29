/**
 * The attorney gates as slash commands, the strict path beside the question
 * cards (port plan section 4): `/confirm-features <matter>`,
 * `/approve-claims <matter>` and `/waive <matter> <rule or line> <reason>`
 * registered through `ctx.commands`. A command runs in the attorney's own
 * chat line without a model round trip, the registry logs it as
 * `command/run` and `command/done`, and the handler writes the same bytes the
 * card writes (`edits.ts`), reads the flag back, adds the record line with
 * `(command /<name>)` (`record.ts`) and rewrites `checklist.md`. The exact
 * analogue of the IDE's editor commands (`draftingGateContribution.ts`): the
 * model never writes a gate flag or a waiver.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-working-directory'
import { parseDraftingFrontmatter, readGateFlag, type DraftingGateFlag } from '../drafting/frontmatter.ts'
import { isWaivableError, parseFindingsFileItems } from '../drafting/findings-file.ts'
import { claimsHash, DraftingWorkspace, workspaceFiles } from '../drafting/workspace.ts'
import { GATE_COMMAND, GATE_LABEL, WAIVE_COMMAND, waiveTarget, withGateFlag, withWaivers } from './edits.ts'
import { GATE_RECORD_LABEL, recordGateDecision, recordWaivers } from './record.ts'

/** The part of `ctx.commands` the gates use; a test passes a fake that keeps the definitions. */
export interface GateCommandRegistry {
  register(definition: CommandDefinition): () => void
}

/** What the command handlers run on. */
export interface GateCommandDependencies {
  readonly registry: GateCommandRegistry
  /** The clock of the record lines; a test passes its own. */
  readonly now?: () => Date
  readonly info: (message: string) => void
}

/** The matter name and the rest of a command line. */
function splitMatter(rawInput: string): { matter: string; rest: string } | undefined {
  const match = /^\s*(?<matter>\S+)(?<rest>[\s\S]*)$/.exec(rawInput)
  if (!match?.groups) return undefined
  const { matter = '', rest = '' } = match.groups
  return { matter, rest }
}

function error(text: string): CommandResult {
  return { kind: 'error', text }
}

/**
 * Register the three gate commands.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the registry, the clock and the logger.
 * @returns the disposer unregistering the commands.
 */
export function registerGateCommands(ctx: Context, deps: GateCommandDependencies): () => void {
  const now = deps.now ?? (() => new Date())

  const open = async (invocation: CommandInvocation, matter: string): Promise<DraftingWorkspace | CommandResult> => {
    const cwd = await ctx.workingDirectory.ensure(invocation.agent, invocation.signal)
    const workspace = DraftingWorkspace.locate(matter, await workspaceFiles(ctx, cwd, invocation.signal), { now })
    return typeof workspace === 'string' ? error(workspace) : workspace
  }

  const gate = (flag: DraftingGateFlag): CommandDefinition => ({
    name: GATE_COMMAND[flag],
    description: `${GATE_LABEL[flag]} of a drafting matter: writes \`${flag}: true\` to drafting/<matter>/${flag === 'confirmed' ? 'feature-list.md' : 'claims.md'} and records the decision. Attorney only; the agent cannot run it.`,
    input: { hint: '<matter>' },
    async handler(invocation) {
      const parsed = splitMatter(invocation.rawInput)
      if (!parsed || parsed.rest.trim()) return error(`Usage: /${GATE_COMMAND[flag]} <matter> (the folder name under drafting/).`)
      const workspace = await open(invocation, parsed.matter)
      if (!(workspace instanceof DraftingWorkspace)) return workspace
      const path = flag === 'confirmed' ? workspace.folder.featureList : workspace.folder.claims
      const text = await workspace.read(path)
      if (text === undefined) return error(`${path} does not exist. Nothing was written.`)
      const next = withGateFlag(text, flag)
      if (next === undefined) {
        if (readGateFlag(parseDraftingFrontmatter(text).fields, flag) === 'set') {
          return { kind: 'success', text: await workspace.textWithChecklistLine(`${path} already has \`${flag}: true\`; nothing was written.`) }
        }
        return error(`The block between the \`---\` lines at the top of ${path} is not valid YAML. Correct it by hand, then run the command again. Nothing was written.`)
      }
      await workspace.write(path, next)
      const after = await workspace.read(path)
      if (after === undefined || readGateFlag(parseDraftingFrontmatter(after).fields, flag) !== 'set') {
        return error(`${path} does not carry \`${flag}: true\` after the write; check the file.`)
      }
      await recordGateDecision(workspace, flag, { kind: 'command', command: GATE_COMMAND[flag] }, now(), flag === 'approved' ? claimsHash(after) : undefined)
      deps.info(`flowleap-deliverables: ${GATE_RECORD_LABEL[flag]} by the attorney (command /${GATE_COMMAND[flag]}) in ${workspace.folder.folder}`)
      return { kind: 'success', text: await workspace.textWithChecklistLine(`${GATE_RECORD_LABEL[flag]}: ${path} now has \`${flag}: true\`; recorded in ${workspace.folder.workingRecord}.`) }
    },
  })

  const waive: CommandDefinition = {
    name: WAIVE_COMMAND,
    description: 'Waive open Errors of drafting/<matter>/findings.md with a reason, written as `  - Waived: <reason>` under each item (one findings.md line number, or a rule name for every open Error of that rule). Attorney only; the agent cannot run it.',
    input: { hint: '<matter> <rule or line> <reason>' },
    async handler(invocation) {
      const match = /^\s*(?<matter>\S+)\s+(?<target>\S+)\s+(?<reason>\S[\s\S]*)$/.exec(invocation.rawInput)
      if (!match?.groups) return error(`Usage: /${WAIVE_COMMAND} <matter> <rule or findings.md line> <reason>.`)
      const { matter = '', target = '', reason = '' } = match.groups
      const workspace = await open(invocation, matter)
      if (!(workspace instanceof DraftingWorkspace)) return workspace
      const path = workspace.folder.findings
      const text = await workspace.read(path)
      if (text === undefined) return error(`${path} does not exist: run validate_draft first. Nothing was written.`)
      // The pattern guarantees a non-blank reason, so withWaivers declines only when no open Error matches the target.
      const next = withWaivers(text, waiveTarget(text, target), reason.trim())
      if (next === undefined) {
        const open = parseFindingsFileItems(text).filter(isWaivableError)
        return error(`${path} has no open Error ${/^\d+$/.test(target) ? `on line ${target}` : `of rule ${target}`}. Open: ${open.length ? open.map(item => `line ${String(item.fileLine)} (${item.finding.rule})`).join(', ') : 'none'}. Nothing was written.`)
      }
      const openBefore = parseFindingsFileItems(text).filter(isWaivableError).length
      await workspace.write(path, next.text)
      const after = await workspace.read(path) ?? ''
      if (parseFindingsFileItems(after).filter(isWaivableError).length !== openBefore - next.waived.length) {
        return error(`${path} does not carry the waiver after the write; check the file.`)
      }
      await recordWaivers(workspace, next.waived, { kind: 'command', command: WAIVE_COMMAND }, now())
      deps.info(`flowleap-deliverables: ${String(next.waived.length)} Error(s) waived by the attorney (command /${WAIVE_COMMAND}) in ${workspace.folder.folder}`)
      return { kind: 'success', text: await workspace.textWithChecklistLine(`Waived ${String(next.waived.length)} Error(s) in ${path} (line${next.waived.length > 1 ? 's' : ''} ${next.waived.map(item => String(item.fileLine)).join(', ')}) with the reason under each item; recorded in ${workspace.folder.workingRecord}.`) }
    },
  }

  const disposers = [gate('confirmed'), gate('approved'), waive].map(definition => deps.registry.register(definition))
  return () => { for (const dispose of disposers.splice(0)) dispose() }
}
