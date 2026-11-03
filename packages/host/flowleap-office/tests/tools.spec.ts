/**
 * The five Office tools over the real local filesystem, the real tool pipeline, and a fixture Office service: the file
 * rules, the requests they send, the results the model reads, and the delivery card.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture, unsupportedInbox, unsupportedModel } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId, type UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as office from '../src/index.ts'
import type { AmendRequest, ChartRequest, FlowleapOffice, LetterRequest, OfficeReadout, ReadRequest, ReviewRequest } from '../src/types.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const bytes = (text: string) => new TextEncoder().encode(text)

/** A fixture Office service that records each request and answers with marker bytes. */
class FixtureOffice implements FlowleapOffice {
  readonly requests: Array<LetterRequest | AmendRequest | ChartRequest | ReadRequest | ReviewRequest> = []
  readout: OfficeReadout = { format: 'docx', text: 'Claims\n1. A', headings: [{ level: 1, text: 'Claims' }], revisions: [] }
  omitClean = false
  failure: Error | undefined

  private answer<T>(request: LetterRequest | AmendRequest | ChartRequest | ReadRequest | ReviewRequest, value: T): Promise<T> {
    this.requests.push(request)
    return this.failure === undefined ? Promise.resolve(value) : Promise.reject(this.failure)
  }

  letter(request: LetterRequest) { return this.answer(request, bytes('letter')) }
  amendClaims(request: AmendRequest) {
    return this.answer(request, this.omitClean || !request.clean ? { marked: bytes('marked') } : { marked: bytes('marked'), clean: bytes('clean') })
  }
  claimChart(request: ChartRequest) { return this.answer(request, bytes('chart')) }
  read(request: ReadRequest) { return this.answer(request, this.readout) }
  reviewChanges(request: ReviewRequest) { return this.answer(request, { file: bytes('reviewed'), changed: 2 }) }
}

let sessions = 0

async function bench(config: Partial<office.Config> = {}) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'flowleap-office-tools-')))
  const templatesDir = join(dir, '.templates')
  await mkdir(templatesDir)
  await writeFile(join(templatesDir, 'reply-letter.docx'), 'firm template')
  await writeFile(join(templatesDir, 'notes.txt'), 'not a template')
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx, dir)
  ctx.provide('agents', { turnBoundaryOf: () => ({ lastTurn: 3, openTurnStartSeq: 0 }) })
  const fixture = new FixtureOffice()
  ctx.provide('flowleapOffice', fixture)
  const fiber = ctx.plugin(office, {
    templatesDir, revisionAuthor: 'FlowLeap', maxReadChars: 1000, maxInputBytes: 1024, ...config,
  })
  await fiber.await()
  const session = ctx.sessions.create(SessionId(`office-${String(++sessions)}`), { meta: { cwd: dir } })
  const agent: Agent = {
    id: session.id, options: {}, session, model: unsupportedModel(), inbox: unsupportedInbox(), status: 'idle', ctx,
    send: () => {}, followup: () => {}, steer: (_message: UserMessage) => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
  let calls = 0
  const call = async (name: string, args: unknown, withAgent = true) => {
    const result = await executeModelToolFixture(ctx, {
      callId: ToolCallId(`call-${String(++calls)}`), name, arguments: args, signal: new AbortController().signal, ...(withAgent ? { agent } : {}),
    })
    const [block] = result.content
    return { isError: result.isError, text: block?.type === 'text' ? block.text : '' }
  }
  const presented = () => session.snapshotEvents().flatMap(event => event.type === 'deliverables/presented' ? [event.data] : [])
  // The module's own `now` is the wall clock; requests are checked for an ISO date instead of a fixed one.
  return { ctx, dir, fixture, fiber, call, presented, templatesDir }
}

