/**
 * The FlowLeap Office tools: `office_letter_from_template`, `office_amend_claims`, `office_claim_chart`,
 * `office_read`, and `office_review_changes`, the consumers of `ctx.flowleapOffice`. They read inputs from the Session
 * working directory and firm templates from the configured template folder, write each new file into the working
 * directory, and show the written files on the delivery card through `deliverables/presented`. The
 * `@deepseek-ai/dsh-flowleap-office/officecli` row provides the service.
 *
 * See packages/host/flowleap-office/README.md.
 * @module @deepseek-ai/dsh-flowleap-office
 */

import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import { amendClaimsTool } from './tools/amend-claims.ts'
import { claimChartTool } from './tools/claim-chart.ts'
import type { OfficeToolDeps } from './tools/deps.ts'
import { letterTool } from './tools/letter.ts'
import { readTool } from './tools/read.ts'
import { reviewChangesTool } from './tools/review-changes.ts'
import { OfficeDeliveries } from './tools/workspace.ts'
import type {} from './types.ts'

export { FlowleapOfficeError } from './error.ts'
export { claimOutcome, joinSegments, redlineParagraph } from './redline.ts'
export type { ClaimChange, ClaimOutcome } from './redline.ts'
export { AMEND_CLAIMS_NAME, amendClaimsTool } from './tools/amend-claims.ts'
export { CLAIM_CHART_NAME, claimChartTool } from './tools/claim-chart.ts'
export type { OfficeToolDeps } from './tools/deps.ts'
export { LETTER_NAME, letterTool } from './tools/letter.ts'
export { READ_NAME, readTool, readValue, renderRead } from './tools/read.ts'
export type { OfficeReadValue } from './tools/read.ts'
export { REVIEW_CHANGES_NAME, reviewChangesTool, reviewSelection } from './tools/review-changes.ts'
export { callWorkspace, OfficeDeliveries, outputTarget, parseArgs, readInput, readTemplate, writeOutput } from './tools/workspace.ts'
export type { CallWorkspace } from './tools/workspace.ts'
export type {
  AmendRequest, AmendResult, ChartRequest, FlowleapOffice, FlowleapOfficeErrorCode, LetterBlock, LetterRequest, OfficeFormat,
  OfficeReadout, OutlineHeading, ReadRequest, RedlineParagraph, RedlineSegment, ReviewRequest, ReviewResult, ReviewSelection,
  SegmentKind, SheetSummary, TrackedRevision,
} from './types.ts'

/** Cordis plugin name. */
export const name = 'flowleap-office'

/** The Office service, the tool registry, the filesystem, the live Agents, and the Session working directory. */
export const inject = ['flowleapOffice', 'tools', 'fs', 'agents', 'workingDirectory']

/** Plugin config. */
export interface Config {
  /** Absolute folder of the firm's `.docx` templates; the firm administrator fills it, the model only names a file. */
  templatesDir: string
  /** Author of tracked changes when a call names none. */
  revisionAuthor: string
  /** Most characters of an `office_read` result: the document text and the lines of headings, tracked changes, and sheets. */
  maxReadChars: number
  /** Largest input document or template, in bytes. */
  maxInputBytes: number
}

/** Runtime schema for the row. */
export const Config: z<Config> = z.object({
  templatesDir: z.string().required(),
  revisionAuthor: z.string().min(1).default('FlowLeap'),
  maxReadChars: z.number().step(1).min(1000).max(1_000_000).default(40_000),
  maxInputBytes: z.number().step(1).min(1024).max(256 * 1024 * 1024).default(32 * 1024 * 1024),
})

/**
 * Check the template folder and register the five tools and the delivery listener.
 * @param ctx - the mounting context, carrying `flowleapOffice`, `tools`, `fs`, `agents`, and `workingDirectory`.
 * @param config - template folder, default author, and bounds.
 * @throws when `templatesDir` is not an absolute path of an existing folder.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!isAbsolute(config.templatesDir)) throw new Error(`flowleap-office: templatesDir must be absolute, got "${config.templatesDir}"`)
  const info = await stat(config.templatesDir).catch(() => undefined)
  if (info?.isDirectory() !== true) throw new Error(`flowleap-office: templatesDir ${config.templatesDir} is not a folder`)
  const deliveries = new OfficeDeliveries()
  deliveries.register(ctx)
  const deps: OfficeToolDeps = {
    office: ctx.flowleapOffice,
    deliveries,
    templatesDir: config.templatesDir,
    revisionAuthor: config.revisionAuthor.trim(),
    maxReadChars: config.maxReadChars,
    maxInputBytes: config.maxInputBytes,
    now: () => new Date(),
  }
  for (const tool of [letterTool, amendClaimsTool, claimChartTool, readTool, reviewChangesTool]) {
    const definition = tool(ctx, deps)
    ctx.effect(() => ctx.tools.register(definition), `flowleap-office: ${definition.name}`)
  }
}
