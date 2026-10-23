/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Ported from the IDE's priorArtReportCompletion.spec.ts (see SOURCE.json): the turns are the
// harness's event-folded shape, the tool names are the harness's, the receipts carry process paths,
// and the file reader is an in-memory map. The IDE's `evidenceLookup` case has no harness analogue.

import { describe, expect, it } from 'vitest'
import { checkPriorArtReportCompletion, type GuardRound, type ReceiptFileReader, type ReportCompletionTurn } from '../src/guard/completion.ts'
import { priorArtReportReceipt, requestsPriorArtReport, type ReceiptFallbacks } from '../src/report/receipt.ts'

const message = 'Search for prior art and save "outputs/研究 review.md".'
const report = '/workspace/outputs/研究 review.md'
const evidence = '/workspace/outputs/revision.evidence.json'

/** An in-memory workspace: the receipt reader over a path map. */
class Files implements ReceiptFileReader {
  readonly map = new Map<string, string>()
  write(path: string, text: string): void { this.map.set(path, text) }
  delete(path: string): void { this.map.delete(path) }
  readText(path: string): Promise<string | undefined> { return Promise.resolve(this.map.get(path)) }
}
const files = () => new Files()
const WRITER = 'write_patent_results'
function round(toolCalls: GuardRound['toolCalls'], response = ''): GuardRound {
  return { toolCalls, response }
}
function turn(names: readonly string[], request = message): ReportCompletionTurn {
  return { message: request, rounds: [round(names.map((name, index) => ({ name, id: String(index), arguments: name === WRITER ? '{"template":"prior-art-report"}' : '{}' })))], results: {} }
}
function saved(fs: Files, path = report): ReportCompletionTurn {
  fs.write(path, 'Evidence-backed interim report')
  fs.write(evidence, 'Snapshot')
  return { ...turn(['search_patents', WRITER]), results: { '1': priorArtReportReceipt(path, 'Evidence-backed interim report', evidence, 'Snapshot') } }
}

