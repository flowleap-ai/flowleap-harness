/**
 * `write_patent_results` on the paths the main writer spec does not reach: malformed arguments, a
 * call without an agent, a path that does not resolve, a write that fails for the report, the
 * verdict file or the working record, the second read in `log` and `render` mode with open
 * objections across re-saves and a judge that did not run, a landscape report's figure
 * provenance, a wording review, and a drafting save that fails.
 */

import { FsError } from '@deepseek-ai/dsh-fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConfirmedMarkets, NO_GATE_SEAMS, NO_LLM_JUDGE, parseWriterArgs, PatentLedger, PresentQueue, writePatentResultsTool,
} from '../src/index.ts'
import { claims, draft, featureList, outline } from './drafting-matter-fixtures.ts'
import { EXAMINER, EXAMINER_DEPENDENT, writerBench } from './writer-test-bench.ts'

type Bench = Awaited<ReturnType<typeof writerBench>>
const benches: Bench[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const bench of benches.splice(0)) await bench.dispose()
})

async function open(...args: Parameters<typeof writerBench>): Promise<Bench> {
  const bench = await writerBench(...args)
  benches.push(bench)
  return bench
}

const anchor = `${EXAMINER}:claims:2:en`

/** A prior-art review of one partial row with two elements, valid against the recorded claims. */
const review = (extra: Record<string, unknown> = {}) => ({
  filePath: 'outputs/review.md',
  content: '',
  template: 'prior-art-report',
  subject: 'Sealed sensor housings',
  coverage: [{
    feature: 'Essential combination',
    kind: 'combination',
    importance: 'essential',
    status: 'partial',
    sourceAnchors: [anchor],
    evidence: [{ anchor, quote: EXAMINER_DEPENDENT, scope: 'Only the quoted claim.', qualifiers: 'As written.', quantityBasis: 'None asserted.' }],
    elements: [{ element: 'Sealed housing', anchor, disclosedBy: 'housing is sealed' }, { element: 'Complete recited combination' }],
    gap: 'The feedback interval is not disclosed.',
  }],
  limitations: ['Synthetic fixture.'],
  stopReason: 'Bounded result.',
  ...extra,
})

/** A judge reply with the given verdicts. */
const verdicts = (...entries: [string, 'agree' | 'disagree' | 'unclear'][]) => JSON.stringify({
  verdicts: entries.map(([element, verdict]) => ({ element, verdict, reason: `${element} reason.` })),
})

/** Make every write of a path that ends with `suffix` fail with `failure`. */
function failWrites(bench: Bench, suffix: string, failure: unknown): void {
  const real = bench.ctx.fs.writeText.bind(bench.ctx.fs)
  vi.spyOn(bench.ctx.fs, 'writeText').mockImplementation((target, ...rest) => bench.ctx.fs.processPath(target).endsWith(suffix)
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- failures that are not an Error are among the cases under test
    ? Promise.reject(failure)
    : real(target, ...rest))
}

describe('the writer arguments and value', () => {
  it('rejects arguments that are not of the declared shape, and renders a value that is not the writer\'s as JSON', () => {
    const failures = [[], { filePath: ' ', content: '' }, { filePath: 'a\0b', content: '' }, { filePath: 'a.md', content: 3 }, { filePath: 'a.md', content: '', template: 'memo' }].map((args) => {
      try {
        parseWriterArgs(args)
        return 'parsed'
      } catch (error) {
        return error instanceof Error ? error.message.split(': ')[2] : 'not an Error'
      }
    })
    const definition = writePatentResultsTool({} as never, {
      ledger: new PatentLedger(), judge: () => NO_LLM_JUDGE, present: new PresentQueue(), secondRead: () => 'off',
      warn: () => {}, info: () => {}, gates: NO_GATE_SEAMS, markets: new ConfirmedMarkets(),
    })
    expect({
      failures,
      nullTemplate: parseWriterArgs({ filePath: 'a.md', content: 'x', template: null }),
      rendered: definition.output?.render({}, 42),
    }).toEqual({
      failures: [
        'expected an object',
        'filePath must be a non-empty string',
        'filePath must be a non-empty string',
        'content must be a string (empty for the structured templates)',
        expect.stringMatching(/^template must be one of prior-art-report, /) as string,
      ],
      nullTemplate: { filePath: 'a.md', content: 'x' },
      rendered: [{ type: 'text', text: '42' }],
    })
  })
})

