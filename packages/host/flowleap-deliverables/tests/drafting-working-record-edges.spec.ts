/** Working Record inputs that the IDE-ported working-record specs do not exercise. */

import { describe, expect, it } from 'vitest'
import { addRecordLine, resaveWorkingRecord, splitSentences, withAttorneyEdits } from '../src/drafting/working-record.ts'

const sourceMap = [
  '## Source map',
  '',
  'Each sentence of the draft as saved, at the line of its paragraph, with the sources the paragraph marker names.'
    + ' "none" means the paragraph has no valid marker; the claims carry none, they are the Approved Claims.',
  '',
  '| Line | Section | Sources | Sentence |',
  '| --- | --- | --- | --- |',
  '| 2 |  | template | A hinge. |',
  '',
]

describe('Application Drafting Working Record edges', () => {
  it('adds a Header section to a record that has none', () => {
    expect(addRecordLine('# Working record\n', 'Re-saved', 't1')).toBe('# Working record\n\n## Header\n\n- **Re-saved:** t1\n')
  })

  it('keeps the text after the last sentence end as a sentence', () => {
    expect(splitSentences('A hinge. A lever')).toEqual(['A hinge.', 'A lever'])
  })

  it('adds a source map to a re-saved record that has none, before the Attorney edits', () => {
    const draft = '<!-- src: template -->\nA hinge.\n'
    expect(resaveWorkingRecord('## Header\n', draft, 't1')).toBe([
      '## Header', '', '- **Re-saved:** t1', '', ...sourceMap,
    ].join('\n'))
    expect(resaveWorkingRecord('## Header\n\n## Attorney edits\n\nNone.\n', draft, 't1')).toBe([
      '## Header', '', '- **Re-saved:** t1', '', ...sourceMap,
      '## Attorney edits', '', 'None.', '',
    ].join('\n'))
  })

  it('replaces the Attorney edits section of a record that has one', () => {
    expect(withAttorneyEdits('## Header\n\n## Attorney edits\n\nOld.\n', { kept: 2, changes: [] }, 't3')).toBe([
      '## Header', '', '## Attorney edits', '', 'Exported t3. Against the generated snapshot: 2 paragraph(s) kept, 0 changed, 0 deleted, 0 added.', '',
    ].join('\n'))
  })

  it('writes deleted and added paragraphs, and adds the section to a record that has none', () => {
    const diff = { kept: 1, changes: [{ kind: 'deleted' as const, before: 'A lever.' }, { kind: 'added' as const, after: 'A spring.', line: 9 }] }
    expect(withAttorneyEdits('## Header\n', diff, 't2')).toBe([
      '## Header', '', '## Attorney edits', '',
      'Exported t2. Against the generated snapshot: 1 paragraph(s) kept, 0 changed, 1 deleted, 1 added.',
      '', '### Deleted', '', 'Generated (sources: none):', '', '> A lever.',
      '', '### Added (line 9)', '', 'Attorney:', '', '> A spring.', '',
    ].join('\n'))
  })
})
