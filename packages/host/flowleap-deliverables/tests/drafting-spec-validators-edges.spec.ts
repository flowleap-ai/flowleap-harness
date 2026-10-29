/** Specification rules that the IDE-ported spec-validators spec does not exercise. */

import { describe, expect, it } from 'vitest'
import { parseInventorAnswers } from '../src/drafting/inventor-answers.ts'
import { parseDraftParagraphs } from '../src/drafting/source-markers.ts'
import {
  checkDefinedTerms,
  checkInventorQuestions,
  checkReferenceNumerals,
  checkSourceMarkers,
  figureHeadingNumbers,
  isAbstractParagraph,
  isClaimsParagraph,
} from '../src/drafting/spec-validators.ts'

describe('Application Drafting specification rules edges', () => {
  it('puts a paragraph before the first heading in neither the Abstract nor the claims', () => {
    const [paragraph] = parseDraftParagraphs('A hinge.\n')
    expect([isAbstractParagraph(paragraph), isClaimsParagraph(paragraph)]).toEqual([false, false])
  })

  it('keeps the first spelling of a term defined twice and skips a term with no words', () => {
    const paragraphs = parseDraftParagraphs([
      '# Description',
      '',
      'A unit, hereinafter "Control Unit", and the same, hereinafter "control unit". "-" means a dash.',
      '',
      'The control-unit is on.',
    ].join('\n'))
    expect(checkDefinedTerms(paragraphs).map(finding => finding.message)).toEqual([
      'Line 3 writes "control unit"; the defined term is "Control Unit".',
      'Line 5 writes "control-unit"; the defined term is "Control Unit".',
    ])
  })

  it('reports a numeral that figures.md does not list once, however often the draft uses it', () => {
    const paragraphs = parseDraftParagraphs('# Description\n\nThe lever 99 turns. The lever 99 stops.\n')
    const findings = checkReferenceNumerals(paragraphs, '- 10: hinge\n', 'US', [])
    expect(findings.filter(finding => finding.message.includes('99')).map(finding => finding.line)).toEqual([3])
  })

  it('reads a backwards figure range as its first figure only', () => {
    expect(figureHeadingNumbers('FIGS. 5 to 3')).toEqual(['5'])
  })

  it('reports a figure source that names no figure', () => {
    const findings = checkSourceMarkers([{ line: 3, kind: 'text', section: 'Description', text: 'A hinge.', sources: [{ kind: 'figure' }] }], [], '# FIG. 1\n')
    expect(findings.map(finding => finding.message)).toEqual(['The paragraph at line 3 cites figure:undefined, but figures.md has no figure heading undefined.'])
  })

  it('reports a dropped empty answer slot without a question text', () => {
    const findings = checkInventorQuestions('# Description\n', parseInventorAnswers('## IQ-1\n\n**Answer:**\n'))
    expect(findings.map(finding => finding.message)).toEqual([
      'Inventor Question IQ-1 is no longer in the draft, but its question has no answer in inventor-answers.md. Put the question back in the draft, or waive it.',
    ])
  })

  it('reports a dropped question with no answer slot, and a dropped narrowed question', () => {
    const answers = parseInventorAnswers([
      '## IQ-1',
      '',
      '**Question:** What is the spring made of?',
      '',
      '## IQ-2',
      '',
      '**Question:** How long is the lever?',
      '',
      '**Answer:** Long.',
      '',
      '**Narrowed question:** How long in mm?',
      '',
      '**Answer:**',
    ].join('\n'))
    expect(checkInventorQuestions('# Description\n', answers)).toEqual([
      {
        severity: 'Error',
        rule: 'inventor-question',
        file: 'inventor-answers.md',
        question: 'IQ-1',
        message: 'Inventor Question IQ-1 is no longer in the draft, but its question has no answer in inventor-answers.md.'
          + ' Put the question back in the draft, or waive it. Question: What is the spring made of?',
      },
      {
        severity: 'Error',
        rule: 'inventor-question',
        file: 'inventor-answers.md',
        line: 13,
        question: 'IQ-2',
        message: 'Inventor Question IQ-2 is no longer in the draft, but its narrowed question has no answer in inventor-answers.md.'
          + ' Put the question back in the draft, or waive it. Question: How long in mm?',
      },
    ])
  })
})
