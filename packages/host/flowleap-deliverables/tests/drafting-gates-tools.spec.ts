/**
 * `start_application_draft`, `validate_draft`, `remove_claim` and the two drafting saves of
 * `write_patent_results` over the REAL local filesystem: the IDE's
 * `applicationDraftingTools.spec.ts` (SOURCE.json) on the dsh bench. The gates stay file edits
 * here (no card is answered: `FakeSeams` has no answerer unless a test arms one), so every
 * refusal names the file, the line, the word to change, the card and the command. Not ported:
 * the editor reveal of `checklist.md`, the file guard (`isCopilotIgnored`), the "app restarted"
 * chat advice and VS Code's tool confirmation (the removal confirms through the approval seam,
 * see `gates-questions.spec.ts`).
 */

import { Document, Packer, Paragraph } from 'docx'
import * as mammoth from 'mammoth'
import { afterEach, describe, expect, it } from 'vitest'
import { parseClaims } from '../src/drafting/claims.ts'
import { parseDraftingFrontmatter } from '../src/drafting/frontmatter.ts'
import { parseInventorAnswers } from '../src/drafting/inventor-answers.ts'
import { sha256Hex } from '../src/report/text.ts'
import { pipeClampClaims } from './drafting-test-claims.ts'
import {
  appliedIq1, claims, claimsHashOf, draft, featureList, figures, fillAnswer, frontmatterOf, gatesOpen, noOutline, openQuestion, outline, outlineTable, stable, twoQuestions,
} from './drafting-matter-fixtures.ts'
import { benchWith, gateBench } from './gates-test-bench.ts'

type Bench = Awaited<ReturnType<typeof gateBench>>
const benches: Bench[] = []
afterEach(async () => {
  for (const bench of benches.splice(0)) await bench.dispose()
})

/** A bench over the files, disposed after the test. */
async function setup(files: Record<string, string> = {}): Promise<Bench> {
  const bench = await benchWith(files)
  benches.push(bench)
  return bench
}

