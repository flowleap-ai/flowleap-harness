/** The OfficeCLI provider over a scripted child: the calls of each operation, its refusals, and its private folders. */
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { FlowleapOfficeError } from '../src/error.ts'
import { checkAmend, OfficeCliProvider, OfficeCliRunner, selectors, wordReadText } from '../src/officecli/index.ts'
import type { AmendRequest } from '../src/types.ts'
import { fail, FakeSubprocess, ok, succeed, type Responder } from './fake-officecli.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const look = { featureColumnWidth: 10, textColumnWidth: 40, headerFill: '1F3A5F', headerFontColor: 'FFFFFF' }
const signal = new AbortController().signal
const bytes = (text: string) => new TextEncoder().encode(text)
const text = (value: Uint8Array | undefined) => new TextDecoder().decode(value)

async function setup(responder: Responder = succeed) {
  const callsDir = await mkdtemp(join(tmpdir(), 'flowleap-office-provider-'))
  const ctx = new Context()
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    await rm(callsDir, { recursive: true, force: true })
  })
  const fake = new FakeSubprocess(responder)
  const runner = new OfficeCliRunner(fake, { binaryPath: '/opt/officecli', home: '/h', stateDir: '/s', timeoutMs: 5_000, maxOutputBytes: 1_000_000 })
  const office = new OfficeCliProvider(ctx, { runner, callsDir, tableStyle: 'FirmTable', chart: look })
  return { ctx, fake, office, callsDir }
}

async function rejection(promise: Promise<unknown>): Promise<FlowleapOfficeError> {
  const error: unknown = await promise.then(() => undefined, (reason: unknown) => reason)
  if (error instanceof FlowleapOfficeError) return error
  throw new Error(`expected a FlowleapOfficeError, got ${String(error)}`)
}

/** Answer `query revision` with these change ids, in turn per call. */
function revisions(...answers: number[][]): Responder {
  let call = 0
  return (args, cwd) => {
    if (args[0] === 'query' && args[2] === 'revision') {
      const ids = answers[Math.min(call++, answers.length - 1)] ?? []
      return ok({
        results: ids.map(id => ({ text: `t${String(id)}`, format: { 'revision.type': 'ins', 'revision.author': 'FlowLeap', 'revision.id': String(id), ...(id === 1 ? {} : { 'revision.date': '2026-11-03T10:00:00.0000000Z' }) } })),
      })
    }
    return succeed(args, cwd)
  }
}

const amendRequest: AmendRequest = {
  heading: 'Claims',
  paragraphs: [{ mark: 'same', segments: [{ kind: 'same', text: '1. A' }, { kind: 'ins', text: ' B' }] }],
  author: 'FlowLeap',
  date: '2026-11-03T10:00:00.000Z',
  clean: true,
}

