/**
 * The bench of the drafting-tool and gate specs: the six deliverable tools
 * registered the way `apply` registers them, over the REAL local filesystem in
 * a temp directory, with the gate seams replaced by programmable fakes (the
 * question-card answerer, the approval decider and the command registry), so
 * a spec drives "yes", "Not yet", an abort, a delegated caller or a missing
 * answerer without a Web client.
 */

import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import {
  ConfirmedMarkets, exportDraftDocxTool, forgetRefusals, inventorQuestionsTool, PatentLedger, PresentQueue, registerDeliverableTools,
  registerGateCommands,
  registerPresent, removeClaimTool, startApplicationDraftTool, validateDraftTool, writePatentResultsTool, NO_LLM_JUDGE, type GateSeams,
} from '../src/index.ts'

/** The text of a model-facing content block, or the block's type when it carries no text. */
export function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : String(block?.type)
}

/** A `UserQuestionError` as the service throws it: an Error with a `code`. */
export function questionError(code: 'ASK_ABORTED' | 'DELEGATED_CALLER' | 'NO_PROVIDER' | 'CALLER_NOT_LIVE'): Error {
  return Object.assign(new Error(`fake user-questions: ${code}`), { name: 'UserQuestionError', code })
}

/** The programmable gate seams of a bench. */
export class FakeSeams implements GateSeams {
  /** Every card asked, in order. */
  readonly asked: AskUserQuestionRequest[] = []
  /** Every approval requested, in order. */
  readonly approvals: ApprovalRequest[] = []
  /** The answerer; `undefined` means no `dsh-user-questions` is composed. */
  answerer: ((request: AskUserQuestionRequest) => AskUserQuestionAnswer | Error) | undefined
  /** The approval decider; `undefined` means no `dsh-user-approval` is composed. */
  decider: ((request: ApprovalRequest) => ApprovalOutcome) | undefined
  /** The session's approval policy. */
  policy: 'ask' | 'never' | undefined
  readonly logged: string[] = []
  readonly now = () => new Date('2026-10-23T12:00:00.000Z')

  ask = () => {
    const { answerer } = this
    if (answerer === undefined) return undefined
    return (request: AskUserQuestionRequest) => {
      this.asked.push(request)
      const answer = answerer(request)
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
    }
  }

  approve = () => {
    const { decider } = this
    if (decider === undefined) return undefined
    return (request: ApprovalRequest) => {
      this.approvals.push(request)
      return Promise.resolve(decider(request))
    }
  }

  approvalPolicy = () => this.policy

  info = (message: string) => { this.logged.push(message) }

  /** Answer every card by picking the given option labels (and a custom text for an optionless question). */
  pick(labels: readonly string[], custom?: string): void {
    this.answerer = request => ({
      answers: request.questions.map((question) => {
        const options = question.options ?? []
        if (!options.length) return { id: question.id, selected: [], ...(custom === undefined ? {} : { custom }) }
        const wanted = question.multiSelect ? labels : labels.slice(0, 1)
        return { id: question.id, selected: wanted.filter(label => options.some(option => option.label === label)) }
      }),
    })
  }

  /** Skip every question of every card. */
  skip(): void {
    this.answerer = request => ({ answers: request.questions.map(question => ({ id: question.id, selected: [] })) })
  }

  /** Reject every card with the given code. */
  fail(code: 'ASK_ABORTED' | 'DELEGATED_CALLER' | 'NO_PROVIDER' | 'CALLER_NOT_LIVE'): void {
    this.answerer = () => questionError(code)
  }
}

/** A command registry that keeps the definitions, so a spec runs a handler the way the dispatching UI would. */
export class FakeCommands {
  readonly definitions = new Map<string, CommandDefinition>()
  register(definition: CommandDefinition): () => void {
    if (this.definitions.has(definition.name)) throw new Error(`command "${definition.name}" is already registered`)
    this.definitions.set(definition.name, definition)
    return () => { this.definitions.delete(definition.name) }
  }

