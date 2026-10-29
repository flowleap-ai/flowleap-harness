/**
 * The drafting tools on the paths the acceptance specs do not reach: malformed arguments, a call
 * without an agent, a matter file that is missing, renamed or deleted while a card is open, a
 * draft without an office, a stale draft, the measured drawing sheets, a long style exemplar, and
 * an answered file that is not a matter file, is not Word, or names an unknown question. The tools
 * run on the gate bench over the REAL local filesystem.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setRecordField, VERSION_CLAIMS_HASH } from '../src/drafting/working-record.ts'
import { draftingToolDefinition } from '../src/tools/shell.ts'
import {
  matterArgument, NO_GATE_SEAMS, parseInventorQuestionsArgs, parseRemoveClaimArgs, parseValidateDraftArgs, PresentQueue, renumberingSentence,
  START_APPLICATION_DRAFT_NAME,
} from '../src/index.ts'
import { claims, draft, featureList, fillAnswer, gatesOpen, openQuestion, outline, stable } from './drafting-matter-fixtures.ts'
import { benchWith, textOf } from './gates-test-bench.ts'

type Bench = Awaited<ReturnType<typeof benchWith>>

const benches: Bench[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const bench of benches.splice(0)) await bench.dispose()
})

async function setup(files: Record<string, string> = gatesOpen): Promise<Bench> {
  const bench = await benchWith(files)
  benches.push(bench)
  return bench
}

/** The first line of a tool result without the checklist sentences a refusal ends with. */
const head = (text: string) => (text.split('\n')[0] ?? '').split(' Open in ')[0] ?? ''

describe('the argument parsers', () => {
  it('reject arguments that are not of the declared shape', () => {
    const failures = [
      () => matterArgument('start_application_draft', []),
      () => matterArgument('start_application_draft', null),
      () => matterArgument('start_application_draft', { matter: 3 }),
      () => parseRemoveClaimArgs({ matter: 'hinge', claim: 0 }),
      () => parseRemoveClaimArgs({ matter: 'hinge', claim: 1.5 }),
      () => parseInventorQuestionsArgs({ matter: 'hinge', action: 'mail' }),
      () => parseInventorQuestionsArgs({ matter: 'hinge', action: 'import', file: 3 }),
      () => parseValidateDraftArgs({ matter: 'hinge', advisory: 'none' }),
      () => parseValidateDraftArgs({ matter: 'hinge', advisory: ['text'] }),
      () => parseValidateDraftArgs({ matter: 'hinge', advisory: [{ line: 3 }] }),
    ].map((parse) => {
      try {
        parse()
        return 'parsed'
      } catch (error) {
        return error instanceof Error ? error.message.split(': ').slice(1).join(': ') : 'not an Error'
      }
    })
    expect(failures).toEqual([
      'invalid arguments: expected an object',
      'invalid arguments: expected an object',
      'invalid arguments: matter must be a string (the folder name under drafting/)',
      'invalid arguments: claim must be a positive integer, the claim number as claims.md numbers it now',
      'invalid arguments: claim must be a positive integer, the claim number as claims.md numbers it now',
      'invalid arguments: action must be "send" or "import"',
      'invalid arguments: file must be a string',
      'invalid arguments: advisory must be an array of items',
      'invalid arguments: each advisory item must be an object with a message',
      'invalid arguments: each advisory item must have a string message',
    ])
    expect({
      file: parseInventorQuestionsArgs({ matter: 'hinge', action: 'import', file: null }),
      advisory: parseValidateDraftArgs({ matter: 'hinge', advisory: [{ message: 'Check claim 2.', line: '4', claim: 2 }] }),
      seams: [NO_GATE_SEAMS.ask(), NO_GATE_SEAMS.approve(), NO_GATE_SEAMS.approvalPolicy(undefined as never)],
    }).toEqual({
      file: { matter: 'hinge', action: 'import' },
      advisory: { matter: 'hinge', advisory: [{ message: 'Check claim 2.', claim: 2 }] },
      seams: [undefined, undefined, undefined],
    })
  })

  it('states the renumbering of no, one, a run of and scattered later claims', () => {
    const removal = (renumbered: { from: number; to: number }[]): Parameters<typeof renumberingSentence>[0] => ({ removed: true, before: 9, text: '', renumbered })
    expect([
      renumberingSentence(removal([])),
      renumberingSentence(removal([{ from: 3, to: 2 }])),
      renumberingSentence(removal([{ from: 3, to: 2 }, { from: 4, to: 3 }])),
      renumberingSentence(removal([{ from: 3, to: 2 }, { from: 7, to: 6 }])),
    ]).toEqual([
      'No other claim is renumbered.',
      'Claim 3 is now claim 2.',
      'Claims 3 to 4 are now claims 2 to 3.',
      'Claims 3, 7 are now claims 2, 6.',
    ])
  })
})

