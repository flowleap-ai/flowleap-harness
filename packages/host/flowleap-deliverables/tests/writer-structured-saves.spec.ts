/**
 * The structured saves the main writer spec does not make: a Find Better report (inline Baseline
 * and Baseline file, complete and incomplete search) and an invalidity chart from coverage, each
 * accepted with its receipt and summary contract, and the refusals of a Baseline path that is
 * outside the workspace, not JSON, or not an object.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMINER, EXAMINER_DEPENDENT, FOUND, FOUND_CLAIM, writerBench } from './writer-test-bench.ts'

type Bench = Awaited<ReturnType<typeof writerBench>>
const benches: Bench[] = []
afterEach(async () => {
  for (const bench of benches.splice(0)) await bench.dispose()
})

async function open(...args: Parameters<typeof writerBench>): Promise<Bench> {
  const bench = await writerBench(...args)
  benches.push(bench)
  await bench.read(EXAMINER)
  await bench.read(FOUND)
  return bench
}

const evidence = (anchor: string, quote: string) => ({
  anchor, quote, scope: 'Only the quoted claim.', qualifiers: 'As written.', quantityBasis: 'No quantities asserted.',
})

const baseline = {
  publication: 'EP9000000A1',
  offices: ['EP'],
  documents: [{ document: EXAMINER, cells: { EP: { citations: [{ category: 'X', citing: 'EP9000000A1', citedBy: 'examiner' }] } } }],
  gaps: [],
}

const tracks = (complete: boolean) => [
  { name: 'Backward citations', queries: [{ query: 'cited by EP9000000A1', count: 1, hop: 1 }, ...complete ? [{ query: 'second hop', count: 0, hop: 2 }] : []] },
  { name: 'Classification', queries: [{ query: 'G01D', count: 3 }] },
  ...complete ? [{ name: 'Keywords', queries: [{ query: 'sealed housing', count: 2 }] }] : [],
]

const findBetter = (extra: Record<string, unknown> = {}) => ({
  filePath: 'outputs/find-better.md',
  content: '',
  template: 'find-better-report',
  subject: 'Sealed sensor housings',
  examinerBestArt: [{ claimNumber: '1', publications: [EXAMINER] }],
  tracks: tracks(true),
  coverage: [
    {
      feature: 'Sealed housing',
      kind: 'feature',
      importance: 'essential',
      status: 'supported',
      claimNumber: '1',
      gap: '',
      examiner: { status: 'supported', sourceAnchors: [`${EXAMINER}:claims:2:en`], evidence: [evidence(`${EXAMINER}:claims:2:en`, EXAMINER_DEPENDENT)], gap: '',
        elements: [{ element: 'Sealed housing', anchor: `${EXAMINER}:claims:2:en`, disclosedBy: 'housing is sealed' }] },
      found: { status: 'supported', sourceAnchors: [`${FOUND}:claims:1:en`], evidence: [evidence(`${FOUND}:claims:1:en`, FOUND_CLAIM)], gap: '',
        elements: [{ element: 'Sealed housing', anchor: `${FOUND}:claims:1:en`, disclosedBy: 'sealed sensor housing' }] },
    },
    {
      feature: 'Complete combination',
      kind: 'combination',
      importance: 'essential',
      status: 'unresolved',
      claimNumber: '1',
      gap: 'Not charted.',
      examiner: { status: 'unresolved', gap: 'The feedback interval is not disclosed.' },
      found: { status: 'unresolved', gap: 'The feedback interval is not disclosed.' },
    },
  ],
  limitations: ['Synthetic fixture.'],
  stopReason: 'Bounded result.',
  baseline,
  ...extra,
})

const chart = (extra: Record<string, unknown> = {}) => ({
  filePath: 'outputs/chart.md',
  content: '',
  template: 'invalidity-claim-chart',
  matter: FOUND,
  subject: 'Sealed sensor housings',
  coverage: [
    {
      feature: 'Claim 1 — sealed sensor housing',
      kind: 'feature',
      importance: 'essential',
      status: 'supported',
      claimNumber: '1',
      sourceAnchors: [`${EXAMINER}:claims:2:en`],
      evidence: [evidence(`${EXAMINER}:claims:2:en`, EXAMINER_DEPENDENT)],
      elements: [{ element: 'Sealed housing', anchor: `${EXAMINER}:claims:2:en`, disclosedBy: 'housing is sealed' }],
      gap: '',
    },
    {
      feature: 'Claim 1 — complete combination',
      kind: 'combination',
      importance: 'essential',
      status: 'unresolved',
      claimNumber: '1',
      gap: 'The moisture barrier is not disclosed.',
    },
  ],
  limitations: ['Synthetic fixture.'],
  stopReason: 'Bounded result.',
  ...extra,
})

/** The result lines of a save, with the receipt's process paths and digests left out. */
const lines = (text: string) => text.split('\n').filter(line => !line.startsWith('Prior-art artifact receipt: '))

