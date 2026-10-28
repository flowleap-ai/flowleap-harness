/** Worker lifecycle of the file parse, with a scripted Worker. */
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'

const workers: FakeWorker[] = []
const spawn = vi.fn<() => void>()

class FakeWorker extends EventEmitter {
  readonly terminate = vi.fn(() => Promise.resolve(0))
  readonly getHeapStatistics = vi.fn(() => Promise.resolve({ used_heap_size: 10, external_memory: 10 }))
  constructor(readonly entry: URL, readonly options: { workerData: unknown; resourceLimits: unknown }) {
    super()
    spawn()
    workers.push(this)
  }
}

vi.mock('node:worker_threads', () => ({ Worker: FakeWorker }))

const { parseInWorker, workerLimits } = await import('../src/parse-thread.ts')

afterEach(() => {
  workers.length = 0
  spawn.mockReset()
})

const LIMITS = { timeoutMs: 60_000, memoryMb: 64, maxPages: 5 }

function start(signal = new AbortController().signal, limits = LIMITS) {
  const bytes = new Uint8Array([1, 2, 3])
  const result = parseInWorker({ name: 'a.pdf', bytes }, limits, signal)
  return { bytes, result, worker: workers.at(-1) as FakeWorker }
}

it('passes the file, the page limit and the heap limits, and resolves with a valid result', async () => {
  const { bytes, result, worker } = start()
  expect(worker.options.workerData).toEqual({ name: 'a.pdf', bytes, maxPages: 5 })
  expect(worker.options.resourceLimits).toEqual({ maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 })
  const text = { kind: 'text', unit: 'page', locations: [{ at: 1, text: 'A' }], count: 2, scanned: [1] }
  worker.emit('message', text)
  worker.emit('exit', 0)
  await expect(result).resolves.toEqual(text)
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(workerLimits(4)).toMatchObject({ maxYoungGenerationSizeMb: 1 })
})

it('passes a failed result through', async () => {
  const { result, worker } = start()
  worker.emit('message', { kind: 'failed', reason: 'no-text', message: 'none' })
  await expect(result).resolves.toEqual({ kind: 'failed', reason: 'no-text', message: 'none' })
})

it.each([
  null, 'text', {}, { kind: 'failed', reason: 1 }, { kind: 'failed', reason: 'x' }, { kind: 'other' },
  { kind: 'text', locations: [{ at: 'one', text: 'A' }], scanned: [], count: 1 },
  { kind: 'text', locations: [null], scanned: [], count: 1 },
  { kind: 'text', locations: [], scanned: ['0'], count: 1 },
  { kind: 'text', locations: [], scanned: [], count: '1' },
  { kind: 'text', locations: {}, scanned: [], count: 1 },
  { kind: 'text', locations: [], scanned: {}, count: 1 },
])('fails an unexpected Worker message %j as unreadable', async (value) => {
  const { result, worker } = start()
  worker.emit('message', value)
  await expect(result).resolves.toEqual({ kind: 'failed', reason: 'unreadable', message: 'the file parser reported an unexpected value' })
})

it('maps an out-of-memory Worker to too-large and any other Worker error to unreadable', async () => {
  const oom = start()
  oom.worker.emit('error', Object.assign(new Error('heap'), { code: 'ERR_WORKER_OUT_OF_MEMORY' }))
  await expect(oom.result).resolves.toEqual({ kind: 'failed', reason: 'too-large', message: 'reading the file needs more than 64 MB of memory' })
  const crash = start()
  crash.worker.emit('error', new Error('boom'))
  await expect(crash.result).resolves.toEqual({ kind: 'failed', reason: 'unreadable', message: 'boom' })
})

it('ends a Worker whose heap and external memory pass the limit, and ignores a failed sample', async () => {
  vi.useFakeTimers()
  try {
    const { result, worker } = start()
    worker.getHeapStatistics.mockImplementationOnce(() => Promise.reject(new Error('exited')))
    await vi.advanceTimersByTimeAsync(25)
    worker.getHeapStatistics.mockImplementationOnce(() => Promise.resolve({ used_heap_size: 10, external_memory: 10 }))
    await vi.advanceTimersByTimeAsync(25)
    const over = { used_heap_size: 1024 * 1024, external_memory: 63 * 1024 * 1024 + 1 }
    worker.getHeapStatistics.mockImplementationOnce(() => Promise.resolve(over))
    await vi.advanceTimersByTimeAsync(25)
    await expect(result).resolves.toEqual({ kind: 'failed', reason: 'too-large', message: 'reading the file needs more than 64 MB of memory' })
    expect(worker.getHeapStatistics).toHaveBeenCalledTimes(3)
  } finally {
    vi.useRealTimers()
  }
})

it('fails a Worker that exits without a result', async () => {
  const { result, worker } = start()
  worker.emit('exit', 1)
  await expect(result).resolves.toMatchObject({ kind: 'failed', reason: 'unreadable', message: expect.stringContaining('code 1') as string })
})

it('ends the Worker at the time limit', async () => {
  vi.useFakeTimers()
  try {
    const { result, worker } = start(undefined, { ...LIMITS, timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    await expect(result).resolves.toEqual({ kind: 'failed', reason: 'timeout', message: 'reading the file took longer than 50 ms' })
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.emit('message', { kind: 'failed', reason: 'no-text', message: 'late' })
  } finally {
    vi.useRealTimers()
  }
})

it('ends the Worker and rejects on abort, and does not start one for an aborted signal', async () => {
  const controller = new AbortController()
  const { result, worker } = start(controller.signal)
  controller.abort(new Error('closing'))
  await expect(result).rejects.toThrow('closing')
  expect(worker.terminate).toHaveBeenCalledOnce()
  await expect(parseInWorker({ name: 'a.pdf', bytes: new Uint8Array() }, LIMITS, controller.signal)).rejects.toThrow('closing')
  expect(spawn).toHaveBeenCalledOnce()
})

it('settles when termination fails', async () => {
  const { result, worker } = start()
  worker.terminate.mockImplementationOnce(() => Promise.reject(new Error('stuck')))
  worker.emit('message', { kind: 'failed', reason: 'no-text', message: 'none' })
  await expect(result).resolves.toMatchObject({ reason: 'no-text' })
})

it('fails a Worker that does not start', async () => {
  spawn.mockImplementationOnce(() => { throw new Error('no threads') })
  await expect(parseInWorker({ name: 'a.pdf', bytes: new Uint8Array() }, LIMITS, new AbortController().signal))
    .resolves.toEqual({ kind: 'failed', reason: 'unreadable', message: 'the file parser did not start: no threads' })
})
