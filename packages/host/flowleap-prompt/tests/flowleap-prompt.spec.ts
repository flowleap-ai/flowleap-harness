import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import * as FlowleapPrompt from '@deepseek-ai/dsh-flowleap-prompt'
import { SECTION_NAME } from '@deepseek-ai/dsh-flowleap-prompt'

const PERSONA = 'You are FlowLeap Patent AI, a patent research agent.\n\nKeep {{braces}} literal.\n'

describe('the flowleap-prompt row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flowleap-prompt-'))
  const contexts: Context[] = []

  afterEach(async () => {
    for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function harness(): Promise<Context> {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false })
    return ctx
  }

  it('registers the file content as the literal flowleap:patent-agent section and removes it on disposal', async () => {
    const path = join(dir, 'patent-agent.md')
    writeFileSync(path, PERSONA)
    const ctx = await harness()
    ctx.systemPrompt.section({ name: 'guidance', order: 100, text: 'Use {{tool}} tools.' })
    ctx.systemPrompt.variable('tool', () => 'patent')
    const fiber = await ctx.plugin(FlowleapPrompt, { path })
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.filter(section => section.name === SECTION_NAME).map(section => section.text)).toEqual([PERSONA])
    expect(renderPrompt(assembly)).toBe(`${PERSONA}\n\nUse patent tools.`)
    await fiber.dispose()
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === SECTION_NAME)).toBe(false)
  })

  it('logs an error and registers nothing when the file is missing', async () => {
    const ctx = await harness()
    const error = vi.spyOn(ctx.logger, 'error')
    await ctx.plugin(FlowleapPrompt, { path: join(dir, 'absent.md') })
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]?.[0])).toContain('absent.md')
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === SECTION_NAME)).toBe(false)
  })

  it('rejects a relative path at load', async () => {
    const ctx = await harness()
    await expect(ctx.plugin(FlowleapPrompt, { path: 'prompt/patent-agent.md' }))
      .rejects.toThrow('flowleap-prompt: path must be absolute')
  })
})
