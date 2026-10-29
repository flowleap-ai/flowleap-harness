/**
 * `export_draft_docx` and `inventor_questions` over the REAL local filesystem
 * in a temp directory: the plan's D2 acceptance on a fixture matter with its
 * flags set by hand (the pipe-clamp matter of the IDE's D7 run). The export
 * writes the three filing documents, the review copy and the manifest, logs
 * the attorney's edits, presents the five files; a closed claims gate refuses
 * with the IDE's sentence and writes nothing. `send` on eight open questions
 * writes a table of eight rows and presents it; `import` of the file with three
 * cells filled in Word fills three slots, leaves five, and a second `send`
 * carries the five.
 */

import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import * as mammoth from 'mammoth'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Deliverables from '../src/index.ts'
import { readInventorQuestionsDocx } from '../src/docx/inventor-questions.ts'
import { openInventorQuestions, updateInventorAnswers } from '../src/drafting/inventor-answers.ts'
import type { InventorQuestion } from '../src/drafting/source-markers.ts'
import { EXPORTED_DRAFT_HASH, readRecordField } from '../src/drafting/working-record.ts'
import { DELIVERED_LINE, EXPORT_DRAFT_DOCX_NAME, forgetRefusals, INVENTOR_QUESTIONS_NAME } from '../src/index.ts'
import { answerInWord } from './docx-test-utils.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures/pipe-clamp')

let dir: string
let calls = 0
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-drafting-')))
  forgetRefusals()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** The text of a model-facing content block, or the block's type when it carries no text. */
function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : String(block?.type)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  await ctx.plugin(Deliverables, { secondRead: 'off', secondReadModel: '' })
  const session = ctx.sessions.create(SessionId(`drafting-${String(++calls)}`), { meta: { cwd: dir } })
  const agent: Agent = {
    id: session.id,
    options: {},
    session,
    model: unsupportedModel(),
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx,
    send: () => {},
    followup: () => {},
    steer: (_message: UserMessage) => {},
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  const call = async (name: string, args: unknown) => {
    const result = await executeModelToolFixture(ctx, { callId: ToolCallId(`call-${String(++calls)}`), name, arguments: args, signal: new AbortController().signal, agent })
    return { isError: result.isError, text: textOf(result.content[0]) }
  }
  return { ctx, session, call }
}

/** The presented files of a Session: `[relative path, description]` per event. */
function presented(session: Session) {
  return session.snapshotEvents().flatMap(event => event.type === 'deliverables/presented'
    ? [event.data.files.map(file => [relative(dir, file.path).split(sep).join('/'), file.description])]
    : [])
}

/** Copy the pipe-clamp matter into `drafting/<matter>/`, with the generated snapshot equal to the draft. */
async function pipeClampMatter(matter: string, edit: (name: string, text: string) => string = (_name, text) => text): Promise<void> {
  const folder = join(dir, 'drafting', matter)
  const names = await readdir(FIXTURES)
  await mkdir(folder, { recursive: true })
  for (const name of names) {
    const text = await readFile(join(FIXTURES, name), 'utf8')
    await writeFile(join(folder, name), edit(name, text))
    if (name === 'draft-application.md') await writeFile(join(folder, 'draft-application.generated.md'), text)
  }
}

/** The paragraphs of a Word file on disk as Word reads them. */
async function docxLines(path: string): Promise<string[]> {
  return (await mammoth.extractRawText({ buffer: Buffer.from(await readFile(join(dir, path))) })).value.split('\n').filter(Boolean)
}

const eightQuestions: InventorQuestion[] = Array.from({ length: 8 }, (_, index) => ({
  id: `IQ-${index + 1}`,
  line: 10 + index,
  text: `Question ${index + 1} on the lever & the "housing"?`,
  ...(index === 0 ? { belongs: 'Detailed Description, after the paragraph on the lever 14.' } : {}),
}))

