import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, imageInputRefusal, imageInputSupport } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'

class Catalog extends LlmAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    if (model === 'broken') return Promise.reject(new Error('catalog down'))
    const info: LlmResolvedModelInfo = { provider, id: model, name: model }
    if (model === 'vision') info.inputModalities = ['text', 'image']
    if (model === 'text') info.inputModalities = ['text']
    return Promise.resolve(info)
  }

  stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('never streams')
  }
}

async function runtime(): Promise<LlmRuntime> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  ctx.llm.registerAdapter(['catalog'], new Catalog())
  return ctx.llm
}

describe('imageInputSupport', () => {
  it('declares image input only for a resolved route that lists the image modality', async () => {
    const llm = await runtime()
    const declared = await imageInputSupport(llm, 'catalog', 'vision')
    expect(declared.kind === 'declared' && [declared.llm === llm, declared.provider, declared.model, declared.info.inputModalities]).toEqual([true, 'catalog', 'vision', ['text', 'image']])
    expect(await imageInputSupport(llm, 'catalog', 'text')).toEqual({ kind: 'absent', model: 'text' })
    expect(await imageInputSupport(llm, 'catalog', 'legacy')).toEqual({ kind: 'absent', model: 'legacy' })
  })

  it('reports a missing runtime or route as unresolved and an adapter failure as unverified', async () => {
    const llm = await runtime()
    expect(await imageInputSupport(undefined, 'catalog', 'vision')).toEqual({ kind: 'unresolved' })
    expect(await imageInputSupport(llm, undefined, 'vision')).toEqual({ kind: 'unresolved' })
    expect(await imageInputSupport(llm, 'catalog', undefined)).toEqual({ kind: 'unresolved' })
    expect(await imageInputSupport(llm, 'catalog', 'broken')).toEqual({ kind: 'unverified', error: new Error('catalog down') })
  })

  it('words each refusal', () => {
    expect(imageInputRefusal({ kind: 'unresolved' })).toBe('the current model route could not be resolved')
    expect(imageInputRefusal({ kind: 'unverified', error: new Error('x') })).toBe('the current model route could not be verified')
    expect(imageInputRefusal({ kind: 'absent', model: 'text' })).toBe('model "text" does not declare image input')
  })
})