describe('start_application_draft', () => {
  it('refuses while the Feature List is missing, unconfirmed or the claims are unapproved, naming the file, the line, the word to change, the card and the command', async () => {
    const results = []
    const cases: Record<string, string>[] = [
      { 'drafting/hinge/claims.md': claims() },
      { 'drafting/hinge/feature-list.md': featureList('false'), 'drafting/hinge/claims.md': claims() },
      { 'drafting/hinge/feature-list.md': featureList().replace('confirmed: true\n', ''), 'drafting/hinge/claims.md': claims() },
      { 'drafting/hinge/feature-list.md': featureList(), 'drafting/hinge/claims.md': claims('"true"') },
      { 'drafting/hinge/feature-list.md': featureList() },
    ]
    for (const files of cases) {
      results.push(await (await setup(files)).tools.start())
    }
    expect(results).toEqual([
      'Drafting did not start. drafting/hinge/feature-list.md does not exist. The attorney opens this gate in that file after review. Open in drafting/hinge/checklist.md: step 1 (Confirm the Feature List). Next: Tell the agent: "Build the Feature List from the disclosure". Stay in this chat.',
      'Drafting did not start. Review `drafting/hinge/feature-list.md:3`, then change `false` to `true` on line 3, or answer the Confirm Feature List card in the chat, or type `/confirm-features hinge`. Only the attorney opens this gate; a statement in chat does not open it. Open in drafting/hinge/checklist.md: step 1 (Confirm the Feature List). Stay in this chat.',
      'Drafting did not start. Review `drafting/hinge/feature-list.md:1`, then add the line `confirmed: true` under the `---` on line 1, or answer the Confirm Feature List card in the chat, or type `/confirm-features hinge`. Only the attorney opens this gate; a statement in chat does not open it. Open in drafting/hinge/checklist.md: step 1 (Confirm the Feature List). Stay in this chat.',
      'Drafting did not start. Review `drafting/hinge/claims.md:2`, then change `"true"` to `true` on line 2, or answer the Approve Claims card in the chat, or type `/approve-claims hinge`. Only the attorney opens this gate; a statement in chat does not open it. Open in drafting/hinge/checklist.md: step 2 (Approve the claims). Stay in this chat.',
      'Drafting did not start. drafting/hinge/claims.md does not exist. The attorney opens this gate in that file after review. Open in drafting/hinge/checklist.md: step 2 (Approve the claims). Next: Tell the agent: "Draft the claims". Stay in this chat.',
    ])
  })

  it('writes checklist.md on the first call of a matter, also a refused one, with the loop at its top (PRD 0026 S1)', async () => {
    const { tools, read } = await setup({ 'drafting/hinge/feature-list.md': featureList('false') })
    await tools.start()
    expect((await read('drafting/hinge/checklist.md')).split('\n').slice(0, 9)).toEqual([
      '# Drafting checklist: hinge (US)',
      '',
      'The loop, in order: Feature List, claims, outline, draft, findings, figures, drawings, export.',
      'A change to claims.md re-opens the claims approval.',
      'After a change to figures.md, the next check of the figures runs the coverage again.',
      'A new render of a drawn Figure needs a new review cycle.',
      'A waived Error stays waived until the Error changes.',
      'The Prompts view page "Drafting with drawings: the loop" shows this loop before the first matter.',
      '',
    ])
  })

  it('returns the inputs and the style exemplars, labelled style only, and records the approved claims', async () => {
    const { tools, read, write, dir } = await setup(gatesOpen)
    const exemplarDocx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('The present disclosure relates to doors.')] }] }))
    await write('style/a.md', 'In one embodiment, the widget turns.')
    await write('style/notes.txt', 'not an exemplar')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(`${dir}/style/b.docx`, new Uint8Array(exemplarDocx))
    await writeFile(`${dir}/style/c.pdf`, '%PDF-1.4 fake')
    const result = await tools.start()
    expect({
      result: stable(result),
      record: stable(await read('drafting/hinge/draft-application.working-record.md')),
    }).toMatchSnapshot()
  })

  it('lists the claim terms to plan after the Approved Claims, each dependent claim with its independent claim', async () => {
    const chain = claims('true', 'wherein the lever has a plurality of springs') + '3. The hinge of claim 2, further comprising a sealing ring.\n'
    const { tools } = await setup({ ...gatesOpen, 'drafting/hinge/claims.md': chain })
    const result = await tools.start()
    expect(result.slice(result.indexOf('## Claim terms to plan'), result.indexOf('## Draft Outline'))).toBe([
      '## Claim terms to plan',
      '',
      'Copy these terms verbatim into the `Claim terms` column of the Draft Outline; the outline-coverage rule checks these exact terms.',
      '',
      'Claim 1: hinge; housing; lever',
      'Claim 2 (with claim 1): springs',
      'Claim 3 (with claim 1): sealing ring',
      '',
      '',
    ].join('\n'))
  })

  it('clears an approval the claims no longer match, and accepts a fresh re-approval and an untouched approval', async () => {
    const forgot = await setup(gatesOpen)
    await forgot.tools.start()
    await forgot.edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    const forgotResult = await forgot.tools.start()

    const reapproved = await setup(gatesOpen)
    await reapproved.tools.start()
    await reapproved.edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    await reapproved.tools.start()
    await reapproved.edit('drafting/hinge/claims.md', 'approved: false', 'approved: true')
    const reapprovedResult = await reapproved.tools.start()

    const untouched = await setup(gatesOpen)
    await untouched.tools.start()
    const untouchedResult = await untouched.tools.start()

    const outcome = async (run: Bench, result: string) => ({
      result: result.split('.')[0],
      claims: frontmatterOf(await run.read('drafting/hinge/claims.md')),
      approvalCleared: (await run.read('drafting/hinge/draft-application.working-record.md')).includes('- **Approval cleared:**'),
    })
    expect({
      forgot: await outcome(forgot, forgotResult),
      reapproved: await outcome(reapproved, reapprovedResult),
      untouched: await outcome(untouched, untouchedResult),
    }).toEqual({
      forgot: { result: 'Drafting did not start', claims: '\napproved: false\n', approvalCleared: true },
      reapproved: { result: 'Drafting started for matter "hinge"', claims: '\napproved: true\napprovedHash: <sha>\n', approvalCleared: true },
      untouched: { result: 'Drafting started for matter "hinge"', claims: '\napproved: true\napprovedHash: <sha>\n', approvalCleared: false },
    })
  })

  it('a flag set by hand keeps the help line after start_application_draft adds approvedHash', async () => {
    const help = '# Review, then change false to true below, or answer the card.'
    const run = await setup({ ...gatesOpen, 'drafting/hinge/claims.md': claims('false').replace('approved: false', `${help}\napproved: true`) })
    const result = await run.tools.start()
    expect({ result: result.split('.')[0], claims: frontmatterOf(await run.read('drafting/hinge/claims.md')) }).toEqual({
      result: 'Drafting started for matter "hinge"',
      claims: `\n${help}\napproved: true\napprovedHash: <sha>\n`,
    })
  })
})