describe(EXPORT_DRAFT_DOCX_NAME, () => {
  it('registers both drafting tools under the IDE\'s names with the IDE\'s input schemas', async () => {
    const { ctx } = await bench()
    const schemas = ctx.tools.schemas().filter(entry => entry.name === EXPORT_DRAFT_DOCX_NAME || entry.name === INVENTOR_QUESTIONS_NAME)
    expect(schemas.map(entry => [entry.name, entry.parameters])).toEqual([
      [EXPORT_DRAFT_DOCX_NAME, { type: 'object', properties: { matter: { type: 'string', description: 'The matter folder name under drafting/, e.g. \'hinge\'.' } }, required: ['matter'] }],
      [INVENTOR_QUESTIONS_NAME, {
        type: 'object',
        properties: {
          matter: { type: 'string', description: 'The matter folder name under drafting/, e.g. \'hinge\'.' },
          action: { type: 'string', enum: ['send', 'import'], description: '"send" writes inventor-questions.docx for the inventor; "import" copies the inventor\'s answers into inventor-answers.md.' },
          file: { type: 'string', description: 'For "import" only: the workspace-relative path of the answered file in drafting/<matter>/, a .docx or a .md. Default: drafting/<matter>/inventor-questions.docx.' },
        },
        required: ['matter', 'action'],
      }],
    ])
  })

  it('writes the three filing documents, the review copy and the manifest of a matter whose gates are set, and presents the five files', async () => {
    const { session, call } = await bench()
    // One attorney edit against the generated snapshot, so the Working Record logs it.
    await pipeClampMatter('pipe-clamp', (name, text) => name === 'draft-application.md' ? text.replace('for example on a wall bracket.', 'for example on a wall bracket or a rack.') : text)
    const result = await call(EXPORT_DRAFT_DOCX_NAME, { matter: 'pipe-clamp' })
    const folder = join(dir, 'drafting/pipe-clamp')
    const record = await readFile(join(folder, 'draft-application.working-record.md'), 'utf8')
    const manifest = await readFile(join(folder, 'filing-manifest.md'), 'utf8')
    const claims = await docxLines('drafting/pipe-clamp/draft-application.claims.docx')
    const description = await docxLines('drafting/pipe-clamp/draft-application.description.docx')
    const full = await docxLines('drafting/pipe-clamp/draft-application.full.docx')
    expect({
      isError: result.isError,
      head: result.text.split(' (')[0],
      counts: /Attorney edits against the generated snapshot: (?<edits>[^;]+);/.exec(result.text)?.groups?.edits,
      delivered: result.text.trimEnd().endsWith(DELIVERED_LINE),
      files: (await readdir(folder)).filter(name => /\.docx$|manifest|checklist/.test(name)).sort(),
      exportRecorded: readRecordField(record, EXPORTED_DRAFT_HASH) !== undefined,
      editLogged: record.includes('for example on a wall bracket or a rack.'),
      manifestClaims: /\| Claims \| (?<claims>[^|]+)\|/.exec(manifest)?.groups?.claims?.trim(),
      claimParagraphs: claims.filter(line => /^\d+\. /.test(line)).length,
      descriptionHasNoMarkers: !description.some(line => line.includes('<!-- src:')),
      fullMark: full[0],
      presented: presented(session),
    }).toEqual({
      isError: false,
      head: 'Exported the description, the claims and the abstract as separate files: drafting/pipe-clamp/draft-application.description.docx, drafting/pipe-clamp/draft-application.claims.docx, drafting/pipe-clamp/draft-application.abstract.docx',
      counts: expect.stringMatching(/^\d+ paragraph\(s\) kept, 1 changed, 0 deleted, 0 added$/),
      delivered: true,
      files: ['checklist.md', 'draft-application.abstract.docx', 'draft-application.claims.docx', 'draft-application.description.docx', 'draft-application.full.docx', 'filing-manifest.md'],
      exportRecorded: true,
      editLogged: true,
      manifestClaims: '10 in total, 2 independent',
      claimParagraphs: 10,
      descriptionHasNoMarkers: true,
      fullMark: 'Draft for attorney review — not for filing',
      presented: [[
        ['drafting/pipe-clamp/draft-application.description.docx', 'Description (Word)'],
        ['drafting/pipe-clamp/draft-application.claims.docx', 'Claims (Word)'],
        ['drafting/pipe-clamp/draft-application.abstract.docx', 'Abstract (Word)'],
        ['drafting/pipe-clamp/draft-application.full.docx', 'Full review copy (Word, not for filing)'],
        ['drafting/pipe-clamp/filing-manifest.md', 'Filing manifest'],
      ]],
    })
  })

  it('refuses while the claims gate is closed, names the edit that opens it, writes the checklist and no Word file', async () => {
    const { session, call } = await bench()
    await pipeClampMatter('gated', (name, text) => name === 'claims.md' ? text.replace('approved: true\n', 'approved: false\n').replace(/approvedHash: .*\n/, '') : text)
    const result = await call(EXPORT_DRAFT_DOCX_NAME, { matter: 'gated' })
    expect({
      isError: result.isError,
      text: result.text.split(' Only the attorney')[0],
      files: (await readdir(join(dir, 'drafting/gated'))).filter(name => /\.docx$|manifest|checklist/.test(name)).sort(),
      presented: presented(session),
    }).toEqual({
      isError: false,
      text: 'The draft was not exported. Review `drafting/gated/claims.md:3`, then change `false` to `true` on line 3, or answer the Approve Claims card in the chat, or type `/approve-claims gated`.',
      files: ['checklist.md'],
      presented: [],
    })
  })

  it('refuses a matter name that is not a folder name and a path outside the working directory', async () => {
    const { call } = await bench()
    expect([
      (await call(EXPORT_DRAFT_DOCX_NAME, { matter: '../elsewhere' })).text,
      (await call(INVENTOR_QUESTIONS_NAME, { matter: 'hinge', action: 'import', file: '../../etc/passwd' })).text.split(' Give a')[0],
    ]).toEqual([
      'The draft was not exported. "../elsewhere" is not a matter name. Give the folder name under drafting/, e.g. "hinge" for drafting/hinge/.',
      'No answer was copied. drafting/hinge/inventor-answers.md does not exist: the save of a draft with Inventor Questions writes it.',
    ])
  })
})

