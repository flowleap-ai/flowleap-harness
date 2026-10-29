/**
 * The `start_application_draft` tool: the IDE's `startApplicationDraftTool.ts`
 * (SOURCE.json) on the dsh seams. It reads the `confirmed` gate of
 * `feature-list.md` and the `approved` gate of `claims.md` from the files,
 * never from the chat; at a closed gate it asks the attorney through the
 * question card (S5 D3) and reads the flag back before it continues, else it
 * refuses with the file edit, the card and the command. When both gates are
 * open it returns the Feature List, the figures, the Approved Claims, the claim
 * terms to plan, the Draft Outline when it was made for the Approved Claims
 * and up to five style exemplars, and records the approved claims hash in the
 * Working Record. The input schema is the IDE's; the description carries the
 * contract (ADR 0018 decision 4).
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { officeAction } from '../drafting/checklist.ts'
import { parseClaims } from '../drafting/claims.ts'
import { claimTermsToPlan } from '../drafting/claim-validators.ts'
import { DRAFT_OUTLINE_SAVE } from '../drafting/folder-contract.ts'
import { parseDraftingFrontmatter, readOffice } from '../drafting/frontmatter.ts'
import { STYLE_INSTRUCTION } from '../drafting/style-folder.ts'
import type { DraftingWorkspace } from '../drafting/workspace.ts'
import { askGate, type GateSeams } from '../gates/questions.ts'
import { draftingToolDefinition, gateSeams, matterArgument, refused, type DraftingToolDependencies, type DraftingToolValue } from './shell.ts'

/** The tool name, shared with the IDE and the exported Patent Agent prompt. */
export const START_APPLICATION_DRAFT_NAME = 'start_application_draft'

/** What the model reads about the tool: the contract, not the gate mechanics. */
export const START_APPLICATION_DRAFT_DESCRIPTION = 'Start Application Drafting for one matter folder drafting/<matter>/ (application-drafting skill, Step 3). It reads the gates from the files, never from the chat: `confirmed: true` in feature-list.md and `approved: true` in claims.md. At a closed gate it asks the attorney in the chat and continues only when the file carries the flag; an approval said in chat opens no gate. A refusal names the file with its line and the word to change: give the attorney that sentence as it is, with the path in backticks. '
  + 'When the gates are open it returns the Feature List, figures.md, the Approved Claims, the claim terms to plan (copy them verbatim into the `Claim terms` column of the Draft Outline; the outline-coverage rule checks these exact terms), the Draft Outline when it was made for the Approved Claims, the office, and up to five style exemplars from the workspace style/ folder as text, labelled style only, never a source. It records the SHA-256 of the approved claims in the Working Record; a later change to claims.md clears the approval, and the drafting tools refuse until the attorney approves again. When the outline is missing or stale, plan first: save the Draft Outline with the draft-outline template; the draft save refuses until then. '
  + 'Call it before writing the specification, and again after any change to the claims. Like every drafting tool, also after a refusal, it rewrites drafting/<matter>/checklist.md from the files: read that file first in a matter.'

/** The IDE's input schema, verbatim. */
export const START_APPLICATION_DRAFT_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    matter: {
      type: 'string',
      description: 'The matter folder name under drafting/, e.g. \'hinge\' for drafting/hinge/.',
    },
  },
  required: ['matter'],
}

const REFUSED = 'Drafting did not start.'

/**
 * One line per Approved Claim with the terms it introduces, `Claim 1: a; b`; a dependent claim
 * names its independent claims, `Claim 3 (with claim 1): c`.
 */
function claimTermLines(claims: string): string[] {
  return claimTermsToPlan(parseClaims(claims)).map(({ claim, independentClaims, terms }) => {
    const roots = independentClaims.length ? ` (with claim${independentClaims.length > 1 ? 's' : ''} ${independentClaims.join(', ')})` : ''
    return `Claim ${String(claim)}${roots}: ${terms.length ? terms.join('; ') : 'no new claim term'}`
  })
}

/**
 * The confirmed Feature List: as the file has it, else after the attorney answered the card, else the refusal.
 * @param workspace - the matter.
 * @param exec - the tool call.
 * @param seams - the gate seams.
 * @returns the Feature List, or the refusal sentence.
 */
export async function confirmedFeatureList(workspace: DraftingWorkspace, exec: ToolRunContext, seams: GateSeams): Promise<Awaited<ReturnType<DraftingWorkspace['requireConfirmedFeatureList']>>> {
  const first = await workspace.requireConfirmedFeatureList()
  if (typeof first !== 'string') return first
  const outcome = await askGate(workspace, exec, seams, 'confirmed')
  if (!outcome.opened) return first
  // Read back: the file is the gate.
  return workspace.requireConfirmedFeatureList()
}

/**
 * The approved claims: as the file has them, else after the attorney answered the card, else the refusal.
 * After a withdrawn approval (the claims changed) the card shows the claims as they are now, so a
 * "yes" is the new approval `checkClaimsApproval` binds to the current body.
 * @param workspace - the matter.
 * @param exec - the tool call.
 * @param seams - the gate seams.
 * @returns the approval with its hash, or the refusal sentence.
 */