describe('a save without an agent or with a failing filesystem', () => {
  it('saves in the default working directory without an agent, and refuses a structured save that has no records', async () => {
    const bench = await open()
    const free = await bench.write({ filePath: 'notes.md', content: 'Notes' }, false)
    const structured = await bench.write(review(), false)
    expect([free.split('\n')[0], structured.split('\n')[0]]).toEqual([
      'Successfully wrote patent results to notes.md',
      'Candidate draft was not saved. Correct these issues and retry with the revised content:',
    ])
  })

  it('fails the call when a path cannot be resolved for a reason other than the filesystem', async () => {
    const bench = await open()
    const real = bench.ctx.fs.resolve.bind(bench.ctx.fs)
    vi.spyOn(bench.ctx.fs, 'resolve').mockImplementation((path, options) => path === 'notes.md'
      ? Promise.reject(new Error('resolver crashed'))
      : real(path, options))
    const result = await bench.run('write_patent_results', { filePath: 'notes.md', content: 'Notes' })
    expect(result.isError).toBe(true)
  })

  it('refuses a path that the filesystem cannot resolve', async () => {
    const bench = await open()
    const real = bench.ctx.fs.resolve.bind(bench.ctx.fs)
    vi.spyOn(bench.ctx.fs, 'resolve').mockImplementation((path, options) => path === 'notes.md'
      ? Promise.reject(new FsError('no such path', 'FS_NOT_FOUND'))
      : real(path, options))
    const text = await bench.write({ filePath: 'notes.md', content: 'Notes' })
    expect(text.split('\n')[0]).toMatch(/^Error: Patent result writes must stay within the working directory /)
  })

  it('reports a failed report write as an error, naming a filesystem code', async () => {
    const bench = await open()
    const outcomes: string[] = []
    for (const failure of [new FsError('disk full', 'FS_IO_ERROR'), new Error('quota'), 'busy']) {
      failWrites(bench, 'notes.md', failure)
      outcomes.push(await bench.write({ filePath: 'notes.md', content: 'Notes' }))
      vi.restoreAllMocks()
    }
    expect({ outcomes, logged: bench.logged }).toEqual({
      outcomes: ['Error: disk full (FS_IO_ERROR)', 'Error: quota', 'Error: Unknown error occurred'],
      logged: [
        'flowleap-deliverables: write_patent_results failed: disk full (FS_IO_ERROR)',
        'flowleap-deliverables: write_patent_results failed: quota',
        'flowleap-deliverables: write_patent_results failed: Unknown error occurred',
      ],
    })
  })

  it('keeps the report when the working record cannot be written, and does not present the record', async () => {
    const bench = await open()
    await bench.read(EXAMINER)
    const outcomes: string[][] = []
    for (const failure of [new Error('record locked'), 'record busy']) {
      failWrites(bench, 'working-record.md', failure)
      outcomes.push((await bench.write(review())).split('\n').filter(line => /^(Successfully|Working record)/.test(line)))
      vi.restoreAllMocks()
    }
    expect({ outcomes, logged: bench.logged }).toEqual({
      outcomes: [['Successfully wrote patent results to outputs/review.md'], ['Successfully wrote patent results to outputs/review.md']],
      logged: [
        'flowleap-deliverables: working record was not written: record locked',
        'flowleap-deliverables: working record was not written: record busy',
      ],
    })
  })
})

describe('the second read', () => {
  it('logs the verdicts beside the evidence in log mode, and says so when the verdict file cannot be written', async () => {
    const reply = verdicts(['Sealed housing', 'agree'], ['Complete recited combination', 'disagree'])
    const bench = await open({ secondRead: 'log' }, [reply, reply, reply])
    await bench.read(EXAMINER)
    const line = async () => (await bench.write(review())).split('\n').find(entry => entry.startsWith('Second read')) ?? ''
    const written = await line()
    failWrites(bench, '.second-read.json', new Error('verdicts locked'))
    const failed = await line()
    vi.restoreAllMocks()
    failWrites(bench, '.second-read.json', 'verdicts busy')
    await line()
    expect({ written, failed, logged: bench.logged }).toEqual({
      written: 'Second read (diagnostic): 2 elements judged, 1 disagree, 0 unclear, 0 unparsed; verdicts in review.md.second-read.json.',
      failed: 'Second read (diagnostic): 2 elements judged, 1 disagree, 0 unclear, 0 unparsed; verdicts in no file (write failed).',
      logged: [
        'flowleap-deliverables: second-read verdicts were not written: verdicts locked',
        'flowleap-deliverables: second-read verdicts were not written: verdicts busy',
      ],
    })
  })

  it('names the open objections in render mode, counts down the re-saves, and resets after a save without objections', async () => {
    const many = verdicts(...Array.from({ length: 7 }, (_, index): [string, 'disagree'] => [`Element ${String(index + 1)}`, 'disagree']), ['Element 8', 'unclear'])
    const agreed = verdicts(['Sealed housing', 'agree'], ['Complete recited combination', 'agree'])
    const bench = await open({ secondRead: 'render' }, [many, many, many, agreed, many])
    await bench.read(EXAMINER)
    const result = async () => (await bench.write(review())).split('\n').filter(line => /^(Second read|If a disagreement|Stop:)/.test(line))
    const first = await result()
    const second = await result()
    const third = await result()
    const clean = await result()
    const again = await result()
    expect({ first, second: second[1], third: third[1], clean, again: again[1] }).toEqual({
      first: [
        expect.stringMatching(new RegExp([
          String.raw`^Second read \(model\): 8 elements judged, 7 not confirmed, 1 unclear\. `,
          String.raw`Not confirmed: Essential combination / Element 1 — Element 1 reason; .*; and 2 more in the working record\.$`,
        ].join(''))) as string,
        'If a disagreement is right, downgrade or reword that row and re-save; if the second read is wrong, leave the row and say why in its gap. Re-save at most 2 more times for second-read objections.',
      ],
      second: 'If a disagreement is right, downgrade or reword that row and re-save; if the second read is wrong, leave the row and say why in its gap. Re-save at most once more for second-read objections.',
      third: 'Stop: remaining objections are recorded for the reviewer. Do not re-save for them again; list them in the chat summary as open second-read points.',
      clean: ['Second read (model): 2 elements judged, 0 not confirmed.'],
      again: 'If a disagreement is right, downgrade or reword that row and re-save; if the second read is wrong, leave the row and say why in its gap. Re-save at most 2 more times for second-read objections.',
    })
  })

  it('says the second read did not run after two network failures', async () => {
    const bench = await open({ secondRead: 'render' }, ['throw:fetch failed', 'throw:fetch failed'])
    await bench.read(EXAMINER)
    const result = await bench.write(review())
    expect(result.split('\n').find(line => line.startsWith('Second read'))).toBe('Second read: not run (network error, retried once). The report and the working record say so.')
  })
})