describe(INVENTOR_QUESTIONS_NAME, () => {
  it('send writes a table of eight rows for eight open questions; import of three answers written in Word fills three slots and leaves five', async () => {
    const { session, call } = await bench()
    const folder = join(dir, 'drafting/hinge')
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'inventor-answers.md'), updateInventorAnswers(undefined, 'hinge', eightQuestions, new Set()))

    const sent = await call(INVENTOR_QUESTIONS_NAME, { matter: 'hinge', action: 'send' })
    const docx = new Uint8Array(await readFile(join(folder, 'inventor-questions.docx')))
    const rows = await readInventorQuestionsDocx(docx)
    await writeFile(join(folder, 'inventor-questions.docx'), await answerInWord(docx, { 'IQ-1': 'Grade 304 &amp; 4 mm.', 'IQ-3': 'Yes.', 'IQ-6': 'About 40 &lt; 50 N.' }))

    // A new document would replace the three answers: send refuses until they are imported.
    const blocked = await call(INVENTOR_QUESTIONS_NAME, { matter: 'hinge', action: 'send' })
    const imported = await call(INVENTOR_QUESTIONS_NAME, { matter: 'hinge', action: 'import' })
    const answers = await readFile(join(folder, 'inventor-answers.md'), 'utf8')
    const again = await call(INVENTOR_QUESTIONS_NAME, { matter: 'hinge', action: 'import' })
    const resent = await call(INVENTOR_QUESTIONS_NAME, { matter: 'hinge', action: 'send' })
    const resentRows = await readInventorQuestionsDocx(new Uint8Array(await readFile(join(folder, 'inventor-questions.docx'))))

    expect({
      sent: sent.text.split(', each with')[0],
      rows: [...rows],
      blocked: blocked.text.split(' Import them')[0],
      imported: imported.text.split(' Now apply')[0],
      filled: answers.match(/\*\*Answer:\*\*\n(?<answer>[^\n]+)/g)?.length,
      open: openInventorQuestions(answers).map(question => question.id),
      again: again.text.split(' Not changed')[0],
      resent: resent.text.split(', each with')[0],
      resentRows: [...resentRows.keys()],
      presented: presented(session),
    }).toEqual({
      sent: 'Wrote drafting/hinge/inventor-questions.docx: a table of 8 open Inventor Question(s) (IQ-1, IQ-2, IQ-3, IQ-4, IQ-5, IQ-6, IQ-7, IQ-8)',
      rows: eightQuestions.map(question => [question.id, '']),
      blocked: 'The Inventor Questions document was not written. drafting/hinge/inventor-questions.docx has answers that are not in drafting/hinge/inventor-answers.md yet (IQ-1, IQ-3, IQ-6).',
      imported: 'Copied 3 answer(s) from drafting/hinge/inventor-questions.docx into drafting/hinge/inventor-answers.md, in the inventor\'s words: IQ-1, IQ-3, IQ-6.',
      filled: 3,
      open: ['IQ-2', 'IQ-4', 'IQ-5', 'IQ-7', 'IQ-8'],
      again: 'No answer was copied from drafting/hinge/inventor-questions.docx: it has no answer for a question with an empty answer in drafting/hinge/inventor-answers.md.',
      resent: 'Wrote drafting/hinge/inventor-questions.docx: a table of 5 open Inventor Question(s) (IQ-2, IQ-4, IQ-5, IQ-7, IQ-8)',
      resentRows: ['IQ-2', 'IQ-4', 'IQ-5', 'IQ-7', 'IQ-8'],
      presented: [
        [['drafting/hinge/inventor-questions.docx', 'Inventor questions (Word)']],
        [['drafting/hinge/inventor-answers.md', 'Inventor answers']],
        [['drafting/hinge/inventor-questions.docx', 'Inventor questions (Word)']],
      ],
    })
  })

  it('send with no open question says so and writes nothing', async () => {
    const { call } = await bench()
    await pipeClampMatter('pipe-clamp')
    const result = await call(INVENTOR_QUESTIONS_NAME, { matter: 'pipe-clamp', action: 'send' })
    expect({
      text: result.text.split(' Wrote drafting')[0],
      docx: (await readdir(join(dir, 'drafting/pipe-clamp'))).includes('inventor-questions.docx'),
    }).toEqual({
      text: 'The Inventor Questions document was not written. No Inventor Question in drafting/pipe-clamp/inventor-answers.md has an empty answer: there is nothing to send.',
      docx: false,
    })
  })
})