const letterArgs = {
  template: 'reply-letter.docx', output: 'out/reply.docx', fields: { datum: '3. November 2026' },
  blocks: [{ kind: 'heading', level: 1, text: 'Erwiderung' }, { kind: 'paragraph', text: 'Text.' }, { kind: 'table', header: ['F', 'D1'], rows: [['1.1', 'ja']] }],
}

describe('office_letter_from_template', () => {
  it('writes the letter from the firm template and presents it', async () => {
    const { call, dir, fixture, presented } = await bench()
    await mkdir(join(dir, 'out'))
    const result = await call('office_letter_from_template', letterArgs)
    expect(result).toEqual({ isError: false, text: 'Wrote the letter out/reply.docx.\nDelivered to the user; do not call `present` for these files.' })
    expect(await readFile(join(dir, 'out/reply.docx'), 'utf8')).toBe('letter')
    expect(fixture.requests[0]).toEqual({
      template: bytes('firm template'), fields: { datum: '3. November 2026' },
      blocks: [{ kind: 'heading', level: 1, text: 'Erwiderung' }, { kind: 'paragraph', text: 'Text.' }, { kind: 'table', header: ['F', 'D1'], rows: [['1.1', 'ja']] }],
    })
    expect(presented()).toEqual([{ turn: 3, callId: 'call-1', files: [{ path: join(dir, 'out/reply.docx'), description: 'Letter (Word)' }] }])
  })

  it('refuses an unknown template with the list of templates, and a model path as template', async () => {
    const { call } = await bench()
    expect((await call('office_letter_from_template', { ...letterArgs, template: 'other.docx' })).text).toContain('Templates: reply-letter.docx.')
    expect((await call('office_letter_from_template', { ...letterArgs, template: '../reply-letter.docx' })).text).toContain('No firm template')
    expect((await call('office_letter_from_template', { ...letterArgs, template: '.hidden.docx' })).text).toContain('No firm template')
  })

  it('refuses a template over the byte bound and an empty template folder', async () => {
    const { call, templatesDir } = await bench({ maxInputBytes: 1024 })
    await writeFile(join(templatesDir, 'big.docx'), 'x'.repeat(2000))
    expect((await call('office_letter_from_template', { ...letterArgs, template: 'big.docx' })).text).toContain('larger than 1024 bytes')
    const empty = await bench()
    await rm(join(empty.templatesDir, 'reply-letter.docx'))
    expect((await empty.call('office_letter_from_template', letterArgs)).text).toContain('Templates: none.')
  })

  it('refuses outputs that exist, are absolute, leave the working directory, or have another extension', async () => {
    const { call, dir, presented } = await bench()
    await writeFile(join(dir, 'reply.docx'), 'attorney file')
    const outputs = { 'reply.docx': 'already exists', [join(dir, 'x.docx')]: 'must be a path relative', '../x.docx': 'outside the working directory', 'x.pdf': 'must end with .docx', ' ': 'must be a path relative' }
    for (const [output, message] of Object.entries(outputs)) {
      const result = await call('office_letter_from_template', { ...letterArgs, output })
      expect(result.isError).toBe(true)
      expect(result.text).toContain(message)
    }
    expect(await readFile(join(dir, 'reply.docx'), 'utf8')).toBe('attorney file')
    expect(presented()).toEqual([])
  })

  it('refuses arguments the schema cannot check and a call outside an agent Session', async () => {
    const { call } = await bench()
    const broken = await call('office_letter_from_template', { ...letterArgs, blocks: [{ kind: 'heading', text: 'no level' }] })
    expect(broken.text).toContain('Invalid arguments')
    expect((await call('office_letter_from_template', { ...letterArgs, fields: { n: 1 } })).isError).toBe(true)
    expect((await call('office_letter_from_template', letterArgs, false)).text).toContain('need an agent Session')
  })

  it('passes a service refusal to the model and presents nothing', async () => {
    const { call, fixture, presented } = await bench()
    fixture.failure = new office.FlowleapOfficeError('missing_fields', 'The template needs values for: datum.')
    const result = await call('office_letter_from_template', { ...letterArgs, output: 'r.docx' })
    expect(result).toMatchObject({ isError: true })
    expect(result.text).toContain('The template needs values for: datum.')
    expect(presented()).toEqual([])
  })
})

