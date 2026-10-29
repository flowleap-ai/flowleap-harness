/** Finding lines that the IDE-ported finding specs do not exercise. */

import { describe, expect, it } from 'vitest'
import { formatFindingLine } from '../src/drafting/finding.ts'

describe('Application Drafting finding line', () => {
  it('shows the severity, the location and the citation when the options ask for them', () => {
    const line = formatFindingLine(
      { severity: 'Note', rule: 'abstract-length', message: 'The abstract is\n  long.', file: 'draft-application.md', line: 4, citation: 'MPEP 608.01(b)' },
      { severity: true, citation: true },
    )
    expect(line).toBe('- Note `abstract-length` (draft-application.md, line 4): The abstract is long. [MPEP 608.01(b)]')
  })

  it('omits the location and the citation when the finding has neither', () => {
    const line = formatFindingLine({ severity: 'Error', rule: 'claims-changed', message: 'The claims changed.' }, { citation: true })
    expect(line).toBe('- `claims-changed`: The claims changed.')
  })
})
