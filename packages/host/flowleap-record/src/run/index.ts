/**
 * The run tools of a Ticket run, the second Consumer of the `flowleapRecord` seam: `record_propose_report` proposes a
 * letter (the client report or the draft reply to the office) with its statements and their exact quotes,
 * `record_propose_reading` proposes the reading of an office letter (the objections of the examiner and the cited
 * documents, with their exact quotes), and `record_finish_run` ends the run with the deadline summary. The run reads
 * the letter with `record_read_document_text` of the main entry, which a chat also has.
 * No tool decides, files, sends, or pays; the Firm Record refuses a decision from a runtime.
 * @module @deepseek-ai/dsh-flowleap-record/run
 */

import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '../types.ts'
import { finishRunTool } from './finish-run.ts'
import { proposeReadingTool } from './propose-reading.ts'
import { proposeReportTool } from './propose-report.ts'

export { FINISH_RUN_NAME, finishRunTool } from './finish-run.ts'
export type { FinishRunResult } from './finish-run.ts'
export { PROPOSE_READING_NAME, proposeReadingTool } from './propose-reading.ts'
export type { ProposeReadingResult } from './propose-reading.ts'
export { MAX_REPORT_BYTES, PROPOSE_REPORT_NAME, proposeReportTool } from './propose-report.ts'
export type { ProposeReportResult } from './propose-report.ts'
export { READ_DOCUMENT_TEXT_NAME, readDocumentTextTool } from './read-document-text.ts'
export type { ReadDocumentTextResult } from './read-document-text.ts'
export { runRefusal } from './refusal.ts'
export type { RunCommandError } from './refusal.ts'

/** Cordis plugin name. */
export const name = 'flowleap-record-run'

/** The seam, the tool registry, the filesystem, and the Session working directory. */
export const inject = ['flowleapRecord', 'tools', 'fs', 'workingDirectory']

/** Plugin config. */
export interface Config {
  /**
   * Absolute folder of the firm's `.docx` templates, the folder of the Office tools; the report names its template
   * version as the SHA-256 of the template file there.
   */
  templatesDir: string
}

/** Config schema: the template folder is required. */
export const Config: z<Config> = z.object({
  templatesDir: z.string().required(),
})

/**
 * Register the three run tools; disposing the plugin removes them.
 * @param ctx - the mounting context.
 * @param config - the template folder.
 * @throws when the template folder is not an absolute path.
 */
export function apply(ctx: Context, config: Config): void {
  if (!isAbsolute(config.templatesDir)) {
    throw new Error(`flowleap-record-run: templatesDir must be an absolute path, got ${JSON.stringify(config.templatesDir)}`)
  }
  ctx.effect(() => ctx.tools.register(proposeReportTool(ctx, config.templatesDir)), 'flowleap-record-run: record_propose_report')
  ctx.effect(() => ctx.tools.register(proposeReadingTool(ctx)), 'flowleap-record-run: record_propose_reading')
  ctx.effect(() => ctx.tools.register(finishRunTool(ctx)), 'flowleap-record-run: record_finish_run')
}