describe('write_patent_results draft-application template', () => {
  it('writes the draft with its frontmatter first, the generated snapshot and the Working Record, never blocked by findings, and presents the draft', async () => {
    const { tools, read, presented } = await setup(gatesOpen)
    await tools.start()
    const result = await tools.save(draft(openQuestion), { disclosureVersion: 'disclosure v2 (2026-10-01)', promptsSummary: 'application-drafting skill, US template' })
    const saved = await read('drafting/hinge/draft-application.md')
    expect({
      result,
      firstLine: saved.split('\n')[0],
      frontmatter: saved.split('---')[1],
      snapshotIsDraft: (await read('drafting/hinge/draft-application.generated.md')) === saved,
      record: stable(await read('drafting/hinge/draft-application.working-record.md')),
      presented: presented(),
    }).toMatchSnapshot()
  })

  it('refuses a draft without model and provider, and a path outside the drafting folder contract', async () => {
    const { tools } = await setup(gatesOpen)
    expect([
      await tools.save(draft().replace('model: claude-sonnet-5\nprovider: anthropic\n', '')),
      await tools.save(draft(), {}, 'outputs/draft-application.md'),
    ]).toEqual([
      'Draft was not saved. The draft frontmatter (or the model and provider fields) must name the model and the provider the disclosure went to. Missing: model, provider. Open in drafting/hinge/checklist.md: step 3 (Write the draft). Next: Tell the agent: "Draft the application". Stay in this chat.',
      'Draft was not saved. The draft-application template saves to drafting/<matter>/draft-application.md inside a workspace folder.',
    ])
  })

  it('refuses the save while the Feature List is unconfirmed or the claims are unapproved, naming the file, the line and the word to change', async () => {
    expect([
      await (await setup({ ...gatesOpen, 'drafting/hinge/feature-list.md': featureList('false') })).tools.save(draft()),
      await (await setup({ ...gatesOpen, 'drafting/hinge/claims.md': claims('false') })).tools.save(draft()),
    ]).toEqual([
      'Draft was not saved. Review `drafting/hinge/feature-list.md:3`, then change `false` to `true` on line 3, or answer the Confirm Feature List card in the chat, or type `/confirm-features hinge`. Only the attorney opens this gate; a statement in chat does not open it. Open in drafting/hinge/checklist.md: step 1 (Confirm the Feature List). Stay in this chat.',
      'Draft was not saved. Review `drafting/hinge/claims.md:2`, then change `false` to `true` on line 2, or answer the Approve Claims card in the chat, or type `/approve-claims hinge`. Only the attorney opens this gate; a statement in chat does not open it. Open in drafting/hinge/checklist.md: step 2 (Approve the claims). Stay in this chat.',
    ])
  })

  it('a later save of the same version keeps the generated snapshot, so the export still shows the attorney edit', async () => {
    const { tools, read } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft())
    const snapshot = await read('drafting/hinge/draft-application.generated.md')
    const resaved = await tools.save(draft().replace('A hinge joins a door to a frame.', 'A hinge pivotally joins a door to a frame.'))
    await tools.exportDocx()
    const record = await read('drafting/hinge/draft-application.working-record.md')
    expect({
      resaved: resaved.split('\n')[0],
      snapshotKept: (await read('drafting/hinge/draft-application.generated.md')) === snapshot,
      resavedLine: /^- \*\*Re-saved:\*\* \S+$/m.test(record),
      sourceMapRefreshed: record.includes('| disclosure:§1 | A hinge pivotally joins a door to a frame. |'),
      attorneyEdit: record.slice(record.indexOf('## Attorney edits')).includes('> A hinge pivotally joins a door to a frame.'),
    }).toEqual({
      resaved: 'Saved drafting/hinge/draft-application.md (version 1, office US). Generated snapshot: drafting/hinge/draft-application.generated.md (kept from the first save of version 1). Working record: drafting/hinge/draft-application.working-record.md.',
      snapshotKept: true,
      resavedLine: true,
      sourceMapRefreshed: true,
      attorneyEdit: true,
    })
  })

  it('starts the next version when the claims changed and were approved again, keeping the previous draft and record', async () => {
    const { tools, read, edit } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft())
    await edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    const cleared = await tools.start()
    await edit('drafting/hinge/claims.md', 'approved: false', 'approved: true')
    await tools.start()
    await tools.saveOutline(outlineTable)
    const result = await tools.save(draft())
    expect({
      cleared,
      result,
      version: (await read('drafting/hinge/draft-application.md')).match(/^version: (?<version>\d+)$/m)?.groups?.['version'],
      previousDraftVersion: (await read('drafting/hinge/draft-application.v1.md')).match(/^version: (?<version>\d+)$/m)?.groups?.['version'],
      previousRecordKept: (await read('drafting/hinge/draft-application.v1.working-record.md')).includes('- **Version:** 1'),
    }).toMatchSnapshot()
  })
})

