/**
 * The `office_amend_claims` tool: a new Word file with the claim amendments as tracked changes, from the claim texts
 * before and after. The word-level difference is computed in code; the tool never edits an existing file.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { DELIVERED_LINE } from '@deepseek-ai/dsh-flowleap-deliverables'
import type { PresentedFile } from '@deepseek-ai/dsh-tool-present/types'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { toolErrorMessage } from '@deepseek-ai/dsh-tools/pipeline'
import { z } from 'zod'
import { claimOutcome, redlineParagraph, type ClaimOutcome } from '../redline.ts'
import type { OfficeToolDeps } from './deps.ts'
import { callWorkspace, outputTarget, parseArgs, readTemplate, writeOutput } from './workspace.ts'

/** Tool name. */
export const AMEND_CLAIMS_NAME = 'office_amend_claims'

const Claim = z.object({
  number: z.string().regex(/^\S+$/u, 'a claim number has no spaces'),
  before: z.string().min(1).optional(),
  after: z.string().min(1).optional(),
}).strict().refine(claim => claim.before !== undefined || claim.after !== undefined, 'a claim needs before, after, or both')

const Args = z.object({
  claims: z.array(Claim).min(1),
  output: z.string().min(1),
  clean_output: z.string().min(1).optional(),
  heading: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
  author: z.string().trim().min(1).optional(),
})

/**
 * Whether two targets can name one file. The comparison ignores letter case and Unicode normalization, because a
 * case-insensitive volume maps `Claims.docx` and `claims.docx` to one file.
 * @param ctx - context with `fs`.
 * @param a - one target.
 * @param b - the other target.
 * @returns true when the process paths are equal after case folding.
 */
function sameFile(ctx: Context, a: FsTarget, b: FsTarget): boolean {
  const key = (target: FsTarget) => ctx.fs.processPath(target).normalize('NFC').toLowerCase()
  return key(a) === key(b)
}

/**
 * Build `office_amend_claims`.
 * @param ctx - context with `fs` and `workingDirectory`.
 * @param deps - the Office service and settings.
 * @returns the unregistered definition.
 */
export function amendClaimsTool(ctx: Context, deps: OfficeToolDeps): ToolDefinition {
  return defineTool({
    name: AMEND_CLAIMS_NAME,
    description: 'Write the claim amendments as a new Word file with tracked changes, as the office expects a marked copy. '
      + 'Give each claim in order with its number and its text before and after the amendment, without the number: '
      + 'only before for a deleted claim, only after for a new claim, both for an amended or unchanged claim. '
      + 'The tool computes the word-level changes; each insertion and deletion carries the author and the date. '
      + 'clean_output also writes a clean copy with the texts after the amendment. Values must not start with http:// or https://.',
    parameters: {
      claims: {
        type: 'array', required: true, description: 'Claims in order.',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            number: { type: 'string', required: true, description: 'Claim number, for example "1".' },
            before: { type: 'string', description: 'Text before the amendment, without the number.' },
            after: { type: 'string', description: 'Text after the amendment, without the number.' },
          },
        },
      },
      output: { type: 'string', required: true, description: 'New .docx path of the marked copy, relative to the working directory.' },
      clean_output: { type: 'string', description: 'New .docx path of the clean copy; omit for none.' },
      heading: { type: 'string', description: 'Heading before the claims, for example "Claims"; omit for none.' },
      template: { type: 'string', description: 'File name of a firm template; omit for a blank document.' },
      author: { type: 'string', description: 'Author of the tracked changes, for example the attorney; omit for the firm default.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          marked: { type: 'string', required: true },
          clean: { type: 'string' },
          author: { type: 'string', required: true },
          claims: {
            type: 'object', required: true, additionalProperties: false,
            properties: {
              amended: { type: 'integer', required: true },
              added: { type: 'integer', required: true },
              deleted: { type: 'integer', required: true },
              unchanged: { type: 'integer', required: true },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Wrote the marked copy ${value.marked}${value.clean === undefined ? '' : ` and the clean copy ${value.clean}`}. `
          + `Tracked changes by ${value.author}: ${String(value.claims.amended)} claim(s) amended, ${String(value.claims.added)} added, `
          + `${String(value.claims.deleted)} deleted, ${String(value.claims.unchanged)} unchanged.\n${DELIVERED_LINE}`,
      }],
    },
    async execute(raw, exec) {
      const args = parseArgs(Args, raw)
      const workspace = await callWorkspace(ctx, exec)
      const markedTarget = await outputTarget(ctx, workspace, args.output, '.docx', exec.signal)
      const cleanTarget = args.clean_output === undefined ? undefined : await outputTarget(ctx, workspace, args.clean_output, '.docx', exec.signal)
      if (cleanTarget !== undefined && sameFile(ctx, markedTarget, cleanTarget)) throw new Error('output and clean_output must be different files.')
      const template = args.template === undefined ? undefined : await readTemplate(deps.templatesDir, args.template, deps.maxInputBytes)
      const author = args.author ?? deps.revisionAuthor
      const result = await deps.office.amendClaims({
        ...(template === undefined ? {} : { template }),
        ...(args.heading === undefined ? {} : { heading: args.heading }),
        paragraphs: args.claims.map(redlineParagraph),
        author,
        date: deps.now().toISOString(),
        clean: cleanTarget !== undefined,
      }, exec.signal)
      const markedPath = await writeOutput(ctx, workspace, markedTarget, result.marked, exec.signal)
      const files: PresentedFile[] = [{ path: markedPath, description: 'Claims with tracked changes (Word)' }]
      if (cleanTarget !== undefined && result.clean !== undefined) {
        const cleanPath = await writeOutput(ctx, workspace, cleanTarget, result.clean, exec.signal).catch((error: unknown) => {
          throw new Error(`${toolErrorMessage(error)} The marked copy was written at ${markedPath}.`, { cause: error })
        })
        files.push({ path: cleanPath, description: 'Clean claims (Word)' })
      }
      deps.deliveries.queue(exec, files)
      const counts: Record<ClaimOutcome, number> = { amended: 0, added: 0, deleted: 0, unchanged: 0 }
      for (const claim of args.claims) counts[claimOutcome(claim)] += 1
      return { marked: args.output, ...(args.clean_output === undefined ? {} : { clean: args.clean_output }), author, claims: counts }
    },
    presentCall: args => ({
      card: 'generic', title: 'Write claim amendments', kind: 'edit',
      locations: [{ path: args.output }, ...(args.clean_output === undefined ? [] : [{ path: args.clean_output }])],
    }),
  })
}