describe('prior-art report completion contract', () => {
  it('leaves clarification and ordinary single-detail questions alone', async () => {
    expect(await checkPriorArtReportCompletion([], turn([]), files())).toBeUndefined()
    expect(await checkPriorArtReportCompletion([], turn(['get_claims'], 'What does claim 10 say?'), files())).toBeUndefined()
    expect(requestsPriorArtReport('Write a unit test for patent lookup')).toBe(false)
  })
  it.each(['write', 'edit', 'bash'])('does not accept a generic %s as finalization', async (name) => {
    expect(await checkPriorArtReportCompletion([], turn(['search_patents', name]), files())).toContain('no successful structured finalization')
  })
  it('requires finalization when an explicit report request reuses existing evidence through a generic write', async () => {
    expect(await checkPriorArtReportCompletion([], turn(['write']), files())).toContain('no successful structured finalization')
  })
  it('persists pending intent through a scope reply and a request-limit continuation', async () => {
    const history = [turn([]), turn(['search_patents'], 'EP and WO before 2002-02-21')]
    expect(await checkPriorArtReportCompletion(history, turn(['write'], 'Continue to iterate'), files())).toContain('no successful structured finalization')
  })
  it('rejects failed and omitted-template writer results', async () => {
    const input = turn(['search_patents', WRITER])
    for (const response of ['Candidate draft was not saved.', 'Successfully wrote patent results; free-form artifact.']) {
      expect(await checkPriorArtReportCompletion([], { ...input, results: { '1': response } }, files())).toContain('no successful structured finalization')
    }
  })
  it('accepts a saved report, preserves unrelated notes, detects generic edits, and recovers via a new receipt', async () => {
    const fs = files()
    const valid = saved(fs)
    expect(await checkPriorArtReportCompletion([], valid, fs)).toBeUndefined()
    fs.write('/workspace/notes.md', 'Ordinary notes')
    const notes = turn(['write'], 'Save these notes')
    expect(await checkPriorArtReportCompletion([valid], notes, fs)).toBeUndefined()
    fs.write(report, 'Unchecked replacement')
    expect(await checkPriorArtReportCompletion([valid], turn(['edit'], 'Update the report'), fs)).toContain('changed after validation')
    const recovered = saved(fs)
    expect(await checkPriorArtReportCompletion([valid], recovered, fs)).toBeUndefined()
  })
  it.each(['report', 'evidence'])('invalidates deleted %s bytes', async (target) => {
    const fs = files()
    const valid = saved(fs)
    fs.delete(target === 'report' ? report : evidence)
    expect(await checkPriorArtReportCompletion([valid], turn(['bash'], 'Continue'), fs)).toContain('changed after validation')
  })
  it('retains an unfinished report obligation for a prose-only continuation', async () => {
    const history = [turn([]), turn(['search_patents'], 'EP and WO before 2002')]
    expect(await checkPriorArtReportCompletion(history, turn([], 'Continue'), files())).toContain('no successful structured finalization')
  })
  it('requires fresh finalization for an explicit report revision with more evidence', async () => {
    const fs = files()
    const valid = saved(fs)
    expect(await checkPriorArtReportCompletion([valid], turn(['get_claims'], 'Update the report with this additional patent'), fs)).toContain('no successful structured finalization')
  })
  it('does not reopen a finalized report for an unrelated single-patent followup', async () => {
    const fs = files()
    const valid = saved(fs)
    expect(await checkPriorArtReportCompletion([valid], turn(['get_claims'], 'What does claim 10 of EP1000000A1 say?'), fs)).toBeUndefined()
  })

  it('starts a second report contract and does not reopen an old report for unrelated work', async () => {
    const fs = files()
    const first = saved(fs)
    const second = turn([], 'Search for prior art and save outputs/second.md')
    const retrieval = turn(['search_patents'], 'US before 2020')
    expect(await checkPriorArtReportCompletion([first, second, retrieval], turn(['write'], 'Continue'), fs)).toContain('no successful structured finalization')
    fs.write(report, 'Manually edited later')
    expect(await checkPriorArtReportCompletion([first], turn(['write'], 'Create a README for my code'), fs)).toBeUndefined()
  })
  it('matches a Windows deliverable across separators and drive-letter case', async () => {
    const fs = files()
    const windows = 'Search for prior art and save "C:\\Users\\Ann\\outputs\\Report.md".'
    const finalized = { ...saved(fs, 'c:/Users/Ann/outputs/report.md'), message: windows }
    const research = turn(['search_patents'], windows)
    const backslashDraft: ReportCompletionTurn = { message: 'Add the last hit', results: {}, rounds: [round([{ id: '0', name: 'write', arguments: '{"file_path":"C:\\\\Users\\\\Ann\\\\outputs\\\\Report.md"}' }])] }
    expect({
      finalized: await checkPriorArtReportCompletion([], finalized, fs),
      draft: (await checkPriorArtReportCompletion([research], backslashDraft, fs))?.includes('no successful structured finalization'),
    }).toEqual({ finalized: undefined, draft: true })
  })

  it('matches the requested path against an IDE-era receipt whose paths are file URIs', async () => {
    const fs = files()
    const uri = 'file:///workspace/outputs/%E7%A0%94%E7%A9%B6%20review.md'
    fs.write(uri, 'Evidence-backed interim report')
    fs.write(evidence, 'Snapshot')
    const valid = { ...turn(['search_patents', WRITER]), results: { '1': priorArtReportReceipt(uri, 'Evidence-backed interim report', evidence, 'Snapshot') } }
    expect(await checkPriorArtReportCompletion([], valid, fs)).toBeUndefined()
  })

  it('binds evidence freshness to the requested report, not another later writer', async () => {
    const fs = files()
    const valid = saved(fs)
    const other = saved(fs, '/workspace/other.md')
    const current: ReportCompletionTurn = {
      ...valid,
      rounds: [...valid.rounds, round([{ id: 'detail', name: 'get_claims', arguments: '{}' }, { id: 'other', name: WRITER, arguments: '{"template":"prior-art-report"}' }])],
      results: { ...valid.results, other: other.results['1']! },
    }
    expect(await checkPriorArtReportCompletion([], current, fs)).toContain('More patent evidence')
  })
  it.each(['{}', '{"template":"prior-art-report"}'])('ignores receipt-like text from an unstructured or malformed later writer: %s', async (argumentsText) => {
    const fs = files()
    const valid = saved(fs)
    const current: ReportCompletionTurn = {
      ...valid,
      rounds: [...valid.rounds, round([{ id: 'detail', name: 'get_claims', arguments: '{}' }, { id: 'bad', name: WRITER, arguments: argumentsText }])],
      results: { ...valid.results, bad: 'Prior-art artifact receipt: malformed' },
    }
    expect(await checkPriorArtReportCompletion([], current, fs)).toContain('More patent evidence')
  })

  it('routes an invalidity chart request through the same finalization, and only with coverage', async () => {
    const fs = files()
    const request = 'Build the invalidity case against EP2000000A1 and save "outputs/研究 review.md".'
    const chart = (args: string): ReportCompletionTurn => ({
      message: request,
      rounds: [round([{ id: '0', name: 'search_patents', arguments: '{}' }, { id: '1', name: WRITER, arguments: args }])],
      results: { '1': priorArtReportReceipt(report, 'Evidence-backed interim chart', evidence, 'Snapshot') },
    })
    fs.write(report, 'Evidence-backed interim chart')
    fs.write(evidence, 'Snapshot')
    const written = await checkPriorArtReportCompletion([], chart('{"template":"invalidity-claim-chart"}'), fs)
    expect({
      recognized: [requestsPriorArtReport(request), requestsPriorArtReport('Write an invalidity report on EP2000000A1'), requestsPriorArtReport('Is this patent still in force?')],
      structured: await checkPriorArtReportCompletion([], chart('{"template":"invalidity-claim-chart","coverage":[{"feature":"Claim 1 — element (a)"}]}'), fs),
      written: [written?.startsWith('The requested invalidity chart has no successful structured finalization in this turn.'), written?.includes('template="invalidity-claim-chart"')],
    }).toEqual({
      recognized: [true, true, false],
      structured: undefined,
      written: [true, true],
    })
  })

  it('does not accept another output path, or an older receipt after new retrieval', async () => {
    const fs = files()
    expect(await checkPriorArtReportCompletion([], saved(fs, '/workspace/wrong.md'), fs)).toContain('different path')
    const valid = saved(fs)
    expect(await checkPriorArtReportCompletion([valid], turn(['get_claims']), fs)).toContain('no successful structured finalization')
    const afterSave = { ...valid, rounds: [...valid.rounds, ...turn(['get_claims']).rounds] }
    expect(await checkPriorArtReportCompletion([], afterSave, fs)).toContain('More patent evidence')
  })

  describe('the Round Report after a saved invalidity chart (C4)', () => {
    const invalidityRequest = 'Build the invalidity case against EP2000000A1 and save "outputs/研究 review.md".'
    const nudge = 'The saved chart lists 3 open points (rung-3, element-1.2, search-1) and this turn ends without a Round Report. Write the Round Report now: the receipt, then each open point as a numbered question that names its id, with your recommended next step, then the line "Reply with the ids to run (for example rung-3, element-1.3), \'all\', or your own steer." Then end the turn. Do not run a Search Round before the expert answers.'
    const openPoints: ReceiptFallbacks = {
      fallbacksNotCovered: 1, rounds: 0, notCovered: ['3'], criticalDate: '2005-03-01',
      openPoints: [
        { id: 'rung-3', text: 'Claim 3 (fallback of claim 1) is partly disclosed in the cited art: Claim 3 (depends on 2) — added limitation: the screw\nis captive' },
        { id: 'element-1.2', text: 'Claim 1 element is not found in the cited art: Claim 1 — element (b): a screw' },
        { id: 'search-1', text: 'A search failed and did not run again: captive screw (ti=captive AND ti=screw)' },
      ],
    }
    const noOpenPoints: ReceiptFallbacks = { fallbacksNotCovered: 0, rounds: 0, notCovered: [], openPoints: [] }
    const roundReport = ['Saved. Receipt: 1 fallback not covered, 3 open points.', '1. [rung-3] Claim 3 is partly covered. Recommended: search the captive-screw limitation in CPC F16L 3/10.', '2. [element-1.2] Element (b) is not found. Recommended: search US art for a screw clamp.', '3. [search-1] One search failed. Recommended: run it again.', 'Reply with the ids to run (for example rung-3, element-1.3), \'all\', or your own steer.'].join('\n')
    /** A turn that saves the chart once, its receipt stating the given open points, then ends with the given text. */
    function chart(fs: Files, fallbacks: ReceiptFallbacks, closing = '', request = invalidityRequest, template = 'invalidity-claim-chart'): ReportCompletionTurn {
      fs.write(report, 'Evidence-backed chart')
      fs.write(evidence, 'Snapshot')
      return {
        message: request,
        rounds: [
          round([{ id: '0', name: 'search_patents', arguments: '{}' }, { id: '1', name: WRITER, arguments: JSON.stringify({ template, coverage: [{ feature: 'Claim 1 — element (a)' }] }) }]),
          round([], closing),
        ],
        results: { '1': priorArtReportReceipt(report, 'Evidence-backed chart', evidence, 'Snapshot', fallbacks) },
      }
    }

    it('prints the open points one line each after the receipt line', () => {
      const lines = priorArtReportReceipt(report, 'Evidence-backed chart', evidence, 'Snapshot', openPoints).split('\n')
      expect({ first: lines[0]!.replace(/^Prior-art artifact receipt: \{.*\}/, '<receipt>'), rest: lines.slice(1), none: priorArtReportReceipt(report, 'Evidence-backed chart', evidence, 'Snapshot', noOpenPoints).split('\n').slice(1) }).toEqual({
        first: '<receipt> fallbacksNotCovered=1 rounds=0 notCovered=3',
        rest: [
          'Open points: 3. Critical date: 2005-03-01. Write the Round Report now: this receipt, then one numbered question per open point in this order, each with its id and your recommended next step, then the line "Reply with the ids to run (for example rung-3, element-1.3), \'all\', or your own steer." Then end the turn; run a Search Round only on the expert\'s answer.',
          'Open point [rung-3]: Claim 3 (fallback of claim 1) is partly disclosed in the cited art: Claim 3 (depends on 2) — added limitation: the screw is captive',
          'Open point [element-1.2]: Claim 1 element is not found in the cited art: Claim 1 — element (b): a screw',
          'Open point [search-1]: A search failed and did not run again: captive screw (ti=captive AND ti=screw)',
        ],
        none: ['Open points: none. Critical date: not given (no criticalDate), so the publication dates of the cited documents were not checked.'],
      })
    })
    it('asks for the Round Report when the receipt lists open points and the turn ends without one', async () => {
      const fs = files()
      expect(await checkPriorArtReportCompletion([], chart(fs, openPoints, 'Saved the chart. Claim 3 is partly covered; I will run a Search Round next.'), fs)).toBe(nudge)
    })
    it('accepts a turn that ends with a Round Report naming the open points', async () => {
      const fs = files()
      expect(await checkPriorArtReportCompletion([], chart(fs, openPoints, roundReport), fs)).toBeUndefined()
    })
    it('accepts a chart whose receipt lists no open points', async () => {
      const fs = files()
      expect(await checkPriorArtReportCompletion([], chart(fs, noOpenPoints), fs)).toBeUndefined()
    })
    it('never asks for a Round Report on a prior-art or Find Better report with the same receipt', async () => {
      const fs = files()
      expect({
        priorArt: await checkPriorArtReportCompletion([], chart(fs, openPoints, '', message, 'prior-art-report'), fs),
        findBetter: await checkPriorArtReportCompletion([], chart(fs, openPoints, '', 'Find better art than the examiner for EP2000000A1 and save "outputs/研究 review.md".', 'find-better-report'), fs),
      }).toEqual({ priorArt: undefined, findBetter: undefined })
    })
    it('asks once: a turn that already holds the nudge is not asked again', async () => {
      const fs = files()
      const first = chart(fs, openPoints)
      const nudged: ReportCompletionTurn = { ...first, rounds: [...first.rounds.slice(0, 1), { ...first.rounds[1]!, hookContext: nudge }, round([], 'Saved.')] }
      expect(await checkPriorArtReportCompletion([], nudged, fs)).toBeUndefined()
    })
    it('reads an older receipt without the open-points lines as a plain receipt', async () => {
      const fs = files()
      const older = chart(fs, openPoints)
      const plain = { ...older, results: { '1': priorArtReportReceipt(report, 'Evidence-backed chart', evidence, 'Snapshot') } }
      expect(await checkPriorArtReportCompletion([], plain, fs)).toBeUndefined()
    })
  })
})