describe('validate_draft', () => {
  it('keeps the attorney\'s waiver across two runs and merges the advisory items', async () => {
    const { tools, read, write } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft(openQuestion))
    await tools.validate()
    const findings = await read('drafting/hinge/findings.md')
    await write('drafting/hinge/findings.md', findings.replace(/(- `inventor-question`[^\n]*)/, '$1\n  - Waived: Grade is left to the manufacturer.'))
    const second = await tools.validate([{ message: 'Claim 2: "steel" has literal basis, but no passage supports steel in combination with the housing.', line: 27, claim: 2 }])
    expect({ second, findings: await read('drafting/hinge/findings.md') }).toMatchSnapshot()
  })

  it('adds a Note when the approved claims were never searched against prior art', async () => {
    const unsearched = claims().replace('approved: true\n', 'approved: true\nstatus: not searched — scope unvalidated\n')
    const { tools, read } = await setup({ ...gatesOpen, 'drafting/hinge/claims.md': unsearched })
    await tools.start()
    await tools.save(draft())
    await tools.validate()
    expect((await read('drafting/hinge/findings.md')).match(/- `claims-unsearched`[^\n]*/)?.[0]).toBe(
      '- `claims-unsearched` (claims.md): The Approved Claims carry status "not searched — scope unvalidated": they were drafted without a prior-art search. Run the prior-art step and re-approve, or record in the review that the claims are deliberately unsearched.')
  })

  it('"All 10 Errors of this rule" on the card waives each antecedent-basis Error; the next run keeps the waivers and the export no longer lists them', async () => {
    const tenClaims = claims().replace(/2\. The hinge[^\n]*\n/, Array.from({ length: 10 }, (_, index) => `${String(index + 2)}. The hinge of claim 1, wherein the pin is steel.\n`).join(''))
    const bench = await setup({ ...gatesOpen, 'drafting/hinge/claims.md': tenClaims, 'drafting/hinge/draft-outline.md': outline(tenClaims).replace('| 1, 2 |', '| 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |') })
    const { tools, read, seams } = bench
    await tools.start()
    await tools.save(draft().replace(/## CLAIMS\n\n[\s\S]*?\n\n## ABSTRACT/, `## CLAIMS\n\n${parseDraftingFrontmatter(tenClaims).body.trim()}\n\n## ABSTRACT`))
    const before = await tools.exportDocx()
    seams.pick(['All 10 Errors of antecedent-basis'], 'The pin is introduced in claim 1 of the parent application.')
    await tools.validate()
    seams.answerer = undefined
    const after = await tools.exportDocx()
    const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0
    expect({
      before: count(before, /- `antecedent-basis`/g),
      options: seams.asked[0]?.questions[0]?.options?.map(option => option.label).slice(-1),
      waiversAfterValidate: count(await read('drafting/hinge/findings.md'), /- Waived: The pin is introduced in claim 1 of the parent application\./g),
      after: after.split(' as ')[0],
    }).toEqual({ before: 10, options: ['All 10 Errors of antecedent-basis'], waiversAfterValidate: 10, after: 'Exported the description, the claims and the abstract' })
  })

  it('a refusal while the claims are not approved names the file, the line, the word to change, the card and the command', async () => {
    const { tools } = await setup({ 'drafting/hinge/feature-list.md': featureList(), 'drafting/hinge/claims.md': claims('false') })
    expect(await tools.validate()).toBe('The draft was not validated. drafting/hinge/draft-application.md does not exist: save the draft with write_patent_results, template draft-application, first. Open in drafting/hinge/checklist.md: step 2 (Approve the claims). Next: Review `drafting/hinge/claims.md:2`, then change `false` to `true` on line 2, or answer the Approve Claims card in the chat, or type `/approve-claims hinge`. Stay in this chat.')
  })

  it('refuses a matter name that leaves drafting/ and a matter folder that does not exist', async () => {
    const { tools } = await setup(gatesOpen)
    expect([await tools.validate(undefined, '../secrets'), await tools.validate(undefined, 'pump')]).toEqual([
      'The draft was not validated. "../secrets" is not a matter name. Give the folder name under drafting/, e.g. "hinge" for drafting/hinge/.',
      'The draft was not validated. drafting/pump/draft-application.md does not exist: save the draft with write_patent_results, template draft-application, first.',
    ])
  })
})

describe('export_draft_docx', () => {
  it('refuses on an open Inventor Question and on claims changed after approval', async () => {
    const { tools, edit } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft(openQuestion))
    const openQuestionRefusal = await tools.exportDocx()
    await edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    const claimsChanged = await tools.exportDocx()
    const unapproved = await tools.exportDocx()
    expect({ openQuestionRefusal, claimsChanged, unapproved }).toMatchSnapshot()
  })

  it('refuses on an unwaived Error that is not an Inventor Question, with the waiver edit, the card and the command', async () => {
    const { tools, exists } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft().replace('<!-- src: disclosure:§1, item:O1 -->\n', ''))
    expect({
      result: await tools.exportDocx(),
      docxWritten: await exists('drafting/hinge/draft-application.description.docx'),
    }).toEqual({
      result: 'The draft was not exported. 1 finding(s) in drafting/hinge/findings.md are open; each is resolved in the draft, or the attorney waives it with a reason (`  - Waived: <reason>` under the item):\n- `source-marker` (draft-application.md, line 11): The paragraph at line 11 has no source marker (<!-- src: ... -->).\nOpen in drafting/hinge/checklist.md: step 4 (Fix or waive the Errors). Next: To waive, add under the item in `drafting/hinge/findings.md:7`:   - Waived: <your reason>, or answer the Waive Errors card validate_draft and export_draft_docx show in the chat, or type `/waive hinge <findings.md line or rule> <reason>`. To fix, tell the agent: "Fix the Errors in findings.md". Stay in this chat.',
      docxWritten: false,
    })
  })

  it('the chat advice says a new chat after the same refusal twice', async () => {
    const { tools } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft().replace('<!-- src: disclosure:§1, item:O1 -->\n', ''))
    const first = await tools.exportDocx()
    const second = await tools.exportDocx()
    expect({ first: first.slice(first.lastIndexOf('. ') + 2), second: second.slice(second.lastIndexOf('. ') + 2) }).toEqual({
      first: 'Stay in this chat.',
      second: 'Start a new chat: the agent refused the same step twice.',
    })
  })

  it('appends the attorney edits to the Working Record and writes the description, claims and abstract .docx files without markers', async () => {
    const { tools, read, write, dir } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft())
    const saved = await read('drafting/hinge/draft-application.md')
    await write('drafting/hinge/draft-application.md', saved.replace('A hinge joins a door to a frame.', 'A hinge pivotally joins a door to a frame.'))
    const result = await tools.exportDocx()
    const { readFile } = await import('node:fs/promises')
    const docxParagraphs: Record<string, string[]> = {}
    for (const type of ['description', 'claims', 'abstract']) {
      const docx = await readFile(`${dir}/drafting/hinge/draft-application.${type}.docx`)
      docxParagraphs[type] = (await mammoth.extractRawText({ buffer: docx })).value.split('\n').filter(Boolean)
    }
    const record = await read('drafting/hinge/draft-application.working-record.md')
    const fullCopy = (await mammoth.extractRawText({ buffer: await readFile(`${dir}/drafting/hinge/draft-application.full.docx`) })).value.split('\n').filter(Boolean)
    expect({
      result,
      docxParagraphs,
      fullCopyStart: fullCopy.slice(0, 3),
      filingManifest: await read('drafting/hinge/filing-manifest.md'),
      attorneyEdits: stable(record.slice(record.indexOf('## Attorney edits'))),
    }).toMatchSnapshot()
  })
})

