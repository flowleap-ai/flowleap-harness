/**
 * The markets card of an fto-memo save: the user's answer fills the memo's
 * `Jurisdiction(s)` cell (the model's `jurisdictions` is only the proposed
 * option) and the save result states it to the model, a re-save of the same
 * memo reuses the answer unless the model proposes other markets, an
 * empty answer or a cancelled card writes nothing, and a caller that cannot be
 * asked saves the proposal marked as not confirmed.
 */

import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, describe, expect, it } from 'vitest'
import { MARKETS_QUESTION_ID, UNCONFIRMED_MARKETS } from '../src/index.ts'
import { gateBench, textOf } from './gates-test-bench.ts'

const benches: { dispose: () => Promise<void> }[] = []
afterEach(async () => {
  for (const bench of benches.splice(0)) await bench.dispose()
})

const MEMO = { filePath: 'outputs/memo.md', content: 'DE and FR parts lapsed; US7722129B2 in force.', template: 'fto-memo', subject: 'Quick-release skewer' }

/** The `Jurisdiction(s)` row of the saved memo. */
async function jurisdictionRow(bench: Awaited<ReturnType<typeof gateBench>>): Promise<string | undefined> {
  return (await bench.read('outputs/memo.md')).split('\n').find(line => line.startsWith('| Jurisdiction(s) |'))
}

describe('the fto-memo markets card', () => {
  it('asks with the proposal as the option, fills the cell from the answer, states it to the model, and asks again only for a different proposal', async () => {
    const bench = await gateBench()
    benches.push(bench)
    bench.seams.pick(['DE, FR, US'])
    const first = await bench.call('write_patent_results', { ...MEMO, jurisdictions: 'DE, FR, US' })
    const row = await jurisdictionRow(bench)
    const reused = await bench.call('write_patent_results', { ...MEMO, content: `${MEMO.content} Claim 1 read.` })
    const askedBefore = bench.seams.asked.length
    bench.seams.pick(['EP, US'])
    const changed = await bench.call('write_patent_results', { ...MEMO, jurisdictions: 'EP, US' })
    const fit = (markets: string) => `Assess the risk for these markets only: if the memo body covers other markets or leaves one of them out, revise the body for ${markets} and save again.`
    expect({
      card: bench.seams.asked.map(request => request.questions.map(question => [
        question.id, question.header, question.options?.map(option => option.label),
      ])),
      first: first.split('\n').slice(0, 2),
      row,
      reused: reused.split('\n')[1],
      askedBefore,
      changed: changed.split('\n')[1],
      rowAfter: await jurisdictionRow(bench),
    }).toEqual({
      card: [[[MARKETS_QUESTION_ID, 'Markets', ['DE, FR, US']]], [[MARKETS_QUESTION_ID, 'Markets', ['EP, US']]]],
      first: [
        'Successfully wrote patent results to outputs/memo.md',
        `Markets: the user answered this save's Markets question card with "DE, FR, US" (your proposal was "DE, FR, US"); the memo header states them. ${fit('DE, FR, US')}`,
      ],
      row: '| Jurisdiction(s) | DE, FR, US |',
      reused: `Markets: DE, FR, US, the user's answer to the Markets question card earlier in this Session; the memo header states them. ${fit('DE, FR, US')}`,
      askedBefore: 1,
      changed: `Markets: the user answered this save's Markets question card with "EP, US" (your proposal was "EP, US"); the memo header states them. ${fit('EP, US')}`,
      rowAfter: '| Jurisdiction(s) | EP, US |',
    })
  })

  it('asks a free-text card when the model proposes nothing, and a typed answer replaces a proposal', async () => {
    const bench = await gateBench()
    benches.push(bench)
    bench.seams.pick([], 'DE, AT, CH')
    const typedResult = await bench.call('write_patent_results', MEMO)
    const typed = await jurisdictionRow(bench)
    const other = await gateBench()
    benches.push(other)
    other.seams.answerer = request => ({ answers: request.questions.map(question => ({ id: question.id, selected: [], custom: 'US' })) })
    await other.call('write_patent_results', { ...MEMO, jurisdictions: 'EP (35 designated states), US' })
    expect({
      options: bench.seams.asked[0]?.questions[0]?.options,
      typedLine: typedResult.split('\n')[1],
      typed,
      replaced: await jurisdictionRow(other),
    }).toEqual({
      options: undefined,
      typedLine: 'Markets: the user answered this save\'s Markets question card with "DE, AT, CH" (you proposed none); the memo header states them.'
        + ' Assess the risk for these markets only: if the memo body covers other markets or leaves one of them out, revise the body for DE, AT, CH and save again.',
      typed: '| Jurisdiction(s) | DE, AT, CH |',
      replaced: '| Jurisdiction(s) | US |',
    })
  })

  it('writes nothing on an empty answer or a cancelled card, and marks the proposal as not confirmed when the caller cannot be asked', async () => {
    const bench = await gateBench()
    benches.push(bench)
    bench.seams.skip()
    const empty = await bench.call('write_patent_results', { ...MEMO, jurisdictions: 'DE, FR, US' })
    bench.seams.fail('ASK_ABORTED')
    const cancelled = await bench.call('write_patent_results', { ...MEMO, jurisdictions: 'DE, FR, US' })
    const nothingWritten = await bench.files('outputs')
    bench.seams.fail('DELEGATED_CALLER')
    const delegated = await bench.call('write_patent_results', { ...MEMO, jurisdictions: 'DE, FR, US' })
    expect({
      empty,
      cancelled,
      nothingWritten,
      delegated: delegated.split('\n')[1],
      row: await jurisdictionRow(bench),
    }).toEqual({
      empty: 'Report was not saved. The user named no markets for the FTO memo. Ask the user which markets the memo must clear, then save again.',
      cancelled: 'Report was not saved. The markets question was cancelled; nothing was written.',
      nothingWritten: [],
      delegated: `Markets: not confirmed by the user (no answer was possible); the memo header marks them ${UNCONFIRMED_MARKETS}.`,
      row: `| Jurisdiction(s) | DE, FR, US ${UNCONFIRMED_MARKETS} |`,
    })
  })

  it('does not ask and marks the proposal as not confirmed when no Agent runs the save', async () => {
    const bench = await gateBench()
    benches.push(bench)
    bench.seams.pick(['DE, FR, US'])
    const result = await executeModelToolFixture(bench.ctx, {
      callId: ToolCallId('call-no-agent'), name: 'write_patent_results', arguments: { ...MEMO, jurisdictions: 'DE, FR, US' }, signal: new AbortController().signal,
    })
    expect({ asked: bench.seams.asked, line: textOf(result.content[0]).split('\n')[1], row: await jurisdictionRow(bench) }).toEqual({
      asked: [],
      line: `Markets: not confirmed by the user (no answer was possible); the memo header marks them ${UNCONFIRMED_MARKETS}.`,
      row: `| Jurisdiction(s) | DE, FR, US ${UNCONFIRMED_MARKETS} |`,
    })
  })

  it('never asks for a template other than fto-memo', async () => {
    const bench = await gateBench()
    benches.push(bench)
    bench.seams.pick(['unused'])
    await bench.call('write_patent_results', { filePath: 'outputs/opinion.md', content: 'Claim 1 is novel over D1.', template: 'patentability-opinion' })
    expect(bench.seams.asked).toEqual([])
  })
})
