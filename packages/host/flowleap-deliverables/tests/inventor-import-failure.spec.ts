/**
 * `inventor_questions` import when the Word reader fails with a value that is not an Error: the
 * refusal names the value. The reader is replaced for this file only, because mammoth fails with
 * Error instances.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { draft, gatesOpen, openQuestion } from './drafting-matter-fixtures.ts'
import { benchWith } from './gates-test-bench.ts'

vi.mock('../src/docx/inventor-questions.ts', async original => ({
  ...await original<typeof import('../src/docx/inventor-questions.ts')>(),
  // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a failure that is not an Error is the case under test
  readInventorQuestionsDocx: () => Promise.reject('unreadable table'),
}))

const benches: Awaited<ReturnType<typeof benchWith>>[] = []
afterEach(async () => {
  for (const bench of benches.splice(0)) await bench.dispose()
})

describe('inventor_questions import', () => {
  it('names a reader failure that is not an Error', async () => {
    const bench = await benchWith(gatesOpen)
    benches.push(bench)
    await bench.tools.start()
    await bench.tools.save(draft(openQuestion))
    await bench.write('drafting/hinge/inventor-questions.docx', 'answered')
    const result = await bench.tools.inventor('import')
    expect(result.split(' Open in ')[0]).toBe('No answer was copied. drafting/hinge/inventor-questions.docx could not be read as a Word file: unreadable table')
  })
})
