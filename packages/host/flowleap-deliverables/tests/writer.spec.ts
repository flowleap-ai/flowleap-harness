/**
 * `write_patent_results` over the REAL local filesystem in a temp directory,
 * with the recorder fed by a fake `get_claims` tool: the schema, a free-form
 * save, the working-directory fence, the drafting refusal, a structured save
 * refused for a quote no tool returned and accepted on the corrected retry
 * (report, working record and evidence companion written, `deliverables/presented`
 * appended for the report and the record only), the one-time
 * "report not written" steer at the turn boundary, the fto-memo header cell
 * the save must fill, the dossier template with its provenance appendix, and
 * the seal on a delivered file (one steer on its first changed and its first
 * failed direct edit).
 */

import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { createToolResultMessage, createUserMessage, ToolCallId, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type {} from '@deepseek-ai/dsh-tool-present/types'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as Deliverables from '../src/index.ts'
import { DELIVERED_LINE, parseJudgeRoute, WRITE_PATENT_RESULTS_NAME } from '../src/index.ts'

const CLAIM_1 = 'A sensor system comprising a housing and a feedback loop sampled at an average interval of 10 ms.'
const CLAIM_2 = 'A sensor system according to claim 1, wherein the housing is sealed against moisture.'
const PUBLICATION = 'EP1000000A1'

/** The connector library's `get_claims` value as the vendored copy returns it today (derived mode). */
const CLAIMS = {
  docId: PUBLICATION,
  documentReference: { publicationNumber: PUBLICATION, section: 'claims' },
  language: 'en',
  totalClaims: 2,
  claims: [
    { number: '1', text: CLAIM_1, documentReference: { publicationNumber: PUBLICATION, section: 'claims', claimNumber: '1' } },
    { number: '2', text: CLAIM_2, documentReference: { publicationNumber: PUBLICATION, section: 'claims', claimNumber: '2' } },
  ],
}

let dir: string
let calls = 0
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-deliverables-')))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** The text of a model-facing content block, or the block's type when it carries no text. */
function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : String(block?.type)
}

