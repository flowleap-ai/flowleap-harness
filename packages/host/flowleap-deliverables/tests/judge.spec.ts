/**
 * The second-read judge over a scripted `ctx.llm`: the route it judges on, a verdict reply and an
 * unparsed one, one retry after a network failure and the stop after a second, a model failure, an
 * aborted stream, the retry pause and its cancellation, and the warnings each path writes. The
 * judge never throws: every failure is a stated skip or "not run".
 */

import { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { createJudge, SECOND_READ_RETRY_DELAY, type JudgeOptions, type PatentCandidateReview, type PatentExecutionSnapshot } from '../src/index.ts'

/** One scripted model answer: reply text, a finish failure, or a thrown value at prepare time. */
type Answer = { readonly text: string } | { readonly finish: 'error' | 'aborted'; readonly message: string } | { readonly prepareThrows: unknown }

/** The judge over a fake `llm` service that answers each call with the next scripted answer. */
function scripted(answers: Answer[], options: Partial<JudgeOptions> = {}, defaultDelay = false) {
  const ctx = new Context()
  const routes: string[] = []
  const sessions: (string | undefined)[] = []
  const warned: string[] = []
  ctx.provide('llm', {
    prepareCall(config: { provider: string; model: string; temperature: number }) {
      routes.push(`${config.provider}/${config.model}@${String(config.temperature)}`)
      const answer = answers.shift() ?? { text: '' }
      if ('prepareThrows' in answer) return Promise.reject(answer.prepareThrows as Error)
      return Promise.resolve({
        config,
        async *stream(generate: GenerateOptions): AsyncIterable<StreamChunk> {
          sessions.push(generate.sessionId)
          if ('text' in answer) {
            yield { type: 'text-delta', index: 0, text: answer.text }
            yield { type: 'finish', reason: { kind: 'stop' } }
            return
          }
          yield { type: 'finish', reason: { kind: answer.finish, failure: { message: answer.message } } as never }
        },
      })
    },
  })
  const judge = createJudge(ctx, {
    warn: (line) => { warned.push(line) }, ...defaultDelay ? {} : { delay: () => Promise.resolve() }, ...options,
  })
  return { judge, routes, sessions, warned }
}

const review: PatentCandidateReview = {
  coverage: [{
    feature: 'Sealed housing',
    importance: 'essential',
    status: 'supported',
    gap: '',
    elements: [{ element: 'Housing is sealed', anchor: 'EP1:claims:2:en', disclosedBy: 'sealed' }],
  }],
}
const snapshot: PatentExecutionSnapshot = { executions: [], limitation: '' }
const VERDICT = '{"verdicts":[{"element":"Housing is sealed","verdict":"agree","reason":"The claim says sealed."}]}'
const signal = () => new AbortController().signal

/** A Session whose logged route is `logged/model`. */
const session = { id: 'session-1', requestHeader: () => ({ config: { provider: 'logged', model: 'model' } }) } as never as Session

describe('the second-read judge', () => {
  it('skips a review without a judged row and a Session without a logged route, and warns about a configured route without a provider', async () => {
    const { judge, warned } = scripted([], { configuredModel: 'no-slash' })
    const blank = scripted([], { configuredModel: '  ' })
    expect({
      empty: await judge.judge({ coverage: [] }, snapshot, undefined, signal()),
      noRoute: await judge.judge(review, snapshot, undefined, signal()),
      noHeader: await blank.judge.judge(review, snapshot, { id: 's', requestHeader: () => undefined } as never, signal()),
      warned,
      blankWarned: blank.warned,
    }).toEqual({
      empty: { kind: 'skipped', reason: 'no supported or partial row lists elements' },
      noRoute: { kind: 'skipped', reason: 'no logged model route for this session' },
      noHeader: { kind: 'skipped', reason: 'no logged model route for this session' },
      warned: ['flowleap-deliverables: secondReadModel "no-slash" is not "provider/model"; judging with the session\'s route.'],
      blankWarned: [],
    })
  })

  it('judges on the Session\'s logged route at temperature 0, keeping a reply it cannot parse as unparsed', async () => {
    const parsed = scripted([{ text: VERDICT }])
    const unparsed = scripted([{ text: 'I cannot tell.' }], { configuredModel: 'configured/judge' })
    const judged = await parsed.judge.judge(review, snapshot, session, signal())
    const raw = await unparsed.judge.judge(review, snapshot, undefined, signal())
    expect({
      judged: judged.kind === 'judged' ? [judged.model, judged.rows] : judged,
      raw: raw.kind === 'judged' ? [raw.model, raw.rows] : raw,
      routes: [...parsed.routes, ...unparsed.routes],
      sessions: [...parsed.sessions, ...unparsed.sessions],
    }).toEqual({
      judged: ['model', [{ feature: 'Sealed housing', status: 'supported', verdicts: [{ element: 'Housing is sealed', verdict: 'agree', reason: 'The claim says sealed.' }] }]],
      raw: ['judge', [{ feature: 'Sealed housing', status: 'supported', unparsed: 'I cannot tell.' }]],
      routes: ['logged/model@0', 'configured/judge@0'],
      sessions: ['session-1', undefined],
    })
  })

  it('retries one network failure once, and stops after a second', async () => {
    const pauses: number[] = []
    const delay = (ms: number) => { pauses.push(ms); return Promise.resolve() }
    const recovered = scripted([{ prepareThrows: new Error('fetch failed') }, { text: VERDICT }], { configuredModel: 'p/m', delay })
    const lost = scripted([{ finish: 'error', message: 'socket hang up' }, { prepareThrows: new Error('ECONNRESET') }], { configuredModel: 'p/m', delay })
    expect({
      recovered: (await recovered.judge.judge(review, snapshot, undefined, signal())).kind,
      lost: await lost.judge.judge(review, snapshot, undefined, signal()),
      pauses,
      warned: [...recovered.warned, ...lost.warned],
    }).toEqual({
      recovered: 'judged',
      lost: { kind: 'notRun', reason: 'network error, retried once' },
      pauses: [SECOND_READ_RETRY_DELAY, SECOND_READ_RETRY_DELAY],
      warned: [
        'flowleap-deliverables: second-read judge call failed on the network (fetch failed); retrying once.',
        'flowleap-deliverables: second-read judge call failed on the network (socket hang up); retrying once.',
      ],
    })
  })

  it('skips with the reason on a model failure, an aborted stream, a failure that is not an Error, and a failed retry pause', async () => {
    const failed = scripted([{ finish: 'error', message: 'quota exceeded' }], { configuredModel: 'p/m' })
    const aborted = scripted([{ finish: 'aborted', message: 'cancelled by user' }], { configuredModel: 'p/m' })
    const odd = scripted([{ prepareThrows: 'adapter missing' }], { configuredModel: 'p/m' })
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a failure that is not an Error is the case under test
    const pause = scripted([{ prepareThrows: new Error('network down') }], { configuredModel: 'p/m', delay: () => Promise.reject('pause failed') })
    const afterRetry = scripted([{ prepareThrows: new Error('ETIMEDOUT') }, { finish: 'error', message: 'bad request' }], { configuredModel: 'p/m' })
    const judged = [failed, aborted, odd, pause, afterRetry]
    const outcomes = await Promise.all(judged.map(entry => entry.judge.judge(review, snapshot, undefined, signal())))
    expect(outcomes).toEqual([
      { kind: 'skipped', reason: 'quota exceeded' },
      { kind: 'skipped', reason: 'cancelled by user' },
      { kind: 'skipped', reason: 'adapter missing' },
      { kind: 'skipped', reason: 'pause failed' },
      { kind: 'skipped', reason: 'bad request' },
    ])
    expect(failed.warned).toEqual(['flowleap-deliverables: second read did not complete: quota exceeded'])
  })

  it('waits the retry pause with the default delay, and stops it when the call is cancelled before or during the pause', async () => {
    const run = async (abort: 'never' | 'before' | 'during', reason: unknown) => {
      const controller = new AbortController()
      const { judge } = scripted([{ prepareThrows: new Error('fetch failed') }, { text: VERDICT }], { configuredModel: 'p/m' }, true)
      if (abort === 'before') controller.abort(reason)
      if (abort === 'during') setTimeout(() => { controller.abort(reason) }, 10)
      return judge.judge(review, snapshot, undefined, controller.signal)
    }
    const started = Date.now()
    const waited = await run('never', undefined)
    const elapsed = Date.now() - started
    expect({
      waited: waited.kind,
      elapsed: elapsed >= SECOND_READ_RETRY_DELAY - 50,
      results: await Promise.all([
        run('before', new Error('stopped before')), run('before', 'stopped'), run('during', new Error('stopped during')), run('during', 'stopped'),
      ]),
    }).toEqual({
      waited: 'judged',
      elapsed: true,
      results: [
        { kind: 'skipped', reason: 'stopped before' },
        { kind: 'skipped', reason: 'aborted' },
        { kind: 'skipped', reason: 'stopped during' },
        { kind: 'skipped', reason: 'aborted' },
      ],
    })
  })
})
