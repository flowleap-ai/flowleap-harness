import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPARE_CLAIMS_NAME } from '@deepseek-ai/dsh-flowleap-connectors'
import { deniedTool } from '../src/index.ts'
import { agentOn, callTool, chunks, makePdf, mountBuilder, ocrDouble, runtime, tempDir } from './harness.ts'

const INPUT = {
  name: 'Office action responder',
  description: 'Drafts responses to office actions.',
  connectors: ['epo-ops'] as const,
}

describe('agent presets', () => {
  it('registers a preset for a new agent with its instructions and the chosen connectors only', async () => {
    const ctx = await runtime({ tools: ['get_bibliography', 'get_us_application', 'mcp__flowleap__patstat_query', 'search_academic', 'ocr'] })
    const root = await tempDir('dsh-agents-')
    await mountBuilder(ctx, { root })
    const view = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT, connectors: ['epo-ops'] }, 'Answer in the house style.')
    expect(view).toMatchObject({ name: INPUT.name, readOnly: false, mode: 'context', files: [] })
    const roster = await ctx.agentPresets.list()
    expect(roster.map(row => ({ id: row.id, broken: row.broken }))).toEqual([{ id: 'patent' }, { id: view.id }])
    const agent = await agentOn(ctx, 's1', view.id)
    const prompt = await ctx.systemPrompt.assemble({ scope: agent })
    expect(prompt.sections.find(section => section.name === 'flowleap:agent-instructions')?.text).toContain('Answer in the house style.')
    const names = ctx.tools.schemas(agent).map(schema => schema.name).sort()
    expect(names).toEqual(['get_bibliography', 'ocr'])
    expect(await readFile(join(root, view.id, 'agent.yaml'), 'utf8')).toBe('name: Office action responder\ndescription: Drafts responses to office actions.\nconnectors:\n  - epo-ops\n')
  })
})

describe('connector restriction', () => {
  it('denies compare_claims only when neither patent office connector is chosen', () => {
    expect(deniedTool([])(COMPARE_CLAIMS_NAME)).toBe(true)
    expect(deniedTool(['uspto-odp'])(COMPARE_CLAIMS_NAME)).toBe(false)
    expect(deniedTool(['epo-ops'])(COMPARE_CLAIMS_NAME)).toBe(false)
    expect(deniedTool([])('read_file')).toBe(false)
  })

  it('hides a connector tool that registers after the preset, and the executor refuses it', async () => {
    const ctx = await runtime({ tools: ['get_bibliography'] })
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const view = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT, connectors: ['uspto-odp'] }, 'Work.')
    const agent = await agentOn(ctx, 's1', view.id)
    const { stubTool } = await import('./harness.ts')
    ctx.tools.register(stubTool('mcp__flowleap__patstat_query'))
    expect(ctx.tools.schemas(agent).map(schema => schema.name)).toEqual([])
    expect(await callTool(ctx, agent, 'get_bibliography', {})).toMatchObject({ isError: true })
    expect(await callTool(ctx, agent, 'mcp__flowleap__patstat_query', {})).toMatchObject({ isError: true })
    const other = await agentOn(ctx, 's2', 'patent')
    expect(await callTool(ctx, other, 'get_bibliography', {})).toMatchObject({ isError: false, value: 'get_bibliography ran' })
  })
})

