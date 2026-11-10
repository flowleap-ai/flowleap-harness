import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestLimiter, limitedPatentData, sleep, systemClock } from '../src/add-client/limiter.ts'
import { FakeClock, settle } from './clock.host.ts'
import { FakePatentData, app, pub } from './patent-data.host.ts'

afterEach(() => {
  vi.useRealTimers()
})

/** The times, in seconds after the start, at which each of a list of turns came. */
function turns(clock: FakeClock, limiter: RequestLimiter, requests: readonly number[]): number[] {
  const start = clock.now()
  const times: number[] = []
  for (const count of requests) void limiter.acquire(count).then(() => { times.push((clock.now() - start) / 1000) })
  return times
}

describe('the request limiter', () => {
  it('gives at most the configured requests in any minute, in the order they were asked', async () => {
    const clock = new FakeClock()
    const limiter = new RequestLimiter(3, clock)
    const times = turns(clock, limiter, [1, 1, 1, 2, 2])
    await settle()
    expect(times).toEqual([0, 0, 0])
    await clock.advance(59_999)
    expect(times).toEqual([0, 0, 0])
    await clock.advance(1)
    expect(times).toEqual([0, 0, 0, 60])
    await clock.advance(60_000)
    expect(times).toEqual([0, 0, 0, 60, 120])
  })

  it('gives a call of more requests than a minute allows a whole minute', async () => {
    const clock = new FakeClock()
    const limiter = new RequestLimiter(2, clock)
    const times = turns(clock, limiter, [5, 1])
    await clock.advance(0)
    expect(times).toEqual([0])
    await clock.advance(60_000)
    expect(times).toEqual([0, 60])
  })

  it('passes the turn of a stopped wait to the next caller', async () => {
    const clock = new FakeClock()
    const limiter = new RequestLimiter(1, clock)
    await limiter.acquire(1)
    const stop = new AbortController()
    const stopped = limiter.acquire(1, stop.signal)
    const next = limiter.acquire(1)
    stop.abort(new Error('the page closed'))
    await expect(stopped).rejects.toThrow('the page closed')
    await clock.advance(60_000)
    await expect(next).resolves.toBeUndefined()
  })

  it('reads through the Service after the turn of each read, with the most requests of each read', async () => {
    const clock = new FakeClock()
    const limiter = new RequestLimiter(100, clock)
    const asked: number[] = []
    const acquire = limiter.acquire.bind(limiter)
    limiter.acquire = (requests, signal) => { asked.push(requests); return acquire(requests, signal) }
    const data = limitedPatentData(new FakePatentData([]), limiter)
    await data.findApplicantNames('Syntegon', { maxRows: 500 })
    await data.findApplicantNames('Syntegon', { maxRows: 0 })
    await data.searchRegister('pa="Syntegon"', { begin: 1, end: 100 })
    await data.registerRecord(app('EP23171862'))
    expect(await data.family(app('EP23171862'))).toEqual({ priorities: [], publications: [] })
    expect(await data.publication(pub('EP4292805'))).toEqual({ publicationNumber: 'EP4292805' })
    expect(asked).toEqual([5, 1, 1, 1, 2, 6])
  })
})

describe('the clocks', () => {
  it('waits on the system clock, also longer than one timeout allows, and cancels a wait', async () => {
    vi.useFakeTimers()
    const fired: string[] = []
    systemClock.timer(2 ** 31 + 5, () => { fired.push('long') })
    const cancel = systemClock.timer(10, () => { fired.push('cancelled') })
    cancel()
    await vi.advanceTimersByTimeAsync(2 ** 31 - 1)
    expect(fired).toEqual([])
    await vi.advanceTimersByTimeAsync(6)
    expect(fired).toEqual(['long'])
    expect(systemClock.now()).toBe(Date.now())
  })

  it('stops a sleep that its signal stops, before or while it waits', async () => {
    const clock = new FakeClock()
    await expect(sleep(clock, 10, AbortSignal.abort(new Error('before')))).rejects.toThrow('before')
    const stop = new AbortController()
    const waiting = sleep(clock, 10, stop.signal)
    stop.abort(new Error('while'))
    await expect(waiting).rejects.toThrow('while')
    expect(clock.waiting).toBe(0)
    const plain = sleep(clock, 10)
    await clock.advance(10)
    await expect(plain).resolves.toBeUndefined()
  })
})
