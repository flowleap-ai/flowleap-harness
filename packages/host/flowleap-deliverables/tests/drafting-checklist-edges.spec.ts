/** Checklist inputs that the IDE-ported checklist spec does not exercise. */

import { describe, expect, it } from 'vitest'
import { checklistPointer, gateActionText, gateEdit, readDraftingChecklist, renderChecklist } from '../src/drafting/checklist.ts'

const base = { matter: 'hinge', findingsCurrent: false, exported: false }

const stepOf = (input: Parameters<typeof readDraftingChecklist>[0], number: number) => readDraftingChecklist(input).steps.find(entry => entry.step === number)

describe('Application Drafting checklist edges', () => {
  it('tells the attorney to write true after an empty gate flag', () => {
    const edit = gateEdit('---\nconfirmed:\n---\n| F1 | A hinge. |\n', 'confirmed')
    expect(edit).toEqual({ flag: 'confirmed', line: 2, kind: 'fill' })
    expect(gateActionText('drafting/hinge/feature-list.md', edit)).toBe(
      'Review `drafting/hinge/feature-list.md:2`, then click **Confirm Feature List** at the top of the file, or write `true` after `confirmed:` on line 2.',
    )
  })

  it('asks for the office when the confirmed Feature List names none', () => {
    expect(stepOf({ ...base, featureList: '---\nconfirmed: true\n---\n' }, 1)).toEqual({
      step: 1,
      done: false,
      title: 'Confirm the Feature List',
      detail: 'feature-list.md names no office',
      actions: ['→ In `feature-list.md:1`, add the line `office: US` or `office: EPO` under the `---` on line 1.'],
      blockedBy: [],
    })
  })

  it('asks to apply the answers when every question is answered but still in the draft', () => {
    const draft = '# Description\n\n> **Inventor Question IQ-1:** How long is the lever?\n'
    const inventorAnswers = '## IQ-1\n\n**Question:** How long is the lever?\n\n**Answer:** 5 mm.\n'
    expect(stepOf({ ...base, draft, inventorAnswers }, 5)).toMatchObject({
      done: false,
      detail: '1 answered but not yet in the draft (IQ-1)',
      actions: ['→ Tell the agent: "Apply the answers"'],
    })
  })

  it('names the answers file without lines when the open question has no answer slot', () => {
    const draft = '# Description\n\n> **Inventor Question IQ-1:** How long is the lever?\n'
    expect(stepOf({ ...base, draft, inventorAnswers: '## IQ-1\n\n**Question:** How long is the lever?\n' }, 5)?.actions).toEqual([
      '→ Fill each **Answer:** in inventor-answers.md, or send the file to the inventor',
      '→ Then tell the agent: "Apply the answers"',
    ])
  })

  it('notes a figures file that has no figures', () => {
    expect(readDraftingChecklist({ ...base, figures: '# Parts\n' }).notes[0]).toMatchObject({ name: 'Figures', detail: 'none in figures.md' })
  })

  it('points to the checklist file when no step is open, and renders a step without detail and no notes', () => {
    const checklist = { matter: 'hinge', steps: [{ step: 6, done: true, title: 'Exported to Word', detail: '', actions: [], blockedBy: [] }], notes: [] }
    expect(checklistPointer(checklist, 'drafting/hinge/checklist.md')).toBe('See drafting/hinge/checklist.md.')
    const lines = renderChecklist(checklist).split('\n')
    expect(lines.slice(-4)).toEqual(['- [x] 6. Exported to Word', '', 'Next step for you: none. Review the Word files: they are a draft for attorney review, not a filing.', ''])
  })
})
