/** Fixed product-independent JavaScript workload that measures the speed of the machine running the benchmarks. */
import { performance } from 'node:perf_hooks'
import { assertBuiltBenchmarkRuntime } from './built-worker.ts'

/** Per-repetition wall times of one probe process. */
export interface RunnerSpeedReport {
  samplesMs: number[]
}

const RECORDS = 20_000
const REPETITIONS = 15

/** Allocate, serialize, parse, index, sort and rebuild strings, the operation mix of the measured product paths. */
function workload(seed: number): number {
  const records = Array.from({ length: RECORDS }, (_, index) => ({
    id: `record-${String(seed)}-${String(index)}`,
    turn: index % 240,
    text: 'synthetic text '.repeat(1 + index % 16) + String(index * seed),
    tags: [index % 7, index % 11, index % 13],
  }))
  const parsed = JSON.parse(JSON.stringify(records)) as typeof records
  const byId = new Map(parsed.map(record => [record.id, record]))
  parsed.sort((a, b) => a.text.length - b.text.length || a.id.localeCompare(b.id))
  let checksum = 0
  for (const record of parsed) {
    checksum += byId.get(record.id)!.text.replaceAll('text', 'TEXT').split(' ').length + record.tags.reduce((sum, tag) => sum + tag, 0)
  }
  return checksum
}

assertBuiltBenchmarkRuntime(import.meta.url, {})
let checksum = 0
for (let warmup = 0; warmup < 3; warmup++) checksum += workload(warmup)
const samplesMs: number[] = []
for (let repetition = 0; repetition < REPETITIONS; repetition++) {
  const started = performance.now()
  checksum += workload(repetition)
  samplesMs.push(performance.now() - started)
}
if (checksum <= 0) throw new Error('runner speed workload produced no result')
const report: RunnerSpeedReport = { samplesMs }
console.log(JSON.stringify(report))
