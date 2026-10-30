/** The structured office action analysis that the work page specs save, and the save arguments around it. */

import type { OfficeActionFindings } from '../src/index.ts'

/** An analysis of an EP search report with two objections and one claim table. */
export const FINDINGS: OfficeActionFindings = {
  application: 'EP 4814394',
  communication: 'EPO, European search report',
  issued: '2026-09-30',
  deadline: '2027-03-30',
  summary: 'SEARCH REPORT ONLY: no examination communication was read.\nTwo objections are inferred from the search categories.',
  action: [
    { field: 'Application', value: 'EP 26167335 / EP4814394A1', source: 'get_bibliography' },
    { field: 'Cited documents', value: 'D1 US2016107508A1 | D2 EP4491971A1', source: 'get_bibliography' },
  ],
  documents: [
    { label: 'D1', text: 'US2016107508A1 (published 2016-04-21)' },
    { label: 'D2', text: 'EP4491971A1' },
  ],
  objections: [
    {
      id: '1',
      title: 'Claims 1-7 lack novelty over D1',
      ground: 'Art. 54 EPC',
      legalBasis: 'Art. 54(1) EPC',
      claims: [1, 2, 3, 4, 5, 6, 7],
      reasoning: 'Category X for claims 1-7.',
      source: 'search report categories',
      citations: [
        { document: 'D1 US2016107508A1', role: 'X', passage: '¶[0059], Fig. 6', says: '"a refrigerant loop"', anchor: 'US2016107508A1:claims:1:en' },
      ],
      assessment: 'Disputable: D1 shows one loop.\nThe second loop is not shown.',
      options: [{ label: 'Argue', text: 'D1 has one loop' }, { label: 'Interview', text: '' }],
      replyMustAddress: 'Each element of claim 1.',
      confidence: 'The description of D1 was read; D2 was not read.',
      sources: 'US2016107508A1:claims:1:en',
    },
    {
      id: '1.2',
      title: 'Clarity of claim 9',
      ground: 'Art. 84 EPC',
      legalBasis: '',
      claims: [],
      reasoning: '',
      source: 'search report categories',
      citations: [],
      assessment: 'Not computable without the opinion.',
      options: [],
      replyMustAddress: 'The term "about".',
      confidence: 'Low.',
      sources: '',
    },
  ],
  comparison: [
    {
      claim: 1,
      heading: 'Claim 1 (system) against D1 US2016107508A1',
      interpretation: '',
      rows: [
        { element: '1a "a loop"', examiner: 'X over D1', cited: '"a refrigerant loop" ¶[0059]', assessment: 'disclosed' },
        { element: '1b "a second loop"', examiner: 'X over D1', cited: 'not found', assessment: 'disputable' },
      ],
      arrangement: 'The loops are in series in D1.',
    },
  ],
  dependentClaims: '',
}

/** The path of the analysis in the specs. */
export const OFFICE_ACTION = 'office-actions/EP4814394/2026-09-30-analysis.md'

/** The content of a structured save: the sections after the claim-by-claim comparison. */
export const PLAN = '## 4. Response plan\n\nFor the attorney\'s decision.\n\n## 5. Sources and gaps\n\n- get_bibliography: the citations.'

/**
 * The arguments of a structured save.
 * @param findings - the `officeAction` value.
 * @param filePath - the report path.
 * @returns the arguments.
 */
export function structuredSave(findings: unknown = FINDINGS, filePath = OFFICE_ACTION) {
  return { filePath, content: PLAN, template: 'office-action-scaffold', matter: 'EP4814394', officeAction: findings }
}

/**
 * The findings with one objection changed.
 * @param index - the objection.
 * @param change - the fields to change.
 * @returns new findings.
 */
export function withObjection(index: number, change: Partial<OfficeActionFindings['objections'][number]>): OfficeActionFindings {
  return { ...FINDINGS, objections: FINDINGS.objections.map((objection, at) => at === index ? { ...objection, ...change } : objection) }
}