  /** Run `/<line>` as the UI would: the handler with the raw input after the name. */
  async run(agent: Agent, line: string): Promise<CommandResult | undefined> {
    const match = /^\/([a-z][a-z0-9_-]*)(?<rest>.*)$/su.exec(line)
    const definition = match ? this.definitions.get(match[1] ?? '') : undefined
    if (!definition) return undefined
    const invocation: CommandInvocation = {
      commandId: `cmd-${String(this.definitions.size)}` as CommandInvocation['commandId'],
      agent,
      rawInput: match?.groups?.['rest'] ?? '',
      attachments: [],
      signal: new AbortController().signal,
    }
    return definition.handler(invocation)
  }
}

let benches = 0

/**
 * A bench over a fresh temp directory with every deliverable tool registered.
 * @returns the bench.
 */
export async function gateBench() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-gates-')))
  forgetRefusals()
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  const seams = new FakeSeams()
  const commands = new FakeCommands()
  const present = new PresentQueue()
  const ledger = new PatentLedger()
  const log = { warn: (message: string) => { seams.logged.push(message) }, info: (message: string) => { seams.logged.push(message) } }
  const deps = { present, gates: seams, now: seams.now, ...log }
  registerPresent(ctx, present, () => 1)
  registerDeliverableTools(ctx, [
    writePatentResultsTool(ctx, {
      ledger, judge: () => NO_LLM_JUDGE, present, gates: seams, markets: new ConfirmedMarkets(), secondRead: () => 'off', now: seams.now, ...log,
    }),
    startApplicationDraftTool(ctx, deps),
    validateDraftTool(ctx, deps),
    exportDraftDocxTool(ctx, deps),
    inventorQuestionsTool(ctx, deps),
    removeClaimTool(ctx, deps),
  ])
  const disposeCommands = registerGateCommands(ctx, { registry: commands, now: seams.now, info: log.info })
  const session = ctx.sessions.create(SessionId(`gates-${String(++benches)}`), { meta: { cwd: dir } })
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    model: unsupportedModel(),
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx,
    send: () => {},
    followup: () => {},
    steer: (_message: UserMessage) => {},
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  let calls = 0
  const call = async (name: string, args: unknown) => {
    const callId = ToolCallId(`call-${String(++calls)}`)
    const result = await executeModelToolFixture(ctx, { callId, name, arguments: args, signal: new AbortController().signal, agent })
    return textOf(result.content[0])
  }
  const read = (path: string) => readFile(join(dir, path), 'utf8')
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), text)
  }
  const exists = (path: string) => readFile(join(dir, path)).then(() => true, () => false)
  /** Changes a file the way an edit in an editor does: the rest of the file, frontmatter included, stays. */
  const edit = async (path: string, from: string, to: string) => write(path, (await read(path)).replace(from, to))
  const files = async (folder: string) => (await readdir(join(dir, folder)).catch(() => [] as string[])).sort()
  const tools = {
    start: (matter = 'hinge') => call('start_application_draft', { matter }),
    validate: (advisory?: { message: string; line?: number; claim?: number }[], matter = 'hinge') => call('validate_draft', { matter, ...(advisory ? { advisory } : {}) }),
    exportDocx: (matter = 'hinge') => call('export_draft_docx', { matter }),
    removeClaim: (claim: number, matter = 'hinge') => call('remove_claim', { matter, claim }),
    inventor: (action: 'send' | 'import', file?: string) => call('inventor_questions', { matter: 'hinge', action, ...(file ? { file } : {}) }),
    save: (content: string, extra: Record<string, string> = {}, filePath = 'drafting/hinge/draft-application.md') => call('write_patent_results', { filePath, content, template: 'draft-application', ...extra }),
    saveOutline: (content: string, filePath = 'drafting/hinge/draft-outline.md') => call('write_patent_results', { filePath, content, template: 'draft-outline' }),
  }
  /** The presented files of the Session: `[relative path, description]` per event. */
  const presented = (target: Session = session) => target.snapshotEvents().flatMap(event => event.type === 'deliverables/presented'
    ? [event.data.files.map(file => [relative(dir, file.path).split(sep).join('/'), file.description])]
    : [])
  const dispose = () => rm(dir, { recursive: true, force: true })
  return { dir, ctx, session, agent, seams, commands, disposeCommands, call, tools, read, write, edit, exists, files, presented, dispose }
}

/** The bench with the given files written first. */
export async function benchWith(files: Record<string, string>) {
  const bench = await gateBench()
  for (const [path, text] of Object.entries(files)) await bench.write(path, text)
  return bench
}