describe('the checked report text', () => {
  it('flags a legal conclusion for the wording review, and validates the concepts and classifications', async () => {
    const bench = await open()
    await bench.read(EXAMINER)
    const result = await bench.write(review({
      concepts: [{ concept: 'sealing', synonyms: ['moisture barrier'] }],
      classifications: [{ code: 'G01D 11/24', meaning: 'Housings for sensors' }],
      objective: 'Find the core novelty of the sealed housing.',
    }))
    expect(result.split('\n').find(line => line.startsWith('Wording review'))).toBe('Wording review: 1 phrase(s) flagged in the working record; reword them in a follow-up save if they are conclusions rather than disclaimers.')
  })

  it('refuses a review without limitations or without coverage', async () => {
    const bench = await open()
    await bench.read(EXAMINER)
    expect(await bench.write(review({ limitations: undefined }))).toContain('- Supply the search and evidence limitations.')
    expect(await bench.write(review({ coverage: undefined }))).toContain('- Supply coverage for essential features and their combination, including unresolved tracks.')
  })

  it('states the figure provenance of a landscape report saved without an agent, with and without figures it could not trace', async () => {
    const bench = await open()
    const traced = await bench.write({ filePath: 'outputs/plain.md', content: 'Filing trend: no figures.', template: 'landscape-report', subject: 'Sensors' }, false)
    const untraced = await bench.write({ filePath: 'outputs/landscape.md', content: 'Top filer: 4242 families in 2025.', template: 'landscape-report', subject: 'Sensors' }, false)
    const provenance = (text: string) => text.split('\n').find(line => line.startsWith('Figure provenance')) ?? ''
    expect({ traced: provenance(traced).includes('in a follow-up save'), untraced: provenance(untraced).includes('in a follow-up save') }).toEqual({ traced: false, untraced: true })
  })
})

describe('a drafting save', () => {
  /** The hinge matter with both gates open, so a draft save reaches its write. */
  const matter = async (bench: Bench) => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(`${bench.dir}/drafting/hinge`, { recursive: true })
    await writeFile(`${bench.dir}/drafting/hinge/feature-list.md`, featureList())
    await writeFile(`${bench.dir}/drafting/hinge/claims.md`, claims())
    await writeFile(`${bench.dir}/drafting/hinge/draft-outline.md`, outline())
  }
  const save = (filePath = 'drafting/hinge/draft-application.md') => ({ filePath, content: draft(), template: 'draft-application' })

  it('refuses a path that is the working directory itself or outside it, and saves without an agent', async () => {
    const bench = await open()
    await matter(bench)
    expect({
      root: (await bench.write(save('.'))).split(' Open in ')[0],
      outside: (await bench.write(save('../drafting/hinge/draft-application.md'))).split(' Open in ')[0],
      noAgent: (await bench.write(save(), false)).split('\n').at(-1),
    }).toEqual({
      root: 'Draft was not saved. The draft-application template saves to drafting/<matter>/draft-application.md inside a workspace folder.',
      outside: 'Draft was not saved. The draft-application template saves to drafting/<matter>/draft-application.md inside a workspace folder.',
      noAgent: 'Delivered to the user; do not call `present` for these files.',
    })
  })

  it('reports a failed write as an error, naming a filesystem code', async () => {
    const bench = await open()
    await matter(bench)
    const outcomes: string[] = []
    for (const failure of [new FsError('disk full', 'FS_IO_ERROR'), new Error('quota'), 'busy']) {
      failWrites(bench, 'draft-application.md', failure)
      outcomes.push(await bench.write(save()))
      vi.restoreAllMocks()
    }
    expect({ outcomes, logged: bench.logged }).toEqual({
      outcomes: ['Error: disk full (FS_IO_ERROR)', 'Error: quota', 'Error: Unknown error occurred'],
      logged: [
        'flowleap-deliverables: write_patent_results draft-application failed: disk full (FS_IO_ERROR)',
        'flowleap-deliverables: write_patent_results draft-application failed: quota',
        'flowleap-deliverables: write_patent_results draft-application failed: Unknown error occurred',
      ],
    })
  })
})
