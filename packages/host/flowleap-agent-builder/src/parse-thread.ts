/**
 * Runs the parse step of one file in a fresh Worker Thread with memory limits and a wall-clock limit, so a hostile
 * file (a zip bomb, a PDF with a huge page count) cannot stall or crash the Host. The V8 heap limits do not count
 * array buffers and external strings, where inflated ZIP and PDF streams live, so the Host also samples the Worker's
 * heap and external memory and ends the Worker when their sum passes the limit.
 * @module
 */

import { Worker, type ResourceLimits, type WorkerOptions } from 'node:worker_threads'
import type { ParseRequest, ParseResult } from './parse.ts'

/** The limits of one parse. */
export interface ParseLimits {
  /** Wall-clock limit of one parse, Worker start included, in milliseconds. */
  readonly timeoutMs: number
  /** V8 heap limit of the Worker, in MB. */
  readonly memoryMb: number
  /** Most pages a PDF may have. */
  readonly maxPages: number
}

/**
 * How often the Host samples the Worker memory. A Worker can pass the limit by what it allocates in one period before
 * the sample sees it; inflation allocates in chunks, so the overshoot stays a fraction of the limit.
 */
const MEMORY_SAMPLE_MS = 25

function workerSpawn(): { readonly entry: URL; readonly options: WorkerOptions } {
  /* v8 ignore next -- built-artifact runs own the bundled path. */
  if (!import.meta.url.endsWith('.ts')) return { entry: new URL('./worker.cjs', import.meta.url), options: { execArgv: [] } }
  const bootstrap = [
    `import { register as registerEsm } from ${JSON.stringify(import.meta.resolve('tsx/esm/api'))}`,
    `import { register as registerCjs } from ${JSON.stringify(import.meta.resolve('tsx/cjs/api'))}`,
    'registerCjs()',
    'registerEsm()',
    `await import(${JSON.stringify(new URL('./worker.ts', import.meta.url).href)})`,
  ].join('\n')
  return { entry: new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`), options: { execArgv: [] } }
}

/**
 * The Worker heap limits: the old generation gets the limit, the young generation one eighth of it, and the stack the
 * V8 default of 4 MB, so deep recursion fails as a stack overflow inside the Worker.
 * @param memoryMb - the limit.
 * @returns the resource limits.
 */
export function workerLimits(memoryMb: number): ResourceLimits {
  return { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: Math.max(1, Math.ceil(memoryMb / 8)), stackSizeMb: 4 }
}

function isLocation(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && 'at' in value && typeof value.at === 'number' && 'text' in value && typeof value.text === 'string'
}

/** Whether a Worker message is a parse result. */
function isResult(value: unknown): value is ParseResult {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false
  if (value.kind === 'failed') return 'reason' in value && typeof value.reason === 'string' && 'message' in value && typeof value.message === 'string'
  return value.kind === 'text'
    && 'locations' in value && Array.isArray(value.locations) && value.locations.every(isLocation)
    && 'scanned' in value && Array.isArray(value.scanned) && value.scanned.every(index => typeof index === 'number')
    && 'count' in value && typeof value.count === 'number'
}

/**
 * Parse one file in a fresh Worker. The Worker receives a copy of the bytes. Over the time limit, or when the Worker
 * runs out of heap or its heap and external memory pass `memoryMb`, the Worker ends and the file fails with `timeout`
 * or `too-large`; any other Worker failure is `unreadable`.
 * @param request - the file name and content.
 * @param limits - the time, memory and page limits.
 * @param signal - ends the Worker and rejects with the signal's reason.
 * @returns the Worker's result, or the typed failure; a Worker that does not start is `unreadable`.
 * @throws the abort reason, and only it.
 */
export async function parseInWorker(
  request: Omit<ParseRequest, 'maxPages'>, limits: ParseLimits, signal: AbortSignal,
): Promise<ParseResult> {
  signal.throwIfAborted()
  const { entry, options } = workerSpawn()
  const workerData: ParseRequest = { name: request.name, bytes: request.bytes, maxPages: limits.maxPages }
  let worker: Worker
  try {
    worker = new Worker(entry, { ...options, workerData, resourceLimits: workerLimits(limits.memoryMb) })
  } catch (error) {
    /* v8 ignore next -- the Worker constructor throws Error objects only */
    return { kind: 'failed', reason: 'unreadable', message: `the file parser did not start: ${error instanceof Error ? error.message : String(error)}` }
  }
  return await new Promise((resolve, reject) => {
    let settled = false
    const settle = (finish: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(sampler)
      signal.removeEventListener('abort', abort)
      // The outcome stands whether or not termination succeeds.
      void worker.terminate().then(finish, finish)
    }
    const fail = (reason: 'too-large' | 'timeout' | 'unreadable', message: string): void => {
      settle(() => { resolve({ kind: 'failed', reason, message }) })
    }
    const abort = (): void => { settle(() => { reject(signal.reason as Error) }) }
    const tooLarge = (): void => { fail('too-large', `reading the file needs more than ${String(limits.memoryMb)} MB of memory`) }
    const timer = setTimeout(() => { fail('timeout', `reading the file took longer than ${String(limits.timeoutMs)} ms`) }, limits.timeoutMs)
    const sampler = setInterval(() => {
      // A Worker that has exited rejects the sample; its 'exit' or 'error' event settles the parse.
      worker.getHeapStatistics().then((heap) => {
        if (heap.used_heap_size + heap.external_memory > limits.memoryMb * 1024 * 1024) tooLarge()
      }, () => undefined)
    }, MEMORY_SAMPLE_MS)
    signal.addEventListener('abort', abort, { once: true })
    worker.once('message', (value: unknown) => {
      if (isResult(value)) settle(() => { resolve(value) })
      else fail('unreadable', 'the file parser reported an unexpected value')
    })
    worker.once('error', (error: Error & { code?: unknown }) => {
      if (error.code === 'ERR_WORKER_OUT_OF_MEMORY') tooLarge()
      else fail('unreadable', error.message)
    })
    worker.once('exit', (code) => { fail('unreadable', `the file parser stopped before it reported a result (code ${String(code)})`) })
  })
}
