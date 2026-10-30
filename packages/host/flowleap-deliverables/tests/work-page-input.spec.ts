/**
 * The `officeAction` input of an `office-action-scaffold` save: what the tool JSON validation accepts and refuses, the
 * refusal text that names each field to correct, and the report body rendered from the valid value.
 */

import { describe, expect, it } from 'vitest'
import { officeActionParameter, officeActionSave, renderOfficeAction } from '../src/index.ts'
import { FINDINGS, PLAN, withObjection } from './work-page-fixtures.ts'

function refusalOf(officeAction: unknown, content = PLAN): string {
  const outcome = officeActionSave(officeAction, content)
  if (outcome.kind !== 'refused') throw new Error(`expected a refusal, got ${outcome.kind}`)
  return outcome.text
}

describe('officeAction validation', () => {
  it('accepts the analysis and renders the body from the fields, then the content', () => {
    const outcome = officeActionSave(FINDINGS, PLAN)
    expect(outcome).toMatchObject({ kind: 'structured', findings: FINDINGS })
    expect(outcome.kind === 'structured' ? outcome.body : '').toBe(renderOfficeAction(FINDINGS, PLAN))
  })

  it('names each field to correct', () => {
    const text = refusalOf({ ...FINDINGS, issued: '2026-02-30', objections: [{ ...FINDINGS.objections[0], claims: [0, 1.5, 12345678901234567] }] })
    expect(text).toBe([
      'Report was not saved. Correct these fields of officeAction and save again:',
      '- officeAction.issued: a real calendar date as YYYY-MM-DD, or null',
      '- officeAction.objections[0].claims[0]: a claim number: a whole number from 1 to 9999',
      '- officeAction.objections[0].claims[1]: a claim number: a whole number from 1 to 9999',
      '- officeAction.objections[0].claims[2]: a claim number: a whole number from 1 to 9999',
    ].join('\n'))
    expect(refusalOf({ ...FINDINGS, deadline: '30.03.2027' })).toContain('- officeAction.deadline: a real calendar date as YYYY-MM-DD, or null')
    expect(refusalOf('{"application":"EP 4814394"}')).toContain('- officeAction: ')
    expect(refusalOf({ ...FINDINGS, extra: true })).toContain('- officeAction: ')
  })

  it('accepts a leap day and refuses a day that the calendar does not have', () => {
    expect(officeActionSave({ ...FINDINGS, issued: '2024-02-29', deadline: null }, PLAN).kind).toBe('structured')
    expect(refusalOf({ ...FINDINGS, deadline: '2025-02-29' })).toContain('officeAction.deadline')
    expect(refusalOf({ ...FINDINGS, deadline: '2026-04-31' })).toContain('officeAction.deadline')
  })

  it('keeps 1.1 and 1.2 distinct and refuses a repeated or malformed objection id', () => {
    const parts = { ...FINDINGS, objections: [withObjection(0, { id: '1.1' }).objections[0], FINDINGS.objections[1]] }
    expect(officeActionSave(parts, PLAN)).toMatchObject({ kind: 'structured', findings: { objections: [{ id: '1.1' }, { id: '1.2' }] } })
    expect(refusalOf(withObjection(1, { id: '1' }))).toContain('- officeAction.objections[1].id: a different id: "1" is already the id of an earlier objection')
    expect(refusalOf(withObjection(0, { id: '1a' }))).toContain('- officeAction.objections[0].id: an objection number such as "1", "2" or "1.2"')
  })

  it('refuses a claim table of a claim that no objection hits', () => {
    expect(refusalOf({ ...FINDINGS, comparison: [{ ...FINDINGS.comparison[0], claim: 12 }] }))
      .toContain('- officeAction.comparison[0].claim: a claim that an objection hits: no objection lists claim 12 in its claims')
  })

  it('refuses an analysis in Markdown without officeAction and saves other content as it is', () => {
    const markdown = '## 1. Action\n\n| Field | Value |\n\n## 2. Objections\n\n### Objection 1: novelty\n'
    expect(refusalOf(undefined, markdown)).toContain('This content is an office action analysis in Markdown. Give the summary, the action table, the objections and the claim tables in officeAction')
    expect(officeActionSave(null, '## Response plan\n\n| Objection | Option |')).toEqual({ kind: 'content' })
  })

  it('refuses empty content and content that repeats a rendered section', () => {
    expect(refusalOf(FINDINGS, '  ')).toContain('content is empty. With officeAction, content holds the sections after the claim-by-claim comparison')
    expect(refusalOf(FINDINGS, `## 2. Objections\n\n${PLAN}`)).toContain('content repeats a section that the report renders from officeAction')
  })

  it('declares the input in the tool schema without a JSON Schema dialect', () => {
    const parameter = officeActionParameter()
    expect(parameter).not.toHaveProperty('$schema')
    expect(parameter).toMatchObject({ type: 'object', additionalProperties: false })
    expect(Object.keys(parameter['properties'] as object)).toEqual([
      'application', 'communication', 'issued', 'deadline', 'summary', 'action', 'documents', 'objections', 'comparison', 'dependentClaims',
    ])
  })
})

