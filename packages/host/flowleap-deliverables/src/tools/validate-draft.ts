/**
 * The `validate_draft` tool: the IDE's `validateDraftTool.ts` (SOURCE.json)
 * on the dsh seams. It runs the deterministic validators of the office over a
 * Draft Application, adds the model's advisory items as Advisory findings and
 * writes `findings.md`, keeping the attorney's waivers; when `claims.md`
 * changed after approval it adds a `claims-changed` Error and clears
 * `approved`. With unwaived Errors left it shows the attorney the Waive Errors
 * card (S5 D3); a waiver written through the card is merged by a second
 * validator run, so the result and the checklist show the new state. It never
 * says the draft passed. The input schema is the IDE's.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { DraftFinding } from '../drafting/finding.ts'
import { blockingFindings } from '../drafting/findings-file.ts'
import { DRAFTING_FILE_NAMES } from '../drafting/folder-contract.ts'
import { findingsSummary, type DraftingWorkspace } from '../drafting/workspace.ts'
import { isInventorQuestion } from '../drafting/finding.ts'
import { askWaiver, type GateSeams } from '../gates/questions.ts'
import { draftingToolDefinition, gateSeams, matterArgument, refused, type DraftingToolDependencies, type DraftingToolValue } from './shell.ts'

/** The tool name, shared with the IDE and the exported Patent Agent prompt. */
export const VALIDATE_DRAFT_NAME = 'validate_draft'

/** What the model reads about the tool: the contract, not the rule list. */
export const VALIDATE_DRAFT_DESCRIPTION = 'Validate a saved Draft Application (application-drafting skill, Step 4). It reads drafting/<matter>/draft-application.md, claims.md, figures.md, draft-outline.md and inventor-answers.md, runs the deterministic validators of the office in code (claims, description, abstract, defined terms, reference numerals, source markers, open Inventor Questions, the Draft Outline rules) and writes drafting/<matter>/findings.md; the attorney\'s waivers (a `  - Waived: <reason>` line under an item) are kept across runs. '
  + 'Pass the items of your advisory review in `advisory`: each quotes the passage it concerns and gives its line or claim; they are recorded as Advisory findings and never block export. When claims.md changed after start_application_draft recorded the approved claims, it adds a `claims-changed` Error and sets `approved: false`: the attorney approves again and the draft is regenerated. With unwaived Errors left it asks the attorney in the chat which to waive, with a reason; a skipped card changes nothing. '
  + 'Returns the counts by severity and the list of findings that block export. Report them by severity with line references; never say the draft passed or is ready to file. Every result ends with the next step for the attorney: give it as it is.'

/** The IDE's input schema, verbatim. */
export const VALIDATE_DRAFT_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    matter: {
      type: 'string',
      description: 'The matter folder name under drafting/, e.g. \'hinge\'.',
    },
    advisory: {
      type: 'array',
      description: 'Optional advisory review items from the model (scope, clarity, support of each claimed combination). Each quotes the passage it concerns.',
      items: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The item, quoting the passage it concerns.',
          },
          line: {
            type: 'number',
            description: 'The 1-based line of the passage in draft-application.md.',
          },
          claim: {
            type: 'number',
            description: 'The claim the item concerns.',
          },
        },
        required: ['message'],
      },
    },
  },
  required: ['matter'],
}

/** One item of the model's advisory review: the IDE's `IAdvisoryItem`. */
export interface AdvisoryItem {
  /** The item, quoting the passage it concerns. */
  readonly message: string
  /** The 1-based line of the passage in draft-application.md. */
  readonly line?: number
  /** The claim the item concerns. */
  readonly claim?: number
}

/** The model's arguments: the IDE's `IValidateDraftParams`. */
export interface ValidateDraftInput {
  readonly matter: string
  readonly advisory?: readonly AdvisoryItem[]
}

/**
 * Validate the raw arguments; the registry hands them over as parsed JSON and this tool owns its schema.
 * @param args - the model's arguments.
 * @returns the typed input.
 * @throws when `matter` or `advisory` is not of its declared shape.
 */
