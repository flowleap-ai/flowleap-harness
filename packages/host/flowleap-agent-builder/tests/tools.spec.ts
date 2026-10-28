import { describe, expect, it } from 'vitest'
import { readAgentFileTool, renderHits, renderRead, searchAgentFilesTool, type AgentFileReader } from '../src/index.ts'

const reader: AgentFileReader = {
  search: query => query === 'none' ? [] : [{ file: 'guide.docx', at: 4, unit: 'paragraph', passage: 'Use active voice.' }],
  read: (file, from, to) => file === 'guide.docx'
    ? { rows: Array.from({ length: to - from + 1 }, (_, index) => ({ file, at: from + index, unit: 'paragraph' as const, text: `P${String(from + index)}` })), total: 40 }
    : undefined,
}
const exec = {} as never

describe('agent file tools', () => {
  it('answers a search with numbered passages that name the file and the location', async () => {
    const tool = searchAgentFilesTool(reader)
    expect(await tool.execute({ query: 'voice' }, exec)).toBe('1 passage for "voice" (cite the file and the page or paragraph):\n\n[1] guide.docx, paragraph 4\nUse active voice.')
    expect(await tool.execute({ query: 'none' }, exec)).toContain('No passage in the agent files matches "none"')
    await expect(tool.execute({ query: '' }, exec)).rejects.toThrow('search_agent_files: invalid arguments: query')
    expect(tool.output.render({}, 'text')).toEqual([{ type: 'text', text: 'text' }])
    expect(tool.output.render({}, { a: 1 })).toEqual([{ type: 'text', text: '{"a":1}' }])
    expect(tool.presentCall?.({ query: 'voice' })).toMatchObject({ kind: 'search', title: 'Search agent files: voice' })
    expect(tool.presentCall?.(null)).toMatchObject({ title: 'Search agent files: ' })
    expect(tool.isConcurrencySafe?.({})).toBe(true)
  })

  it('reads at most the bounded number of locations and refuses an unknown file', async () => {
    const tool = readAgentFileTool(reader, 2)
    expect(await tool.execute({ file: 'guide.docx', page: 3, to: 9 }, exec)).toBe('guide.docx: 40 paragraphs with text.\n\n=== guide.docx | paragraph 3 ===\nP3\n\n=== guide.docx | paragraph 4 ===\nP4')
    expect(await tool.execute({ file: 'guide.docx', page: 5, to: 1 }, exec)).toContain('paragraph 5 ===\nP5')
    await expect(tool.execute({ file: 'x.pdf', page: 1 }, exec)).rejects.toThrow('no indexed file is named "x.pdf"')
    await expect(tool.execute({ file: 'guide.docx', page: 0 }, exec)).rejects.toThrow('invalid arguments: page')
    expect(tool.output.render({}, 'text')).toEqual([{ type: 'text', text: 'text' }])
    expect(tool.output.render({}, 1)).toEqual([{ type: 'text', text: '1' }])
    expect(tool.presentCall?.({ file: 'guide.docx' })).toMatchObject({ kind: 'read', title: 'Read agent file: guide.docx' })
    expect(tool.presentCall?.(undefined)).toMatchObject({ title: 'Read agent file: ' })
    expect(tool.isConcurrencySafe?.({})).toBe(true)
  })

  it('renders empty results', () => {
    expect(renderHits('q', [])).toContain('No passage')
    expect(renderRead('a.pdf', [], 3)).toBe('a.pdf has no text in that range; it has 3 indexed locations.')
  })
})