describe('office_amend_claims', () => {
  const claims = [
    { number: '1', before: 'A mit B.', after: 'A mit B, wobei C.' },
    { number: '2', before: 'Gleich.', after: 'Gleich.' },
    { number: '3', before: 'Alt.' },
    { number: '4', after: 'Neu.' },
  ]

  it('sends the word diff as tracked-change paragraphs and writes the marked and the clean copy', async () => {
    const { call, dir, fixture, presented } = await bench()
    const result = await call('office_amend_claims', { claims, output: 'claims.marked.docx', clean_output: 'claims.clean.docx', heading: 'Ansprüche', template: 'reply-letter.docx' })
    expect(result.text).toBe('Wrote the marked copy claims.marked.docx and the clean copy claims.clean.docx. Tracked changes by FlowLeap: 1 claim(s) amended, 1 added, 1 deleted, 1 unchanged.\nDelivered to the user; do not call `present` for these files.')
    const request = fixture.requests[0] as AmendRequest
    expect(request).toMatchObject({ template: bytes('firm template'), heading: 'Ansprüche', author: 'FlowLeap', clean: true })
    expect(Number.isNaN(Date.parse(request.date))).toBe(false)
    expect(request.paragraphs.map(paragraph => paragraph.mark)).toEqual(['same', 'same', 'del', 'ins'])
    expect(request.paragraphs[0]?.segments).toEqual([{ kind: 'same', text: '1. A mit B' }, { kind: 'ins', text: ', wobei C' }, { kind: 'same', text: '.' }])
    expect([await readFile(join(dir, 'claims.marked.docx'), 'utf8'), await readFile(join(dir, 'claims.clean.docx'), 'utf8')]).toEqual(['marked', 'clean'])
    expect(presented()[0]?.files).toEqual([
      { path: join(dir, 'claims.marked.docx'), description: 'Claims with tracked changes (Word)' },
      { path: join(dir, 'claims.clean.docx'), description: 'Clean claims (Word)' },
    ])
  })

  it('takes the author of the call, writes only the marked copy without clean_output, and needs a text per claim', async () => {
    const { call, fixture } = await bench()
    const result = await call('office_amend_claims', { claims: claims.slice(0, 1), output: 'm.docx', author: 'Dr. Jürgen Weiß' })
    expect(result.text).toContain('Tracked changes by Dr. Jürgen Weiß: 1 claim(s) amended')
    expect(fixture.requests[0]).toMatchObject({ author: 'Dr. Jürgen Weiß', clean: false })
    expect(fixture.requests[0]).not.toHaveProperty('template')
    expect(fixture.requests[0]).not.toHaveProperty('heading')
    expect((await call('office_amend_claims', { claims: [{ number: '1' }], output: 'n.docx' })).text).toContain('a claim needs before, after, or both')
    expect((await call('office_amend_claims', { claims, output: 'same.docx', clean_output: 'same.docx' })).text).toContain('must be different files')
  })

  it('presents only the marked copy when the service returns no clean copy', async () => {
    const { call, fixture, presented } = await bench()
    fixture.omitClean = true
    await call('office_amend_claims', { claims, output: 'm.docx', clean_output: 'c.docx' })
    expect(presented()[0]?.files).toHaveLength(1)
  })
})