export function parseValidateDraftArgs(args: unknown): ValidateDraftInput {
  const matter = matterArgument(VALIDATE_DRAFT_NAME, args)
  const advisory = (args as Record<string, unknown>)['advisory']
  if (advisory === undefined || advisory === null) return { matter }
  if (!Array.isArray(advisory)) throw new Error(`${VALIDATE_DRAFT_NAME}: invalid arguments: advisory must be an array of items`)
  const items = advisory.map((item: unknown): AdvisoryItem => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error(`${VALIDATE_DRAFT_NAME}: invalid arguments: each advisory item must be an object with a message`)
    const record = item as Record<string, unknown>
    const message = record['message']
    if (typeof message !== 'string') throw new Error(`${VALIDATE_DRAFT_NAME}: invalid arguments: each advisory item must have a string message`)
    const line = record['line']
    const claim = record['claim']
    return {
      message,
      ...typeof line === 'number' ? { line } : {},
      ...typeof claim === 'number' ? { claim } : {},
    }
  })
  return { matter, advisory: items }
}

const REFUSED = 'The draft was not validated.'

/**
 * Offer the Waive Errors card when unwaived Errors (not Inventor Questions) are left, and return
 * the findings after a second validator run merged the waivers the card wrote.
 * @param workspace - the matter.
 * @param exec - the tool call.
 * @param seams - the gate seams.
 * @param findings - the merged findings of this run.
 * @param revalidate - runs the validators again (the waivers are merged from `findings.md`).
 * @returns the findings to report, and the card's outcome line when it waived anything.
 */
export async function offerWaivers(
  workspace: DraftingWorkspace, exec: ToolRunContext, seams: GateSeams, findings: DraftFinding[], revalidate: () => Promise<DraftFinding[]>,
): Promise<{ findings: DraftFinding[]; waived?: string }> {
  const blocking = blockingFindings(findings)
  if (!blocking.some(finding => !isInventorQuestion(finding))) return { findings }
  const outcome = await askWaiver(workspace, exec, seams, blocking)
  if (!outcome.opened) return { findings }
  return { findings: await revalidate(), waived: outcome.detail }
}

/**
 * Build the `validate_draft` definition over the mounted `fs` and `workingDirectory` services.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the delivery queue, the gate seams, the loggers and the clock.
 * @returns the unregistered dsh definition.
 */
export function validateDraftTool(ctx: Context, deps: DraftingToolDependencies): ToolDefinition {
  const seams = gateSeams(deps)

  const execute = async (workspace: DraftingWorkspace, exec: ToolRunContext, input: ValidateDraftInput): Promise<DraftingToolValue> => {
    const { folder } = workspace
    const refusal = async (reason: string) => refused(await workspace.refusal(REFUSED, reason))
    const draft = await workspace.read(folder.draft)
    if (draft === undefined) {
      return refusal(`${folder.draft} does not exist: save the draft with write_patent_results, template draft-application, first.`)
    }
    const claims = await workspace.read(folder.claims)
    if (claims === undefined) {
      return refusal(`${folder.claims} does not exist.`)
    }
    const office = await workspace.office(draft)
    if (!office) {
      return refusal(`Neither ${folder.draft} nor ${folder.featureList} names the office (\`office: US\` or \`office: EPO\`).`)
    }
    const advisory: DraftFinding[] = (input.advisory ?? []).filter(item => item.message.trim()).map(item => ({
      severity: 'Advisory',
      rule: 'advisory',
      message: item.message.trim(),
      file: DRAFTING_FILE_NAMES.draft,
      ...(item.line !== undefined ? { line: item.line } : {}),
      ...(item.claim !== undefined ? { claim: item.claim } : {}),
    }))
    // Read again: checkClaimsApproval may have rewritten the frontmatter of claims.md (`approved`,
    // `approvedHash`), which moves the claim line numbers the findings refer to.
    const run = async () => {
      const approval = await workspace.checkClaimsApproval()
      return workspace.validate(office, draft, await workspace.read(folder.claims) ?? claims, approval, advisory)
    }
    const { findings, waived } = await offerWaivers(workspace, exec, seams, await run(), run)
    deps.info(`flowleap-deliverables: validated ${folder.folder} (${office})`)
    const text = `Wrote ${folder.findings} (${office} validators${advisory.length ? `, ${String(advisory.length)} advisory item(s)` : ''}; waivers kept).\n${waived ? `${waived}\n` : ''}${findingsSummary(findings)}\nReport these by severity with their line references. Do not call the draft passed or ready to file.\n${await workspace.checklistLine(false)}`
    return { ok: true, text }
  }

  return draftingToolDefinition(ctx, deps, {
    name: VALIDATE_DRAFT_NAME,
    description: VALIDATE_DRAFT_DESCRIPTION,
    parameters: VALIDATE_DRAFT_PARAMETERS,
    parse: parseValidateDraftArgs,
    matter: input => input.matter,
    refusal: () => REFUSED,
    execute,
  })
}