/** A fake office tool returning one fixed value. */
function fakeTool(name: string, value: unknown): ToolDefinition {
  return {
    name,
    description: 'fake',
    parameters: { type: 'object', properties: { patent_number: { type: 'string' } } },
    output: { schema: {}, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
    execute: () => Promise.resolve(value as never),
  }
}

async function bench(config: Partial<Deliverables.Config> = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  await ctx.plugin(Deliverables, { secondRead: 'off', secondReadModel: '', ...config })
  ctx.tools.register(fakeTool('get_claims', CLAIMS))
  const session = ctx.sessions.create(SessionId(`deliverables-${String(++calls)}`), { meta: { cwd: dir } })
  const steered: string[] = []
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
    steer: (message: UserMessage) => { steered.push(textOf(message.content[0])) },
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  const call = (name: string, args: unknown) => executeModelToolFixture(ctx, {
    callId: ToolCallId(`call-${String(++calls)}`), name, arguments: args, signal: new AbortController().signal, agent,
  })
  const write = (args: unknown) => call(WRITE_PATENT_RESULTS_NAME, args)
  return { ctx, session, agent, call, write, steered }
}

/** The session events of one type. */
function eventsOf(session: Session, type: string) {
  return session.snapshotEvents().filter(event => event.type === type)
}

const COVERAGE = (quote: string) => ({
  filePath: 'outputs/review.md',
  content: '',
  template: 'prior-art-report',
  subject: 'Sealed sensor housings',
  coverage: [{
    feature: 'Essential combination',
    kind: 'combination',
    importance: 'essential',
    status: 'partial',
    sourceAnchors: [`${PUBLICATION}:claims:2:en`],
    evidence: [{
      anchor: `${PUBLICATION}:claims:2:en`,
      quote,
      scope: 'Only the quoted dependent claim; the parent claim\'s scope remains unresolved.',
      qualifiers: 'Preserve "sealed against moisture" as written; no degree of sealing inferred.',
      quantityBasis: 'No quantities in the quoted claim; none asserted.',
    }],
    elements: [
      { element: 'Sealed housing', anchor: `${PUBLICATION}:claims:2:en`, disclosedBy: 'housing is sealed' },
      { element: 'Complete recited combination' },
    ],
    gap: 'The feedback interval of the complete combination is not disclosed by the cited claim.',
  }],
  limitations: ['Synthetic fixture; one publication read.'],
  stopReason: 'Bounded interim result.',
})

describe('write_patent_results', () => {
  it('registers under the IDE\'s name with the IDE\'s input schema and a contract-only description', async () => {
    const { ctx } = await bench()
    const schema = ctx.tools.schemas().find(entry => entry.name === WRITE_PATENT_RESULTS_NAME)
    const parameters = schema?.parameters as { properties: Record<string, unknown>; required: string[] }
    expect({
      names: ctx.tools.schemas().map(entry => entry.name).sort(),
      required: parameters.required,
      properties: Object.keys(parameters.properties).length,
      template: (parameters.properties['template'] as { enum: string[] }).enum.length,
      words: schema?.description.split(/\s+/).length,
      noIde: !/VS Code|Approve Claims|evidenceLookup/.test(schema?.description ?? ''),
    }).toEqual({
      names: ['export_draft_docx', 'get_claims', 'inventor_questions', 'remove_claim', 'start_application_draft', 'validate_draft', WRITE_PATENT_RESULTS_NAME],
      required: ['filePath', 'content'],
      properties: 26,
      template: 12,
      words: 211,
      noIde: true,
    })
  })

  it('saves a free-form document, creates the parent folder, presents the file, and never calls present itself', async () => {
    const { session, write } = await bench()
    session.append('turn/start', { turn: 1 })
    const result = await write({ filePath: 'notes/claim review.md', content: 'Saved notes' })
    expect(result.isError).toBe(false)
    const text = textOf(result.content[0])
    expect(text.split('\n')).toEqual([
      'Successfully wrote patent results to notes/claim review.md',
      'Free-form artifact: evidence validation was not performed.',
      DELIVERED_LINE,
    ])
    expect(await readFile(join(dir, 'notes/claim review.md'), 'utf8')).toBe('Saved notes')
    const presented = eventsOf(session, 'deliverables/presented')
    expect(presented.map(event => event.type === 'deliverables/presented' ? { turn: event.data.turn, files: event.data.files.map(file => [file.path.endsWith(`${sep}${join('notes', 'claim review.md')}`), file.description]) } : undefined))
      .toEqual([{ turn: 1, files: [[true, 'Report']] }])
  })

  it.each(['../outside.md', '/outside.md', 'outputs/../../outside.md'])('refuses %s outside the working directory before writing', async (filePath) => {
    const { write } = await bench()
    const result = await write({ filePath, content: 'notes' })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ saved: false })
    expect(textOf(result.content[0])).toBe(`Error: Patent result writes must stay within the working directory ${dir}.`)
  })

  it('refuses a drafting save outside the folder contract or without its frontmatter, a content template without a body, and rejects malformed arguments', async () => {
    const { write } = await bench()
    const outside = await write({ filePath: 'outputs/draft-application.md', content: '# Draft', template: 'draft-application' })
    const draft = await write({ filePath: 'drafting/m1/draft-application.md', content: '# Draft', template: 'draft-application' })
    const empty = await write({ filePath: 'memo.md', content: '', template: 'fto-memo' })
    const bad = await write({ filePath: 'x.md' })
    expect({
      outside: textOf(outside.content[0]),
      draft: textOf(draft.content[0]).split(' Open in ')[0],
      empty: textOf(empty.content[0]).startsWith('Report was not saved. '),
      bad: [bad.isError, textOf(bad.content[0]).includes('content must be a string')],
      // The refused drafting save writes no draft; like every drafting tool it creates style/README.md once.
      files: await readdir(dir),
    }).toEqual({
      outside: 'Draft was not saved. The draft-application template saves to drafting/<matter>/draft-application.md inside a workspace folder.',
      draft: 'Draft was not saved. The draft frontmatter (or the model and provider fields) must name the office, the model and the provider. Missing: office (US or EPO), model, provider.',
      empty: true,
      bad: [true, true],
      files: ['style'],
    })
  })

  it('without a question answerer, refuses an fto-memo whose Jurisdiction(s) header cell would ship as the placeholder, and fills it from the jurisdictions input marked as not confirmed', async () => {
    const { write } = await bench()
    const memo = { filePath: 'outputs/memo.md', content: 'DE and FR parts lapsed; US7722129B2 in force.', template: 'fto-memo', subject: 'Quick-release skewer' }
    const refused = await write(memo)
    const saved = await write({ ...memo, jurisdictions: 'DE, FR, US' })
    const document = await readFile(join(dir, 'outputs/memo.md'), 'utf8')
    expect({
      refused: [refused.value, textOf(refused.content[0])],
      saved: textOf(saved.content[0]).split('\n').slice(0, 3).map(line => line.split(':')[0]),
      header: document.split('\n').slice(4, 7),
      placeholders: document.match(/_\(to be completed\)_/g)?.length,
    }).toEqual({
      refused: [{ saved: false, text: textOf(refused.content[0]) }, 'Report was not saved. The fto-memo header cell `Jurisdiction(s)` is still `_(to be completed)_`. Set `jurisdictions` to the markets the memo clears, for example `DE, FR, US`. Retry with the same content and the field set.'],
      saved: ['Successfully wrote patent results to outputs/memo.md', 'Markets', 'FTO provenance'],
      header: ['| Matter / Reference | _(to be completed)_ |', '| Product / Technology | Quick-release skewer |', '| Jurisdiction(s) | DE, FR, US (not confirmed by the user) |'],
      // The matter reference the user never gave stays the practitioner's.
      placeholders: 1,
    })
    await expect(readdir(join(dir, 'outputs'))).resolves.toEqual(['memo.md'])
  })

  it('refuses a structured save whose quote no tool returned, naming the row and the fix, and accepts the corrected retry with report, record, evidence and the delivery card', async () => {
    const { session, call, write } = await bench()
    session.append('turn/start', { turn: 1 })
    const claims = await call('get_claims', { patent_number: PUBLICATION })
    expect(textOf(claims.content.at(-1))).toContain(`[source anchor: ${PUBLICATION}:claims:2:en]`)

    const refused = await write(COVERAGE('wherein the housing is welded shut'))
    expect(refused.isError).toBe(false)
    expect(refused.value).toMatchObject({ saved: false })
    expect(textOf(refused.content[0])).toBe([
      'Candidate draft was not saved. Correct these issues and retry with the revised content:',
      `- Quotation for ${PUBLICATION}:claims:2:en is not found in its recorded text. Copy the passage verbatim from the get_claims or get_description result; do not paraphrase or merge lines.`,
      `- Quote the complete claim for ${PUBLICATION}:claims:2:en, including dependency language, qualifiers and every constituent; do not extract only a numeric range.`,
    ].join('\n'))
    await expect(readdir(join(dir, 'outputs'))).rejects.toThrow()

    const saved = await write(COVERAGE(CLAIM_2))
    expect(saved.isError).toBe(false)
    const text = textOf(saved.content[0])
    const lines = text.split('\n')
    const report = await readFile(join(dir, 'outputs/review.md'), 'utf8')
    const record = await readFile(join(dir, 'outputs/review.working-record.md'), 'utf8')
    const evidence = JSON.parse(await readFile(join(dir, 'outputs/review.md.evidence.json'), 'utf8')) as { schemaVersion: number; executions: unknown[] }
    const presented = eventsOf(session, 'deliverables/presented').map(event => event.type === 'deliverables/presented' ? event.data : undefined)
    expect({
      value: saved.value,
      first: lines[0],
      contract: lines.some(line => line.startsWith('Chat summary contract: repeat each coverage row\'s status word exactly')),
      receipt: lines.filter(line => line.startsWith('Prior-art artifact receipt: ')).length,
      recordLine: lines.find(line => line.startsWith('Working record: ')),
      last: lines.at(-1),
      files: (await readdir(join(dir, 'outputs'))).sort(),
      reportQuotesClaim: report.includes(CLAIM_2),
      plainAnchor: report.includes(`${PUBLICATION}:claims:2:en`) && !report.includes('flowleap://'),
      recordTitle: record.split('\n')[0],
      recordSections: record.split('\n').filter(line => line.startsWith('## ')),
      evidence: [evidence.schemaVersion, evidence.executions.length],
      presented: presented.map(data => data && { turn: data.turn, callId: data.callId, files: data.files.map(file => [`<dir>/${relative(dir, file.path).split(sep).join('/')}`, file.description]) }),
    }).toEqual({
      value: { saved: true, text, report: join(dir, 'outputs/review.md'), workingRecord: join(dir, 'outputs/review.working-record.md'), evidence: join(dir, 'outputs/review.md.evidence.json') },
      first: 'Successfully wrote patent results to outputs/review.md',
      contract: true,
      receipt: 1,
      recordLine: 'Working record: outputs/review.working-record.md',
      last: DELIVERED_LINE,
      files: ['review.md', 'review.md.evidence.json', 'review.working-record.md'],
      reportQuotesClaim: true,
      plainAnchor: true,
      recordTitle: '# Working record — Sealed sensor housings',
      recordSections: ['## Search log', '## Retrieved but not read', '## Second read', '## Wording review', '## Provenance'],
      evidence: [1, 1],
      presented: [{ turn: 1, callId: `call-${String(calls)}`, files: [['<dir>/outputs/review.md', 'Report'], ['<dir>/outputs/review.working-record.md', 'Working record']] }],
    })

    // A refinement save replaces the stable companions instead of leaving a second copy.
    await write({ ...COVERAGE(CLAIM_2), stopReason: 'Corrected stopping rationale.' })
    expect((await readdir(join(dir, 'outputs'))).sort()).toEqual(['review.md', 'review.md.evidence.json', 'review.working-record.md'])
    expect(await readFile(join(dir, 'outputs/review.md'), 'utf8')).toContain('Corrected stopping rationale.')
  })

  it('states a skipped second read when no model service is mounted, and parses a configured judge route', async () => {
    const { session, call, write } = await bench({ secondRead: 'render' })
    session.append('turn/start', { turn: 1 })
    await call('get_claims', { patent_number: PUBLICATION })
    const saved = await write(COVERAGE(CLAIM_2))
    expect(textOf(saved.content[0])).toContain('\nSecond read (diagnostic): skipped (no model service mounted).')
    expect({
      plain: parseJudgeRoute('anthropic/claude-sonnet-5-5'),
      nested: parseJudgeRoute('openrouter/anthropic/claude-sonnet-5-5'),
      none: [parseJudgeRoute(''), parseJudgeRoute('claude'), parseJudgeRoute(undefined)],
    }).toEqual({
      plain: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
      nested: { provider: 'openrouter', model: 'anthropic/claude-sonnet-5-5' },
      none: [undefined, undefined, undefined],
    })
  })
})

