import { describe, expect, it } from 'vitest'
import { readBoundedText } from '../src/bounded-body.ts'

describe('readBoundedText', () => {
  it('reads a body within the limit, and an absent body as empty text', async () => {
    expect(await readBoundedText(new Response('{"a":1}'), 16)).toBe('{"a":1}')
    expect(await readBoundedText(new Response(null, { status: 204 }), 16)).toBe('')
  })

  it('stops at the first chunk that takes the body over the limit', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(10))
      },
    })
    expect(await readBoundedText(new Response(stream), 25)).toBeUndefined()
    expect(pulled).toBeLessThanOrEqual(4)
  })
})