describe('the drafting tool shell', () => {
  it('opens the matter in the default working directory for a call without an agent', async () => {
    const bench = await setup()
    const result = await executeModelToolFixture(bench.ctx, {
      callId: ToolCallId('no-agent'), name: START_APPLICATION_DRAFT_NAME, arguments: { matter: 'hinge' }, signal: new AbortController().signal,
    })
    expect(head(textOf(result.content[0]))).toMatch(/^Drafting started for matter "hinge"\. Office: US\. Gates read from the files: /)
  })

  it('returns a thrown failure as the refusal, and renders a value that is not a drafting value as JSON', async () => {
    const bench = await setup()
    const warned: string[] = []
    const probe = (name: string, failure: unknown) => draftingToolDefinition(bench.ctx, {
      present: new PresentQueue(), gates: NO_GATE_SEAMS, warn: (line) => { warned.push(line) }, info: () => {},
    }, {
      name,
      description: 'probe',
      parameters: { type: 'object', properties: {} },
      parse: () => 'hinge',
      matter: matter => matter,
      refusal: () => 'Nothing was done.',
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a failure that is not an Error is one of the cases under test
      execute: () => Promise.reject(failure),
    })
    const definition = probe('probe_string_failure', 'a thrown string')
    bench.ctx.tools.register(definition)
    bench.ctx.tools.register(probe('probe_error_failure', new Error('disk full')))
    const results = [await bench.call('probe_string_failure', {}), await bench.call('probe_error_failure', {})]
    expect({ results, warned, rendered: definition.output?.render({}, 42) }).toEqual({
      results: ['Nothing was done. a thrown string', 'Nothing was done. disk full'],
      warned: ['flowleap-deliverables: probe_string_failure failed: a thrown string', 'flowleap-deliverables: probe_error_failure failed: disk full'],
      rendered: [{ type: 'text', text: '42' }],
    })
  })
})

