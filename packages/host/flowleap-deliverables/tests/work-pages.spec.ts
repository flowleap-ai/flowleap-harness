/**
 * The office action work page: the findings read from an analysis in the skill's layout, the `<report>.work.json`
 * file that an `office-action-scaffold` save writes over the real local filesystem, and the `flowleapWorkPages`
 * Remote that lists the pages and changes only their review fields.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import {
  claimNumbers, memoryIndex, parseOfficeActionReport, plainText, responseOptions, tableCells, WorkPages, workPageId, workPagePath,
  workPagesDomainSpec,
  type WorkPageFile, type WorkPageId,
} from '../src/index.ts'
import { writerBench } from './writer-test-bench.ts'

/** An analysis in the layout of the `recipe-office-action-response` skill, with the variants the parser reads. */
const REPORT = [
  '## 0. Summary',
  '',
  'SEARCH REPORT ONLY.',
  '',
  '## 1. Action',
  '',
  '| Field | Value | Source |',
  '|---|---|---|',
  '| Application | EP 26167335 / publication EP4814394A1 | get_bibliography |',
  '| Office and action | EPO, European search report (phase "national") printed with the A1 | get_bibliography |',
  '| Action date | Publication 2026-09-30 (INPADOC) | timeline |',
  '| Last date without extension | 2027-03-30 if the period runs from 2026-09-30 (computed by the agent) | computed |',
  '| Cited documents | D1 US2016107508 (A1); D2: EP4491971 (A1); family member CN1 | get_bibliography |',
  '| Application date | 2026-03-24 | get_bibliography |',
  '| | empty field | - |',
  '',
  '## 2. Objections',
  '',
  '### Objection 1: Claims 1-3 – novelty over [D1](flowleap://x)',
  '',
  '- **Ground:** Art. 54 EPC (category X)',
  '- **Claims hit:** 1-3, 5, 9–8, 2-900 (A only for 4)',
  '- **Examiner’s reasoning:** none available.',
  '  The search report gives only "X".',
  '- **Source of the objection:** search report categories',
  '- **Cited documents:**',
  '',
  '| Document | Role | Passage | What the passage says | Source anchor |',
  '|---|---|---|---|---|',
  '| D1 US2016107508A1 | X | ¶[0059] | "a **refrigerant-fluid** heat exchanger" | `US2016107508A1:claims:1:en` |',
  '| D1 claims | – | claim 2 |',
  '',
  '- **Assessment (novelty):** disputable.',
  '- **Assessment (inventive step):**',
  '  1. Closest art: D1.',
  '- **Options (for the attorney\'s decision):** Argue (D1 is a vehicle system; claim 1 differs); Amend claims 1 and 12 so that the two components are distinct (basis: ¶[0121]); check claim 8 as a fallback; Interview; Accept (no step required now).',
  '- **Reply must address:** each ground.',
  '- **Confidence and gaps:** low.',
  '- **Sources:** [source anchor: US2016107508A1:claims:1:en]',
  '- **Legal basis:** not read.',
  '',
  '### Objection: clarity of claim 9',
  '',
  '- **Cited documents:** D3 US11479079B2, claims read only.',
  '- **Date check:** no date issue.',
  '',
  '### Notes',
  '',
  '- **Ground:** not an objection.',
  '',
  '## 3. Claim-by-claim comparison',
  '',
  '| Term | Reading |',
  '|---|---|',
  '| "first" | distinct |',
  '',
  '**Claim 1 (system) against D1.**',
  '',
  '| Element (verbatim) | Examiner says | Cited passage says | Assessment |',
  '|---|---|---|---|',
  '| 1a "a loop" | X over D1 | "a refrigerant loop" | disclosed |',
  '| 1b | |',
  '',
  '**Dependent claims**',
  '',
  '| Element | Examiner | Cited | Assessment |',
  '|---|---|---|---|',
  '| 5 | – | not read | not read |',
  '| one row \\| with a pipe | | | |',
  '',
  '## 4. Response plan',
  '',
  '| Objection | Option |',
  'not a separator row',
].join('\n')

