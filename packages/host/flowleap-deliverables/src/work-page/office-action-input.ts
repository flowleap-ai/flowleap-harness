/**
 * The `officeAction` input of an `office-action-scaffold` save: the action table, the cited documents, the objections
 * and the claim tables of an office action analysis as structured fields. This schema is the one home of the analysis
 * layout: the tool schema property is generated from it, the save validates the input with it at the tool JSON
 * boundary and names each field to correct, the report renders sections 0 to 3 from the valid value, and the work page
 * file holds the same value as its findings.
 * @module
 */

import { z } from 'zod'
import type {
  ActionRow, CitedDocument, CitedPassage, ClaimTable, ComparisonRow, Objection, OfficeActionFindings, ResponseOption,
} from './types.ts'

/** Highest claim number that a save accepts. */
export const MAX_CLAIM_NUMBER = 9999

const OBJECTION_ID = /^[1-9][0-9]{0,3}(?:\.[1-9][0-9]{0,3}){0,2}$/

const text = (description: string) => z.string().describe(description)

const claimNumber = z.number({ error: `a claim number: a whole number from 1 to ${MAX_CLAIM_NUMBER}` })
  .int({ error: `a claim number: a whole number from 1 to ${MAX_CLAIM_NUMBER}` })
  .min(1, { error: `a claim number: a whole number from 1 to ${MAX_CLAIM_NUMBER}` })
  .max(MAX_CLAIM_NUMBER, { error: `a claim number: a whole number from 1 to ${MAX_CLAIM_NUMBER}` })

/**
 * Whether a `YYYY-MM-DD` text names a day of the calendar, so that `2026-02-30` is refused.
 * @param value - the text.
 * @returns whether the day exists.
 */
function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const DATE_ERROR = 'a real calendar date as YYYY-MM-DD, or null'

const calendarDate = (description: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: DATE_ERROR })
  .refine(isCalendarDate, { error: DATE_ERROR }).nullable().describe(description)

const actionRowSchema = z.strictObject({
  field: text('The row label, for example "Action type" or "Claims examined".'),
  value: text('The value.'),
  source: text('Where the value comes from: the tool or the page of the action.'),
}) satisfies z.ZodType<ActionRow>

const documentSchema = z.strictObject({
  label: text('The label, for example "D1".'),
  text: text('The document, for example "US2016107508A1 (published 2016-04-21)".'),
}) satisfies z.ZodType<CitedDocument>

const passageSchema = z.strictObject({
  document: text('The document, for example "D1 US2016107508A1".'),
  role: text('Its role, for example "applied alone", "X" or "Y".'),
  passage: text('The passage that the examiner relied on, for example "¶[0059], Fig. 6".'),
  says: text('What the passage says: a verbatim quote or a short summary.'),
  anchor: text('The source anchor of the passage; empty when there is none.'),
}) satisfies z.ZodType<CitedPassage>

const optionSchema = z.strictObject({
  label: text('The option: Argue, Amend, Accept or cancel, Interview, or Ask.'),
  text: text('What the option does and its basis; empty when there is nothing to add.'),
}) satisfies z.ZodType<ResponseOption>

const objectionSchema = z.strictObject({
  id: z.string().regex(OBJECTION_ID, { error: 'an objection number such as "1", "2" or "1.2"' })
    .describe('The objection number, for example "1", or "1.2" for a part of objection 1. Each objection has a different id.'),
  title: text('One line, for example "Claims 1-7 lack novelty over D1".'),
  ground: text('The legal ground, for example "35 U.S.C. 102(a)(1)" or "Art. 54 EPC".'),
  legalBasis: text('The legal text or guideline that the ground rests on, with its source.'),
  claims: z.array(claimNumber).max(1000)
    .describe(`The claim numbers that the objection hits, each a whole number from 1 to ${MAX_CLAIM_NUMBER}; write a range as each number. Empty when the objection hits no claim.`),
  reasoning: text('The examiner\'s reasoning, quoted with its page.'),
  source: text('Where the objection comes from: the action text, or the search report categories when no action text was read.'),
  citations: z.array(passageSchema).describe('One row for each cited passage that the objection relies on.'),
  assessment: text('One or two sentences with the passage that decides the objection.'),
  options: z.array(optionSchema).describe('The response options, for the attorney\'s decision.'),
  replyMustAddress: text('What the reply must address for this objection.'),
  confidence: text('What the assessment rests on, and what was not read.'),
  sources: text('The anchors and URLs used for this objection.'),
}) satisfies z.ZodType<Objection>

const comparisonRowSchema = z.strictObject({
  element: text('The claim element, verbatim, with its label, for example "1a \\"a housing ...\\"".'),
  examiner: text('What the examiner says about the element, with the page of the action.'),
  cited: text('What the cited passage says: quote, passage and anchor.'),
  assessment: z.enum(['disclosed', 'not disclosed', 'disputable', 'not read']).describe('The assessment of the element.'),
}) satisfies z.ZodType<ComparisonRow>

