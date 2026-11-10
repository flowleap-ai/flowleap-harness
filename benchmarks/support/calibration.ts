/** Shared conversion from reference-machine expectations to CI time budgets. */
import { inject } from 'vitest'

/** Measured wall-time ratio between the x64 CI runner and the arm64 reference machine. */
export const CI_TIME_SCALE = 2
/** Allowed variance above the calibrated expectation. */
export const PERFORMANCE_BUDGET_HEADROOM = 1.25
/** Median runner speed probe time, in milliseconds, on the EPYC 9V74 runner class that the CI time budgets fit. */
export const RUNNER_PROBE_REFERENCE_MS = 55
/** Largest runner time scale; a slower runner keeps this scale, so its time budgets still reject slow results. */
export const MAX_RUNNER_TIME_SCALE = 1.5

declare module 'vitest' {
  interface ProvidedContext {
    /** Time budget multiplier of the machine running this benchmark process, from {@link runnerTimeScale}. */
    runnerTimeScale: number
  }
}

/**
 * Convert a reference-machine duration into its CI wall-time budget.
 * @param expectedMs - Expected duration on the reference machine.
 * @returns Integer CI budget including machine scaling and variance headroom.
 */
export function ciTimeBudget(expectedMs: number): number {
  return Math.ceil(expectedMs * CI_TIME_SCALE * PERFORMANCE_BUDGET_HEADROOM)
}

/**
 * Convert a runner speed probe median into the time budget multiplier of that runner.
 * @param probeMs - Median repetition time of the runner speed probe.
 * @returns 1 on a runner as fast as the reference class or faster, the slowdown ratio on a slower runner, at most {@link MAX_RUNNER_TIME_SCALE}.
 */
export function runnerTimeScale(probeMs: number): number {
  return Math.min(MAX_RUNNER_TIME_SCALE, Math.max(1, probeMs / RUNNER_PROBE_REFERENCE_MS))
}

/**
 * Fit a CI wall-time budget to the machine running this benchmark process. Memory and ratio budgets do not use it.
 * @param budgetMs - CI wall-time budget for the reference runner class.
 * @param scale - Runner time scale; defaults to the one the benchmark global setup measured.
 * @returns Integer budget multiplied by the runner time scale.
 */
export function runnerTimeBudget(budgetMs: number, scale = inject('runnerTimeScale')): number {
  return Math.ceil(budgetMs * scale)
}