describe('start_application_draft', () => {
  it('refuses a Feature List without an office, and names two independent claims of a dependent claim', async () => {
    const noOffice = await setup({ ...gatesOpen, 'drafting/hinge/feature-list.md': featureList().replace('office: US\n', '') })
    const twoRoots = await setup({
      ...gatesOpen,
      'drafting/hinge/claims.md': `${claims()}3. A door comprising a frame.\n4. The hinge of claim 1 or the door of claim 3, wherein a pin is steel.\n`,
    })
    const refusal = await noOffice.tools.start()
    const started = await twoRoots.tools.start()
    expect({
      refusal: head(refusal),
      terms: started.split('\n').find(line => line.startsWith('Claim 4')),
    }).toEqual({
      refusal: 'Drafting did not start. drafting/hinge/feature-list.md names no office. In `drafting/hinge/feature-list.md:1`, add the line `office: US` or `office: EPO` under the `---` on line 1.',
      terms: 'Claim 4 (with claims 1, 3): pin is steel',
    })
  })

  it('states a missing figures.md, cuts a long style exemplar, and shows empty claims when claims.md goes away after the approval is recorded', async () => {
    const { tools, write, ctx, dir } = await setup({
      'drafting/hinge/feature-list.md': featureList(),
      'drafting/hinge/claims.md': claims(),
      'drafting/hinge/draft-outline.md': outline(),
    })
    await write('style/long.md', `${'word '.repeat(5000)}end`)
    const real = ctx.fs.writeText.bind(ctx.fs)
    // Another process deletes claims.md right after the tool records the approved claims.
    vi.spyOn(ctx.fs, 'writeText').mockImplementation(async (target, content, ...rest) => {
      const outcome = await real(target, content, ...rest)
      if (ctx.fs.processPath(target).endsWith('working-record.md')) rmSync(join(dir, 'drafting/hinge/claims.md'), { force: true })
      return outcome
    })
    const result = await tools.start()
    const section = (title: string) => result.slice(result.indexOf(`## ${title}`)).split('\n').slice(2, 3)[0]
    expect({
      figures: section('Figures'),
      claims: section('Approved Claims'),
      cut: result.includes('[Exemplar cut here; the rest is not shown.]'),
    }).toEqual({
      figures: 'No figures.md: the application has no figures unless the attorney supplies them.',
      claims: '',
      cut: true,
    })
  })
})

describe('validate_draft', () => {
  it('refuses without claims.md or an office, and takes an advisory item without a line or claim', async () => {
    const noClaims = await setup({ 'drafting/hinge/feature-list.md': featureList(), 'drafting/hinge/draft-application.md': draft() })
    const noOffice = await setup({
      'drafting/hinge/feature-list.md': featureList().replace('office: US\n', ''),
      'drafting/hinge/claims.md': claims(),
      'drafting/hinge/draft-application.md': draft().replace('office: US\n', ''),
    })
    const advisory = await setup()
    await advisory.tools.start()
    await advisory.tools.save(draft())
    const validated = await advisory.tools.validate([{ message: 'Consider a broader term.' }, { message: '  ' }])
    expect({
      noClaims: head(await noClaims.tools.validate()),
      noOffice: head(await noOffice.tools.validate()),
      advisory: head(validated),
      findings: (await advisory.read('drafting/hinge/findings.md')).match(/- `advisory`[^\n]*/g),
    }).toEqual({
      noClaims: 'The draft was not validated. drafting/hinge/claims.md does not exist.',
      noOffice: 'The draft was not validated. Neither drafting/hinge/draft-application.md nor drafting/hinge/feature-list.md names the office (`office: US` or `office: EPO`).',
      advisory: 'Wrote drafting/hinge/findings.md (US validators, 1 advisory item(s); waivers kept).',
      findings: ['- `advisory` (draft-application.md): Consider a broader term.'],
    })
  })

  it('validates against the claims it read when claims.md goes away while the waive card is open', async () => {
    const { tools, seams, dir, read } = await setup()
    await tools.start()
    await tools.save(draft().replace('<!-- src: disclosure:§1, item:O1 -->\n', ''))
    seams.answerer = (request) => {
      rmSync(join(dir, 'drafting/hinge/claims.md'))
      return {
        answers: [
          { id: 'waive-items', selected: request.questions[0]?.options?.map(option => option.label) ?? [] },
          { id: 'waive-reason', selected: [], custom: 'The background needs no source.' },
        ],
      }
    }
    const result = await tools.validate()
    expect({ waived: result.split('\n')[1], findings: (await read('drafting/hinge/findings.md')).includes('  - Waived: The background needs no source.') }).toEqual({
      waived: '1 Error(s) waived by the attorney in chat (question card); the reason is under each item in drafting/hinge/findings.md.',
      findings: true,
    })
  })
})