const claimTableSchema = z.strictObject({
  claim: claimNumber.describe('The independent claim that the table compares. An objection must hit this claim.'),
  heading: text('One line above the table, for example "Claim 1 (system) against D1 US2016107508A1".'),
  interpretation: text('The interpretation of the disputed terms: term, reading, the quoted definition, and why it is disputed. Empty when no term is disputed.'),
  rows: z.array(comparisonRowSchema).min(1).describe('One row for each element of the claim.'),
  arrangement: text('One line on the arrangement of the elements.'),
}) satisfies z.ZodType<ClaimTable>

/** The `officeAction` input, validated at the tool JSON boundary. */
export const officeActionSchema = z.strictObject({
  application: z.string().trim().min(1).describe('The application number, for example "EP 4814394" or "US 19/043,989".'),
  communication: z.string().trim().min(1).describe('The office and the action, for example "EPO, communication under Art. 94(3) EPC".'),
  issued: calendarDate('The action date as YYYY-MM-DD; null when the action states none.'),
  deadline: calendarDate('The last date without extension as YYYY-MM-DD; null when it cannot be computed.'),
  summary: z.string().trim().min(1).describe('3 to 5 lines: the action type, final or not, the number of objections, the main problems, and the last date without extension. For an EP search report without its opinion, the first line says so.'),
  action: z.array(actionRowSchema).min(1).describe('The rows of the action table, in order: application, office and action, action type, action date, response deadline, last dates, later filings, claims examined, effective filing dates, cited documents, assumptions.'),
  documents: z.array(documentSchema).describe('The cited documents of the action.'),
  objections: z.array(objectionSchema).min(1).describe('One entry for each objection, also for a formal objection.'),
  comparison: z.array(claimTableSchema).describe('One claim table for each independent claim that an objection hits.'),
  dependentClaims: text('One line for each dependent claim that the action names: its added feature, and whether a cited passage discloses it. Empty when the action names none.'),
}).superRefine((value, check) => {
  const seen = new Set<string>()
  value.objections.forEach((objection, index) => {
    if (seen.has(objection.id)) {
      check.addIssue({ code: 'custom', path: ['objections', index, 'id'], message: `a different id: "${objection.id}" is already the id of an earlier objection` })
    }
    seen.add(objection.id)
  })
  const hit = new Set(value.objections.flatMap(objection => objection.claims))
  value.comparison.forEach((table, index) => {
    if (!hit.has(table.claim)) {
      check.addIssue({ code: 'custom', path: ['comparison', index, 'claim'], message: `a claim that an objection hits: no objection lists claim ${String(table.claim)} in its claims` })
    }
  })
}).describe('office-action-scaffold: the analysis of an office action as structured fields. The report shows sections 0 to 3 (summary, action, objections, claim-by-claim comparison) from these fields, and the office action board shows them. content then holds only the sections after the comparison: the response plan, the sources and gaps, and the closing sentence. Omit for a save that is not an analysis of an office action, for example a response plan.') satisfies z.ZodType<OfficeActionFindings>

/**
 * The `officeAction` property of the tool schema, generated from {@link officeActionSchema}.
 * @returns the JSON Schema of the property, without its dialect.
 */
export function officeActionParameter(): Record<string, unknown> {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(officeActionSchema, { io: 'input' })
  return schema
}

/** A heading of the sections that `officeAction` renders: the summary, the action, the objections and the comparison. */
const RENDERED_HEADING = /^#{1,6}[ \t]+(?:\d+\.[ \t]*)?(?:Summary|Action|Objections?|Claim-by-claim comparison)\b/im

/** A heading of one objection block. */
const OBJECTION_HEADING = /^#{2,6}[ \t]+Objection\b/im

/** A heading of the action section or of the claim-by-claim comparison. */
const ANALYSIS_SECTION = /^#{1,6}[ \t]+(?:\d+\.[ \t]*)?(?:Action|Claim-by-claim comparison)\b/im

/** How an `office-action-scaffold` save goes on: with structured findings, with content only, or refused. */
export type OfficeActionSave =
  | { readonly kind: 'structured'; readonly findings: OfficeActionFindings; readonly body: string }
  | { readonly kind: 'content' }
  | { readonly kind: 'refused'; readonly text: string }

const MOVE_TO_FIELDS = 'Give the summary, the action table, the objections and the claim tables in officeAction (summary, action, documents, objections, comparison, dependentClaims), and keep only the response plan, the sources and gaps, and the closing sentence in content.'

/**
 * Validate the `officeAction` input of an `office-action-scaffold` save and render its report body.
 * @param officeAction - the model's `officeAction` value, as parsed JSON.
 * @param content - the model's `content`.
 * @returns the findings and the body, a save with content only, or the refusal that names each field to correct.
 */