describe('OfficeCliProvider.letter', () => {
  it('merges the fields, adds the blocks in one batch, validates, and removes its folder', async () => {
    const { fake, office, callsDir } = await setup()
    const file = await office.letter({
      template: bytes('template'), fields: { datum: '3. November 2026' },
      blocks: [{ kind: 'heading', level: 1, text: 'Erwiderung' }, { kind: 'table', header: ['a', 'b'], rows: [['1,5', '2']] }],
    }, signal)
    expect(text(file)).toBe('merged+batch')
    expect(fake.calls()).toEqual([
      ['query', 'template.docx', 'revision', '--json'],
      ['merge', 'template.docx', 'letter.docx', '--data', 'fields.json', '--json'],
      ['batch', 'letter.docx', '--input', 'letter.docx.batch.json', '--json'],
      ['validate', 'letter.docx', '--json'],
    ])
    expect(fake.spawned[2]?.batch).toContainEqual({ command: 'add', parent: '/body', type: 'table', props: { rows: '2', cols: '2', style: 'FirmTable' } })
    expect(await readdir(callsDir)).toEqual([])
  })

  it('refuses unresolved placeholders, a bad field name, a ragged table, and a web address before or after the merge', async () => {
    const { fake, office } = await setup((args, cwd) => args[0] === 'merge' ? ok({ unresolvedPlaceholders: ['datum'] }) : succeed(args, cwd))
    const template = bytes('t')
    expect((await rejection(office.letter({ template, fields: {}, blocks: [] }, signal))).code).toBe('missing_fields')
    expect((await rejection(office.letter({ template, fields: { 'a b': 'x' }, blocks: [] }, signal))).code).toBe('invalid_request')
    expect((await rejection(office.letter({ template, fields: {}, blocks: [{ kind: 'table', header: ['a'], rows: [['1', '2']] }] }, signal))).code).toBe('invalid_request')
    expect((await rejection(office.letter({ template, fields: {}, blocks: [{ kind: 'table', header: [], rows: [] }] }, signal))).code).toBe('invalid_request')
    const before = fake.spawned.length
    expect((await rejection(office.letter({ template, fields: { url: 'https://x' }, blocks: [] }, signal))).code).toBe('url_refused')
    expect((await rejection(office.letter({ template, fields: {}, blocks: [{ kind: 'paragraph', text: 'http://x' }] }, signal))).code).toBe('url_refused')
    expect(fake.spawned.length).toBe(before)
  })

  it('refuses a template that holds tracked changes', async () => {
    const { fake, office } = await setup(revisions([7]))
    expect((await rejection(office.letter({ template: bytes('firm'), fields: {}, blocks: [] }, signal))).code).toBe('invalid_document')
    expect(fake.calls().map(argv => argv[0])).toEqual(['query'])
  })

  it('reports a template the engine cannot open and a letter that fails validation', async () => {
    const broken = await setup((args, cwd) => args[0] === 'merge' ? fail('Cannot open template.docx: File contains corrupted data.') : succeed(args, cwd))
    const error = await rejection(broken.office.letter({ template: bytes('x'), fields: {}, blocks: [] }, signal))
    expect([error.code, error.message]).toEqual(['invalid_document', 'The Office engine refused merge: Cannot open template.docx: File contains corrupted data.'])
    const invalid = await setup((args, cwd) => args[0] === 'validate'
      ? { exitCode: 1, stdout: JSON.stringify({ success: false, data: { count: 1, errors: [{ description: 'invalid child element' }] } }) }
      : succeed(args, cwd))
    const failed = await rejection(invalid.office.letter({ template: bytes('x'), fields: {}, blocks: [] }, signal))
    expect([failed.code, failed.message]).toEqual(['invalid_output', 'The written file does not pass validation: invalid child element'])
    const opaque = await setup((args, cwd) => args[0] === 'validate' ? fail('locked') : succeed(args, cwd))
    expect((await rejection(opaque.office.letter({ template: bytes('x'), fields: {}, blocks: [] }, signal))).message).toContain('locked')
  })

  it('fails on a reply with unexpected fields and on a cancelled signal', async () => {
    const { office } = await setup((args, cwd) => args[0] === 'merge' ? ok({ unresolvedPlaceholders: 'no' }) : succeed(args, cwd))
    expect((await rejection(office.letter({ template: bytes('x'), fields: {}, blocks: [] }, signal))).code).toBe('engine_failed')
    const controller = new AbortController()
    controller.abort()
    await expect(office.letter({ template: bytes('x'), fields: {}, blocks: [] }, controller.signal)).rejects.toThrow()
  })
})

describe('a failure outside the engine', () => {
  it('is aborted for a cancelled signal and engine_failed otherwise, with its message', async () => {
    const { office } = await setup((args, cwd) => args[0] === 'create' ? ok() : succeed(args, cwd))
    const controller = new AbortController()
    controller.abort()
    expect((await rejection(office.claimChart({ sheet: 'S', header: ['F'], rows: [] }, controller.signal))).code).toBe('aborted')
    const missing = await rejection(office.claimChart({ sheet: 'S', header: ['F'], rows: [] }, signal))
    expect([missing.code, missing.message.includes('ENOENT')]).toEqual(['engine_failed', true])
  })
})

