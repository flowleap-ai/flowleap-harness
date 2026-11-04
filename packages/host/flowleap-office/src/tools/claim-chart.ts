/** The `office_claim_chart` tool: an Excel claim chart. @module */

import type { Context } from '@deepseek-ai/cordis'
import { DELIVERED_LINE } from '@deepseek-ai/dsh-flowleap-deliverables'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { OfficeToolDeps } from './deps.ts'
import { callWorkspace, outputTarget, parseArgs, writeOutput } from './workspace.ts'

/** Tool name. */
export const CLAIM_CHART_NAME = 'office_claim_chart'

const Args = z.object({
  output: z.string().min(1),
  sheet: z.string().min(1),
  header: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
})

/**
 * Build `office_claim_chart`.
 * @param ctx - context with `fs` and `workingDirectory`.
 * @param deps - the Office service and settings.
 * @returns the unregistered definition.
 */
export function claimChartTool(ctx: Context, deps: OfficeToolDeps): ToolDefinition {
  return defineTool({
    name: CLAIM_CHART_NAME,
    description: 'Write an Excel claim chart as a new file: one row per claim feature, the first column the feature number (for example "1.1"), '
      + 'then the feature text and one column per prior-art document or assessment. Every cell is text, so "1.10" stays "1.10" and decimal commas stay in their cell. '
      + 'The chart has a bold header, borders, wrapped text, a filter, a frozen header row, and a landscape print one page wide. '
      + 'Values must not start with http:// or https://.',
    parameters: {
      output: { type: 'string', required: true, description: 'New .xlsx path relative to the working directory.' },
      sheet: { type: 'string', required: true, description: 'Sheet name, for example "Claim 1"; at most 31 characters, none of : \\ / ? * [ ].' },
      header: { type: 'array', required: true, items: { type: 'string' }, description: 'Header cells, for example ["Feature", "Claim 1", "D1", "D2"].' },
      rows: {
        type: 'array', required: true, items: { type: 'array', items: { type: 'string' } },
        description: 'One row per feature with as many cells as the header; the first cell is the feature number as text.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { file: { type: 'string', required: true }, rows: { type: 'integer', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: `Wrote the claim chart ${value.file} with ${String(value.rows)} feature row(s).\n${DELIVERED_LINE}` }],
    },
    async execute(raw, exec) {
      const args = parseArgs(Args, raw)
      const workspace = await callWorkspace(ctx, exec)
      const target = await outputTarget(ctx, workspace, args.output, '.xlsx', exec.signal)
      const bytes = await deps.office.claimChart({ sheet: args.sheet, header: args.header, rows: args.rows }, exec.signal)
      const path = await writeOutput(ctx, workspace, target, bytes, exec.signal)
      deps.deliveries.queue(exec, [{ path, description: 'Claim chart (Excel)' }])
      return { file: args.output, rows: args.rows.length }
    },
    presentCall: args => ({ card: 'generic', title: 'Write claim chart', kind: 'edit', locations: [{ path: args.output }] }),
  })
}