export function officeActionSave(officeAction: unknown, content: string): OfficeActionSave {
  if (officeAction === undefined || officeAction === null) {
    return OBJECTION_HEADING.test(content) && ANALYSIS_SECTION.test(content)
      ? { kind: 'refused', text: `Report was not saved. This content is an office action analysis in Markdown. ${MOVE_TO_FIELDS} The office action board reads the analysis from officeAction.` }
      : { kind: 'content' }
  }
  const parsed = officeActionSchema.safeParse(officeAction)
  if (!parsed.success) {
    // A field that fails two checks, for example a whole number above the range, is named once.
    const fields = new Map(parsed.error.issues.map(issue => [fieldPath(issue.path), issue.message]))
    return { kind: 'refused', text: `Report was not saved. Correct these fields of officeAction and save again:\n${[...fields].map(([field, message]) => `- ${field}: ${message}`).join('\n')}` }
  }
  if (content.trim() === '') {
    return { kind: 'refused', text: 'Report was not saved. content is empty. With officeAction, content holds the sections after the claim-by-claim comparison: "## 4. Response plan" and "## 5. Sources and gaps", and the closing sentence.' }
  }
  if (RENDERED_HEADING.test(content)) {
    return { kind: 'refused', text: `Report was not saved. content repeats a section that the report renders from officeAction (a summary, action, objection or claim-by-claim comparison heading). ${MOVE_TO_FIELDS}` }
  }
  return { kind: 'structured', findings: parsed.data, body: renderOfficeAction(parsed.data, content) }
}

/**
 * The path of a field as the model writes it, for example `officeAction.objections[1].claims[0]`.
 * @param path - the zod issue path.
 * @returns the path text.
 */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((joined, key) => typeof key === 'number' ? `${joined}[${String(key)}]` : `${joined}.${String(key)}`, 'officeAction')
}

/**
 * One table cell: a pipe is escaped and a line break becomes a space, so the cell stays in its row.
 * @param value - the cell text.
 * @returns the cell.
 */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim()
}

/**
 * One table.
 * @param head - the header cells.
 * @param rows - the rows.
 * @returns the table lines.
 */
function table(head: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)]
}

/**
 * One labelled field of an objection block; the lines after the first keep the list item.
 * @param label - the field label.
 * @param value - the value.
 * @returns the list item.
 */
function field(label: string, value: string): string {
  const trimmed = value.trim()
  return trimmed === '' ? `- **${label}:**` : `- **${label}:** ${trimmed.replace(/\r?\n/g, '\n  ')}`
}

function objectionBlock(objection: Objection): string[] {
  return [
    `### Objection ${objection.id}: ${cell(objection.title)}`,
    '',
    field('Ground', objection.ground),
    field('Legal basis', objection.legalBasis),
    field('Claims hit', objection.claims.length === 0 ? 'none' : objection.claims.join(', ')),
    field('Examiner\'s reasoning', objection.reasoning),
    field('Source of the objection', objection.source),
    field('Cited documents', objection.citations.length === 0 ? 'none' : ''),
    ...objection.citations.length === 0 ? [] : [
      '',
      ...table(['Document', 'Role', 'Passage the examiner relied on', 'What the passage says', 'Source anchor'],
        objection.citations.map(citation => [citation.document, citation.role, citation.passage, citation.says, citation.anchor])),
      '',
    ],
    field('Assessment', objection.assessment),
    field('Options', objection.options.map(option => option.text.trim() === '' ? option.label : `${option.label} (${option.text.trim()})`).join('; ')),
    field('Reply must address', objection.replyMustAddress),
    field('Confidence and gaps', objection.confidence),
    field('Sources', objection.sources),
    '',
  ]
}

function claimTable(comparison: ClaimTable): string[] {
  return [
    `**${cell(comparison.heading)}**`,
    '',
    ...comparison.interpretation.trim() === '' ? [] : [comparison.interpretation.trim(), ''],
    ...table(['Element (verbatim)', 'Examiner says (OA page)', 'Cited passage says (quote, passage, anchor)', 'Assessment'],
      comparison.rows.map(row => [row.element, row.examiner, row.cited, row.assessment])),
    '',
    ...comparison.arrangement.trim() === '' ? [] : [comparison.arrangement.trim(), ''],
  ]
}

/**
 * The report body of an analysis: sections 0 to 3 from the findings, then the model's content.
 * @param findings - the valid `officeAction` value.
 * @param content - the sections after the claim-by-claim comparison.
 * @returns the body.
 */
export function renderOfficeAction(findings: OfficeActionFindings, content: string): string {
  return [
    '## 0. Summary',
    '',
    findings.summary.trim(),
    '',
    '## 1. Action',
    '',
    ...table(['Field', 'Value', 'Source'], findings.action.map(row => [row.field, row.value, row.source])),
    '',
    '## 2. Objections',
    '',
    ...findings.objections.flatMap(objectionBlock),
    '## 3. Claim-by-claim comparison',
    '',
    ...findings.comparison.length === 0 ? ['No claim table: no objection hits an independent claim.', ''] : findings.comparison.flatMap(claimTable),
    ...findings.dependentClaims.trim() === '' ? [] : [findings.dependentClaims.trim(), ''],
    content.trim(),
  ].join('\n')
}