describe('OfficeCliProvider.amendClaims', () => {
  it('creates the marked and the clean copy, each with one batch and a validation', async () => {
    const { fake, office } = await setup()
    const result = await office.amendClaims(amendRequest, signal)
    expect([text(result.marked), text(result.clean)]).toEqual(['created+batch', 'created+batch'])
    expect(fake.calls().map(argv => argv.slice(0, 2))).toEqual([
      ['create', 'marked.docx'], ['batch', 'marked.docx'], ['validate', 'marked.docx'],
      ['create', 'clean.docx'], ['batch', 'clean.docx'], ['validate', 'clean.docx'],
    ])
    expect(fake.spawned[1]?.batch).toContainEqual({
      command: 'add', parent: '/body/p[last()]', type: 'run',
      props: { text: ' B', 'revision.type': 'ins', 'revision.author': 'FlowLeap', 'revision.date': '2026-11-03T10:00:00.000Z' },
    })
    expect(fake.spawned[4]?.batch).toContainEqual({ command: 'add', parent: '/body', type: 'paragraph', props: { text: '1. A B' } })
  })

  it('starts both copies from a template without tracked changes and skips the clean copy when not asked', async () => {
    const { fake, office } = await setup(revisions([]))
    const result = await office.amendClaims({ ...amendRequest, template: bytes('firm'), clean: false }, signal)
    expect(text(result.marked)).toBe('firm+batch')
    expect(result.clean).toBeUndefined()
    expect(fake.calls().map(argv => argv[0])).toEqual(['query', 'batch', 'validate'])
  })

  it('refuses a template that holds tracked changes', async () => {
    const { office } = await setup(revisions([7]))
    expect((await rejection(office.amendClaims({ ...amendRequest, template: bytes('firm') }, signal))).code).toBe('invalid_document')
  })

  it('checks the rules the types do not express', () => {
    const broken: Partial<AmendRequest>[] = [
      { paragraphs: [] },
      { author: ' ' },
      { author: 'Dr. Weiß\nPartner' },
      { author: 'Dr. Weiß\u0000' },
      { date: '3. November 2026' },
      { date: '2026-13-45T10:00:00Z' },
      { paragraphs: [{ mark: 'same', segments: [{ kind: 'same', text: '' }] }] },
      { paragraphs: [{ mark: 'ins', segments: [{ kind: 'same', text: '1. A' }] }] },
      { paragraphs: [{ mark: 'del', segments: [{ kind: 'ins', text: '1. A' }] }] },
    ]
    for (const change of broken) {
      expect(() => { checkAmend({ ...amendRequest, ...change }) }).toThrow(FlowleapOfficeError)
    }
    expect(() => { checkAmend({ ...amendRequest, date: '2026-11-03T10:00:00+01:00' }) }).not.toThrow()
    expect(() => { checkAmend({ ...amendRequest, author: 'Dr. Weiß\tPartner' }) }).not.toThrow()
  })
})

describe('OfficeCliProvider.claimChart', () => {
  it('creates the workbook, writes the chart in one batch, and validates', async () => {
    const { fake, office } = await setup()
    const file = await office.claimChart({ sheet: 'Anspruch 1', header: ['Merkmal', 'D1'], rows: [['1.10', 'offenbart']] }, signal)
    expect(text(file)).toBe('created+batch')
    expect(fake.calls().map(argv => argv[0])).toEqual(['create', 'batch', 'validate'])
    expect(fake.spawned[1]?.batch).toContainEqual({
      command: 'set', path: '/Anspruch 1/A2',
      props: { value: '1.10', type: 'string', 'border.all': 'thin', 'alignment.wrapText': 'true', 'alignment.vertical': 'top' },
    })
  })

  it('refuses a bad sheet name, a ragged row, too many columns, and a web address', async () => {
    const { fake, office } = await setup()
    for (const sheet of ['', 'a/b', 'x'.repeat(32), '\'quoted', 'quoted\'', 'a[1]']) {
      expect((await rejection(office.claimChart({ sheet, header: ['F'], rows: [] }, signal))).code).toBe('invalid_request')
    }
    expect((await rejection(office.claimChart({ sheet: 'S', header: ['F', 'G'], rows: [['1']] }, signal))).code).toBe('invalid_request')
    expect((await rejection(office.claimChart({ sheet: 'S', header: Array.from({ length: 16_385 }, () => 'F'), rows: [] }, signal))).message).toContain('at most 16384')
    expect((await rejection(office.claimChart({ sheet: 'S', header: ['F'], rows: [['https://x']] }, signal))).code).toBe('url_refused')
    expect(fake.spawned).toEqual([])
  })
})