describe('office_claim_chart', () => {
  it('writes the chart with feature numbers as strings', async () => {
    const { call, dir, fixture, presented } = await bench()
    const result = await call('office_claim_chart', { output: 'chart.xlsx', sheet: 'Anspruch 1', header: ['Merkmal', 'D1'], rows: [['1.10', 'offenbart']] })
    expect(result.text).toBe('Wrote the claim chart chart.xlsx with 1 feature row(s).\nDelivered to the user; do not call `present` for these files.')
    expect(fixture.requests[0]).toEqual({ sheet: 'Anspruch 1', header: ['Merkmal', 'D1'], rows: [['1.10', 'offenbart']] })
    expect(await readFile(join(dir, 'chart.xlsx'), 'utf8')).toBe('chart')
    expect(presented()[0]?.files).toEqual([{ path: join(dir, 'chart.xlsx'), description: 'Claim chart (Excel)' }])
    expect((await call('office_claim_chart', { output: 'c.xlsx', sheet: 'S', header: ['F'], rows: [[1.1]] })).isError).toBe(true)
  })
})

describe('office_read', () => {
  it('reads a Word file with headings and tracked changes', async () => {
    const { call, dir, fixture } = await bench()
    await writeFile(join(dir, 'claims.docx'), 'docx bytes')
    fixture.readout = {
      format: 'docx', text: 'Claims\n1. A', headings: [{ level: 1, text: 'Claims' }, { level: 2, text: 'Sub' }],
      revisions: [{ id: 7, type: 'ins', author: 'FlowLeap', date: '2026-11-03T10:00:00Z', text: ' B' }, { id: 8, type: 'del', author: 'X', text: 'C' }],
    }
    const result = await call('office_read', { path: 'claims.docx' })
    expect(result.text).toBe('Claims\n1. A\n\nHeadings:\n- Claims\n  - Sub\n\nTracked changes:\n- id 7 ins by FlowLeap on 2026-11-03T10:00:00Z: " B"\n- id 8 del by X: "C"')
    const request = fixture.requests[0] as ReadRequest
    expect([request.format, Buffer.from(request.file).toString()]).toEqual(['docx', 'docx bytes'])
    fixture.readout = { format: 'docx', text: 'x', headings: [], revisions: [] }
    expect((await call('office_read', { path: 'claims.docx' })).text).toBe('x\n\nTracked changes: none.')
  })

  it('reads an Excel file, cuts long text, and refuses other files', async () => {
    const { call, dir, fixture } = await bench({ maxReadChars: 1000 })
    await writeFile(join(dir, 'chart.XLSX'), 'xlsx bytes')
    fixture.readout = { format: 'xlsx', text: 'ä'.repeat(1001), sheets: [{ name: 'S', rows: 2, cols: 3 }] }
    const result = await call('office_read', { path: 'chart.XLSX' })
    expect(result.text).toBe(`${'ä'.repeat(1000)}\n\n[Text cut at 1000 characters.]\n\nSheets:\n- S: 2 rows, 3 columns`)
    expect((await call('office_read', { path: 'notes.pdf' })).text).toContain('must end with .docx or .xlsx')
    expect((await call('office_read', { path: 'missing.docx' })).text).toContain('is not a file in the working directory')
  })
})

describe('office_review_changes', () => {
  it('writes the reviewed copy and leaves the original unchanged', async () => {
    const { call, dir, fixture, presented } = await bench()
    await writeFile(join(dir, 'claims.docx'), 'original')
    const result = await call('office_review_changes', { path: 'claims.docx', output: 'claims.accepted.docx', action: 'accept' })
    expect(result.text).toBe('Wrote claims.accepted.docx: 2 tracked change(s) accepted; claims.docx is unchanged.\nDelivered to the user; do not call `present` for these files.')
    const request = fixture.requests[0] as ReviewRequest
    expect([request.action, request.selection, Buffer.from(request.file).toString()]).toEqual(['accept', { kind: 'all' }, 'original'])
    expect(await readFile(join(dir, 'claims.docx'), 'utf8')).toBe('original')
    expect(await readFile(join(dir, 'claims.accepted.docx'), 'utf8')).toBe('reviewed')
    expect(presented()[0]?.files).toEqual([{ path: join(dir, 'claims.accepted.docx'), description: 'Tracked changes accepted (Word)' }])
  })

  it('selects by author or by ids, never both', async () => {
    const { call, dir, fixture } = await bench()
    await writeFile(join(dir, 'c.docx'), 'original')
    expect((await call('office_review_changes', { path: 'c.docx', output: 'r1.docx', action: 'reject', author: 'X' })).text).toContain('2 tracked change(s) rejected')
    await call('office_review_changes', { path: 'c.docx', output: 'r2.docx', action: 'reject', ids: [7, 8] })
    expect(fixture.requests.map(request => 'selection' in request ? request.selection : undefined)).toEqual([{ kind: 'author', author: 'X' }, { kind: 'ids', ids: [7, 8] }])
    expect((await call('office_review_changes', { path: 'c.docx', output: 'r3.docx', action: 'accept', author: 'X', ids: [1] })).text).toContain('not both')
  })
})