describe('files', () => {
  it('reads a text-layer PDF from its text layer and a scanned page through OCR, once per content', async () => {
    const ocr = ocrDouble(() => ({ kind: 'read', pages: [{ page: 1, text: 'Scanned: the applicant replied in time.' }] }))
    const ctx = await runtime({ ocr })
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    const pdf = makePdf([['Inventive step objections need a problem-solution answer.'], null])
    const row = await ctx.flowleapAgentCatalog.upload(id, 'Playbook.pdf', chunks(pdf))
    expect(row.state).toEqual({ kind: 'indexing' })
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files).toEqual([{ name: 'Playbook.pdf', bytes: pdf.byteLength, state: { kind: 'indexed' }, locations: 2, unit: 'page' }])
    expect(ocr.pages).toHaveBeenCalledTimes(1)
    await ctx.flowleapAgentCatalog.upload(id, 'Playbook.pdf', chunks(pdf))
    await ctx.flowleapAgentCatalog.settled()
    expect(ocr.pages).toHaveBeenCalledTimes(1)
    expect(ctx.flowleapAgentCatalog.search(id, 'applicant replied', 8)).toEqual([
      { file: 'Playbook.pdf', at: 2, unit: 'page', passage: 'Scanned: the applicant replied in time.' },
    ])
    expect(ctx.flowleapAgentCatalog.readFile(id, 'Playbook.pdf', 1, 1)).toEqual({
      rows: [{ file: 'Playbook.pdf', at: 1, unit: 'page', text: 'Inventive step objections need a problem-solution answer.' }], total: 2,
    })
  })

  it('fails a scanned PDF without OCR, and refuses a file type and an oversized body', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), maxFileBytes: 10 })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'scan.pdf', chunks(makePdf([null]).slice(0, 10)))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files[0]!.state).toMatchObject({ kind: 'failed', reason: 'unreadable' })
    await expect(ctx.flowleapAgentCatalog.upload(id, 'big.txt', chunks('0123456789', 'x'))).rejects.toMatchObject({ code: 'flowleap-agents/invalid' })
    await expect(ctx.flowleapAgentCatalog.upload(id, 'tool.exe', chunks('x'))).rejects.toMatchObject({ code: 'flowleap-agents/invalid' })
    await expect(ctx.flowleapAgentCatalog.upload(id, '../escape.txt', chunks('x'))).rejects.toMatchObject({ code: 'flowleap-agents/invalid' })
    expect(ctx.flowleapAgentCatalog.read(id).files.map(file => file.name)).toEqual(['scan.pdf'])
  })

  it('answers ocr-unavailable for a PDF without a text layer and no OCR key', async () => {
    const ctx = await runtime({ ocr: ocrDouble(() => ({ kind: 'not-configured' })) })
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-') })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'scan.pdf', chunks(makePdf([null])))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files[0]!.state).toMatchObject({ kind: 'failed', reason: 'ocr-unavailable' })
  })

  it('counts CJK text at the configured characters per token for the mode switch', async () => {
    const text = '発明の進歩性について審査官に回答する'
    expect(text).toHaveLength(18)
    const modes: string[] = []
    for (const charsPerToken of [4, 1]) {
      const ctx = await runtime()
      await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), contextLimitTokens: 10, charsPerToken })
      const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
      await ctx.flowleapAgentCatalog.upload(id, 'ja.txt', chunks(text))
      await ctx.flowleapAgentCatalog.settled()
      modes.push(ctx.flowleapAgentCatalog.read(id).mode)
    }
    expect(modes).toEqual(['context', 'search'])
  })

  it('replaces a file whose name differs only in case, on disk and in the index', async () => {
    const ctx = await runtime()
    const root = await tempDir('dsh-agents-')
    await mountBuilder(ctx, { root })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'Notes.txt', chunks('old text'))
    await ctx.flowleapAgentCatalog.settled()
    await ctx.flowleapAgentCatalog.upload(id, 'notes.TXT', chunks('new text'))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).files.map(file => file.name)).toEqual(['notes.TXT'])
    expect(await readdir(join(root, id, 'files'))).toEqual(['notes.TXT'])
    expect(ctx.flowleapAgentCatalog.search(id, 'text', 8)).toEqual([{ file: 'notes.TXT', at: 1, unit: 'page', passage: 'new text' }])
  })

  it('switches to the search mode above the limit and gives the search and read tools', async () => {
    const ctx = await runtime()
    await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), contextLimitTokens: 5 })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'a.txt', chunks('0123456789abcdefghij'))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).mode).toBe('context')
    const contextAgent = await agentOn(ctx, 'c1', id)
    expect(ctx.tools.schemas(contextAgent).map(schema => schema.name)).toEqual([])
    const contextPrompt = await ctx.systemPrompt.assemble({ scope: contextAgent })
    expect(contextPrompt.sections.find(section => section.name === 'flowleap:agent-files')?.text).toContain('=== a.txt | page 1 ===\n0123456789abcdefghij')
    await ctx.flowleapAgentCatalog.upload(id, 'b.md', chunks('x'))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.flowleapAgentCatalog.read(id).mode).toBe('search')
    const searchAgent = await agentOn(ctx, 'c2', id)
    expect(ctx.tools.schemas(searchAgent).map(schema => schema.name).sort()).toEqual(['read_agent_file', 'search_agent_files'])
    expect(await callTool(ctx, searchAgent, 'search_agent_files', { query: '0123456789abcdefghij' })).toMatchObject({
      isError: false, value: expect.stringContaining('<<<agent-files>>>\n=== a.txt | page 1 ===') as string,
    })
    expect(ctx.tools.schemas(contextAgent).map(schema => schema.name)).toEqual([])
  })

  it('removes a file and deletes an agent with its preset and folder', async () => {
    const ctx = await runtime()
    const root = await tempDir('dsh-agents-')
    await mountBuilder(ctx, { root })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'a.txt', chunks('alpha'))
    await ctx.flowleapAgentCatalog.settled()
    await ctx.flowleapAgentCatalog.removeFile(id, 'a.txt')
    expect(ctx.flowleapAgentCatalog.read(id).files).toEqual([])
    await ctx.flowleapAgentCatalog.delete(id)
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent'])
    await expect(readFile(join(root, id, 'agent.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(() => ctx.flowleapAgentCatalog.read(id)).toThrow(expect.objectContaining({ code: 'flowleap-agents/not-found' }))
  })
})

