/** Export inputs (filing documents, manifest, full review copy) that the IDE-ported specs do not exercise. */

import { describe, expect, it } from 'vitest'
import { exportedParagraphs, filingParagraphs, headingLevel, missingParts, orderSections, sectionRank } from '../src/drafting/filing-documents.ts'
import { filingManifest, renderFilingManifest } from '../src/drafting/filing-manifest.ts'
import { resolveDraftingFolder } from '../src/drafting/folder-contract.ts'
import { composeFullReviewCopy, type ReviewCopyBlock } from '../src/drafting/full-review-copy.ts'

const texts = (blocks: readonly ReviewCopyBlock[], kind: ReviewCopyBlock['kind']) => blocks.flatMap(block => block.kind === kind && 'text' in block ? [block.text] : [])

describe('Application Drafting filing documents edges', () => {
  it('exports the text before the first heading and joins a claim written on two lines', () => {
    const paragraphs = exportedParagraphs('A hinge.\n\n# Claims\n\n1. A hinge\ncomprising a lever.\n2. The hinge of claim 1.\n')
    expect(paragraphs.flatMap(filingParagraphs)).toEqual([
      { kind: 'text', text: 'A hinge.' },
      { kind: 'heading', level: 1, text: 'Claims' },
      { kind: 'text', text: '1. A hinge comprising a lever.' },
      { kind: 'text', text: '2. The hinge of claim 1.' },
    ])
  })

  it('reads a paragraph without a heading mark or a section as level 1, an empty title and no rank', () => {
    const paragraph = { line: 1, kind: 'heading' as const, text: 'Hinge' }
    expect([headingLevel(paragraph), filingParagraphs(paragraph), sectionRank(paragraph, 'US')]).toEqual([1, [{ kind: 'heading', level: 1, text: '' }], undefined])
  })

  it('keeps a draft with no headings in its order', () => {
    const paragraphs = exportedParagraphs('A hinge.\n\nA lever.\n')
    expect(orderSections(paragraphs, 'US')).toEqual(paragraphs)
  })

  it('puts an unknown first section at the front and an unknown section after the claims before the claims', () => {
    const paragraphs = exportedParagraphs('## Notes\n\nn\n\n## Claims\n\n1. A hinge.\n\n## Remarks\n\nr\n\n## Summary\n\ns\n')
    expect(orderSections(paragraphs, 'US').map(paragraph => paragraph.text)).toEqual(['## Notes', 'n', '## Summary', 's', '## Remarks', 'r', '## Claims', '1. A hinge.'])
  })

  it('needs no title when the frontmatter names one, and names the title when nothing gives one', () => {
    expect(missingParts('---\ntitle: Hinge\n---\nA hinge.\n', 'US', false)).not.toContain('Title')
    expect(missingParts('A hinge.\n', 'US', false)).toContain('Title')
  })
})

describe('Application Drafting filing manifest edges', () => {
  it('takes the title from a lower heading and writes no title, figures or abstract figure when there are none', () => {
    expect(filingManifest({ office: 'US', draft: '## Background\n\nA hinge.\n', claims: '1. A hinge.' }).title).toBe('Background')
    const manifest = filingManifest({ office: 'US', draft: 'A hinge.\n', claims: '1. A hinge.' })
    const rows = renderFilingManifest(manifest, resolveDraftingFolder('hinge')!).split('\n').filter(line => /^\| (?:Title|Figures|Abstract figure) /.test(line))
    expect(rows).toEqual(['| Title | Not found (no title heading) |', '| Figures | None |', '| Abstract figure | None (no figures) |'])
  })
})

describe('Application Drafting full review copy edges', () => {
  it('marks the title, abstract, claims and reference signs as missing in an EPO draft that has none', () => {
    const draft = '## Notes\n\nA remark.\n'
    const blocks = composeFullReviewCopy({ office: 'EPO', draft, manifest: filingManifest({ office: 'EPO', draft: 'A remark.\n', claims: '' }) })
    expect(texts(blocks, 'missing').filter(text => /Title|Abstract|Claims|Reference signs/.test(text))).toEqual([
      '[MISSING: Title — no title heading in draft-application.md. See checklist.md, "Required sections".]',
      '[MISSING: Abstract — no such section in draft-application.md. See checklist.md, "Required sections".]',
      '[MISSING: Claims — no such section in draft-application.md. See checklist.md, "Required sections".]',
      '[MISSING: Abstract — no such section in draft-application.md. See checklist.md, "Required sections".]',
      '[MISSING: Reference signs — no parts under a figure in figures.md. See checklist.md, "Figures".]',
    ])
    expect(texts(blocks, 'heading')).toContain('Notes')
  })

  it('lists the reference signs that share a number in letter order', () => {
    const draft = '# Hinge\n\n## Abstract\n\nA hinge.\n'
    const figures = '## FIG. 1\n\n- 12b: arm\n- 12a: arm\n'
    const blocks = composeFullReviewCopy({ office: 'EPO', draft, figures, manifest: filingManifest({ office: 'EPO', draft, claims: '1. A hinge.', figures }) })
    const signs = texts(blocks, 'text')
    expect(signs.slice(signs.indexOf('12a arm'))).toEqual(['12a arm', '12b arm'])
  })
})
