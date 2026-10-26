/**
 * The harness's own additions to the IDE's report templates: the `dossier`
 * template (S5 acceptance defect C), its contract-only guidance, its content
 * requirement, and the sync between the template copy and the writer schema.
 */

import { describe, expect, it } from 'vitest'
import { buildPatentReport, contentRequirementError, PATENT_REPORT_TEMPLATES, REPORT_TEMPLATES } from '../src/index.ts'

describe('the dossier template', () => {
  it('wraps a short body in the seven dossier sections under the title block, with contract-only guidance', () => {
    const document = buildPatentReport('EP2110298B1, granted 2014-08-06, lapsed in DE on 2024-08-01.', 'dossier', { matter: 'EP2110298B1', subject: 'Bicycle wheel quick release assembly', date: '2026-10-25', preparedBy: 'FlowLeap Patent AI (AI-assisted draft)' })
    const lines = document.split('\n')
    expect({
      title: lines[0],
      header: lines.slice(2, 8),
      headings: lines.filter(line => line.startsWith('## ')),
      body: lines[lines.indexOf('## 1. Snapshot') + 2],
      // ADR 0018 decision 4: the guidance names what each section holds, never a tool, the IDE or an editor.
      contractOnly: !/\bget_|\bsearch_|\bpatstat|mcp__|VS Code|editor|click|button|CodeLens/i.test(document),
      disclaimer: lines.at(-2)?.startsWith('*This document was generated with AI assistance'),
    }).toEqual({
      title: '# Patent Dossier',
      header: [
        '| Field | Details |',
        '| --- | --- |',
        '| Publication | EP2110298B1 |',
        '| Title / Technology | Bicycle wheel quick release assembly |',
        '| Date | 2026-10-25 |',
        '| Prepared By | FlowLeap Patent AI (AI-assisted draft) |',
      ],
      headings: ['## 1. Snapshot', '## 2. Claims', '## 3. Family', '## 4. Legal Status', '## 5. Citations', '## 6. US Family Chain', '## 7. Sources and Limitations'],
      body: 'EP2110298B1, granted 2014-08-06, lapsed in DE on 2024-08-01.',
      contractOnly: true,
      disclaimer: true,
    })
  })

  it('steps aside for an authored dossier, refuses an empty or placeholder body or an authored body without a US Family Chain heading, and is listed by both the template copy and the writer schema', () => {
    const authored = ['## Snapshot', 'EP2110298B1.', '', '## Claims', '12 claims; independents 1, 6, 10.', '', '## Family', '| State | Status |'].join('\n')
    const document = buildPatentReport(authored, 'dossier', { matter: 'EP2110298B1' }, '## Figure and date provenance (generated)\nnone')
    expect({
      authoredHeadings: document.match(/^## .*$/gm),
      empty: contentRequirementError('dossier', ''),
      placeholder: contentRequirementError('dossier', 'To be completed')?.endsWith('A placeholder such as "to be completed" is not content.'),
      noChain: contentRequirementError('dossier', authored),
      usMembersOnly: contentRequirementError('dossier', `${authored}\n\n## Forward citations of the US family members\nNone.`),
      chain: contentRequirementError('dossier', `${authored}\n\n### 6. US Family Chain\nNo US member in the family.`),
      continuity: contentRequirementError('dossier', `${authored}\n\n## US continuity\nUS7722129B2, then US8056987B2.`),
      scaffolded: contentRequirementError('dossier', 'EP2110298B1, granted 2014-08-06.'),
      listed: [PATENT_REPORT_TEMPLATES.includes('dossier'), [...REPORT_TEMPLATES]],
    }).toEqual({
      authoredHeadings: ['## Snapshot', '## Claims', '## Family', '## Figure and date provenance (generated)'],
      empty: 'dossier needs content: the snapshot of the publication, its claims with claim 1 verbatim, the family with the status and dates of each state, the legal status, the citations, the US family chain, and the sources and limitations. Only prior-art-report and find-better-report use empty content with structured fields.',
      placeholder: true,
      noChain: 'dossier needs a US Family Chain section: a heading that names the US family chain, with the US applications and grants of the family in filing order, each with its serial number, publication, grant date and maintenance standing. When the family has no US member, write the heading and say so under it.',
      usMembersOnly: 'dossier needs a US Family Chain section: a heading that names the US family chain, with the US applications and grants of the family in filing order, each with its serial number, publication, grant date and maintenance standing. When the family has no US member, write the heading and say so under it.',
      chain: undefined,
      continuity: undefined,
      scaffolded: undefined,
      listed: [true, [...PATENT_REPORT_TEMPLATES]],
    })
  })
})
