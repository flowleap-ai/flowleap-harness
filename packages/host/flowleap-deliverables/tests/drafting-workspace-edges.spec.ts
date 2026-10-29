/**
 * Drafting workspace behavior that the gate and tool specs do not exercise: the workspace over
 * in-memory files, and the file I/O over the real local filesystem in a temp directory.
 */

import { mkdir, mkdtemp, realpath, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveDraftingFolder } from '../src/drafting/folder-contract.ts'
import { claimsHash, DraftingWorkspace, MAX_DRAFTING_FILE_BYTES, withoutEditorButtons, workspaceFiles } from '../src/drafting/workspace.ts'
import { claims, draft, featureList } from './drafting-matter-fixtures.ts'
import { memoryFiles, memoryWorkspace } from './drafting-memory-files.ts'

const RECORD = 'drafting/hinge/draft-application.working-record.md'

describe('Application Drafting workspace edges', () => {
  it('keeps the rest of a gate sentence whose edit clause has no period', () => {
    expect(withoutEditorButtons('Review `claims.md:2`, then click **Approve Claims** at the top of the file, or change `false` to `true`', 'hinge'))
      .toBe('Review `claims.md:2`, then change `false` to `true`, or answer the Approve Claims card in the chat, or type `/approve-claims hinge`')
  })

  it('runs on the wall clock when the options give no clock', () => {
    const before = Date.now()
    const now = new DraftingWorkspace(memoryFiles(), resolveDraftingFolder('hinge')!).clock().getTime()
    expect(now).toBeGreaterThanOrEqual(before)
  })

  it('counts the drawn Figures of the drawings folder in the checklist', async () => {
    const { workspace } = memoryWorkspace({
      'drafting/hinge/feature-list.md': featureList(),
      'drafting/hinge/figures.md': '## FIG. 1\n\n- 12: housing\n',
      'drafting/hinge/drawings/FIG-1.svg': '<svg/>',
      'drafting/hinge/drawings/sheet-1.svg': '<svg/>',
    })
    expect((await workspace.writeChecklist())?.notes[0]?.detail).toBe('1 in figures.md, 1 drawn in drawings/')
  })

  it('withdraws a changed approval and starts a Working Record for it', async () => {
    const { files, workspace } = memoryWorkspace({ 'drafting/hinge/claims.md': claims().replace('approved: true', 'approved: true\napprovedHash: stale') })
    expect(await workspace.checkClaimsApproval()).toMatchObject({ gate: 'not-true', cleared: true })
    expect(files.entries.get(RECORD)).toMatch(/^- \*\*Approval cleared:\*\* 2026-10-23T12:00:00\.000Z \(claims\.md changed after approval\)$/m)
  })

  it('takes the office from the Feature List when the draft names none, and finds none without a Feature List', async () => {
    const withList = memoryWorkspace({ 'drafting/hinge/feature-list.md': featureList() }).workspace
    expect([await withList.office('---\nmodel: x\n---\n'), await withList.office(undefined), await memoryWorkspace().workspace.office(undefined)]).toEqual(['US', 'US', undefined])
  })

  it('reports a claims change when it validates a draft of a matter without a Feature List', async () => {
    const { workspace } = memoryWorkspace()
    const findings = await workspace.validate('US', draft(), claims(), { gate: 'set', hash: claimsHash(claims()), changed: 'The claims changed.' }, [])
    expect(findings[0]).toEqual({ severity: 'Error', rule: 'claims-changed', file: 'claims.md', message: 'The claims changed.' })
  })

  it('records an export in a new Working Record', async () => {
    const { files, workspace } = memoryWorkspace()
    await workspace.recordExport(draft(), claims())
    expect(files.entries.get(RECORD)).toMatch(/^- \*\*Exported draft and claims SHA-256:\*\* [0-9a-f]{64}$/m)
  })

  it('adds no checklist line while the matter has no folder', async () => {
    expect(await memoryWorkspace().workspace.textWithChecklistLine('Done.')).toBe('Done.')
  })

  it('reads the style exemplars: a long one cut, a PDF through the reader, and a reason for each it cannot read', async () => {
    const long = 'x'.repeat(20_001)
    const initial = { 'style/a.md': long, 'style/b.pdf': 'pdf', 'style/c.md': null, 'style/d.pdf': 'pdf' }
    const pdfText = (path: string) => path.endsWith('b.pdf') ? Promise.resolve('PDF text') : Promise.reject(new Error('unreadable PDF'))
    expect(await memoryWorkspace(initial, { pdfText }).workspace.styleExemplars()).toEqual([
      { path: 'style/a.md', text: long.slice(0, 20_000), truncated: true },
      { path: 'style/b.pdf', text: 'PDF text' },
      { path: 'style/c.md', error: 'the file could not be read' },
      { path: 'style/d.pdf', error: 'unreadable PDF' },
    ])
    const rejectsText = () => Promise.reject('not a PDF') as Promise<string>
    expect(await memoryWorkspace({ 'style/b.pdf': 'pdf' }, { pdfText: rejectsText }).workspace.styleExemplars()).toEqual([{ path: 'style/b.pdf', error: 'not a PDF' }])
    expect(await memoryWorkspace({ 'style/b.pdf': 'pdf' }).workspace.styleExemplars()).toEqual([
      { path: 'style/b.pdf', error: 'PDF exemplars are not read in this harness; save the exemplar as .docx or .md' },
    ])
  })
})

describe('Application Drafting workspace files', () => {
  let dir: string
  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-drafting-files-')))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function files() {
    const ctx = new Context()
    await ctx.plugin(LocalFileSystem, { cwd: dir })
    return workspaceFiles(ctx, dir, new AbortController().signal)
  }

  it('refuses a path outside the working directory', async () => {
    await expect((await files()).read('../outside.md')).rejects.toThrow(`Drafting files must stay within the working directory ${dir} (refused: ../outside.md).`)
  })

  it('reads a folder as no file, and passes on the other read failures', async () => {
    await mkdir(join(dir, 'drafting'))
    await writeFile(join(dir, 'binary.md'), Buffer.from([0, 1, 2, 0xff, 0xfe, 0]))
    await writeFile(join(dir, 'large.docx'), '')
    await truncate(join(dir, 'large.docx'), MAX_DRAFTING_FILE_BYTES + 1)
    const io = await files()
    expect([await io.read('drafting'), await io.readBytes('drafting')]).toEqual([undefined, undefined])
    await expect(io.read('binary.md')).rejects.toMatchObject({ code: 'FS_NOT_TEXT' })
    await expect(io.readBytes('large.docx')).rejects.toMatchObject({ code: 'FS_TOO_LARGE' })
  })
})