describe('the rendered analysis', () => {
  it('writes the layout of the office action skill, with escaped table cells', () => {
    const body = renderOfficeAction({ ...FINDINGS, dependentClaims: 'Claim 8 adds a valve; D1 does not show it.' }, PLAN)
    expect(body).toMatchInlineSnapshot(`
      "## 0. Summary

      SEARCH REPORT ONLY: no examination communication was read.
      Two objections are inferred from the search categories.

      ## 1. Action

      | Field | Value | Source |
      |---|---|---|
      | Application | EP 26167335 / EP4814394A1 | get_bibliography |
      | Cited documents | D1 US2016107508A1 \\| D2 EP4491971A1 | get_bibliography |

      ## 2. Objections

      ### Objection 1: Claims 1-7 lack novelty over D1

      - **Ground:** Art. 54 EPC
      - **Legal basis:** Art. 54(1) EPC
      - **Claims hit:** 1, 2, 3, 4, 5, 6, 7
      - **Examiner's reasoning:** Category X for claims 1-7.
      - **Source of the objection:** search report categories
      - **Cited documents:**

      | Document | Role | Passage the examiner relied on | What the passage says | Source anchor |
      |---|---|---|---|---|
      | D1 US2016107508A1 | X | ¶[0059], Fig. 6 | "a refrigerant loop" | US2016107508A1:claims:1:en |

      - **Assessment:** Disputable: D1 shows one loop.
        The second loop is not shown.
      - **Options:** Argue (D1 has one loop); Interview
      - **Reply must address:** Each element of claim 1.
      - **Confidence and gaps:** The description of D1 was read; D2 was not read.
      - **Sources:** US2016107508A1:claims:1:en

      ### Objection 1.2: Clarity of claim 9

      - **Ground:** Art. 84 EPC
      - **Legal basis:**
      - **Claims hit:** none
      - **Examiner's reasoning:**
      - **Source of the objection:** search report categories
      - **Cited documents:** none
      - **Assessment:** Not computable without the opinion.
      - **Options:**
      - **Reply must address:** The term "about".
      - **Confidence and gaps:** Low.
      - **Sources:**

      ## 3. Claim-by-claim comparison

      **Claim 1 (system) against D1 US2016107508A1**

      | Element (verbatim) | Examiner says (OA page) | Cited passage says (quote, passage, anchor) | Assessment |
      |---|---|---|---|
      | 1a "a loop" | X over D1 | "a refrigerant loop" ¶[0059] | disclosed |
      | 1b "a second loop" | X over D1 | not found | disputable |

      The loops are in series in D1.

      Claim 8 adds a valve; D1 does not show it.

      ## 4. Response plan

      For the attorney's decision.

      ## 5. Sources and gaps

      - get_bibliography: the citations."
    `)
  })

  it('states that no claim table applies and keeps an interpretation above its table', () => {
    expect(renderOfficeAction({ ...FINDINGS, comparison: [] }, PLAN)).toContain('## 3. Claim-by-claim comparison\n\nNo claim table: no objection hits an independent claim.\n\n## 4. Response plan')
    const interpreted = renderOfficeAction({ ...FINDINGS, comparison: [{ ...FINDINGS.comparison[0]!, interpretation: '"loop": a closed circuit (¶[0012]).', arrangement: '' }] }, PLAN)
    expect(interpreted).toContain('**Claim 1 (system) against D1 US2016107508A1**\n\n"loop": a closed circuit (¶[0012]).\n\n| Element (verbatim)')
    expect(interpreted).toContain('| 1b "a second loop" | X over D1 | not found | disputable |\n\n## 4. Response plan')
  })
})