describe('Inventor Question answers', () => {
  it('the save writes inventor-answers.md; an applied answer closes its question, is recorded, and the export blocks only on the rest', async () => {
    const { tools, read, write } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft(twoQuestions))
    const written = await read('drafting/hinge/inventor-answers.md')
    await write('drafting/hinge/inventor-answers.md', fillAnswer(written, 'IQ-1', 'Stainless steel.'))
    await tools.validate()
    const answeredNotApplied = {
      findings: (await read('drafting/hinge/findings.md')).match(/- `inventor-question`[^\n]*/g),
      checklistStep5: (await read('drafting/hinge/checklist.md')).match(/- \[ \] 5\.[^\n]*/)?.[0],
    }
    await tools.save(appliedIq1())
    const exportResult = await tools.exportDocx()
    expect({
      written,
      answeredNotApplied,
      exportResult,
      answersKept: (await read('drafting/hinge/inventor-answers.md')).includes('**Answer:**\nStainless steel.\n'),
      recorded: (await read('drafting/hinge/draft-application.working-record.md')).match(/^- \*\*Inventor answer applied:\*\*.*$/gm)?.map(stable),
    }).toMatchSnapshot()
  })

  it('a filled answer stays current until a save applies it, and the Working Record names the round applied', async () => {
    const { tools, read, write } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft(twoQuestions))
    await write('drafting/hinge/inventor-answers.md', fillAnswer(await read('drafting/hinge/inventor-answers.md'), 'IQ-1', 'Stainless steel; the hardness is not known.'))
    const narrowedQuestion = '\n## Inventor Questions\n\n> **Inventor Question IQ-1:** What hardness has the stainless steel lever?\n\n> **Inventor Question IQ-2:** How thick is the lever?\n'
    await tools.save(appliedIq1(narrowedQuestion))
    await write('drafting/hinge/inventor-answers.md', (await read('drafting/hinge/inventor-answers.md')).replace(/(\*\*Narrowed question:\*\* What hardness has the stainless steel lever\?\n\n\*\*Answer:\*\*\n)/, '$1Hardened to 40 HRC.\n'))
    await tools.save(appliedIq1(narrowedQuestion))
    const notYetApplied = parseInventorAnswers(await read('drafting/hinge/inventor-answers.md'))[0]?.rounds.length
    await tools.save(appliedIq1('\n## Inventor Questions\n\n> **Inventor Question IQ-2:** How thick is the lever?\n').replace('The lever 14 is stainless steel.', 'The lever 14 is stainless steel, hardened to 40 HRC.'))
    expect({
      notYetApplied,
      rounds: parseInventorAnswers(await read('drafting/hinge/inventor-answers.md'))[0]?.rounds.map(round => round.answer),
      recorded: (await read('drafting/hinge/draft-application.working-record.md')).match(/^- \*\*Inventor answer applied:\*\*.*$/gm)?.map(line => line.replace(/ at \S+$/, '')),
    }).toEqual({
      notYetApplied: 2,
      rounds: ['Stainless steel; the hardness is not known.', 'Hardened to 40 HRC.'],
      recorded: [
        '- **Inventor answer applied:** IQ-1, answer 1, from inventor-answers.md',
        '- **Inventor answer applied:** IQ-1, answer 2, from inventor-answers.md',
      ],
    })
  })

  it('an inventor:IQ-n marker without a filled answer is an Error', async () => {
    const { tools, read } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft(twoQuestions))
    await tools.save(appliedIq1())
    await tools.validate()
    expect((await read('drafting/hinge/findings.md')).match(/- `source-marker`[^\n]*/g)).toEqual([
      '- `source-marker` (draft-application.md, line 30): The paragraph at line 30 cites inventor:IQ-1, but inventor-answers.md has no answer to IQ-1.',
    ])
  })
})