describe('OfficeCliProvider.read', () => {
  it('reads a Word document: text with tables, headings, and tracked changes', async () => {
    const { fake, office } = await setup((args, cwd) => {
      if (args[0] === 'view' && args[2] === 'text') {
        return ok({ elements: [{ path: '/body/p[1]', type: 'paragraph', text: 'Titel' }, { path: '/body/tbl[1]', type: 'table', text: '[Table: 2 rows]' }, { path: '/body/p[2]', type: 'paragraph', text: 'a\vb' }] })
      }
      if (args[0] === 'query' && args[2] === 'cell') {
        return ok({ results: [{ path: '/body/tbl[1]/tr[1]/tc[1]', text: 'F' }, { path: '/body/tbl[1]/tr[1]/tc[2]', text: 'D1' }, { path: '/body/tbl[1]/tr[2]/tc[1]', text: '1.1' }] })
      }
      if (args[0] === 'view') return ok({ headings: [{ line: 1, text: 'Titel', style: 'heading 1', level: 1 }] })
      return revisions([1, 2])(args, cwd)
    })
    const readout = await office.read({ file: bytes('doc'), format: 'docx' }, signal)
    expect(readout).toEqual({
      format: 'docx',
      text: 'Titel\nF\tD1\n1.1\na\nb',
      headings: [{ level: 1, text: 'Titel' }],
      revisions: [
        { id: 1, type: 'ins', author: 'FlowLeap', text: 't1' },
        { id: 2, type: 'ins', author: 'FlowLeap', date: '2026-11-03T10:00:00.0000000Z', text: 't2' },
      ],
    })
    expect(fake.calls()).toEqual([
      ['view', 'document.docx', 'text', '--json'],
      ['query', 'document.docx', 'cell', '--json'],
      ['view', 'document.docx', 'outline', '--json'],
      ['query', 'document.docx', 'revision', '--json'],
    ])
  })

  it('reads an Excel workbook: cells per row and the sheets', async () => {
    const { office } = await setup(args => args[2] === 'text'
      ? ok({ sheets: [{ name: 'S', totalRows: 2, rows: [{ row: 1, cells: { A1: 'F', B1: 'D1' } }, { row: 2, cells: { A2: '1.10' } }] }] })
      : ok({ fileName: 'x', sheets: [{ name: 'S', rows: 2, cols: 2, formulas: 0 }] }))
    expect(await office.read({ file: bytes('x'), format: 'xlsx' }, signal)).toEqual({
      format: 'xlsx', text: '=== Sheet: S ===\nA1=F\tB1=D1\nA2=1.10', sheets: [{ name: 'S', rows: 2, cols: 2 }],
    })
  })

  it('reports a file the engine cannot open as an invalid document', async () => {
    const { office } = await setup(() => fail('Cannot open document.docx: File contains corrupted data.'))
    expect((await rejection(office.read({ file: bytes('x'), format: 'docx' }, signal))).code).toBe('invalid_document')
  })
})

describe('OfficeCliProvider.reviewChanges', () => {
  it('accepts every change in one batch, counts the removed changes, and validates', async () => {
    const { fake, office } = await setup(revisions([1, 2, 3], []))
    const result = await office.reviewChanges({ file: bytes('doc'), action: 'accept', selection: { kind: 'all' } }, signal)
    expect([text(result.file), result.changed]).toEqual(['doc+batch', 3])
    expect(fake.calls().map(argv => argv[0])).toEqual(['query', 'batch', 'query', 'validate'])
    expect(fake.spawned[1]?.batch).toEqual([{ command: 'set', path: '/revision', props: { 'revision.action': 'accept' } }])
  })

  it('rejects named changes and refuses an id the document does not hold', async () => {
    const { fake, office } = await setup(revisions([1, 2], [2]))
    expect((await office.reviewChanges({ file: bytes('d'), action: 'reject', selection: { kind: 'ids', ids: [1] } }, signal)).changed).toBe(1)
    expect(fake.spawned[1]?.batch).toEqual([{ command: 'set', path: '/revision[@id=1]', props: { 'revision.action': 'reject' } }])
    expect((await rejection(office.reviewChanges({ file: bytes('d'), action: 'reject', selection: { kind: 'ids', ids: [9] } }, signal))).message).toContain('9')
  })

  it('refuses an empty selection, a bad author, and a web-address author', async () => {
    const { office } = await setup()
    const review = (selection: Parameters<typeof office.reviewChanges>[0]['selection']) => office.reviewChanges({ file: bytes('d'), action: 'accept', selection }, signal)
    expect((await rejection(review({ kind: 'ids', ids: [] }))).code).toBe('invalid_request')
    expect((await rejection(review({ kind: 'author', author: ' ' }))).code).toBe('invalid_request')
    expect((await rejection(review({ kind: 'author', author: 'a]b' }))).code).toBe('invalid_request')
    expect((await rejection(review({ kind: 'author', author: 'https://x' }))).code).toBe('url_refused')
  })
})

describe('selectors and wordReadText', () => {
  it('maps each selection to its revision paths', () => {
    expect(selectors({ kind: 'all' })).toEqual(['/revision'])
    expect(selectors({ kind: 'author', author: 'Dr. Weiß' })).toEqual(['/revision[@author=Dr. Weiß]'])
    expect(selectors({ kind: 'ids', ids: [1, 2] })).toEqual(['/revision[@id=1]', '/revision[@id=2]'])
  })

  it('keeps the engine text of a table without cells and ignores cells outside tables', () => {
    expect(wordReadText([{ path: '/body/tbl[2]', type: 'table', text: '[Table: 1 rows]' }], [{ path: '/body/p[1]', text: 'x' }])).toBe('[Table: 1 rows]')
  })
})
