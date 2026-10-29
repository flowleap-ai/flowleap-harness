/** Draft Outline saves that the gate and tool specs do not exercise, over in-memory files. */

import { describe, expect, it } from 'vitest'
import { saveDraftOutline } from '../src/drafting/draft-outline-save.ts'
import { claims, featureList, outlineTable } from './drafting-matter-fixtures.ts'
import { memoryWorkspace } from './drafting-memory-files.ts'

const gates = { 'drafting/hinge/feature-list.md': featureList(), 'drafting/hinge/claims.md': claims() }

const tableOf = (rows: readonly string[]) => [
  '| Item | Section | Kind | Claims | Claim terms | Sources | Explain | Question |',
  '|------|---------|------|--------|-------------|---------|---------|----------|',
  ...rows,
].join('\n')

const firstLines = (result: Awaited<ReturnType<typeof saveDraftOutline>>) => (result.saved ? result.message : result.reason).split('\n')

describe('Application Drafting outline save edges', () => {
  it('refuses while the Feature List does not exist, or names no office', async () => {
    const missing = await saveDraftOutline(memoryWorkspace().workspace, outlineTable)
    expect(missing).toMatchObject({ saved: false, reason: expect.stringMatching(/^drafting\/hinge\/feature-list\.md does not exist\./) })
    const noOffice = await saveDraftOutline(memoryWorkspace({ ...gates, 'drafting/hinge/feature-list.md': '---\nconfirmed: true\n---\n| F1 | A hinge. |\n' }).workspace, outlineTable)
    expect(noOffice).toMatchObject({ saved: false, reason: expect.stringMatching(/^drafting\/hinge\/feature-list\.md names no office\./) })
  })

  it('refuses a table with no rows', async () => {
    const result = await saveDraftOutline(memoryWorkspace(gates).workspace, tableOf([]))
    expect(result).toMatchObject({ saved: false, reason: expect.stringContaining('The content has no Outline Item to save: the Outline table has no rows.') })
  })

  it('records a re-save in a new Working Record', async () => {
    const { files, workspace } = memoryWorkspace(gates)
    await saveDraftOutline(workspace, outlineTable)
    await saveDraftOutline(workspace, outlineTable.replace('a hinge, a housing, a lever', 'a hinge, a lever, a housing'))
    expect(files.entries.get('drafting/hinge/draft-application.working-record.md')).toMatch(/^- \*\*Outline re-saved:\*\* [0-9a-f]{12} → [0-9a-f]{12}$/m)
  })

  it('lists ten Errors and counts the rest', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => `| O${String(index + 2)} | DETAILED DESCRIPTION | Technical | 1, 2 | a hinge, a housing, a lever | F${String(index + 20)} | yes |  |`)
    const lines = firstLines(await saveDraftOutline(memoryWorkspace(gates).workspace, tableOf(['| O1 | BACKGROUND | Template |  |  |  | no |  |', ...rows])))
    expect(lines[1]).toBe('Outline check: 12 Error(s). Fix them in the outline and save it again before drafting:')
    expect(lines.slice(2, 13).at(-1)).toBe('- and 2 more.')
  })
})