describe('the seal on a delivered file', () => {
  it('saves a dossier as a checked report with its provenance appendix, and steers once per outcome when the model edits the delivered file directly', async () => {
    const { ctx, session, call, write, steered } = await bench()
    // An edit of text the file does not hold fails, as the real edit tool fails on an unread file.
    ctx.tools.register({ ...fakeTool('edit', 'edited'), execute: (args: unknown) => (args as { old_string?: string }).old_string === 'missing' ? Promise.reject(new Error('cannot modify')) : Promise.resolve('edited' as never) })
    ctx.tools.register(fakeTool('str_replace_editor', 'viewed'))
    session.append('turn/start', { turn: 1 })
    await call('get_claims', { patent_number: PUBLICATION })
    const body = ['## Snapshot', `${PUBLICATION}: 2 claims; claim 1 reads "${CLAIM_1}".`, '', '## Family', 'No family members read.', '', '## US Family Chain', 'No US member read.', '', '## Sources and Limitations', 'Claims from the retrieved text; no legal status read.'].join('\n')
    const saved = await write({ filePath: 'outputs/dossier.md', content: body, template: 'dossier', matter: PUBLICATION, subject: 'Sealed sensor housings' })
    const document = await readFile(join(dir, 'outputs/dossier.md'), 'utf8')
    // The delivered file is edited directly: a failed edit and a changed file are each steered once, then
    // silent for that path; another path and a view are never steered.
    await call('edit', { file_path: 'outputs/dossier.md', old_string: 'missing', new_string: 'b' })
    await call('edit', { file_path: 'outputs/dossier.md', old_string: 'missing', new_string: 'c' })
    await call('edit', { file_path: 'outputs/dossier.md', old_string: 'No family members read.', new_string: 'No family.' })
    await call('edit', { file_path: './outputs/../outputs/dossier.md', old_string: 'a', new_string: 'b' })
    await call('str_replace_editor', { command: 'view', path: 'outputs/dossier.md' })
    await call('edit', { file_path: 'outputs/other.md', old_string: 'a', new_string: 'b' })
    expect({
      result: textOf(saved.content[0]).split('\n').map(line => line.split(';')[0]),
      title: document.split('\n')[0],
      generated: document.match(/^## .*\(generated\)$/gm),
      files: await readdir(join(dir, 'outputs')),
      steered,
    }).toEqual({
      result: [
        'Successfully wrote patent results to outputs/dossier.md',
        'Provenance: 1 figures checked against recorded tool outputs',
        DELIVERED_LINE.split(';')[0],
      ],
      title: '# Patent Dossier',
      generated: ['## Figure and date provenance (generated)', '## Quotation provenance (generated)', '## Data provenance (generated)'],
      files: ['dossier.md'],
      steered: [`\`outputs/dossier.md\`: ${Deliverables.FAILED_EDIT_STEER}`, `\`outputs/dossier.md\`: ${Deliverables.DIRECT_EDIT_STEER}`],
    })
    // A free-form save is sealed the same way, and a write of a path never delivered is not.
    await write({ filePath: 'notes/free.md', content: 'Notes' })
    ctx.tools.register(fakeTool('write', 'written'))
    await call('write', { file_path: 'notes/free.md', content: 'Changed' })
    await call('write', { file_path: 'notes/never-delivered.md', content: 'New' })
    expect(steered).toHaveLength(3)
    expect(steered[2]).toBe(`\`notes/free.md\`: ${Deliverables.DIRECT_EDIT_STEER}`)
  })
})

describe('the report-not-written steer', () => {
  /** Log one settled tool call the way the agent loop does. */
  function logCall(session: Session, turn: number, name: string, args: unknown, resultText: string): void {
    const callId = ToolCallId(`logged-${String(++calls)}`)
    const source = session.append('tool/call', { turn, step: 1, callId, name, arguments: JSON.stringify(args) })
    session.append('tool/result', {
      turn, step: 1, message: createToolResultMessage({ callId, content: [{ type: 'text', text: resultText }], isError: false }),
    }, { surfaceOp: 'append', sourceEventSeqs: [source.seq] })
  }

  it('steers once when a prior-art turn ends without a structured save, and not when the turn holds a current receipt', async () => {
    const { ctx, session, agent, call, write, steered } = await bench()
    const signal = new AbortController().signal
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Search for prior art and save outputs/review.md' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 1, step: 1 })
    logCall(session, 1, 'get_claims', { patent_number: PUBLICATION }, 'claims')
    await ctx.serial('agent/turn-stopping', { agent, turn: 1, signal })
    await ctx.serial('agent/turn-stopping', { agent, turn: 1, signal })
    expect(steered).toEqual([
      'The requested prior-art report has no successful structured finalization in this turn. Generic file writes and free-form writer calls are unvalidated drafts. Save the requested report with write_patent_results, template="prior-art-report", empty content and the evidence-backed coverage fields. An honest interim report with unresolved features and explicit limitations is valid; do not invent support or repeat searches merely to pass validation.',
    ])
    // The steer text lands as this plugin's user message; the next step then saves the report.
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: steered[0]! }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 1, step: 2 })
    await call('get_claims', { patent_number: PUBLICATION })
    const saved = await write(COVERAGE(CLAIM_2))
    logCall(session, 1, WRITE_PATENT_RESULTS_NAME, COVERAGE(CLAIM_2), textOf(saved.content[0]))
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    session.append('turn/start', { turn: 2 })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Continue' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 2, step: 1 })
    const again = await write(COVERAGE(CLAIM_2))
    logCall(session, 2, WRITE_PATENT_RESULTS_NAME, COVERAGE(CLAIM_2), textOf(again.content[0]))
    await ctx.serial('agent/turn-stopping', { agent, turn: 2, signal })
    expect(steered).toHaveLength(1)
  })

  it('does not steer a turn that asked an ordinary question', async () => {
    const { ctx, session, agent, steered } = await bench()
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'What does claim 2 of EP1000000A1 say?' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    session.append('step/start', { turn: 1, step: 1 })
    logCall(session, 1, 'get_claims', { patent_number: PUBLICATION }, 'claims')
    await ctx.serial('agent/turn-stopping', { agent, turn: 1, signal: new AbortController().signal })
    expect(steered).toEqual([])
  })
})
