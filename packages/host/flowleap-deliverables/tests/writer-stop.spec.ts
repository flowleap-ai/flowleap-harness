/**
 * `write_patent_results` when the user stops the turn during a structured save (#128): a Stop before
 * the first write leaves no file, a Stop between the evidence write and the report write still leaves
 * the report beside its evidence, and a Stop after the writes still shows the delivery card.
 */

import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMINER, EXAMINER_DEPENDENT, writerBench } from './writer-test-bench.ts'

type Bench = Awaited<ReturnType<typeof writerBench>>
const benches: Bench[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const bench of benches.splice(0)) await bench.dispose()
})

const anchor = `${EXAMINER}:claims:2:en`

/** A prior-art review of one partial row, valid against the recorded claims. */
const review = {
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
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (_missing) {
    // A missing file is the answer, not a failure.
    return false
  }
}

/** Save the review with Stop pressed right after `step` of the path that ends with `suffix`. */
async function saveWithStop(step: 'resolve' | 'write', suffix: string) {
  const bench = await writerBench()
  benches.push(bench)
  bench.session.append('turn/start', { turn: 1 })
  await bench.read(EXAMINER)
  const stop = new AbortController()
  const fs = bench.ctx.fs
  const matches = (target: FsTarget) => fs.processPath(target).endsWith(suffix)
  if (step === 'resolve') {
    const real = fs.resolve.bind(fs)
    vi.spyOn(fs, 'resolve').mockImplementation(async (path, options) => {
      const target = await real(path, options)
      if (matches(target)) stop.abort()
      return target
    })
  } else {
    const real = fs.writeText.bind(fs)
    vi.spyOn(fs, 'writeText').mockImplementation(async (target, ...rest) => {
      const written = await real(target, ...rest)
      if (matches(target)) stop.abort()
      return written
    })
  }
  const result = await bench.run('write_patent_results', review, true, stop.signal)
  const report = join(bench.dir, 'outputs', 'review.md')
  const cards = bench.session.snapshotEvents().flatMap(event => event.type === 'deliverables/presented' ? [event.data.files.map(file => file.description)] : [])
  const files = {
    report: await exists(report),
    evidence: await exists(`${report}.evidence.json`),
    record: await exists(join(bench.dir, 'outputs', 'review.working-record.md')),
  }
  return { outcome: { aborted: result.isError, ...files, cards }, report }
}

describe('a Stop during a structured save', () => {
  it('writes no file when the Stop comes before the first write', async () => {
    const { outcome } = await saveWithStop('resolve', 'review.md.evidence.json')
    expect(outcome).toEqual({ aborted: true, report: false, evidence: false, record: false, cards: [] })
  })

  it('writes the report beside its evidence and presents it when the Stop comes between the two writes', async () => {
    const { outcome, report } = await saveWithStop('write', 'review.md.evidence.json')
    expect(outcome).toEqual({ aborted: true, report: true, evidence: true, record: true, cards: [['Report', 'Working record']] })
    expect(await readFile(report, 'utf8')).toContain('Sealed sensor housings')
  })

  it('presents the saved report when the Stop comes after the report write', async () => {
    const { outcome } = await saveWithStop('write', 'review.md')
    expect(outcome).toEqual({ aborted: true, report: true, evidence: true, record: true, cards: [['Report', 'Working record']] })
  })
})
