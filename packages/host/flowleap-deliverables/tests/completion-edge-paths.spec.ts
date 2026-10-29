/**
 * The completion check on the inputs the ported IDE spec does not reach: a receipt the reader
 * cannot read, a writer call without a logged result, an IDE-era `file:` receipt that does not
 * parse or names a Windows drive, writer arguments that are not a JSON object, and a chart with
 * one open point.
 */

import { describe, expect, it } from 'vitest'
import { checkPriorArtReportCompletion, type ReceiptFileReader, type ReportCompletionTurn } from '../src/guard/completion.ts'
import { priorArtReportReceipt } from '../src/report/receipt.ts'

const WRITER = 'write_patent_results'
const evidence = '/workspace/outputs/review.md.evidence.json'

/** The receipt reader over a path map. */
function reader(files: Record<string, string>): ReceiptFileReader {
  return { readText: path => Promise.resolve(files[path]) }
}

/** A turn that searched and called the writer once, with the given result text and writer arguments. */
function savedTurn(message: string, result: string | undefined, writerArguments = '{"template":"prior-art-report"}'): ReportCompletionTurn {
  return {
    message,
    rounds: [{ toolCalls: [{ id: '0', name: 'search_patents', arguments: '{}' }, { id: '1', name: WRITER, arguments: writerArguments }], response: '' }],
    results: result === undefined ? {} : { '1': result },
  }
}

const receiptFor = (path: string) => priorArtReportReceipt(path, 'Report', evidence, 'Snapshot')

describe('the completion check', () => {
  it('lets a turn end when the receipt files cannot be read for a transient reason', async () => {
    const failing: ReceiptFileReader = { readText: () => Promise.reject(new Error('device busy')) }
    const turn = savedTurn('Search for prior art and save outputs/review.md', receiptFor('/workspace/outputs/review.md'))
    expect(await checkPriorArtReportCompletion([], turn, failing)).toBeUndefined()
  })

  it('counts a writer call without a logged result as no finalization', async () => {
    const turn = savedTurn('Search for prior art and save outputs/review.md', undefined)
    expect(await checkPriorArtReportCompletion([], turn, reader({}))).toContain('no successful structured finalization')
  })

  it('keeps an IDE-era receipt URI that does not parse as it is, and matches a file URI with a Windows drive', async () => {
    const broken = 'file://%zz/outputs/review.md'
    const drive = 'file:///C:/Users/Ann/outputs/review.md'
    const files = reader({ [broken]: 'Report', [drive]: 'Report', [evidence]: 'Snapshot' })
    const unparsed = await checkPriorArtReportCompletion([], savedTurn('Search for prior art and save outputs/review.md', receiptFor(broken)), files)
    const windows = await checkPriorArtReportCompletion([], savedTurn('Search for prior art and save "C:\\Users\\Ann\\outputs\\review.md".', receiptFor(drive)), files)
    expect({ unparsed, windows }).toEqual({ unparsed: undefined, windows: undefined })
  })

  it('reads the target from the raw arguments when the writer arguments are not a JSON object', async () => {
    const request = 'Search for prior art and save outputs/review.md'
    const history: ReportCompletionTurn[] = [{ message: request, rounds: [{ toolCalls: [{ id: '0', name: 'search_patents', arguments: '{}' }], response: '' }], results: {} }]
    const call = (writerArguments: string): ReportCompletionTurn => ({
      message: 'Add the last hit',
      rounds: [{ toolCalls: [{ id: '0', name: 'get_claims', arguments: '{}' }, { id: '1', name: WRITER, arguments: writerArguments }], response: '' }],
      results: {},
    })
    const results = await Promise.all(['"outputs/review.md"', 'not json outputs/review.md', '{"filePath":"/workspace/outputs/review.md"}', '{"filePath":7}']
      .map(async writerArguments => (await checkPriorArtReportCompletion(history, call(writerArguments), reader({})))?.split('.')[0]))
    expect(results).toEqual(Array<string>(4).fill('The requested prior-art report has no successful structured finalization in this turn'))
  })

  it('names one open point in the singular', async () => {
    const report = '/workspace/outputs/chart.md'
    const receipt = priorArtReportReceipt(report, 'Chart', evidence, 'Snapshot', {
      fallbacksNotCovered: 0, rounds: 0, notCovered: [], openPoints: [{ id: 'rung-1', text: 'Claim 2 is partly disclosed.' }],
    })
    const turn = savedTurn('Build the invalidity case against EP2000000A1 and save outputs/chart.md', receipt, JSON.stringify({ template: 'invalidity-claim-chart', coverage: [{ feature: 'Claim 1' }] }))
    const nudge = await checkPriorArtReportCompletion([], turn, reader({ [report]: 'Chart', [evidence]: 'Snapshot' }))
    expect(nudge?.startsWith('The saved chart lists 1 open point (rung-1) and ')).toBe(true)
  })
})
