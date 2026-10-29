/** inventor-answers.md inputs that the IDE-ported inventor-answers spec does not exercise. */

import { describe, expect, it } from 'vitest'
import { citedInventorAnswers, openInventorQuestions, parseInventorAnswers, updateInventorAnswers } from '../src/drafting/inventor-answers.ts'
import { parseDraftParagraphs } from '../src/drafting/source-markers.ts'

describe('Application Drafting inventor answers edges', () => {
  it('lists the question ids that the draft cites with an inventor marker', () => {
    const paragraphs = parseDraftParagraphs('# Description\n\n<!-- src: inventor:IQ-2, feature:F1 -->\nThe spring is steel.\n')
    expect([...citedInventorAnswers(paragraphs)]).toEqual(['IQ-2'])
  })

  it('reads an empty Belongs as no place, and an Answer with no question as its own round', () => {
    const text = '## IQ-1\n\n**Belongs:**\n\n**Answer:** Steel.\n\n**Answer:** Brass.\n'
    expect(parseInventorAnswers(text)).toEqual([
      { id: 'IQ-1', rounds: [{ question: '', answer: 'Steel.', answerLine: 5 }, { question: '', answer: 'Brass.', answerLine: 7 }] },
    ])
  })

  it('lists an open question with no place without a belongs field', () => {
    expect(openInventorQuestions('## IQ-1\n\n**Question:** How long?\n\n**Answer:**\n')).toEqual([{ id: 'IQ-1', question: 'How long?' }])
  })

  it('leaves a section with no question or answer as it is', () => {
    const previous = '# Inventor answers: m\n\n## IQ-1\n\nA note.\n'
    expect(updateInventorAnswers(previous, 'm', [{ id: 'IQ-1', line: 4, text: 'How long?' }], new Set())).toBe(previous)
  })

  it('rewrites the open question and its place when the draft changes them', () => {
    const previous = [
      '## IQ-1', '', '**Question:** How long?', '', '**Belongs:** Description.', '', '**Answer:**',
      '', '## IQ-2', '', '**Question:** How wide?', '', '**Answer:** 5 mm.', '', '**Narrowed question:** How wide in inches?', '', '**Answer:**',
      '', '## IQ-3', '', '**Question:** How high?', '', '**Answer:**',
    ].join('\n')
    const questions = [
      { id: 'IQ-1', line: 4, text: 'How long in mm?', belongs: 'Summary.' },
      { id: 'IQ-2', line: 6, text: 'How wide in cm?', belongs: 'Summary.' },
      { id: 'IQ-3', line: 8, text: 'How high?', belongs: 'Summary.' },
    ]
    expect(updateInventorAnswers(previous, 'm', questions, new Set())).toBe([
      '## IQ-1', '', '**Question:** How long in mm?', '', '**Belongs:** Summary.', '', '**Answer:**',
      '', '## IQ-2', '', '**Question:** How wide?', '', '**Answer:** 5 mm.', '', '**Narrowed question:** How wide in cm?', '', '**Answer:**',
      '', '## IQ-3', '', '**Question:** How high?', '', '**Answer:**',
    ].join('\n') + '\n')
  })

  it('keeps the place when the draft gives none or the same one', () => {
    const previous = '## IQ-1\n\n**Question:** How long?\n\n**Belongs:** Description.\n\n**Answer:**\n'
    expect(updateInventorAnswers(previous, 'm', [{ id: 'IQ-1', line: 4, text: 'How long?', belongs: 'Description.' }], new Set())).toBe(previous)
    expect(updateInventorAnswers(previous, 'm', [{ id: 'IQ-1', line: 4, text: 'How long?' }], new Set())).toBe(previous)
  })

  it('adds a narrowed question to each applied answered section', () => {
    const previous = '## IQ-1\n\n**Question:** How long?\n\n**Answer:** 5 mm.\n\n## IQ-2\n\n**Question:** How wide?\n\n**Answer:** 2 mm.\n'
    const questions = [{ id: 'IQ-1', line: 4, text: 'Long in cm?' }, { id: 'IQ-2', line: 6, text: 'Wide in cm?' }]
    expect(updateInventorAnswers(previous, 'm', questions, new Set(['IQ-1', 'IQ-2']))).toBe([
      '## IQ-1', '', '**Question:** How long?', '', '**Answer:** 5 mm.', '', '**Narrowed question:** Long in cm?', '', '**Answer:**',
      '', '## IQ-2', '', '**Question:** How wide?', '', '**Answer:** 2 mm.', '', '**Narrowed question:** Wide in cm?', '', '**Answer:**',
    ].join('\n') + '\n')
  })
})