describe('the main row', () => {
  it('registers the five tools and removes them with its fiber', async () => {
    const { ctx, fiber } = await bench()
    const names = [office.LETTER_NAME, office.AMEND_CLAIMS_NAME, office.CLAIM_CHART_NAME, office.READ_NAME, office.REVIEW_CHANGES_NAME]
    expect(names.map(name => ctx.tools.get(name)?.name)).toEqual(names)
    await fiber.dispose()
    expect(names.map(name => ctx.tools.get(name))).toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('shows each pending call with the files it touches', async () => {
    const { ctx } = await bench()
    const view = (name: string, args: unknown) => ctx.tools.get(name)?.presentCall?.(args)
    expect(view(office.LETTER_NAME, letterArgs)).toEqual({ card: 'generic', title: 'Write letter', kind: 'edit', locations: [{ path: 'out/reply.docx' }] })
    expect(view(office.AMEND_CLAIMS_NAME, { claims: [], output: 'm.docx' })).toMatchObject({ locations: [{ path: 'm.docx' }] })
    expect(view(office.AMEND_CLAIMS_NAME, { claims: [], output: 'm.docx', clean_output: 'c.docx' })).toMatchObject({ locations: [{ path: 'm.docx' }, { path: 'c.docx' }] })
    expect(view(office.CLAIM_CHART_NAME, { output: 'c.xlsx', sheet: 'S', header: [], rows: [] })).toMatchObject({ title: 'Write claim chart', locations: [{ path: 'c.xlsx' }] })
    expect(view(office.READ_NAME, { path: 'a.docx' })).toMatchObject({ kind: 'read', locations: [{ path: 'a.docx' }] })
    expect(view(office.REVIEW_CHANGES_NAME, { path: 'a.docx', output: 'b.docx', action: 'accept' })).toMatchObject({ locations: [{ path: 'a.docx' }, { path: 'b.docx' }] })
  })

  it('fails loud on a relative or missing template folder', async () => {
    for (const templatesDir of ['templates', join(tmpdir(), 'flowleap-office-no-such-folder')]) {
      const ctx = new Context()
      cleanups.push(() => ctx.fiber.dispose())
      ctx.provide('flowleapOffice', new FixtureOffice())
      ctx.provide('tools', {})
      ctx.provide('fs', {})
      ctx.provide('agents', {})
      ctx.provide('workingDirectory', {})
      const error: unknown = await ctx.plugin(office, { templatesDir, revisionAuthor: 'FlowLeap', maxReadChars: 1000, maxInputBytes: 1024 }).await().then(() => undefined, (reason: unknown) => reason)
      expect(String(error)).toContain('templatesDir')
    }
  })

  it('validates its config', () => {
    expect(office.Config({ templatesDir: '/t' })).toEqual({ templatesDir: '/t', revisionAuthor: 'FlowLeap', maxReadChars: 40_000, maxInputBytes: 32 * 1024 * 1024 })
    expect(() => office.Config({})).toThrow()
  })
})
