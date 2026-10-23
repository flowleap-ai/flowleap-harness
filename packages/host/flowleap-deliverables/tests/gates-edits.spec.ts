/**
 * The pure gate edits (the IDE's `draftingGateLens.spec.ts` without the CodeLens and the
 * WorkspaceEdit): the flag written only on an open gate and only inside the frontmatter, the
 * comments kept; the waiver written under each chosen item and nothing on an empty reason or a
 * waived item; the card options one per Error plus "All N" per rule with more than two; and
 * the `/waive` target by line or rule.
 */

import { describe, expect, it } from 'vitest'
import type { DraftFinding } from '../src/drafting/finding.ts'
import { renderFindingsFile } from '../src/drafting/findings-file.ts'
import { waiveChoices, waiveTarget, withGateFlag, withWaivers } from '../src/gates/edits.ts'

const help = '# Review, then change false to true below, or click the action at the top.'

describe('withGateFlag', () => {
  it('sets the flag line in place, adds a missing flag or a missing block, keeps the comments, and is inert on a set flag or invalid YAML', () => {
    const cases: [flag: 'confirmed' | 'approved', text: string][] = [
      ['confirmed', `---\noffice: US\n${help}\nconfirmed: false\n---\n| F1 | lever |\n`],
      ['approved', `---\n${help}\napproved: false\n---\n1. A hinge.\n`],
      ['approved', '---\noffice: US\n---\n1. A hinge.\n'],
      ['approved', '1. A hinge.\n'],
      ['approved', `---\n${help}\napproved: true\n---\n1. A hinge.\n`],
      ['confirmed', '---\nconfirmed: true\n---\n| F1 | lever |\n'],
      ['approved', '---\napproved: [\n---\n1. A hinge.\n'],
      ['approved', '---\napproved: "true"\n---\n1. A hinge.\n'],
    ]
    expect(cases.map(([flag, text]) => withGateFlag(text, flag))).toEqual([
      `---\noffice: US\n${help}\nconfirmed: true\n---\n| F1 | lever |\n`,
      `---\n${help}\napproved: true\n---\n1. A hinge.\n`,
      '---\noffice: US\napproved: true\n---\n1. A hinge.\n',
      '---\napproved: true\n---\n1. A hinge.\n',
      undefined,
      undefined,
      undefined,
      '---\napproved: true\n---\n1. A hinge.\n',
    ])
  })
})

/** Ten `antecedent-basis` Errors of one rule (the shape of #747), one other Error, one waived Error, an Inventor Question and a Note. */
const findingsText = renderFindingsFile([
  ...Array.from({ length: 10 }, (_, index): DraftFinding => ({ severity: 'Error', rule: 'antecedent-basis', file: 'claims.md', line: index + 3, claim: index + 2, message: `Claim ${String(index + 2)}: "the clamp body" has no antecedent basis ("a clamp body") earlier in claim ${String(index + 2)} or in the claims it depends on.` })),
  { severity: 'Error', rule: 'defined-term', file: 'draft-application.md', line: 12, message: 'Line 12 writes "clamp-body"; the defined term is "clamp body".' },
  { severity: 'Error', rule: 'source-marker', file: 'draft-application.md', line: 20, message: 'The paragraph at line 20 has no source marker.', waived: { reason: 'Boilerplate.' } },
  { severity: 'Error', rule: 'inventor-question', file: 'draft-application.md', line: 40, message: 'Inventor Question IQ-1 is open: What is the clamp made of?' },
  { severity: 'Note', rule: 'claim-count', file: 'claims.md', message: '11 claims in total.' },
])
  // An item with sub-lines: an attorney note and a waiver line without a reason (it waives nothing).
  .replace(/(- `defined-term`[^\n]*)/, '$1\n  - Note: client spelling?\n  - Waived:')

describe('waiveChoices and withWaivers', () => {
  it('offers one option per open Error and "All N" for a rule with more than two; writes the reason under each item, nothing on an empty reason or a waived item', () => {
    const choices = waiveChoices(findingsText)
    const bulk = choices.find(choice => choice.label.startsWith('All'))!
    const defined = choices.find(choice => choice.label.endsWith('defined-term'))!
    const sourceMarkerLine = findingsText.split('\n').findIndex(line => line.includes('`source-marker`')) + 1
    const bulkText = withWaivers(findingsText, bulk.fileLines, 'False positive of #747: "a clamp body" is in claim 1.')
    const singleText = withWaivers(findingsText, defined.fileLines, 'Client spelling.')
    expect({
      choices: choices.map(choice => [choice.label, choice.fileLines, choice.description?.slice(0, 30)]),
      bulkWaived: bulkText?.waived.map(item => item.finding.claim),
      bulkLines: bulkText?.text.split('\n').filter(line => line.includes('Waived: False positive')).length,
      single: singleText?.text.match(/- `defined-term`[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*/)?.[0],
      empty: withWaivers(findingsText, defined.fileLines, '  '),
      twoLines: withWaivers(findingsText, defined.fileLines, 'two\nlines'),
      waivedItem: withWaivers(findingsText, [sourceMarkerLine], 'Again.'),
      noOpenError: waiveChoices(renderFindingsFile([{ severity: 'Note', rule: 'claim-count', file: 'claims.md', message: '11 claims in total.' }])),
      targetByLine: waiveTarget(findingsText, String(defined.fileLines[0])),
      targetByRule: waiveTarget(findingsText, 'antecedent-basis'),
      targetUnknown: [waiveTarget(findingsText, 'source-marker'), waiveTarget(findingsText, '999'), waiveTarget(findingsText, 'inventor-question')],
    }).toMatchSnapshot()
  })
})
