/**
 * The `export_draft_docx` tool: the IDE's `exportDraftDocxTool.ts`
 * (SOURCE.json) on the dsh seams. It re-runs the validators and refuses while
 * an Error or an Inventor Question is open and unwaived, while `approved` is
 * not `true` in `claims.md`, or while `claims.md` differs from the claims the
 * draft was generated against. At the closed approval it shows the Approve
 * Claims card, at unwaived Errors the Waive Errors card (S5 D3), and reads the
 * file back before it continues; else it logs the attorney's edits against the
 * generated snapshot in the Working Record, writes the three filing documents
 * with the office page setup, the filing manifest and the full review copy,
 * and presents the five files on the delivery card. The input schema is the
 * IDE's; the description carries the contract (ADR 0018 decision 4).
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { buildDraftDocx, buildFullReviewCopyDocx } from '../docx/draft.ts'
import { diffDraftParagraphs } from '../drafting/draft-diff.ts'
import { OFFICE_PAGE_SETUP } from '../drafting/filing-documents.ts'
import { filingManifest, renderFilingManifest } from '../drafting/filing-manifest.ts'
import { findingLine } from '../drafting/finding.ts'
import { blockingFindings } from '../drafting/findings-file.ts'
import { DRAFT_DOCUMENT_TYPES } from '../drafting/folder-contract.ts'
import { composeFullReviewCopy } from '../drafting/full-review-copy.ts'
import { emptyWorkingRecord, withAttorneyEdits } from '../drafting/working-record.ts'
import type { DraftingWorkspace } from '../drafting/workspace.ts'
import { delivered, draftingToolDefinition, gateSeams, matterArgument, refused, toolClock, type DraftingToolDependencies, type DraftingToolValue } from './shell.ts'
import { approvedClaims } from './start-application-draft.ts'
import { offerWaivers } from './validate-draft.ts'

/** The tool name, shared with the IDE and the exported Patent Agent prompt. */
export const EXPORT_DRAFT_DOCX_NAME = 'export_draft_docx'

/** What the model reads about the tool: the contract, not the page-setup rules. */
export const EXPORT_DRAFT_DOCX_DESCRIPTION = 'Export a Draft Application to Word, only when the attorney asks for the Word file: drafting/<matter>/draft-application.description.docx, .claims.docx and .abstract.docx (one file per document type, office page setup, source markers and the Inventor Questions section removed), draft-application.full.docx (the full review copy, the whole application in one file, marked not for filing) and filing-manifest.md (claims, drawing sheets, abstract figure, ESTIMATED pages). '
  + 'It re-runs the validators and refuses while any Error or Inventor Question in findings.md is open and unwaived, while `approved` in claims.md is not true, or while claims.md differs from the claims the draft was generated against; at a closed approval or at unwaived Errors it asks the attorney in the chat first and continues only when the file carries the flag or the waiver; a refusal lists every blocking item and names the open steps of checklist.md. Report every item it lists as it is, with paths in backticks; the attorney resolves it in the draft, waives it with a reason, or opens the gate. '
  + 'On success it logs the attorney\'s edits against draft-application.generated.md in the Working Record and delivers the five files to the user; do not call present for them. Drawings are not generated. The export is a draft for attorney review, not a filing.'

/** The IDE's input schema, verbatim. */
export const EXPORT_DRAFT_DOCX_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    matter: {
      type: 'string',
      description: 'The matter folder name under drafting/, e.g. \'hinge\'.',
    },
  },
  required: ['matter'],
}

const REFUSED = 'The draft was not exported.'

/**
 * Build the `export_draft_docx` definition over the mounted `fs` and `workingDirectory` services.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the delivery queue, the loggers and the clock.
 * @returns the unregistered dsh definition.
 */