describe('office action findings', () => {
  it('reads the action table, the objection blocks, and the claim tables', () => {
    const findings = parseOfficeActionReport(REPORT, '  ')
    expect(findings).toMatchObject({
      application: 'EP 26167335 / publication EP4814394A1',
      communication: 'EPO, European search report printed with the A1',
      issued: '2026-09-30',
      deadline: '2027-03-30',
      documents: [
        { label: 'D1', text: 'US2016107508 (A1)' },
        { label: 'D2', text: 'EP4491971 (A1)' },
        { label: '', text: 'family member CN1' },
      ],
    })
    const [first, second] = findings.objections
    expect(findings.objections).toHaveLength(2)
    expect(first).toEqual({
      id: '1',
      title: 'Claims 1-3 – novelty over D1',
      ground: 'Art. 54 EPC (category X)',
      claims: [1, 2, 3, 5, 9],
      claimsText: '1-3, 5, 9–8, 2-900 (A only for 4)',
      reasoning: 'none available.\nThe search report gives only "X".',
      source: 'search report categories',
      citations: [
        { document: 'D1 US2016107508A1', role: 'X', passage: '¶[0059]', says: '"a refrigerant-fluid heat exchanger"', anchor: 'US2016107508A1:claims:1:en' },
        { document: 'D1 claims', role: '–', passage: 'claim 2', says: '', anchor: '' },
      ],
      citationsText: '',
      assessment: [
        { label: 'Assessment (novelty)', text: 'disputable.' },
        { label: 'Assessment (inventive step)', text: '1. Closest art: D1.' },
      ],
      options: [
        { label: 'Argue', text: 'D1 is a vehicle system; claim 1 differs' },
        { label: 'Amend', text: 'claims 1 and 12 so that the two components are distinct (basis: ¶[0121]); check claim 8 as a fallback' },
        { label: 'Interview', text: '' },
        { label: 'Accept', text: 'no step required now' },
      ],
      replyMustAddress: 'each ground.',
      confidence: 'low.',
      sources: '[source anchor: US2016107508A1:claims:1:en]',
      details: [{ label: 'Legal basis', text: 'not read.' }],
    })
    expect(second).toMatchObject({
      id: '2', title: 'clarity of claim 9', claims: [], citations: [], citationsText: 'D3 US11479079B2, claims read only.',
      details: [{ label: 'Date check', text: 'no date issue.' }], options: [],
    })
    expect(findings.comparison).toEqual([
      {
        heading: 'Claim 1 (system) against D1',
        claim: 1,
        rows: [
          { element: '1a "a loop"', examiner: 'X over D1', cited: '"a refrigerant loop"', assessment: 'disclosed' },
          { element: '1b', examiner: '', cited: '', assessment: '' },
        ],
      },
      {
        heading: 'Dependent claims',
        claim: null,
        rows: [
          { element: '5', examiner: '–', cited: 'not read', assessment: 'not read' },
          { element: 'one row | with a pipe', examiner: '', cited: '', assessment: '' },
        ],
      },
    ])
  })

  it('prefers the matter of the save and gives empty findings for a report outside the layout', () => {
    expect(parseOfficeActionReport(REPORT, 'EP4814394').application).toBe('EP4814394')
    const bare = parseOfficeActionReport('## Objections\n\n### Objection 7: unity\n\n- **Ground:** Art. 82 EPC')
    expect(bare.objections[0]).toMatchObject({ id: '7', ground: 'Art. 82 EPC', citations: [], citationsText: '' })
    expect(parseOfficeActionReport('# Free text\n\nNo layout.')).toEqual({
      application: '', communication: '', issued: null, deadline: null, deadlineText: '', documents: [], objections: [], comparison: [],
    })
  })

  it('reads table cells, plain text, claim numbers and options on their own', () => {
    expect(tableCells('| a | `b` \\| c |')).toEqual(['a', 'b | c'])
    expect(plainText(' [x](y) **z** `w` ')).toBe('x z w')
    expect(claimNumbers('none by category; relevant "1-15"')).toEqual([])
    expect(claimNumbers('12, 3-4')).toEqual([3, 4, 12])
    expect(responseOptions('')).toEqual([])
    expect(responseOptions('Argue ((nested); text);.')).toEqual([{ label: 'Argue', text: '(nested); text' }])
    expect(responseOptions('Interview; the attorney decides')).toEqual([{ label: 'Interview', text: 'the attorney decides' }])
    expect(parseOfficeActionReport([
      '## 1. Action', '', '| Field | Value |', '|---|---|',
      '| Last date without extension | Not computable. Indicative only: about 2027-03-30 | ',
      '', '## 3. Claim-by-claim comparison', '', '### Claim 12 (method)', '',
      '| Element | Examiner says | Cited passage says | Assessment |', '|---|---|---|---|', '| 12a | X | – | not read |',
    ].join('\n'))).toMatchObject({
      deadline: null,
      comparison: [{ heading: 'Claim 12 (method)', claim: 12, rows: [{ element: '12a' }] }],
    })
  })
})

