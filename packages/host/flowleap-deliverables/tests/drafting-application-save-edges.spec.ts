/** Draft Application saves that the gate and tool specs do not exercise, over in-memory files. */

import { describe, expect, it } from 'vitest'
import { saveDraftApplication } from '../src/drafting/draft-application-save.ts'
import { claims, draft, featureList, outline } from './drafting-matter-fixtures.ts'
import { memoryWorkspace } from './drafting-memory-files.ts'

const gatesOpen = {
  'drafting/hinge/feature-list.md': featureList(),
  'drafting/hinge/claims.md': claims(),
  'drafting/hinge/draft-outline.md': outline(),
}

const lines = (result: Awaited<ReturnType<typeof saveDraftApplication>>) => (result.saved ? result.message : result.reason).split('\n')

describe('Application Drafting draft save edges', () => {
  it('names only the office when the model and the provider are given', async () => {
    const result = await saveDraftApplication(memoryWorkspace().workspace, { content: '# Hinge\n', model: 'claude-sonnet-5', provider: 'anthropic' })
    expect(lines(result)[0]).toBe('The draft frontmatter (or the model and provider fields) must name the office, the model and the provider. Missing: office (US or EPO).')
  })

  it('says that no approved claims were recorded on a first save without a Working Record, and reads a numeric model', async () => {
    const { files, workspace } = memoryWorkspace(gatesOpen)
    const result = await saveDraftApplication(workspace, { content: draft().replace('model: claude-sonnet-5', 'model: 5') })
    expect(lines(result).slice(0, 3)).toEqual([
      'Saved drafting/hinge/draft-application.md (version 1, office US). Generated snapshot: drafting/hinge/draft-application.generated.md. Working record: drafting/hinge/draft-application.working-record.md.',
      'No approved claims were recorded: call start_application_draft before drafting, so the draft is tied to the approved drafting/hinge/claims.md.',
      'Findings are not checked at save. Call validate_draft next.',
    ])
    expect(files.entries.get('drafting/hinge/draft-application.md')).toMatch(/^model: "5"$/m)
  })

  it('reads a snapshot without a version number as version 1 and keeps only the files that exist', async () => {
    const { files, workspace } = memoryWorkspace({ ...gatesOpen, 'drafting/hinge/draft-application.generated.md': '---\nversion: draft\n---\n# Hinge\n' })
    const result = await saveDraftApplication(workspace, { content: draft().replace('provider: anthropic', 'provider: anthropic\nversion: 3') })
    expect(lines(result)[1]).toBe('This is version 3; the previous files are kept as drafting/hinge/draft-application.v1.generated.md.')
    expect([...files.entries.keys()].filter(path => path.includes('.v1.'))).toEqual(['drafting/hinge/draft-application.v1.generated.md'])
  })

  it('says when the claims were approved again after start_application_draft', async () => {
    const record = '# Working record\n\n## Header\n\n- **Approved claims SHA-256:** 0000\n'
    const result = await saveDraftApplication(memoryWorkspace({ ...gatesOpen, 'drafting/hinge/draft-application.working-record.md': record }).workspace, { content: draft() })
    expect(lines(result)).toContain('drafting/hinge/claims.md was approved again after start_application_draft: this draft is tied to the claims start_application_draft returned.'
      + ' Call start_application_draft, regenerate and save to draft against the current claims.')
  })
})
