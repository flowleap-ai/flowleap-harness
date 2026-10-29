/**
 * The `inventor_questions` tool: the IDE's `inventorQuestionsTool.ts`
 * (SOURCE.json) on the dsh seams. `send` writes `inventor-questions.docx` from
 * `inventor-answers.md`, one table row per open question with an empty answer
 * cell, and presents it; `import` reads the answered `.docx` (or a `.md` in the
 * format of `inventor-answers.md`) and copies each answer into the empty
 * current `**Answer:**` slot of its question, never over a filled slot. Code
 * copies the inventor's own words; the model applies them to the draft after
 * this. The input schema is the IDE's.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { buildInventorQuestionsDocx, readInventorQuestionsDocx } from '../docx/inventor-questions.ts'
import { currentAnswer, fillInventorAnswers, openInventorQuestions, parseInventorAnswers } from '../drafting/inventor-answers.ts'
import type { DraftingWorkspace } from '../drafting/workspace.ts'
import { delivered, draftingToolDefinition, matterArgument, refused, type DraftingToolDependencies, type DraftingToolValue } from './shell.ts'

/** The tool name, shared with the IDE and the exported Patent Agent prompt. */
export const INVENTOR_QUESTIONS_NAME = 'inventor_questions'

/** What the model reads about the tool. */
export const INVENTOR_QUESTIONS_DESCRIPTION = 'The Inventor Questions document of one matter folder drafting/<matter>/ (application-drafting skill, Step 5). '
  + 'action "send": when the attorney asks to send the questions to the inventor, it writes drafting/<matter>/inventor-questions.docx from inventor-answers.md: a heading, one sentence on what the inventor does, and one table with a row per open question (a question whose current answer is empty) with the question, where the answer goes and an empty answer cell; the file is delivered to the user, do not call present for it. It refuses while the existing inventor-questions.docx holds answers that are not imported yet. '
  + 'action "import": when the attorney asks to apply the answers and the inventor answered in a file, call it first with that file (default drafting/<matter>/inventor-questions.docx; also a .md file in the format of inventor-answers.md, in the matter folder). Code copies each answer, in the inventor\'s words, into the empty answer slot of its question in inventor-answers.md and never writes over a filled answer; the result names the questions filled, the questions not changed and the ids it does not know. Then apply the answers to the draft as the skill says. Never write an answer into inventor-answers.md yourself.'

/** The IDE's input schema, verbatim. */
export const INVENTOR_QUESTIONS_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    matter: {
      type: 'string',
      description: 'The matter folder name under drafting/, e.g. \'hinge\'.',
    },
    action: {
      type: 'string',
      enum: ['send', 'import'],
      description: '"send" writes inventor-questions.docx for the inventor; "import" copies the inventor\'s answers into inventor-answers.md.',
    },
    file: {
      type: 'string',
      description: 'For "import" only: the workspace-relative path of the answered file in drafting/<matter>/, a .docx or a .md. Default: drafting/<matter>/inventor-questions.docx.',
    },
  },
  required: ['matter', 'action'],
}

/** The model's arguments: the IDE's `IInventorQuestionsParams`. */
export interface InventorQuestionsInput {
  /** The matter folder name under `drafting/`. */
  readonly matter: string
  /** `send` writes the document for the inventor; `import` copies the inventor's answers back. */
  readonly action: 'send' | 'import'
  /** For `import`: the answered file in the matter folder, `.docx` or `.md`; by default `inventor-questions.docx`. */
  readonly file?: string
}

/**
 * Validate the raw arguments; the registry hands them over as parsed JSON and this tool owns its schema.
 * @param args - the model's arguments.
 * @returns the typed input.
 * @throws when `matter`, `action` or `file` is not of its declared shape.
 */
export function parseInventorQuestionsArgs(args: unknown): InventorQuestionsInput {
  const matter = matterArgument(INVENTOR_QUESTIONS_NAME, args)
  const record = args as Record<string, unknown>
  const action = record['action']
  if (action !== 'send' && action !== 'import') { throw new Error(`${INVENTOR_QUESTIONS_NAME}: invalid arguments: action must be "send" or "import"`) }
  const file = record['file']
  if (file !== undefined && file !== null && typeof file !== 'string') { throw new Error(`${INVENTOR_QUESTIONS_NAME}: invalid arguments: file must be a string`) }
  return { matter, action, ...(typeof file === 'string' ? { file } : {}) }
}

/**
 * Build the `inventor_questions` definition over the mounted `fs` and `workingDirectory` services.
 * @param ctx - a context whose `fs` and `workingDirectory` are active.
 * @param deps - the delivery queue, the loggers and the clock.
 * @returns the unregistered dsh definition.
 */