const OFFICE_ACTION = 'office-actions/EP4814394/2026-09-30-analysis.md'

function save(content = REPORT, filePath = OFFICE_ACTION) {
  return { filePath, content, template: 'office-action-scaffold', matter: 'EP4814394' }
}

function allows(visible: boolean) {
  return { allows: vi.fn(() => visible) }
}

describe('office action work page save and Remote', () => {
  const cleanups: (() => Promise<unknown>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  async function bench(visible = true) {
    const bench = await writerBench()
    cleanups.push(bench.dispose)
    const access = allows(visible)
    bench.ctx.provide('remoteAccess', access as never)
    await vi.waitFor(() => { expect(bench.ctx.get('flowleapWorkPages')).toBeDefined() })
    const pages = bench.ctx.flowleapWorkPages
    const path = join(bench.dir, `${OFFICE_ACTION}.work.json`)
    const fileOf = async (): Promise<WorkPageFile> => JSON.parse(await readFile(path, 'utf8')) as WorkPageFile
    return { ...bench, access, pages, path, fileOf }
  }

  it('writes the work page beside the report, names it in the result, and lists it for the chat', async () => {
    const { write, pages, fileOf, session, ctx } = await bench()
    const changed = vi.fn()
    ctx.on('flowleap-work-pages/changed', changed)
    const text = await write(save())
    expect(text).toContain(`Work page: ${OFFICE_ACTION}.work.json holds the 2 objections of this analysis for the office action board, where the attorney sets a review state, an owner and a note on each objection. Read that file before you revise this analysis or write its response plan; do not edit it.`)
    expect(text.trimEnd().endsWith('Delivered to the user; do not call `present` for these files.')).toBe(true)
    const file = await fileOf()
    expect(file).toMatchObject({
      schemaVersion: 1, kind: 'office-action', report: '2026-09-30-analysis.md',
      review: { '1': { state: 'needs_review', owner: '', note: '' }, '2': { state: 'needs_review', owner: '', note: '' } },
    })
    expect(file.about).toContain('2026-09-30-analysis.md')
    expect(file.findings.application).toBe('EP4814394')
    expect(changed).toHaveBeenCalledOnce()
    const [summary] = await pages.list()
    expect(summary).toMatchObject({
      sessionId: session.id, path: `${OFFICE_ACTION}.work.json`, application: 'EP4814394', objections: 2, needsReview: 2,
    })
    expect((await pages.read(summary!.id)).file).toEqual(file)
  })

  it('changes only the review fields, keeps them across a later save, and refuses what it cannot change', async () => {
    const { write, pages, fileOf, path } = await bench()
    await write(save())
    const [summary] = await pages.list()
    const id = summary!.id
    const view = await pages.review({ id, objection: '1', state: 'relevant', owner: '  M. Keller ', note: 'Argue the arrangement.' })
    expect(view.summary.needsReview).toBe(1)
    expect((await fileOf()).review['1']).toEqual({ state: 'relevant', owner: 'M. Keller', note: 'Argue the arrangement.' })
    await Promise.all([pages.review({ id, objection: '1', state: 'done' }), pages.review({ id, objection: '2', note: 'Amend.' })])
    expect((await fileOf()).review).toEqual({
      '1': { state: 'done', owner: 'M. Keller', note: 'Argue the arrangement.' },
      '2': { state: 'needs_review', owner: '', note: 'Amend.' },
    })
    const findings = (await fileOf()).findings
    const resaved = REPORT.replace('### Objection: clarity of claim 9', '### Objection 3: clarity of claim 9')
    await write(save(resaved))
    const after = await fileOf()
    expect(after.review).toEqual({ '1': { state: 'done', owner: 'M. Keller', note: 'Argue the arrangement.' }, '3': { state: 'needs_review', owner: '', note: '' } })
    expect(after.findings.objections[0]).toEqual(findings.objections[0])
    const refusal = async (request: unknown) => remoteErrorOf(await pages.review(request as never).catch((error: unknown) => error))
    expect(await refusal({ id, objection: '9', state: 'done' })).toMatchObject({ code: 'flowleap-work-pages/objection-not-found', details: { objection: '9' } })
    expect(await refusal({ id, objection: '1', state: 'argue' })).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'state' } })
    expect(await refusal({ id, objection: '1', findings: {} })).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'request' } })
    expect(await refusal({ id: 'nothex', objection: '1' })).toMatchObject({ code: 'flowleap-work-pages/invalid', details: { field: 'id' } })
    expect(await refusal({ id: 'aaaaaaaaaaaaaaaa', objection: '1' })).toMatchObject({ code: 'flowleap-work-pages/not-found' })
    expect(remoteErrorOf(await pages.read('nothex' as WorkPageId).catch((error: unknown) => error))).toMatchObject({ code: 'flowleap-work-pages/invalid' })
    await writeFile(path, '{"schemaVersion":2}')
    expect(await refusal({ id, objection: '1', state: 'done' })).toMatchObject({ code: 'flowleap-work-pages/unreadable', details: { id } })
    expect(await pages.list()).toEqual([])
    await rm(path)
    expect(remoteErrorOf(await pages.read(id).catch((error: unknown) => error))).toMatchObject({
      code: 'flowleap-work-pages/unreadable', details: { reason: 'FS_NOT_FOUND' },
    })
    await writeFile(path, 'not json')
    expect(await write(save())).toContain('holds the 2 objections')
    expect((await fileOf()).review['1']).toEqual({ state: 'needs_review', owner: '', note: '' })
  })

  it('hides the pages of a chat that remote access denies the caller', async () => {
    const { write, pages } = await bench(false)
    await write(save())
    expect(await pages.list()).toEqual([])
    const id = workPageId(workPagePath(join((await bench()).dir, OFFICE_ACTION)))
    expect(remoteErrorOf(await pages.read(id).catch((error: unknown) => error))).toMatchObject({ code: 'flowleap-work-pages/not-found' })
  })

  it('names a report without objection blocks, writes no page for a save without a chat, and leaves other templates alone', async () => {
    const { write, pages, dir } = await bench()
    const empty = await write(save('## 0. Summary\n\nNothing.', 'office-actions/x/empty.md'))
    expect(empty).toContain('Work page: none, because this report has no "### Objection" block;')
    await expect(readFile(join(dir, 'office-actions/x/empty.md.work.json'), 'utf8')).rejects.toThrow()
    const loose = await write(save(REPORT, 'office-actions/x/loose.md'), false)
    expect(loose).toContain('Work page: office-actions/x/loose.md.work.json')
    expect(JSON.parse(await readFile(join(dir, 'office-actions/x/loose.md.work.json'), 'utf8'))).toMatchObject({ kind: 'office-action' })
    expect(await pages.list()).toEqual([])
    const memo = await write({ filePath: 'memo.md', content: REPORT, template: 'patentability-opinion', matter: 'EP4814394' })
    expect(memo).not.toContain('Work page:')
  })

  it('reports a work page that cannot be written and keeps the report', async () => {
    const { write, dir, logged } = await bench()
    await mkdir(join(dir, `${OFFICE_ACTION}.work.json`), { recursive: true })
    const text = await write(save())
    expect(text).toMatch(/Work page: not written \(.+\); the office action board does not show this analysis\./)
    expect(await readFile(join(dir, OFFICE_ACTION), 'utf8')).toContain('### Objection 1')
    expect(logged.some(line => line.includes('work page of office-actions/EP4814394/2026-09-30-analysis.md was not written'))).toBe(true)
  })
})

