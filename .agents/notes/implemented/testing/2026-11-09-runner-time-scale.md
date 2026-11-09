# Agent Note: Runner time scale and held reply overlap

Status: implemented

## Problem

The `node 24 / benchmarks` job of the fork runs on the free public `ubuntu-24.04` pool. That pool assigns runners with different CPUs. Across 103 finished benchmark jobs of PR runs from 2026-11-05 to 2026-11-09, the CPU decided the verdict: EPYC 7763 runners failed 37 of 37 jobs, EPYC 9V45 runners passed 31 of 31, EPYC 9V74 runners passed 21 of 28, and Intel Xeon runners passed 3 of 7. Docs-only PRs failed in the same way, and the fork does not change the fold, Session-list, or terminal code that the failing cases time.

Each job's slowdown, the median over 71 common timing endpoints of the ratio to the EPYC 9V45 median, predicts its verdict. Passing jobs measure 0.93 to 1.36, and every job at 1.45 or more fails. EPYC 7763 jobs measure 1.63 to 1.77. Within one CPU class the endpoints are tight: the 16,384-delta reasoning fold has a 79.2 to 91.6 ms range on EPYC 7763 against its 80 ms budget. The cause is the runner speed, not measurement noise and not a product regression.

The browser case has a second fault. Its overlap assertion requires a trusted keystroke while the paced reply is still open, but the replay runs a fixed 1,984 ms after its first chunk. On passing runs, the reply text first shows about 870 ms before the stream ends. On EPYC 7763 runners, it first shows together with the DONE marker in all 35 samples, so the keystroke cannot overlap. The replay documents its pacing as a realism setting that correctness must not depend on.

## Decision

A Vitest global setup, [runner-speed.ts](../../../../benchmarks/support/runner-speed.ts), runs a fixed product-independent JavaScript workload in a fresh plain-Node child before each benchmark invocation. The median of 15 repetitions sets `runnerTimeScale = clamp(probeMs / 55, 1, 1.5)` in [calibration.ts](../../../../benchmarks/support/calibration.ts). `runnerTimeBudget` multiplies each measured wall-time verdict by that scale; deterministic controls, memory budgets, and dimensionless ratios do not use it. The report records the enforced budget.

The 55 ms reference is the probe median of the EPYC 9V74 class, the class that the reviewed CI budgets fit. A runner as fast as that class or faster keeps every budget unchanged. The 1.5 cap keeps a stalled runner from loosening budgets without bound.

The browser reply now holds before its DONE delta until the test has typed into the composer. The hold is an optional `hold` field of a replay `chunks` entry in [llm-replay](../../../../packages/test-support/llm-replay/README.md), released by a file, like the `readyFile` of a `hang` entry. The overlap assertion then proves the product contract, input accepted while a reply is open, without a race against pacing. The trusted keystroke after DONE still must fail the same assertion.

## Calibration

Calibration run 42638383736 ran the probe three times before and three times after the conversation-fold, projection-list, and terminal-io benchmarks on 13 runners. Probe medians were 40.9 ms on EPYC 9V45, 53.2 to 54.8 ms on EPYC 9V74, 69.8 to 73.9 ms on EPYC 7763, and 74.8 ms on Xeon 8370C. Repeated probes in one job stayed within about 5%. The probe ratio and the same-job product slowdown correlate with Pearson r 0.99. Their EPYC 7763 to EPYC 9V74 ratios are 1.29 and 1.28.

## Consequences

On the reference class and faster, the gate is as strict as before. On an EPYC 7763 runner, the 16,384-delta reasoning budget becomes 105 ms against recorded medians of 80.2 to 87.8 ms, which keeps the 1.18 to 1.27 relative headroom of the EPYC 9V74 class. The conversation-fold controls accept the recorded EPYC 7763 median at its own scale, reject that median at the unscaled budget, and reject the median one quarter slower at the scaled budget.

Known exclusions: the probe measures the runner once, before the timed cases. Load that starts later is not part of the scale. The probe is single-threaded JavaScript, so it estimates browser and storage speed through their correlation with CPU speed. The 55 ms reference and the 1.5 cap need new calibration when the runner pool or Node version changes the probe distribution.

## Alternatives considered

- A table of scales keyed by CPU model: rejected because slow instances inside one class, EPYC 9V74 jobs at 1.63 to 1.79, would still fail, and a new CPU would need a source change.
- A global increase of `CI_TIME_SCALE`: rejected because it loosens every budget on fast runners too.
- Paid or self-hosted runners with one CPU type: not available to the fork.
- A longer replay instead of the hold: rejected because the overlap would still depend on pacing, and the stream endpoints would measure a different workload.
