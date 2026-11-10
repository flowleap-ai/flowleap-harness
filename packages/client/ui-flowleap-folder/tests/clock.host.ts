import type { Clock } from '../src/add-client/limiter.ts'

/** A clock that moves only when a test moves it. */
export class FakeClock implements Clock {
  private readonly timers = new Set<{ readonly at: number; readonly callback: () => void }>()

  constructor(public time = Date.parse('2026-11-09T10:00:00.000Z')) {}

  now(): number {
    return this.time
  }

  timer(ms: number, callback: () => void): () => void {
    const entry = { at: this.time + ms, callback }
    this.timers.add(entry)
    return () => { this.timers.delete(entry) }
  }

  /** The timers that wait now. */
  get waiting(): number {
    return this.timers.size
  }

  /** Move the time on and run each timer that is due, in time order, with the work that it starts. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms
    for (;;) {
      const due = [...this.timers].filter(entry => entry.at <= end).sort((a, b) => a.at - b.at)[0]
      if (due === undefined) break
      this.timers.delete(due)
      this.time = Math.max(this.time, due.at)
      due.callback()
      await settle()
    }
    this.time = end
    await settle()
  }
}

/** Let the promise jobs and the file writes that wait now run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await new Promise(resolve => setImmediate(resolve))
}