describe('a Find Better report', () => {
  it('saves from an inline Baseline over a complete search, naming the unchecked completeness and the ignored numbers', async () => {
    const bench = await open()
    const result = lines(await bench.write(findBetter({ score: 7 })))
    expect(result.slice(0, 4)).toEqual([
      'Successfully wrote patent results to outputs/find-better.md',
      'Examiner Baseline source: inline. Baseline completeness not checked: membersWalked reports no read publication with a citedCount, so the writer could not compare documents[] with the offices\' own counts.',
      'Ignored model-supplied numeric field(s): score. A Find Better report counts disclosed elements from the validated rows only; no model-supplied number reaches the report.',
      'Chat summary contract: repeat each cell\'s status word exactly (disclosed / partially disclosed / not found); state each claim\'s counts exactly as the saved report counts them (claim 1 — examiner\'s best art: disclosed 1 of 1 · best art found: disclosed 1 of 1); state that the Baseline has 0 gaps in the offices\' records and that a gap is not "nothing cited"; where no better art was found, say so as a complete result. Do not add invalidity, anticipation or obviousness conclusions. The summary must not be more certain than the saved report.',
    ])
  })

  it('saves from a Baseline file over an incomplete search with one gap, its completeness checked', async () => {
    const bench = await open()
    const counted = {
      ...baseline,
      membersWalked: [{ office: 'EP', publications: [{ publication: 'EP9000000A1', status: 'read', citedCount: 1 }] }],
      gaps: [{ member: 'US9000000B2', reason: 'no record' }],
    }
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(`${bench.dir}/references`, { recursive: true })
    await writeFile(`${bench.dir}/references/baseline.json`, JSON.stringify(counted))
    const result = lines(await bench.write(findBetter({ baseline: undefined, baselinePath: 'references/baseline.json', tracks: tracks(false) })))
    expect(result.slice(1, 3)).toEqual([
      'Examiner Baseline source: file references/baseline.json.',
      'Chat summary contract: repeat each cell\'s status word exactly (disclosed / partially disclosed / not found); state each claim\'s counts exactly as the saved report counts them (claim 1 — examiner\'s best art: disclosed 1 of 1 · best art found: disclosed 1 of 1); state that the Baseline has 1 gap in the offices\' records and that a gap is not "nothing cited"; state that the search is incomplete (only 2 of the 3 mandatory tracks is logged; Track 1 has no second-hop entry) and do not present "no better art found" as a complete result. Do not add invalidity, anticipation or obviousness conclusions. The summary must not be more certain than the saved report.',
    ])
  })

  it('refuses missing inputs, and a Baseline path outside the workspace, not JSON, or not an object', async () => {
    const bench = await open()
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(`${bench.dir}/references`, { recursive: true })
    const files = [['broken', '{'], ['null', 'null'], ['array', '[]'], ['number', '7']] as const
    for (const [name, text] of files) await writeFile(`${bench.dir}/references/${name}.json`, text)
    const withPath = (path: string) => findBetter({ baseline: undefined, baselinePath: path })
    const refusals = [
      await bench.write(findBetter({ tracks: [] })),
      await bench.write(withPath('../outside.json')),
      await bench.write(withPath('references/broken.json')),
      await bench.write(withPath('references/null.json')),
      await bench.write(withPath('references/array.json')),
      await bench.write(withPath('references/number.json')),
    ]
    expect(refusals.map(text => text.split('(')[0])).toEqual([
      'Report was not saved. find-better-report is a structured save and needs tracks ',
      'Report was not saved. baselinePath "../outside.json" is not a path inside the working directory. Save the Baseline in the workspace with the examiner_baseline tool ',
      'Report was not saved. baselinePath "references/broken.json" could not be read as JSON ',
      'Report was not saved. baselinePath "references/null.json" does not hold a Baseline object. It must be the unedited file the examiner_baseline tool wrote, or the unedited --json output of flowleap patent examiner-baseline.',
      'Report was not saved. baselinePath "references/array.json" does not hold a Baseline object. It must be the unedited file the examiner_baseline tool wrote, or the unedited --json output of flowleap patent examiner-baseline.',
      'Report was not saved. baselinePath "references/number.json" does not hold a Baseline object. It must be the unedited file the examiner_baseline tool wrote, or the unedited --json output of flowleap patent examiner-baseline.',
    ])
  })

  it('names a Baseline read failure that is not an Error', async () => {
    const bench = await open()
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(`${bench.dir}/references`, { recursive: true })
    await writeFile(`${bench.dir}/references/baseline.json`, JSON.stringify(baseline))
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a failure that is not an Error is the case under test
    vi.spyOn(bench.ctx.fs, 'readText').mockImplementationOnce(() => Promise.reject('device busy'))
    const refusal = await bench.write(findBetter({ baseline: undefined, baselinePath: 'references/baseline.json' }))
    vi.restoreAllMocks()
    expect(refusal.split('. It must')[0]).toBe('Report was not saved. baselinePath "references/baseline.json" could not be read as JSON (device busy)')
  })
})

