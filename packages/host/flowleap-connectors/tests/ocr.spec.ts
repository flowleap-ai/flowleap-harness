import { Context } from '@deepseek-ai/cordis'
import { createConnectors } from '@flowleap/connectors'
import { describe, expect, it, vi } from 'vitest'
import { FlowleapOcr, createConnectorHost, createCredentialStore } from '@deepseek-ai/dsh-flowleap-connectors'
import { MemoryCredentials } from './memory-credentials.ts'

const OCR_ANSWER = {
  model: 'mistral-ocr-latest',
  pages: [
    { index: 0, markdown: 'Scanned page one.', images: [] },
    { index: 1, markdown: 'Scanned page two.', images: [] },
  ],
}

async function bench(answer: () => Promise<Response>) {
  const ctx = new Context()
  const store = createCredentialStore(new MemoryCredentials(ctx))
  const fetchSpy = vi.fn<typeof fetch>(answer)
  const bound = createConnectorHost({ store, logger: ctx.logger, cacheEntries: 10, fetch: fetchSpy })
  await ctx.plugin(FlowleapOcr, { connectors: createConnectors(bound.host), bound })
  return { ctx, store, fetchSpy }
}

describe('the flowleapOcr service', () => {
  it('returns the page text of one document on the stored Mistral key', async () => {
    const { ctx, store } = await bench(() => Promise.resolve(Response.json(OCR_ANSWER)))
    await store.write('mistral', { apiKey: 'mk' })
    expect(await ctx.flowleapOcr.pages(new Uint8Array([1, 2, 3]), 'scan.pdf')).toEqual({
      kind: 'read', pages: [{ page: 1, text: 'Scanned page one.' }, { page: 2, text: 'Scanned page two.' }],
    })
  })

  it('answers not-configured without a key and makes no call', async () => {
    const { ctx, fetchSpy } = await bench(() => Promise.reject(new Error('no network in this spec')))
    expect(await ctx.flowleapOcr.pages(new Uint8Array([1]), 'scan.pdf')).toEqual({ kind: 'not-configured' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('answers not-configured when Mistral refuses the key', async () => {
    const { ctx, store } = await bench(() => Promise.resolve(new Response('Unauthorized', { status: 401 })))
    await store.write('mistral', { apiKey: 'stale' })
    expect(await ctx.flowleapOcr.pages(new Uint8Array([1]), 'scan.pdf')).toEqual({ kind: 'not-configured' })
  })

  it('throws another upstream failure', async () => {
    const { ctx, store } = await bench(() => Promise.resolve(new Response('bad', { status: 500 })))
    await store.write('mistral', { apiKey: 'mk' })
    await expect(ctx.flowleapOcr.pages(new Uint8Array([1]), 'scan.pdf')).rejects.toThrow()
  })
})