describe('remove_claim', () => {
  it('refuses without claims.md and for a claim another claim refers to', async () => {
    const missing = await setup({ 'drafting/hinge/feature-list.md': featureList() })
    const referred = await setup()
    expect({
      missing: await missing.tools.removeClaim(2),
      referred: head(await referred.tools.removeClaim(1)),
    }).toEqual({
      missing: expect.stringMatching(/^Claim 2 was not removed\. drafting\/hinge\/claims\.md does not exist\./) as string,
      referred: 'Claim 1 was not removed. Claim 2 refers to claim 1. The attorney decides about that claim first: remove it or change the claim it refers to.',
    })
  })

  it('writes nothing when claims.md goes away while the confirmation is open, and removes an unapproved claim', async () => {
    const { tools, seams, dir, read } = await setup({ ...gatesOpen, 'drafting/hinge/claims.md': claims('false') })
    seams.decider = () => {
      rmSync(join(dir, 'drafting/hinge/claims.md'))
      return 'allowed-once'
    }
    const vanished = head(await tools.removeClaim(2))
    await setupClaims(dir)
    seams.decider = () => 'allowed-once'
    const removed = await tools.removeClaim(2)
    expect({ vanished, removed: removed.split('. ').slice(0, 4).join('. '), claims: (await read('drafting/hinge/claims.md')).includes('2. ') }).toEqual({
      vanished: 'Claim 2 was not removed. drafting/hinge/claims.md changed while the confirmation was open. Nothing was written; read the claims again.',
      removed: 'Removed claim 2 of 2 from drafting/hinge/claims.md. No other claim is renumbered. The claim references in the other claims changed with them. The claims were not approved before the removal; the attorney approves them after review',
      claims: false,
    })
  })
})

/** Write the unapproved hinge claims again. */
async function setupClaims(dir: string): Promise<void> {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(dir, 'drafting/hinge/claims.md'), claims('false'))
}

describe('export_draft_docx', () => {
  it('refuses a stale draft, a missing draft or snapshot, and a draft without an office', async () => {
    const stale = await setup()
    await stale.tools.start()
    await stale.tools.save(draft())
    const record = await stale.read('drafting/hinge/draft-application.working-record.md')
    await stale.write('drafting/hinge/draft-application.working-record.md', setRecordField(record, VERSION_CLAIMS_HASH, '0'.repeat(64)))
    const missing = await setup()
    const noSnapshot = await setup({ ...gatesOpen, 'drafting/hinge/draft-application.md': draft() })
    const noOffice = await setup({
      ...gatesOpen,
      'drafting/hinge/feature-list.md': featureList().replace('office: US\n', ''),
      'drafting/hinge/draft-application.md': draft().replace('office: US\n', ''),
      'drafting/hinge/draft-application.generated.md': draft(),
    })
    expect({
      stale: head(await stale.tools.exportDocx()),
      missing: head(await missing.tools.exportDocx()),
      noSnapshot: head(await noSnapshot.tools.exportDocx()),
      noOffice: head(await noOffice.tools.exportDocx()),
    }).toEqual({
      stale: 'The draft was not exported. The saved draft was generated against other claims than the current drafting/hinge/claims.md. Call start_application_draft, regenerate the specification and save it: the save starts the next draft version.',
      missing: 'The draft was not exported. drafting/hinge/draft-application.md does not exist: save the draft with write_patent_results, template draft-application, first.',
      noSnapshot: 'The draft was not exported. drafting/hinge/draft-application.generated.md does not exist: save the draft with write_patent_results, template draft-application, first.',
      noOffice: 'The draft was not exported. Neither drafting/hinge/draft-application.md nor drafting/hinge/feature-list.md names the office (`office: US` or `office: EPO`).',
    })
  })

  it('counts the drawing sheets of drawings/ and starts the Working Record again when it goes away after validation', async () => {
    const { tools, write, read, dir, ctx } = await setup()
    await tools.start()
    await tools.save(draft())
    await write('drafting/hinge/drawings/sheet-1.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')
    const real = ctx.fs.writeText.bind(ctx.fs)
    // Another process deletes the Working Record right after the export's validation writes it.
    vi.spyOn(ctx.fs, 'writeText').mockImplementation(async (target, content, ...rest) => {
      const outcome = await real(target, content, ...rest)
      if (ctx.fs.processPath(target).endsWith('working-record.md') && !content.includes('## Attorney edits')) {
        rmSync(join(dir, 'drafting/hinge/draft-application.working-record.md'))
      }
      return outcome
    })
    const result = await tools.exportDocx()
    expect({
      sheets: result.includes('The Drawing Sheets are the sheet-N.svg files of drafting/hinge/drawings/ (built by build_drawing_set).'),
      record: stable(await read('drafting/hinge/draft-application.working-record.md')).includes('## Attorney edits'),
    }).toEqual({ sheets: true, record: true })
  })
})

