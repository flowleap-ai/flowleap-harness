import { describe, expect, it } from 'vitest'
import { agentMode, estimateTokens, fileNameProblem, ftsExpression, isAgentId, newAgentId, parseAgentYaml, renderAgentYaml } from '../src/index.ts'

describe('agent.yaml', () => {
  it('round-trips the three fields', () => {
    const definition = { name: 'Responder', description: 'Drafts.', connectors: ['epo-ops', 'flowleap'] as const }
    expect(parseAgentYaml(renderAgentYaml({ ...definition, connectors: [...definition.connectors] }))).toEqual(definition)
  })

  it('rejects an unknown key, so a definition holds no key and no code', () => {
    expect(() => parseAgentYaml('name: A\napiKey: sk-123\n')).toThrow(/Unrecognized key/)
    expect(() => parseAgentYaml('name: A\nplugins: [{ name: x }]\n')).toThrow(/Unrecognized key/)
  })

  it('rejects an unknown or repeated connector and an empty name', () => {
    expect(() => parseAgentYaml('name: A\nconnectors: [mistral]\n')).toThrow(/connectors\.0/)
    expect(() => parseAgentYaml('name: A\nconnectors: [epo-ops, epo-ops]\n')).toThrow(/repeat/)
    expect(() => parseAgentYaml('name: "  "\n')).toThrow(/name/)
  })
})

describe('ids and file names', () => {
  it('makes an id from a slug and a random suffix', () => {
    expect(newAgentId('Office Action — Responder!')).toMatch(/^office-action-responder-[0-9a-f]{6}$/)
    expect(newAgentId('審査')).toMatch(/^agent-[0-9a-f]{6}$/)
    expect(isAgentId('office-action-responder-a1b2c3')).toBe(true)
    expect(isAgentId('../etc')).toBe(false)
  })

  it('accepts only plain names of the four file types', () => {
    expect(fileNameProblem('Playbook 2025.PDF')).toBeUndefined()
    expect(fileNameProblem('notes.md')).toBeUndefined()
    expect(fileNameProblem('a/b.pdf')).toBe('path')
    expect(fileNameProblem('..\\b.pdf')).toBe('path')
    expect(fileNameProblem('.hidden.txt')).toBe('path')
    expect(fileNameProblem('run.sh')).toBe('type')
    expect(fileNameProblem(' ')).toBe('empty')
  })
})

describe('mode', () => {
  it('estimates ceil(chars / 4) tokens and keeps the context mode at the exact limit', () => {
    expect(estimateTokens(0)).toBe(0)
    expect(estimateTokens(5)).toBe(2)
    expect(agentMode(40, 10)).toBe('context')
    expect(agentMode(41, 10)).toBe('search')
  })

  it('quotes each query word as data', () => {
    expect(ftsExpression('Claim "1" OR NEAR(x)')).toBe('"claim" OR "1" OR "or" OR "near" OR "x"')
    expect(ftsExpression('—')).toBeUndefined()
  })
})