export function inventorQuestionsTool(ctx: Context, deps: DraftingToolDependencies): ToolDefinition {

  /** The question ids that an answered document at `path` would fill now: answers a new document would replace. */
  const notImported = async (workspace: DraftingWorkspace, answers: string, path: string): Promise<readonly string[]> => {
    const bytes = await workspace.readBytes(path)
    if (!bytes) {
      return []
    }
    try {
      return fillInventorAnswers(answers, await readInventorQuestionsDocx(bytes)).filled
    } catch {
      // Not a readable Word file: nothing to keep.
      return []
    }
  }

  const send = async (workspace: DraftingWorkspace, answers: string, refusal: string, exec: ToolRunContext): Promise<DraftingToolValue> => {
    const { folder } = workspace
    const open = openInventorQuestions(answers)
    if (!open.length) {
      return refused(`${refusal} No Inventor Question in ${folder.inventorAnswers} has an empty answer: there is nothing to send. ${await workspace.checklistLine(false)}`)
    }
    const pending = await notImported(workspace, answers, folder.inventorQuestionsDocx)
    if (pending.length) {
      return refused(await workspace.refusal(refusal, `${folder.inventorQuestionsDocx} has answers that are not in ${folder.inventorAnswers} yet (${pending.join(', ')}). Import them first (action "import"), so that a new document does not replace them.`))
    }
    await workspace.write(folder.inventorQuestionsDocx, await buildInventorQuestionsDocx(folder.matter, open))
    deps.info(`flowleap-deliverables: wrote ${folder.inventorQuestionsDocx} (${String(open.length)} open question(s))`)
    const text = `Wrote ${folder.inventorQuestionsDocx}: a table of ${open.length} open Inventor Question(s) (${open.map(question => question.id).join(', ')}), each with an empty answer cell. The attorney sends the file to the inventor. The inventor writes each answer in the "Your answer" column and sends the file back; the attorney puts it in ${folder.folder}/ and asks to apply the answers. ${await workspace.checklistLine(false)}`
    return delivered(deps, exec, workspace, [{ path: folder.inventorQuestionsDocx, description: 'Inventor questions (Word)' }], text)
  }

  const importAnswers = async (
    workspace: DraftingWorkspace, answers: string, file: string | undefined, refusal: string, exec: ToolRunContext,
  ): Promise<DraftingToolValue> => {
    const { folder } = workspace
    const path = file?.trim().replace(/\\/g, '/') || folder.inventorQuestionsDocx
    const name = path.startsWith(`${folder.folder}/`) ? path.slice(folder.folder.length + 1) : ''
    if (!/^[^/]+\.(?:docx|md)$/i.test(name) || name.startsWith('.') || path === folder.inventorAnswers) {
      return refused(await workspace.refusal(refusal, `"${path}" is not an answered file of the matter. Give a .docx or .md file in ${folder.folder}/ other than ${folder.inventorAnswers}, e.g. ${folder.inventorQuestionsDocx}.`))
    }
    const bytes = await workspace.readBytes(path)
    if (!bytes) {
      return refused(await workspace.refusal(refusal, `${path} does not exist. The attorney puts the inventor's answered file in ${folder.folder}/.`))
    }
    let received: Map<string, string>
    try {
      received = /\.docx$/i.test(path)
        ? await readInventorQuestionsDocx(bytes)
        : new Map(parseInventorAnswers(new TextDecoder().decode(bytes)).map(section => [section.id, currentAnswer(section)]))
    } catch (error) {
      return refused(await workspace.refusal(refusal, `${path} could not be read as a Word file: ${error instanceof Error ? error.message : String(error)}`))
    }
    const fill = fillInventorAnswers(answers, received)
    if (fill.filled.length) {
      await workspace.write(folder.inventorAnswers, fill.text)
    }
    const lines = [
      fill.filled.length
        ? `Copied ${fill.filled.length} answer(s) from ${path} into ${folder.inventorAnswers}, in the inventor's words: ${fill.filled.join(', ')}.`
        : `No answer was copied from ${path}: it has no answer for a question with an empty answer in ${folder.inventorAnswers}.`,
      ...(fill.kept.length ? [`Not changed, because their answer in ${folder.inventorAnswers} is filled already: ${fill.kept.join(', ')}.`] : []),
      ...(fill.unknown.length ? [`Not copied, because ${folder.inventorAnswers} has no such question: ${fill.unknown.join(', ')}.`] : []),
      ...(fill.filled.length ? ['Now apply the answers to the draft (application-drafting skill, Step 5).'] : []),
    ]
    const text = `${lines.join(' ')} ${await workspace.checklistLine(false)}`
    if (!fill.filled.length) {
      return { ok: true, text }
    }
    return delivered(deps, exec, workspace, [{ path: folder.inventorAnswers, description: 'Inventor answers' }], text)
  }

  const execute = async (
    workspace: DraftingWorkspace, exec: ToolRunContext, input: InventorQuestionsInput, refusal: string,
  ): Promise<DraftingToolValue> => {
    const importing = input.action === 'import'
    const answers = await workspace.read(workspace.folder.inventorAnswers)
    if (answers === undefined) {
      return refused(await workspace.refusal(refusal, `${workspace.folder.inventorAnswers} does not exist: the save of a draft with Inventor Questions writes it.`))
    }
    return importing ? importAnswers(workspace, answers, input.file, refusal, exec) : send(workspace, answers, refusal, exec)
  }

  return draftingToolDefinition(ctx, deps, {
    name: INVENTOR_QUESTIONS_NAME,
    description: INVENTOR_QUESTIONS_DESCRIPTION,
    parameters: INVENTOR_QUESTIONS_PARAMETERS,
    parse: parseInventorQuestionsArgs,
    matter: input => input.matter,
    refusal: input => input.action === 'import' ? 'No answer was copied.' : 'The Inventor Questions document was not written.',
    execute,
  })
}