describe('inventor_questions', () => {
  /** A matter whose saved draft has one open Inventor Question. */
  async function withQuestion(): Promise<Bench> {
    const bench = await setup()
    await bench.tools.start()
    await bench.tools.save(draft(openQuestion))
    return bench
  }

  it('replaces an inventor-questions.docx that is not a Word file on send', async () => {
    const { tools, write } = await withQuestion()
    await write('drafting/hinge/inventor-questions.docx', 'not a zip')
    expect(head(await tools.inventor('send'))).toMatch(/^Wrote drafting\/hinge\/inventor-questions\.docx: a table of 1 open Inventor Question\(s\) \(IQ-1\)/)
  })

  it('refuses an answered file outside the matter, of another type, hidden, the answers file itself, missing, or not Word', async () => {
    const { tools, write } = await withQuestion()
    await write('drafting/hinge/broken.docx', 'not a zip')
    const refusals = await Promise.all([
      'answers.docx', 'drafting/hinge/answers.txt', 'drafting/hinge/.answers.md', 'drafting/hinge/inventor-answers.md', 'drafting/hinge/none.docx', 'drafting/hinge/broken.docx',
    ].map(async file => head(await tools.inventor('import', file)).replace(/^No answer was copied\. /, '')))
    expect(refusals.map(line => line.split(':')[0] ?? '')).toEqual([
      '"answers.docx" is not an answered file of the matter. Give a .docx or .md file in drafting/hinge/ other than drafting/hinge/inventor-answers.md, e.g. drafting/hinge/inventor-questions.docx.',
      '"drafting/hinge/answers.txt" is not an answered file of the matter. Give a .docx or .md file in drafting/hinge/ other than drafting/hinge/inventor-answers.md, e.g. drafting/hinge/inventor-questions.docx.',
      '"drafting/hinge/.answers.md" is not an answered file of the matter. Give a .docx or .md file in drafting/hinge/ other than drafting/hinge/inventor-answers.md, e.g. drafting/hinge/inventor-questions.docx.',
      '"drafting/hinge/inventor-answers.md" is not an answered file of the matter. Give a .docx or .md file in drafting/hinge/ other than drafting/hinge/inventor-answers.md, e.g. drafting/hinge/inventor-questions.docx.',
      'drafting/hinge/none.docx does not exist. The attorney puts the inventor\'s answered file in drafting/hinge/.',
      'drafting/hinge/broken.docx could not be read as a Word file',
    ])
  })

  it('imports a Markdown answers file, naming the question it does not know', async () => {
    const { tools, write, read } = await withQuestion()
    const answers = fillAnswer(await read('drafting/hinge/inventor-answers.md'), 'IQ-1', 'Stainless steel.')
    await write('drafting/hinge/answered.md', `${answers}\n## IQ-9\n\n**Question:** Unknown?\n\n**Answer:**\nYes.\n`)
    const result = await tools.inventor('import', 'drafting/hinge/answered.md')
    expect(result.split('. ').slice(0, 3)).toEqual([
      'Copied 1 answer(s) from drafting/hinge/answered.md into drafting/hinge/inventor-answers.md, in the inventor\'s words: IQ-1',
      'Not copied, because drafting/hinge/inventor-answers.md has no such question: IQ-9',
      'Now apply the answers to the draft (application-drafting skill, Step 5)',
    ])
  })
})