describe('Drafting Checklist', () => {
  it('every drafting tool rewrites checklist.md, also after a refusal', async () => {
    const { tools, read, edit } = await setup({ ...gatesOpen, 'drafting/hinge/claims.md': claims('false') })
    const refused = await tools.start()
    const afterRefusal = await read('drafting/hinge/checklist.md')
    await edit('drafting/hinge/claims.md', 'approved: false', 'approved: true')
    await tools.start()
    await tools.save(draft(openQuestion))
    expect({ refused, afterRefusal, afterSave: await read('drafting/hinge/checklist.md') }).toMatchSnapshot()
  })

  it('step 6 is checked only while the export was written from the current draft', async () => {
    const { tools, read, edit } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft())
    await tools.exportDocx()
    const step6 = async () => (await read('drafting/hinge/checklist.md')).match(/^- \[.\] 6\..*$/m)?.[0]
    const afterExport = await step6()
    await edit('drafting/hinge/draft-application.md', 'A hinge joins a door to a frame.', 'A hinge pivotally joins a door to a frame.')
    await tools.validate()
    expect({ afterExport, afterEdit: await step6() }).toEqual({
      afterExport: '- [x] 6. Exported to Word: draft-application.description.docx, draft-application.claims.docx, draft-application.abstract.docx',
      afterEdit: '- [ ] 6. Export to Word: ready',
    })
  })

  it('shows the outline line and the draft line of step 3, each read from the files', async () => {
    const { tools, read } = await setup(noOutline)
    const step3 = async () => (await read('drafting/hinge/checklist.md')).match(/^- \[.\] 3\..*(?:\n {6}→.*)*$/gm)
    await tools.start()
    const started = await step3()
    await tools.saveOutline(outlineTable)
    const planned = await step3()
    await tools.save(draft())
    expect({ started, planned, drafted: await step3() }).toEqual({
      started: [
        '- [ ] 3. Write the outline: draft-outline.md does not exist\n      → Tell the agent: "Plan the draft" (it saves draft-outline.md with write_patent_results, template draft-outline)',
        '- [ ] 3. Write the draft: blocked by the outline (draft-outline.md)',
      ],
      planned: [
        '- [x] 3. Outline written for the approved claims: draft-outline.md',
        '- [ ] 3. Write the draft: draft-application.md does not exist\n      → Tell the agent: "Draft the application"',
      ],
      drafted: [
        '- [x] 3. Outline written for the approved claims: draft-outline.md',
        '- [x] 3. Draft written: draft-application.md',
      ],
    })
  })
})