describe('folders', () => {
  it('loads firm agents read only, keeps their index outside the firm folder, and reads each file once across restarts', async () => {
    const root = await tempDir('dsh-agents-')
    const firmRoot = await tempDir('dsh-firm-')
    await mkdir(join(firmRoot, 'firm-style-guide', 'files'), { recursive: true })
    await writeFile(join(firmRoot, 'firm-style-guide', 'agent.yaml'), 'name: Firm style\ndescription: House style.\nconnectors: []\n')
    await writeFile(join(firmRoot, 'firm-style-guide', 'instructions.md'), 'Use the house style.')
    await writeFile(join(firmRoot, 'firm-style-guide', 'files', 'guide.txt'), 'Short sentences.')
    await mkdir(join(firmRoot, 'Bad Folder'))
    await mkdir(join(firmRoot, 'broken'))
    await writeFile(join(firmRoot, 'broken', 'agent.yaml'), 'name: Broken\napiKey: secret\n')
    const ocr = ocrDouble(() => ({ kind: 'not-configured' }))
    const first = await runtime({ ocr })
    const fiber = await mountBuilder(first, { root, firmRoot })
    expect(first.flowleapAgentCatalog.list()).toEqual([{ id: 'firm-style-guide', name: 'Firm style', description: 'House style.', readOnly: true }])
    expect(first.flowleapAgentCatalog.read('firm-style-guide' as never).files[0]!.state).toEqual({ kind: 'indexed' })
    await expect(first.flowleapAgentCatalog.save('firm-style-guide' as never, { ...INPUT }, 'x')).rejects.toMatchObject({ code: 'flowleap-agents/read-only' })
    await expect(readFile(join(firmRoot, 'firm-style-guide', 'index.sqlite'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(root, '.firm', 'firm-style-guide', 'index.sqlite'))).toBeDefined()
    await fiber.dispose()
    const second = await runtime({ ocr })
    await mountBuilder(second, { root, firmRoot })
    expect(second.flowleapAgentCatalog.read('firm-style-guide' as never).files[0]!.state).toEqual({ kind: 'indexed' })
  })

  it('removes the presets and their tools when the plugin is disposed', async () => {
    const ctx = await runtime()
    const fiber = await mountBuilder(ctx, { root: await tempDir('dsh-agents-'), contextLimitTokens: 0 })
    const { id } = await ctx.flowleapAgentCatalog.save(undefined, { ...INPUT }, 'Work.')
    await ctx.flowleapAgentCatalog.upload(id, 'a.txt', chunks('alpha'))
    await ctx.flowleapAgentCatalog.settled()
    expect(ctx.agentPresets.inspectCompositions().map(row => row.id)).toEqual(['patent', id])
    await fiber.dispose()
    expect((await ctx.agentPresets.list()).map(row => row.id)).toEqual(['patent'])
    expect(ctx.agentPresets.inspectCompositions().map(row => row.id)).toEqual(['patent'])
    expect(ctx.tools.definitions().map(definition => definition.name)).toEqual([])
  })
})