describe('an invalidity chart', () => {
  it('saves from coverage for the matter, stating its open points, and for a named challenged patent with a critical date', async () => {
    const bench = await open()
    const forMatter = lines(await bench.write(chart({ rounds: [] })))
    const named = lines(await bench.write(chart({ filePath: 'outputs/named.md', challengedPublication: FOUND, matter: undefined, criticalDate: '2001-01-01' })))
    const blankDate = lines(await bench.write(chart({ filePath: 'outputs/blank.md', criticalDate: '  ' })))
    expect({
      forMatter: forMatter.find(line => line.startsWith('Open points')),
      named: named.find(line => line.startsWith('Open points')),
      blankDate: blankDate.find(line => line.startsWith('Open points')),
      header: (await readReport(bench.dir, 'outputs/named.md')).includes(FOUND),
    }).toEqual({
      forMatter: 'Open points: none. Critical date: not given (no criticalDate), so the publication dates of the cited documents were not checked.',
      named: expect.stringMatching(/^Open points: 1\. Critical date: 2001-01-01\. Write the Round Report now/) as string,
      blankDate: 'Open points: none. Critical date: not given (no criticalDate), so the publication dates of the cited documents were not checked.',
      header: true,
    })
  })

  it('saves a written chart without coverage as a checked report', async () => {
    const bench = await open()
    const written = await bench.write({
      filePath: 'outputs/written.md', template: 'invalidity-claim-chart', matter: FOUND, subject: 'Sealed sensor housings',
      content: `| Claim Element | ${EXAMINER} |\n| --- | --- |\n| Sealed housing | "${EXAMINER_DEPENDENT}" |`,
      coverage: [],
    })
    expect(written.split('\n')[0]).toBe('Successfully wrote patent results to outputs/written.md')
  })
})

/** The text of a saved report. */
async function readReport(dir: string, path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return readFile(`${dir}/${path}`, 'utf8')
}