export async function approvedClaims(workspace: DraftingWorkspace, exec: ToolRunContext, seams: GateSeams): Promise<Awaited<ReturnType<DraftingWorkspace['requireApprovedClaims']>>> {
  const first = await workspace.requireApprovedClaims()
  if (typeof first !== 'string') return first
  const outcome = await askGate(workspace, exec, seams, 'approved')
  if (!outcome.opened) return first
  return workspace.requireApprovedClaims()
}

/**
 * Build the `start_application_draft` definition over the mounted `fs` and `workingDirectory` services.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the delivery queue, the gate seams, the loggers and the clock.
 * @returns the unregistered dsh definition.
 */
export function startApplicationDraftTool(ctx: Context, deps: DraftingToolDependencies): ToolDefinition {
  const seams = gateSeams(deps)

  const execute = async (workspace: DraftingWorkspace, exec: ToolRunContext): Promise<DraftingToolValue> => {
    const { folder } = workspace
    const featureList = await confirmedFeatureList(workspace, exec, seams)
    if (typeof featureList === 'string') {
      return refused(await workspace.refusal(REFUSED, featureList))
    }
    const approval = await approvedClaims(workspace, exec, seams)
    if (typeof approval === 'string') {
      return refused(await workspace.refusal(REFUSED, approval))
    }
    const office = readOffice(featureList.fields)
    if (!office) {
      return refused(await workspace.refusal(REFUSED, `${folder.featureList} names no office. ${officeAction(folder.featureList)}`))
    }
    await workspace.recordApprovedClaims(approval.hash)
    const figures = await workspace.read(folder.figures)
    const claims = await workspace.read(folder.claims) ?? ''
    const exemplars = await workspace.styleExemplars()
    const outline = await workspace.readOutline(approval.hash)
    const body = (text: string) => parseDraftingFrontmatter(text).body.trim()
    const saveOutline = `save it ${DRAFT_OUTLINE_SAVE}, to ${folder.draftOutline}`
    const outlineSection = !outline
      ? `No ${folder.draftOutline} yet. Plan first: write the Draft Outline for the Approved Claims and ${saveOutline}. The draft save refuses without it.`
      : outline.stale
        ? `The Draft Outline is stale: ${outline.stale} Plan from the Approved Claims above and ${saveOutline} before drafting; the draft save refuses until then.`
        : body(outline.text)

    const sections = [
      `Drafting started for matter "${folder.matter}". Office: ${office}. Gates read from the files: \`confirmed: true\` in ${folder.featureList}, \`approved: true\` in ${folder.claims}. The approved claims are recorded (SHA-256 ${approval.hash}) in ${folder.workingRecord}: when ${folder.claims} changes, the drafting tools set \`approved\` to \`false\` and refuse until the attorney approves again.`,
      `Save the Draft Outline ${DRAFT_OUTLINE_SAVE}, to ${folder.draftOutline}; then save the draft with template draft-application, to ${folder.draft}; then call validate_draft. ${await workspace.checklistLine(false)}`,
      '',
      `## Feature List (${folder.featureList})`,
      '',
      body(featureList.text),
      '',
      `## Figures (${folder.figures})`,
      '',
      figures === undefined ? 'No figures.md: the application has no figures unless the attorney supplies them.' : body(figures),
      '',
      `## Approved Claims (${folder.claims})`,
      '',
      body(claims),
      '',
      '## Claim terms to plan',
      '',
      'Copy these terms verbatim into the `Claim terms` column of the Draft Outline; the outline-coverage rule checks these exact terms.',
      '',
      ...claimTermLines(claims),
      '',
      `## Draft Outline (${folder.draftOutline})`,
      '',
      outlineSection,
      '',
      '## Style exemplars (style only, never a source)',
      '',
      exemplars.length
        ? 'Voice and structure only. No fact, feature, embodiment, value, example or result enters the draft from an exemplar.'
        : `No exemplar in style/: use the office template style only. Tell the attorney: ${STYLE_INSTRUCTION}`,
      ...exemplars.flatMap((exemplar, index) => [
        '',
        `### Style exemplar ${String(index + 1)}: ${exemplar.path} (style only, never a source)`,
        '',
        exemplar.error ? `Not read: ${exemplar.error}.` : `${exemplar.text?.trim() ?? ''}${exemplar.truncated ? '\n\n[Exemplar cut here; the rest is not shown.]' : ''}`,
      ]),
    ]
    deps.info(`flowleap-deliverables: drafting started for ${folder.folder}`)
    return { ok: true, text: sections.join('\n') }
  }

  return draftingToolDefinition(ctx, deps, {
    name: START_APPLICATION_DRAFT_NAME,
    description: START_APPLICATION_DRAFT_DESCRIPTION,
    parameters: START_APPLICATION_DRAFT_PARAMETERS,
    parse: args => matterArgument(START_APPLICATION_DRAFT_NAME, args),
    matter: matter => matter,
    refusal: () => REFUSED,
    execute,
  })
}