describe('write_patent_results draft-outline template', () => {
  it('writes draft-outline.md with the office of the Feature List and the Approved Claims hash, reports the outline findings without blocking the save, and presents the outline', async () => {
    const { tools, read, presented } = await setup(noOutline)
    const unsourced = `${outlineTable}| O3 | DETAILED DESCRIPTION | Technical | 1 | a spring |  | yes |  |\n`
    const result = await tools.saveOutline(`---\noffice: EPO\nauthor: agent\n---\n${unsourced}`)
    const saved = await read('drafting/hinge/draft-outline.md')
    expect({
      result: stable(result),
      frontmatter: frontmatterOf(saved),
      boundToClaims: saved.includes(`claims: ${claimsHashOf(claims())}`),
      presented: presented(),
    }).toMatchSnapshot()
  })

  it('refuses while the claims are not approved, when the content has no Outline table, and outside the drafting folder contract', async () => {
    expect([
      await (await setup({ ...noOutline, 'drafting/hinge/claims.md': claims('false') })).tools.saveOutline(outlineTable),
      await (await setup(noOutline)).tools.saveOutline('# Draft Outline\n\nO1 Background, O2 the lever.\n'),
      await (await setup(noOutline)).tools.saveOutline(outlineTable, 'outputs/draft-outline.md'),
    ]).toMatchSnapshot()
  })

  it('records each save that replaces a different draft-outline.md in the Working Record, and the draft save keeps the lines', async () => {
    const { tools, read, edit } = await setup(noOutline)
    await tools.start()
    await tools.saveOutline(outlineTable)
    await tools.saveOutline(outlineTable)
    const before = await read('drafting/hinge/draft-outline.md')
    await edit('drafting/hinge/draft-outline.md', '| F1, FIG. 1 |', '| F1 |')
    const edited = await read('drafting/hinge/draft-outline.md')
    await tools.saveOutline(outlineTable)
    await tools.save(draft())
    const short = (text: string) => sha256Hex(text).slice(0, 12)
    expect({
      attorneyEditChangedTheFile: edited !== before,
      recorded: (await read('drafting/hinge/draft-application.working-record.md')).match(/^- \*\*Outline re-saved:\*\*.*$/gm),
    }).toEqual({
      attorneyEditChangedTheFile: true,
      recorded: [`- **Outline re-saved:** ${short(edited)} → ${short(before)}`],
    })
  })
})

describe('draft-application save: Draft Outline precondition', () => {
  it('refuses while draft-outline.md is missing or made for other claims; saves with a bound outline and records its SHA-256', async () => {
    const missing = await (await setup(noOutline)).tools.save(draft())
    const stale = await (await setup({ ...gatesOpen, 'drafting/hinge/draft-outline.md': outline(claims('true', 'wherein the lever is iron')) })).tools.save(draft())
    const bound = await setup(gatesOpen)
    await bound.tools.start()
    const saved = await bound.tools.save(draft())
    const resaved = await bound.tools.save(draft().replace('A hinge joins a door to a frame.', 'A hinge pivotally joins a door to a frame.'))
    const record = await bound.read('drafting/hinge/draft-application.working-record.md')
    const outlineFileHash = sha256Hex(await bound.read('drafting/hinge/draft-outline.md'))
    expect({
      missing,
      stale: stale.replace(/[0-9a-f]{12}…/g, '<sha>…'),
      saved: saved.split('\n')[0],
      resaved: resaved.split('\n')[0],
      recordOutlineHash: record.match(/^- \*\*Outline SHA-256:\*\* \S+$/gm)?.map(line => line.replace(outlineFileHash, '<sha of draft-outline.md>')),
    }).toMatchSnapshot()
  })

  it('editing the claims leaves the outline stale: start says so, the save refuses until the outline is saved again', async () => {
    const { tools, edit } = await setup(gatesOpen)
    await tools.start()
    await tools.save(draft())
    await edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    await tools.start()
    await edit('drafting/hinge/claims.md', 'approved: false', 'approved: true')
    const started = await tools.start()
    const refused = await tools.save(draft())
    const replanned = await tools.saveOutline(outlineTable)
    const saved = await tools.save(draft())
    expect({
      startOutlineSection: started.slice(started.indexOf('## Draft Outline'), started.indexOf('## Style exemplars')).replace(/[0-9a-f]{12}…/g, '<sha>…'),
      refused: refused.replace(/[0-9a-f]{12}…/g, '<sha>…'),
      replanned: stable(replanned.split('\n')[0] ?? ''),
      saved: saved.split('\n')[0],
    }).toMatchSnapshot()
  })

  it('claims edited and then restored to the same body bind the old outline again: the binding is the hash of the claims body only', async () => {
    const { tools, edit } = await setup(gatesOpen)
    await tools.start()
    await edit('drafting/hinge/claims.md', 'wherein the lever is steel', 'wherein the lever is made of steel')
    await tools.start()
    await edit('drafting/hinge/claims.md', 'wherein the lever is made of steel', 'wherein the lever is steel')
    await edit('drafting/hinge/claims.md', 'approved: false', 'approved: true')
    const started = await tools.start()
    const saved = await tools.save(draft())
    expect({
      startReturnsOutline: started.includes(`## Draft Outline (drafting/hinge/draft-outline.md)\n\n${outlineTable.trim()}`),
      saved: saved.split('\n')[0],
    }).toEqual({
      startReturnsOutline: true,
      saved: 'Saved drafting/hinge/draft-application.md (version 1, office US). Generated snapshot: drafting/hinge/draft-application.generated.md. Working record: drafting/hinge/draft-application.working-record.md.',
    })
  })
})

