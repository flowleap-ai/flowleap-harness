/**
 * The second read: one model call per coverage row that claims disclosure,
 * asking whether the recorded passage behind each element actually discloses
 * it. Runs on the session's own logged route through `ctx.llm.prepareCall()`
 * (or the configured `secondReadModel`), at temperature 0, with the IDE's
 * 12-row cap, one network retry and the re-save limit of 2 kept by the writer.
 * It never blocks a save: every failure is caught and returned as a skip the
 * report and the tool result both state. Ported from the judge half of the
 * IDE's `writePatentResultsTool.ts` (see SOURCE.json).
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import type { PatentExecutionSnapshot } from './ledger/types.ts'
import type { PatentCandidateReview } from './report/candidate-review.ts'
import {
  buildSecondReadRequests, notJudgedFigureElements, parseSecondReadVerdicts, secondReadPrompt, summarizeSecondRead,
  type SecondReadOutcome, type SecondReadRequest, type SecondReadResult,
} from './report/second-read.ts'
import { contentText } from './ledger/recorder.ts'
import { STEER_SOURCE_KIND } from './guard/turn-tracker.ts'

/**
 * Coverage rows judged by one second read. A report with more rows is judged only in part; the
 * diagnostic is a sample, not an audit, and a per-row model call is neither free nor instant.
 */
export const SECOND_READ_ROW_LIMIT = 12

/** The pause before the one retry of a judge call that failed on the network (#538). */
export const SECOND_READ_RETRY_DELAY = 500

/** A provider route the judge runs on. */
export interface JudgeRoute {
  readonly provider: string
  readonly model: string
}

/** What the writer asks of the judge. */
export interface SecondReadJudge {
  /**
   * Judge the rows of a report about to be saved.
   * @param review - the flattened review (a Find Better row's two sides as rows).
   * @param snapshot - the session's recorded evidence.
   * @param session - the session whose logged route is the default judge model.
   * @param signal - the writer call's signal.
   * @returns the outcome; never throws.
   */
  judge(
    review: PatentCandidateReview,
    snapshot: PatentExecutionSnapshot,
    session: Session | undefined,
    signal: AbortSignal,
  ): Promise<SecondReadOutcome>
}

/** How the judge is built. */
export interface JudgeOptions {
  /** `provider/model` to judge with; absent means the session's logged route. */
  readonly configuredModel?: string | undefined
  /** Warn sink. */
  readonly warn: (message: string) => void
  /** The retry pause; a test passes a no-op. */
  readonly delay?: (ms: number, signal: AbortSignal) => Promise<void>
}

/**
 * Split `provider/model` at the first slash; a model id may itself contain slashes (`openrouter/anthropic/claude-sonnet-5-5`).
 * @param configured - the configured value.
 * @returns the route, or `undefined` when the value has no provider part.
 */
export function parseJudgeRoute(configured: string | undefined): JudgeRoute | undefined {
  const trimmed = configured?.trim()
  if (!trimmed) return undefined
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) return undefined
  return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) }
}

/** The reason a judge call failed on the network, or undefined when it did not. */
function networkFailure(message: string): string | undefined {
  return /fetch failed|ERR_CONNECTION|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message) ? message : undefined
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason instanceof Error ? signal.reason : new Error('aborted')); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(signal.reason instanceof Error ? signal.reason : new Error('aborted')) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** One judge answer: the text, or the failure message when the stream ended in an error. */
type JudgeAnswer = { readonly text: string } | { readonly failure: string }

/**
 * Build the judge over the mounted `ctx.llm`.
 * @param ctx - a context whose `llm` is active.
 * @param options - the configured model, the warn sink and the retry pause.
 * @returns the judge.
 */
export function createJudge(ctx: Context, options: JudgeOptions): SecondReadJudge {
  const delay = options.delay ?? defaultDelay
  const configured = parseJudgeRoute(options.configuredModel)
  if (options.configuredModel?.trim() && configured === undefined) {
    options.warn(`flowleap-deliverables: secondReadModel ${JSON.stringify(options.configuredModel)} is not "provider/model"; judging with the session's route.`)
  }

  const resolveRoute = (session: Session | undefined): JudgeRoute | undefined => {
    if (configured !== undefined) return configured
    const config = session?.requestHeader()?.config
    return config === undefined ? undefined : { provider: config.provider, model: config.model }
  }

  const ask = async (
    route: JudgeRoute,
    request: SecondReadRequest,
    session: Session | undefined,
    signal: AbortSignal,
  ): Promise<JudgeAnswer> => {
    try {
      const call = await ctx.llm.prepareCall({ ...route, temperature: 0 }, signal)
      const prompt = createUserMessage({ content: [{ type: 'text', text: secondReadPrompt(request) }], source: { kind: STEER_SOURCE_KIND } })
      const generate: GenerateOptions = {
        ...call.config, messages: [prompt], signal, ...session === undefined ? {} : { sessionId: session.id },
      }
      const assembler = new BlockAssembler()
      for await (const chunk of call.stream(generate)) {
        signal.throwIfAborted()
        assembler.push(chunk)
      }
      const finish = assembler.finish
      if (finish.kind === 'error' || finish.kind === 'aborted') return { failure: finish.failure.message }
      return { text: contentText(assembler.blocks()) }
    } catch (error) {
      return { failure: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    async judge(review, snapshot, session, signal) {
      try {
        const requests = buildSecondReadRequests(review, snapshot)
        if (!requests.length) return { kind: 'skipped', reason: 'no supported or partial row lists elements' }
        const route = resolveRoute(session)
        if (route === undefined) return { kind: 'skipped', reason: 'no logged model route for this session' }
        const results: SecondReadResult[] = []
        for (const request of requests.slice(0, SECOND_READ_ROW_LIMIT)) {
          // One network failure is retried once after a short pause; a second one means the second
          // read did not run, which the report and the receipt both say (#538).
          let answer = await ask(route, request, session, signal)
          if ('failure' in answer && networkFailure(answer.failure) !== undefined) {
            options.warn(`flowleap-deliverables: second-read judge call failed on the network (${answer.failure}); retrying once.`)
            await delay(SECOND_READ_RETRY_DELAY, signal)
            answer = await ask(route, request, session, signal)
            if ('failure' in answer && networkFailure(answer.failure) !== undefined) return { kind: 'notRun', reason: 'network error, retried once' }
          }
          if ('failure' in answer) throw new Error(answer.failure)
          const verdicts = parseSecondReadVerdicts(answer.text)
          results.push({ feature: request.feature, status: request.status, ...(verdicts ? { verdicts } : { unparsed: answer.text }) })
        }
        return { kind: 'judged', model: route.model, rows: results, summary: summarizeSecondRead(results, notJudgedFigureElements(review)) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        options.warn(`flowleap-deliverables: second read did not complete: ${message}`)
        return { kind: 'skipped', reason: message }
      }
    },
  }
}

/** The judge a composition without `ctx.llm` gets: every read is a skip that says why. */
export const NO_LLM_JUDGE: SecondReadJudge = {
  judge: () => Promise.resolve({ kind: 'skipped', reason: 'no model service mounted' }),
}
