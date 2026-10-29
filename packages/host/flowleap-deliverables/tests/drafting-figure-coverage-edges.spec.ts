/** Claimed-feature coverage and Feature List inputs that the IDE-ported specs do not exercise. */

import { describe, expect, it } from 'vitest'
import { parseClaims } from '../src/drafting/claims.ts'
import { checkClaimedFeatureCoverage } from '../src/drafting/figure-validators.ts'
import { checkOutline, parseFeatureRows } from '../src/drafting/outline-validators.ts'
import { parseDraftOutline } from '../src/drafting/outline.ts'

const outlineOf = (rows: readonly string[]) => [
  '---',
  'office: US',
  'claims: c1',
  '---',
  '| Item | Section | Kind | Claims | Claim terms | Sources | Explain | Question |',
  '|------|---------|------|--------|-------------|---------|---------|----------|',
  ...rows,
].join('\n')

const featureList = '---\noffice: US\n---\n| F1 | A hinge. | §1 | working |\n| F2 | A lever. | §1 | working |\n'

describe('Application Drafting claimed-feature coverage edges', () => {
  it('names a row that has no text by its ID, and says when every citing claim is independent', () => {
    const outline = parseDraftOutline(outlineOf([
      '| O1 | Detailed Description | Technical | 1, 2 | 12 | F9 | yes |  |',
      '| O2 | Detailed Description | Technical | 1 | a lever | F2 | yes |  |',
    ]))
    const findings = checkClaimedFeatureCoverage({ office: 'US', figures: '## FIG. 1\n\n- 10: hinge [F1]\n', outline, featureList, claims: parseClaims('1. A hinge.\n2. A door.') })
    expect(findings.map(finding => finding.message)).toEqual([
      'Feature List row F9, which the Draft Outline cites for claims 1, 2, has no drawn part in figures.md (37 CFR 1.83(a): the drawings must show every feature'
        + ' specified in the claims). The attorney decides: "Add a figure of F9", then link its part under the figure heading, e.g. "- 20: <part> [F9]".'
        + ' Claims 1 and 2 are independent, so the claims are not removed.',
      'Feature List row F2, which the Draft Outline cites for claim 1, has no drawn part in figures.md (37 CFR 1.83(a): the drawings must show every feature'
        + ' specified in the claims). The attorney decides: "Add a figure of a lever (F2)", then link its part under the figure heading, e.g. "- 20: <part> [F2]".'
        + ' Claim 1 is independent, so the claim is not removed.',
    ])
  })

  it('reports nothing when figures.md links no part and the outline cites no row', () => {
    const outline = parseDraftOutline(outlineOf(['| O1 | Background | Template |  |  |  | no |  |']))
    expect(checkClaimedFeatureCoverage({ office: 'US', figures: '## FIG. 1\n\n- 10: hinge\n', outline, featureList, claims: [] })).toEqual([])
  })
})

describe('Application Drafting Feature List rows edges', () => {
  it('reads list rows, a prophetic list row and a table row with no text cell', () => {
    const rows = parseFeatureRows('# Elements\n\n- F1: A hinge.\n**F2** - A damper, prophetic.\n| F3\n')
    expect(Object.fromEntries(rows)).toEqual({
      F1: { text: 'A hinge.', section: 'Elements', prophetic: false },
      F2: { text: 'A damper, prophetic.', section: 'Elements', prophetic: true },
      F3: { text: '', section: 'Elements', prophetic: false },
    })
  })

  it('checks an outline without an inventor-answers.md the same as with an empty one', () => {
    const input = { outline: outlineOf(['| O1 | Detailed Description | Technical | 1 | a hinge | F1 | yes |  |']), approvedClaimsHash: 'c1', claims: '1. A hinge.', featureList }
    expect(checkOutline(input)).toEqual(checkOutline({ ...input, inventorAnswers: '' }))
  })
})