export function exportDraftDocxTool(ctx: Context, deps: DraftingToolDependencies): ToolDefinition {
  const now = toolClock(deps)
  const seams = gateSeams(deps)

  const execute = async (workspace: DraftingWorkspace, exec: ToolRunContext): Promise<DraftingToolValue> => {
    const { folder } = workspace
    const approval = await approvedClaims(workspace, exec, seams)
    if (typeof approval === 'string') {
      return refused(await workspace.refusal(REFUSED, approval))
    }
    if (approval.changed) {
      return refused(await workspace.refusal(REFUSED, approval.changed))
    }
    const draft = await workspace.read(folder.draft)
    const snapshot = await workspace.read(folder.generatedSnapshot)
    const claims = await workspace.read(folder.claims)
    if (draft === undefined || snapshot === undefined || claims === undefined) {
      return refused(await workspace.refusal(REFUSED, `${draft === undefined ? folder.draft : folder.generatedSnapshot} does not exist: save the draft with write_patent_results, template draft-application, first.`))
    }
    const office = await workspace.office(draft)
    if (!office) {
      return refused(await workspace.refusal(REFUSED, `Neither ${folder.draft} nor ${folder.featureList} names the office (\`office: US\` or \`office: EPO\`).`))
    }
    const validate = () => workspace.validate(office, draft, claims, approval, [])
    const { findings, waived } = await offerWaivers(workspace, exec, seams, await validate(), validate)
    const blocking = blockingFindings(findings)
    if (blocking.length) {
      return refused(await workspace.refusal(REFUSED, `${blocking.length} finding(s) in ${folder.findings} are open; each is resolved in the draft, or the attorney waives it with a reason (\`  - Waived: <reason>\` under the item):\n${blocking.map(findingLine).join('\n')}`))
    }
    const diff = diffDraftParagraphs(snapshot, draft)
    const record = await workspace.read(folder.workingRecord) ?? emptyWorkingRecord(folder.matter)
    await workspace.write(folder.workingRecord, withAttorneyEdits(record, diff, now().toISOString()))
    const documents = await buildDraftDocx(draft, office)
    for (const type of DRAFT_DOCUMENT_TYPES) {
      await workspace.write(folder.docx[type], documents[type])
    }
    const figures = await workspace.read(folder.figures)
    const manifest = filingManifest({ office, draft, claims, figures, drawingFiles: await workspace.listFiles(folder.drawings) })
    await workspace.write(folder.filingManifest, renderFilingManifest(manifest, folder))
    await workspace.recordExport(draft, claims)
    const reviewCopy = composeFullReviewCopy({ office, draft, figures, manifest })
    await workspace.write(folder.fullReviewCopy, await buildFullReviewCopyDocx(reviewCopy, office))
    const setup = OFFICE_PAGE_SETUP[office]
    const count = (kind: string) => diff.changes.filter(change => change.kind === kind).length
    deps.info(`flowleap-deliverables: exported ${folder.folder} to Word`)
    const text = `${waived ? `${waived}\n` : ''}Exported the description, the claims and the abstract as separate files: ${DRAFT_DOCUMENT_TYPES.map(type => folder.docx[type]).join(', ')} (${setup.rule} page setup, ${setup.paper}; source markers and Inventor Questions section removed). ${manifest.drawingSheetsBasis === 'measured' ? `The Drawing Sheets are the sheet-N.svg files of ${folder.drawings}/ (built by build_drawing_set).` : `Drawings are not generated: the drawing sheets for ${folder.figures} are prepared outside FlowLeap.`} Wrote ${folder.filingManifest}: ${manifest.claims.total} claim(s), ${manifest.claims.independent} independent; ${manifest.drawingSheets} drawing sheet(s); about ${manifest.pages.total} page(s) in total (estimated). Wrote the full review copy ${folder.fullReviewCopy}: the whole application in one file for reading, marked not for filing; each [MISSING: ...] placeholder in it names its checklist step. Attorney edits against the generated snapshot: ${diff.kept} paragraph(s) kept, ${count('changed')} changed, ${count('deleted')} deleted, ${count('added')} added; logged in ${folder.workingRecord}. The export is a draft for attorney review, not a filing. ${await workspace.checklistLine(false)}`
    return delivered(deps, exec, workspace, [
      { path: folder.docx.description, description: 'Description (Word)' },
      { path: folder.docx.claims, description: 'Claims (Word)' },
      { path: folder.docx.abstract, description: 'Abstract (Word)' },
      { path: folder.fullReviewCopy, description: 'Full review copy (Word, not for filing)' },
      { path: folder.filingManifest, description: 'Filing manifest' },
    ], text)
  }

  return draftingToolDefinition(ctx, deps, {
    name: EXPORT_DRAFT_DOCX_NAME,
    description: EXPORT_DRAFT_DOCX_DESCRIPTION,
    parameters: EXPORT_DRAFT_DOCX_PARAMETERS,
    parse: args => matterArgument(EXPORT_DRAFT_DOCX_NAME, args),
    matter: matter => matter,
    refusal: () => REFUSED,
    execute,
  })
}
