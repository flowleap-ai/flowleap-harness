/**
 * The `remove_claim` tool: the IDE's `removeClaimTool.ts` (SOURCE.json) on the
 * dsh seams. It removes one claim from `claims.md` of a drafting matter through
 * `removeClaim`: the claim goes, the later claims move down by one, and the
 * claim references in the other claims change with them. It refuses, and
 * writes nothing, when another claim refers to the claim. The IDE confirms
 * through VS Code's tool confirmation (`prepareInvocation`); here the attorney
 * confirms through `ctx.approval.request`, or, when the session's approval
 * policy is `never` or no approval answerer is composed, through the one-option
 * card `Remove claim N` / `Keep it` (S5 D3). The approval closes in code, not
 * by the confirmation: the edit changes the claims body, so
 * `checkClaimsApproval` sets `approved: false`. The input schema is the IDE's.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { removeClaim, type ClaimRemoval } from '../drafting/claims.ts'
import { addRecordLine, CLAIM_REMOVED, emptyWorkingRecord } from '../drafting/working-record.ts'
import type { DraftingWorkspace } from '../drafting/workspace.ts'
import { confirmRemoval } from '../gates/questions.ts'
import { draftingToolDefinition, gateSeams, matterArgument, refused, toolClock, type DraftingToolDependencies, type DraftingToolValue } from './shell.ts'

/** The tool name, shared with the IDE and the exported Patent Agent prompt. */
export const REMOVE_CLAIM_NAME = 'remove_claim'

/** What the model reads about the tool: the contract, not the confirmation mechanics. */
export const REMOVE_CLAIM_DESCRIPTION = 'Remove one claim from drafting/<matter>/claims.md (application-drafting skill, Step 4). Call it only after the attorney chose "Remove claim N" in chat, for example on a figure-coverage Error (a claim cites a Feature List row that no figure shows) or an advisory item that says a claim has no figure support. The tool asks the attorney to confirm the removal and its cost before it writes; a declined confirmation changes nothing. '
  + 'It deletes the claim, renumbers each later claim down by one, and changes the claim references in the other claims with them ("of claim 5" becomes "of claim 4"). It refuses, and changes nothing, when another claim refers to the claim (the refusal names those claims: the attorney decides about them first) or when claims.md has no claim with that number. The removal changes the claims, so it re-opens the claims approval: `approved` in claims.md becomes false and the attorney approves the claims again before drafting continues; then call start_application_draft. '
  + 'The tool records the old and new claim numbers in the Working Record. Report the renumbering and the re-opened approval to the attorney; never remove a claim on your own.'

/** The IDE's input schema, verbatim. */
export const REMOVE_CLAIM_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    matter: {
      type: 'string',
      description: 'The matter folder name under drafting/, e.g. \'hinge\' for drafting/hinge/.',
    },
    claim: {
      type: 'number',
      description: 'The number of the claim to remove, as claims.md numbers it now.',
    },
  },
  required: ['matter', 'claim'],
}

/** The model's arguments: the IDE's `IRemoveClaimParams`. */
export interface RemoveClaimInput {
  readonly matter: string
  readonly claim: number
}

/**
 * Validate the raw arguments; the registry hands them over as parsed JSON and this tool owns its schema.
 * @param args - the model's arguments.
 * @returns the typed input.
 * @throws when `matter` or `claim` is not of its declared shape.
 */
export function parseRemoveClaimArgs(args: unknown): RemoveClaimInput {
  const matter = matterArgument(REMOVE_CLAIM_NAME, args)
  const claim = (args as Record<string, unknown>)['claim']
  if (typeof claim !== 'number' || !Number.isInteger(claim) || claim < 1) throw new Error(`${REMOVE_CLAIM_NAME}: invalid arguments: claim must be a positive integer, the claim number as claims.md numbers it now`)
  return { matter, claim }
}

type ClaimsRemoved = Extract<ClaimRemoval, { removed: true }>

/**
 * The claims after the removed claim, before and after the removal: "claims 5 to 14 are now claims 4 to 13".
 * @param removal - the removal.
 * @returns the sentence.
 */
export function renumberingSentence(removal: ClaimsRemoved): string {
  const { renumbered } = removal
  if (!renumbered.length) {
    return 'No other claim is renumbered.'
  }
  // The package relaxes noUncheckedIndexedAccess (the copied IDE modules), so the ends are plain reads.
  const first = renumbered[0]
  const last = renumbered[renumbered.length - 1]
  if (renumbered.length === 1) {
    return `Claim ${String(first.from)} is now claim ${String(first.to)}.`
  }
  if (last.from - first.from === renumbered.length - 1) {
    return `Claims ${String(first.from)} to ${String(last.from)} are now claims ${String(first.to)} to ${String(last.to)}.`
  }
  return `Claims ${renumbered.map(entry => String(entry.from)).join(', ')} are now claims ${renumbered.map(entry => String(entry.to)).join(', ')}.`
}

