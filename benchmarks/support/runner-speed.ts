/**
 * Vitest global setup that measures the speed of the machine running the benchmarks. A fresh plain-Node
 * child runs the product-independent workload of `runner-speed.worker.ts`; the median repetition time sets
 * the `runnerTimeScale` that `runnerTimeBudget` in `calibration.ts` applies to wall-time budgets.
 */
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'
import { runBuiltBenchmarkWorker } from './built-worker.ts'
import { RUNNER_PROBE_REFERENCE_MS, runnerTimeScale } from './calibration.ts'
import type { RunnerSpeedReport } from './runner-speed.worker.ts'

/**
 * Measure the runner and provide its time scale to benchmark files.
 * @param project - Vitest project that receives the provided value.
 * @throws If the probe child fails or omits its report.
 */
export default async function setup(project: TestProject): Promise<void> {
  const run = await runBuiltBenchmarkWorker<RunnerSpeedReport>({
    worker: join(import.meta.dirname, '../.dsh-build/support/runner-speed.worker.js'),
    timeoutMs: 60_000,
  })
  if (run.report === undefined) {
    throw new Error(`runner speed probe failed: exit ${String(run.exitCode)}, signal ${String(run.signal)}, timed out ${String(run.timedOut)}\n${run.stderr}`)
  }
  const samples = run.report.samplesMs.toSorted((a, b) => a - b)
  const probeMs = samples[Math.floor(samples.length / 2)]!
  const scale = runnerTimeScale(probeMs)
  console.log(JSON.stringify({ benchmark: 'runner-speed', samplesMs: run.report.samplesMs, probeMs, referenceMs: RUNNER_PROBE_REFERENCE_MS, runnerTimeScale: scale }))
  project.provide('runnerTimeScale', scale)
}