describe('work page index', () => {
  it('copies the pages in memory into storage once storage opens, and goes back to memory without it', async () => {
    const savedAt = '2026-10-29T09:00:00.000Z'
    expect(workPagesDomainSpec.tables.pages.valueSchema.parse({ path: '/w/a', display: 'a', sessionId: 'chat', savedAt })).toEqual({
      path: '/w/a', display: 'a', sessionId: SessionId('chat'), savedAt,
    })
    const files = new Map<string, string>()
    const fs = {
      resolve: async (path: string) => ({ path }) as never,
      readText: async (target: { path: string }) => {
        const text = files.get(target.path)
        if (text === undefined) throw new Error('missing')
        return text
      },
      writeText: async (target: { path: string }, text: string) => { files.set(target.path, text); return {} as never },
    }
    const changed = vi.fn()
    let hour = 10
    const pages = new WorkPages(fs as never, changed, () => new Date(`2026-10-29T${String(hour++)}:00:00.000Z`))
    const chat = SessionId('chat')
    await pages.save({ reportPath: '/w/a.md', displayPath: 'a.md', content: REPORT, sessionId: chat })
    await pages.save({ reportPath: '/w/z.md', displayPath: 'z.md', content: REPORT, sessionId: chat })
    const table = memoryIndex()
    const id = workPageId('/w/a.md.work.json')
    const kept = brandString<WorkPageId>('bbbbbbbbbbbbbbbb')
    await table.put(kept, { path: '/w/b.md.work.json', display: 'b.md.work.json', sessionId: chat, savedAt: '2026-10-29T09:00:00.000Z' })
    await pages.attach(table)
    const newer = workPageId('/w/z.md.work.json')
    expect([...table.entries()].map(([key]) => key).sort()).toEqual([id, kept, newer].sort())
    await pages.attach(table)
    expect((await pages.list(() => true)).map(page => page.id)).toEqual([newer, id])
    await pages.attach(undefined)
    expect(await pages.list(() => true)).toEqual([])
    expect(changed).toHaveBeenCalledTimes(2)
    expect(await pages.save({ reportPath: '/w/one.md', displayPath: 'one.md', content: '## Objections\n\n### Objection 1: unity\n' }))
      .toContain('Work page: one.md.work.json holds the 1 objection of this analysis')
    const failing = new WorkPages({ ...fs, writeText: async () => { throw new Error('disk full') } } as never, changed)
    await expect(failing.save({ reportPath: '/w/c.md', displayPath: 'c.md', content: REPORT })).rejects.toThrow('disk full')
    await expect(failing.save({ reportPath: '/w/c.md', displayPath: 'c.md', content: REPORT, signal: new AbortController().signal })).rejects.toThrow('disk full')
  })
})