/**
 * What the confirmation tells the attorney: the IDE's `confirmationMessages.message`.
 * @param claim - the claim number.
 * @param removal - the removal.
 * @param claimsPath - the claims file.
 * @returns the sentence.
 */
export function removalCost(claim: number, removal: ClaimsRemoved, claimsPath: string): string {
  return `Remove claim ${String(claim)} of ${String(removal.before)} from ${claimsPath}? ${renumberingSentence(removal)} This re-opens the claims approval: you approve the claims again before drafting continues.`
}

/**
 * Build the `remove_claim` definition over the mounted `fs` and `workingDirectory` services.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the delivery queue, the gate seams, the loggers and the clock.
 * @returns the unregistered dsh definition.
 */
export function removeClaimTool(ctx: Context, deps: DraftingToolDependencies): ToolDefinition {
  const now = toolClock(deps)
  const seams = gateSeams(deps)

  const execute = async (
    workspace: DraftingWorkspace, exec: ToolRunContext, { claim }: RemoveClaimInput, refusal: string,
  ): Promise<DraftingToolValue> => {
    const { folder } = workspace
    if (await workspace.read(folder.claims) === undefined) {
      return refused(await workspace.refusal(refusal, `${folder.claims} does not exist.`))
    }
    // Ties an approval that no tool has read yet to the current claims body first, so the edit
    // below cannot carry it over to the changed claims.
    await workspace.checkClaimsApproval()
    const removal = removeClaim(await workspace.read(folder.claims) ?? '', claim)
    if (!removal.removed) {
      if (removal.reason === 'no-claim') {
        return refused(await workspace.refusal(refusal, `${folder.claims} has no claim ${String(claim)}.`))
      }
      const { dependents } = removal
      const many = dependents.length > 1
      return refused(await workspace.refusal(refusal, `${many ? `Claims ${dependents.join(', ')} refer` : `Claim ${String(dependents[0])} refers`} to claim ${String(claim)}. The attorney decides about ${many ? 'those claims' : 'that claim'} first: remove ${many ? 'them, the highest number first,' : 'it'} or change the claim ${many ? 'they refer' : 'it refers'} to.`))
    }
    const cost = removalCost(claim, removal, folder.claims)
    const confirmation = await confirmRemoval(workspace, exec, seams, claim, cost)
    if (!confirmation.confirmed) {
      const why = confirmation.reason === 'no-channel'
        ? 'No confirmation channel is available in this session (no approval answerer and no question card).'
        : confirmation.reason === 'rejected' || confirmation.reason === 'declined'
          ? 'The attorney did not confirm the removal.'
          : `The confirmation did not arrive (${confirmation.reason}).`
      return refused(await workspace.refusal(refusal, `${why} Nothing was written. The attorney removes the claim in ${folder.claims} by hand, or asks again and confirms in the chat.`))
    }
    // The file may have changed while the confirmation was open: remove from what is there now.
    const current = removeClaim(await workspace.read(folder.claims) ?? '', claim)
    if (!current.removed || current.text !== removal.text) {
      return refused(await workspace.refusal(refusal, `${folder.claims} changed while the confirmation was open. Nothing was written; read the claims again.`))
    }
    await workspace.write(folder.claims, removal.text)
    const renumbering = renumberingSentence(removal)
    const record = await workspace.read(folder.workingRecord) ?? emptyWorkingRecord(folder.matter)
    const via = confirmation.via === 'approval' ? 'approval request' : 'question card'
    await workspace.write(folder.workingRecord, addRecordLine(record, CLAIM_REMOVED, `${now().toISOString()} claim ${String(claim)} of ${String(removal.before)}, on the attorney's confirmation (${via}, call ${String(exec.callId)}). ${renumbering}`))
    const approval = await workspace.checkClaimsApproval()
    const reopened = approval.cleared
      ? `This re-opened the claims approval: \`approved\` in ${folder.claims} is now \`false\`. The attorney reviews the claims and approves them again; then call start_application_draft.`
      : 'The claims were not approved before the removal; the attorney approves them after review.'
    deps.info(`flowleap-deliverables: removed claim ${String(claim)} of ${folder.folder} (${via})`)
    return { ok: true, text: `Removed claim ${String(claim)} of ${String(removal.before)} from ${folder.claims}. ${renumbering} The claim references in the other claims changed with them. ${reopened} ${await workspace.checklistLine(false)}`.trim() }
  }

  return draftingToolDefinition(ctx, deps, {
    name: REMOVE_CLAIM_NAME,
    description: REMOVE_CLAIM_DESCRIPTION,
    parameters: REMOVE_CLAIM_PARAMETERS,
    parse: parseRemoveClaimArgs,
    matter: input => input.matter,
    refusal: ({ claim }) => `Claim ${String(claim)} was not removed.`,
    execute,
  })
}
