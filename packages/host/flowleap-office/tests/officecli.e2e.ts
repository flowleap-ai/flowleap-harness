/**
 * The OfficeCLI provider over the real pinned binary and the local subprocess seam. Runs only when FLOWLEAP_OFFICECLI
 * names the binary; FLOWLEAP_OFFICECLI_SHA256 pins its hash (default: the hash of the named file).
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as row from '../src/officecli/index.ts'
import { redlineParagraph, type ClaimChange } from '../src/redline.ts'
import type { FlowleapOffice } from '../src/types.ts'

const binaryPath = process.env['FLOWLEAP_OFFICECLI']
const signal = new AbortController().signal

const claims: ClaimChange[] = [
  {
    number: '1',
    before: 'Wärmeübertrager (1) für ein Kühlgerät, mit einem Rohr (2) und einer Vielzahl von Lamellen (3), die auf dem Rohr (2) angeordnet sind.',
    after: 'Wärmeübertrager (1) für ein Kühlgerät, mit einem Rohr (2) und einer Vielzahl von Lamellen (3), die auf dem Rohr (2) angeordnet sind, wobei der Lamellenabstand zwischen 1,5 mm und 3,0 mm liegt.',
  },
  { number: '2', before: 'Wärmeübertrager nach Anspruch 1, wobei die Lamellen (3) aus Aluminium bestehen.', after: 'Wärmeübertrager nach Anspruch 1, wobei die Lamellen (3) aus Kupfer bestehen.' },
  { number: '3', before: 'Wärmeübertrager nach Anspruch 1 oder 2, wobei die Strömungsgeschwindigkeit der Luft höchstens 2 m/s beträgt.' },
  { number: '4', after: 'Kühlgerät mit einem Wärmeübertrager nach einem der Ansprüche 1 oder 2.' },
]
const lines = (key: 'before' | 'after') => claims.flatMap(claim => claim[key] === undefined ? [] : [`${claim.number}. ${claim[key]}`])

describe.skipIf(binaryPath === undefined)('OfficeCLI provider over the real binary', () => {
  let ctx: Context
  let dir: string
  let office: FlowleapOffice

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'flowleap-office-e2e-'))
    ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    const path = binaryPath ?? ''
    await ctx.plugin(row, row.Config({
      binaryPath: path,
      version: '1.0.160',
      sha256: process.env['FLOWLEAP_OFFICECLI_SHA256'] ?? await row.fileSha256(path),
      stateDir: join(dir, 'state'),
      tableStyle: 'FirmTable',
      chart: {},
    })).await()
    office = ctx.flowleapOffice
  }, 60_000)

  afterAll(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  it('writes a valid marked claims copy whose accept and reject give the after and the before texts', async () => {
    const date = '2026-11-03T10:00:00.000Z'
    const { marked, clean } = await office.amendClaims({ heading: 'Patentansprüche', paragraphs: claims.map(redlineParagraph), author: 'Dr. Jürgen Weiß & Partner', date, clean: true }, signal)
    const readout = await office.read({ file: marked, format: 'docx' }, signal)
    if (readout.format !== 'docx') throw new Error('expected a Word readout')
    expect(readout.headings).toEqual([{ level: 1, text: 'Patentansprüche' }])
    expect(new Set(readout.revisions.map(revision => revision.type))).toEqual(new Set(['ins', 'del', 'paraMarkIns', 'paraMarkDel']))
    for (const revision of readout.revisions) {
      expect(revision.author).toBe('Dr. Jürgen Weiß & Partner')
      expect(Date.parse(revision.date ?? '')).toBe(Date.parse(date))
    }
    const accepted = await office.reviewChanges({ file: marked, action: 'accept', selection: { kind: 'all' } }, signal)
    expect(accepted.changed).toBe(readout.revisions.length)
    expect((await office.read({ file: accepted.file, format: 'docx' }, signal)).text).toBe(['Patentansprüche', ...lines('after')].join('\n'))
    const rejected = await office.reviewChanges({ file: marked, action: 'reject', selection: { kind: 'author', author: 'Dr. Jürgen Weiß & Partner' } }, signal)
    expect((await office.read({ file: rejected.file, format: 'docx' }, signal)).text).toBe(['Patentansprüche', ...lines('before')].join('\n'))
    const one = await office.reviewChanges({ file: marked, action: 'accept', selection: { kind: 'ids', ids: [readout.revisions[0]?.id ?? 0] } }, signal)
    expect(one.changed).toBe(1)
    const cleanReadout = await office.read({ file: clean ?? new Uint8Array(), format: 'docx' }, signal)
    expect(cleanReadout).toMatchObject({ text: ['Patentansprüche', ...lines('after')].join('\n'), revisions: [] })
  }, 120_000)

  it('writes a letter on the firm template with headings and a table whose decimal commas stay in their cells', async () => {
    const template = new Uint8Array(await readFile(new URL('./fixtures/firm-template.docx', import.meta.url)))
    const letter = await office.letter({
      template,
      fields: { zeichen: 'FL-2026-0815/DE', ihr_zeichen: 'EP 4 123 456.7', datum: '3. November 2026' },
      blocks: [
        { kind: 'heading', level: 1, text: 'Erwiderung auf den Prüfungsbescheid' },
        { kind: 'heading', level: 2, text: '1. Änderungen' },
        { kind: 'paragraph', text: 'Anspruch 1 wurde ergänzt.' },
        { kind: 'table', header: ['Merkmal', 'D1'], rows: [['1.3 Lamellenabstand 1,5–3,0 mm', 'nicht offenbart']] },
      ],
    }, signal)
    const readout = await office.read({ file: letter, format: 'docx' }, signal)
    if (readout.format !== 'docx') throw new Error('expected a Word readout')
    expect(readout.text).toContain('Unser Zeichen: FL-2026-0815/DE')
    expect(readout.text).toContain('Merkmal\tD1\n1.3 Lamellenabstand 1,5–3,0 mm\tnicht offenbart')
    expect(readout.headings).toEqual([{ level: 1, text: 'Erwiderung auf den Prüfungsbescheid' }, { level: 2, text: '1. Änderungen' }])
    await expect(office.letter({ template, fields: { zeichen: 'x' }, blocks: [] }, signal)).rejects.toMatchObject({ code: 'missing_fields' })
  }, 120_000)

  it('writes a claim chart with feature numbers as text', async () => {
    const chart = await office.claimChart({
      sheet: 'Anspruch 1', header: ['Merkmal', 'Anspruch 1', 'D1'],
      rows: [['1.1', 'Wärmeübertrager für Kühlgeräte', 'offenbart (Abs. 12)'], ['1.10', 'Lamellenabstand 1,5–3,0 mm', 'nicht offenbart']],
    }, signal)
    expect(await office.read({ file: chart, format: 'xlsx' }, signal)).toEqual({
      format: 'xlsx',
      text: '=== Sheet: Anspruch 1 ===\nA1=Merkmal\tB1=Anspruch 1\tC1=D1\nA2=1.1\tB2=Wärmeübertrager für Kühlgeräte\tC2=offenbart (Abs. 12)\nA3=1.10\tB3=Lamellenabstand 1,5–3,0 mm\tC3=nicht offenbart',
      sheets: [{ name: 'Anspruch 1', rows: 3, cols: 3 }],
    })
  }, 120_000)
})
