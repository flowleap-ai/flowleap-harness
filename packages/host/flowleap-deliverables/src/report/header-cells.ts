/**
 * The header cells of a templated report that the save itself can fill. The
 * IDE's templates leave a few `| Field | _(to be completed)_ |` cells for the
 * practitioner, who fills them in the editor after the save; this harness has
 * no editor, so a cell the request already answers must be filled by the
 * save or the save is refused. The template copy stays the IDE's: the cell is
 * filled in the rendered document, and the rule lives here (S5 acceptance
 * defect B, 2026-10-25).
 * @module
 */

import type { PatentReportTemplate } from './templates.ts'

/** The IDE's placeholder for a practitioner-owned field (`FIELD` in `templates.ts`, not exported). */
export const PLACEHOLDER_CELL = '_(to be completed)_'

/** The `write_patent_results` inputs that fill a header cell. */
export type HeaderCellInput = 'jurisdictions'

/** One header cell a template renders as a placeholder that the save must fill. */
export interface RequiredHeaderCell {
  /** The cell's label, as the field table prints it. */
  readonly label: string
  /** The `write_patent_results` input that fills it. */
  readonly input: HeaderCellInput
  /** What to write there, for the refusal. */
  readonly hint: string
}

/**
 * The cells each template must not ship as placeholders: an FTO memo clears named markets, so its
 * `Jurisdiction(s)` row is the save's to fill (with the user's answer to the markets card, see
 * `markets.ts`). Every other placeholder cell (a matter reference the user never gave, an
 * examiner, an art unit) stays the practitioner's.
 */
export const REQUIRED_HEADER_CELLS: Partial<Record<PatentReportTemplate, readonly RequiredHeaderCell[]>> = {
  'fto-memo': [{ label: 'Jurisdiction(s)', input: 'jurisdictions', hint: 'the markets the memo clears, for example `DE, FR, US`' }],
}

/** The `| label | value |` row of a field table, with the characters of the label escaped for a pattern. */
function cellRow(label: string, value: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\| ${escaped} \\| ${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|$`, 'm')
}

/**
 * Fill one placeholder cell of a rendered report with a value; a document without that placeholder
 * row, or an empty value, is returned unchanged.
 * @param document - the rendered report.
 * @param label - the cell's label.
 * @param value - the value the save knows.
 * @returns the document with the cell filled.
 */
export function fillHeaderCell(document: string, label: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return document
  return document.replace(cellRow(label, PLACEHOLDER_CELL), `| ${label} | ${trimmed.replace(/\|/g, '/').replace(/\s+/g, ' ')} |`)
}

/**
 * The required cells of a template that the rendered document still shows as placeholders.
 * @param document - the rendered report, after {@link fillHeaderCell}.
 * @param template - the report template.
 * @returns the cells still unfilled, in template order.
 */
export function unfilledHeaderCells(document: string, template: PatentReportTemplate | undefined): readonly RequiredHeaderCell[] {
  const required = template === undefined ? undefined : REQUIRED_HEADER_CELLS[template]
  if (required === undefined) return []
  return required.filter(cell => cellRow(cell.label, PLACEHOLDER_CELL).test(document))
}

/**
 * The refusal that names each unfilled cell and what to write there.
 * @param template - the report template.
 * @param cells - the cells still unfilled.
 * @returns the refusal text, the model's instruction.
 */
export function unfilledHeaderCellsRefusal(template: PatentReportTemplate, cells: readonly RequiredHeaderCell[]): string {
  const lines = cells.map(cell => `The ${template} header cell \`${cell.label}\` is still \`${PLACEHOLDER_CELL}\`. Set \`${cell.input}\` to ${cell.hint}.`)
  return `Report was not saved. ${lines.join(' ')} Retry with the same content and the field${cells.length === 1 ? '' : 's'} set.`
}
