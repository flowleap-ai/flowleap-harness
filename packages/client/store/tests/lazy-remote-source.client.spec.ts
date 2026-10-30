import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLazyRemoteSource, notifySubscribers } from '../src/index.ts'

afterEach(() => { vi.restoreAllMocks() })

/** A read whose answers the test settles one at a time. */
function scriptedRead() {
  const pending: ((value: string) => void)[] = []
  const read = vi.fn(() => new Promise<string>((resolve) => { pending.push(resolve) }))
  const settle = async (index: number, value: string): Promise<void> => {
    pending[index]!(value)
    await Promise.resolve()
    await Promise.resolve()
  }
  return { read, settle }
}

/** One invalidation channel the test fires by hand. */
function channel() {
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    fire: () => { for (const listener of listeners) listener() },
    size: () => listeners.size,
  }
}

describe('createLazyRemoteSource', () => {
  it('reads at the first observer and at each invalidation, and notifies with the new snapshot', async () => {
    const { read, settle } = scriptedRead()
    const reset = channel()
    const source = createLazyRemoteSource({ initial: 'none', read, invalidations: [reset.subscribe] })
    expect(read).not.toHaveBeenCalled()
    const seen: string[] = []
    const stop = source.subscribe(() => { seen.push(source.getSnapshot()) })
    source.subscribe(() => {})
    expect(read).toHaveBeenCalledOnce()
    expect(reset.size()).toBe(1)
    await settle(0, 'first')
    expect(seen).toEqual(['first'])
    reset.fire()
    await settle(1, 'second')
    expect(source.getSnapshot()).toBe('second')
    stop()
    stop()
    expect(reset.size()).toBe(1)
  })

  it('drops a superseded read and a read that settles after the last observer left, and keeps the snapshot', async () => {
    const { read, settle } = scriptedRead()
    const reset = channel()
    const source = createLazyRemoteSource({ initial: 'none', read, invalidations: [reset.subscribe] })
    const stop = source.subscribe(() => {})
    reset.fire()
    await settle(1, 'newer')
    await settle(0, 'older')
    expect(source.getSnapshot()).toBe('newer')
    reset.fire()
    stop()
    expect(reset.size()).toBe(0)
    await settle(2, 'late')
    expect(source.getSnapshot()).toBe('newer')
    source.subscribe(() => {})
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('logs a rejected read and keeps the snapshot', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const source = createLazyRemoteSource({ initial: 'none', read: () => Promise.reject(new Error('down')), invalidations: [] })
    source.subscribe(() => {})
    await Promise.resolve()
    await Promise.resolve()
    expect(source.getSnapshot()).toBe('none')
    expect(error).toHaveBeenCalledOnce()
  })
})

describe('notifySubscribers', () => {
  it('logs a failing subscriber and still notifies the rest', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const later = vi.fn()
    notifySubscribers([() => { throw new Error('broken') }, later], 'test', 1)
    expect(later).toHaveBeenCalledWith(1)
    expect(error).toHaveBeenCalledWith('test subscriber failed:', expect.any(Error))
  })
})