describe('validate_draft Draft Outline rules', () => {
  it('writes the outline rules to findings.md with the others; without draft-outline.md, one outline-claims Error', async () => {
    const withOutline = await setup({ ...gatesOpen, 'drafting/hinge/draft-application.md': draft().replace('feature:F1, item:O2', 'feature:F1') })
    await withOutline.tools.validate()
    const withoutOutline = await setup({ ...noOutline, 'drafting/hinge/draft-application.md': draft() })
    const result = await withoutOutline.tools.validate()
    const outlineLines = async (run: Bench) => (await run.read('drafting/hinge/findings.md')).match(/^- `(?:outline-[a-z]+|item-coverage|duplicate-sentence)`[^\n]*/gm)
    expect({
      withOutline: await outlineLines(withOutline),
      withoutOutline: await outlineLines(withoutOutline),
      withoutOutlineCounts: result.split('\n')[1],
    }).toMatchSnapshot()
  })
})

describe('style folder', () => {
  it('every drafting tool creates style/README.md once, never overwrites it, never reads it as an exemplar; the checklist counts the exemplars', async () => {
    const { tools, read, write } = await setup(gatesOpen)
    const first = await tools.start()
    const created = await read('style/README.md')
    await write('style/README.md', 'My own notes.')
    await write('style/a.md', 'In one embodiment, the widget turns.')
    const second = await tools.start()
    await tools.validate()
    expect({
      created,
      firstSaysNoExemplar: first.includes('No exemplar in style/: use the office template style only. Tell the attorney: Put 1 to 5 of your own filed applications or claim sets in style/'),
      readmeKept: await read('style/README.md'),
      exemplarHeadings: second.match(/^### Style exemplar.*$/gm),
      checklistStyleLine: (await read('drafting/hinge/checklist.md')).match(/^- Style exemplars:.*$/m)?.[0],
    }).toMatchSnapshot()
  })
})

describe('remove_claim', () => {
  const pipeClamp = { 'drafting/hinge/feature-list.md': featureList(), 'drafting/hinge/claims.md': pipeClampClaims, 'drafting/hinge/figures.md': figures }

  /** The bench with the approval seam allowing every removal. */
  async function approving(): Promise<Bench> {
    const bench = await setup(pipeClamp)
    bench.seams.policy = 'ask'
    bench.seams.decider = () => 'allowed-once'
    return bench
  }

  it('asks the attorney with the cost, removes claim 4 of 14, renumbers, records it, and the next start refuses on the re-opened approval', async () => {
    const { tools, read, seams } = await approving()
    const result = await tools.removeClaim(4)
    const claimsAfter = await read('drafting/hinge/claims.md')
    expect({
      confirmation: seams.approvals.map(request => [request.toolName, request.callId, request.reason]),
      result,
      frontmatter: frontmatterOf(claimsAfter),
      claims: claimsAfter.split('\n').filter(line => /^\d+\./.test(line)).map(line => line.slice(0, 32)),
      record: (await read('drafting/hinge/draft-application.working-record.md')).split('\n').filter(line => line.startsWith('- **')).map(stable),
      start: await tools.start(),
    }).toMatchSnapshot()
  })

  it('refuses a claim other claims refer to, names them, asks nothing and changes nothing', async () => {
    const { tools, read, seams } = await approving()
    expect({
      result: await tools.removeClaim(1),
      asked: seams.approvals.length + seams.asked.length,
      unchanged: parseDraftingFrontmatter(await read('drafting/hinge/claims.md')).body === parseDraftingFrontmatter(pipeClampClaims).body,
    }).toMatchSnapshot()
  })

  it('removing the claim that claim 9 depends on refuses, names claim 9 and changes nothing (PRD 0025, S5)', async () => {
    const { tools, read } = await approving()
    const parents = parseClaims(pipeClampClaims).find(claim => claim.number === 9)?.dependsOn ?? []
    const result = await tools.removeClaim(parents[0] ?? 0)
    expect({
      parents,
      result,
      namesClaim9: / 9[,.]/.test(result),
      unchanged: parseDraftingFrontmatter(await read('drafting/hinge/claims.md')).body === parseDraftingFrontmatter(pipeClampClaims).body,
    }).toMatchSnapshot()
  })

  it('refuses a number with no claim and changes nothing', async () => {
    const { tools, read } = await approving()
    expect({
      result: await tools.removeClaim(15),
      unchanged: parseDraftingFrontmatter(await read('drafting/hinge/claims.md')).body === parseDraftingFrontmatter(pipeClampClaims).body,
    }).toMatchSnapshot()
  })
})
