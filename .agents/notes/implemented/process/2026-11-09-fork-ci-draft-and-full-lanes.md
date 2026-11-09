# Agent Note: The fork runs a fast lane on drafts and the full suite on ready pull requests

Status: implemented

## Problem

The `flowleap` fork runs CI on free GitHub-hosted runners with 4 CPUs, because the founder decided on 2026-11-09 not to pay for larger or third-party runners. The workflows came from upstream, which runs them on 8 to 32 CPU pools. On the free runners one push took about 37 min before `all checks passed` reported and about 75 min before every job finished: `windows node 24 / coverage` alone took 74 min (measured on CI runs 42631585615 and 42614655512). Many fork pull requests are drafts, documentation, or mockups that do not need the full suite on every push. The fork also had no CI after a merge, because `ci-master.yml` runs only on pushes to `master`.

## Decision

`ci.yml`, `ci-windows.yml`, and `ci-python.yml` each start with the same `lane` job. It sets `full` to true for a push or a schedule, for a pull request that is not a draft, and for a pull request labelled `full-ci`. Every other job reads that output.

- **Fast lane (draft).** `node 24 / static` (including the doc-sync gates, without `doc-typecheck`, which needs a build), `node 24 / lint` (with typecheck), and `node 24 / unit, changed files (draft fast lane)`. The unit job runs `check:ci:unit:changed`: `vitest run --changed <PR base>` without coverage, with the coverage lane's 90 s test budget. Windows and Python run no job.
- **Full lane.** Linux static, lint, coverage, snapshots and artifacts, the four web snapshot shards, benchmarks, and Node compatibility; the Windows build and native tests; and Python. The unit job does not run, because coverage runs the same tests.
- **After a merge.** A push to `flowleap` runs the full Linux suite and the Windows build, native tests, and coverage. Pushes queue instead of cancelling each other, so every run that starts also finishes.
- **Nightly.** `ci-windows.yml` runs only Windows coverage at 02:17 UTC.

Each verdict job names itself from the lane. Only a full-lane run reports `all checks passed`, `windows checks passed`, or `python checks passed`, and only when every job of the full lane succeeded. A draft run reports `fast lane passed (draft, not full CI)`, `windows checks not run (draft)`, or `python checks not run (draft)`. A re-run of a draft run keeps its draft event and its draft names.

A `labeled` event for any label other than `full-ci` skips the `lane` job, and with it every job of the run. Its concurrency group carries the run id, so it cannot cancel the run of the current head.

Branch protection on `flowleap` requires only the `signoff` status, so the verdict names do not change what can merge. They tell the reader which lane passed.

## Desk runner

The founder approved one self-hosted runner on the Mac Studio "desk" on 2026-11-09. It takes only `node 24 / coverage`, only for code from this repository, and only while the API reports it online and idle; otherwise coverage runs on `ubuntu-latest`. Each job runs in a new container inside a colima VM that shares no host files. The [desk runner guide](../../../../.github/ci-desk/README.md) records the setup, the limits, and the removal.

## Consequences

A ready push starts at most 14 worker jobs at the same time, of the 20 that the organization's free plan allows. A draft push starts 3. Two ready pushes at the same time wait in the queue for runners; two such pushes already went over 20 before this change.

Windows-only coverage gaps and Windows-only test failures under coverage are found after the merge, on the `flowleap` push run or the nightly run, not on the pull request. The Windows build and native tests still run on every full-lane pull request.

A draft does not run `doc-typecheck`, the snapshots, or any Windows or Python job. Its green fast lane is not evidence for those surfaces. Vitest selects a draft's unit tests through the import graph. A test that reads a changed file at run time, such as the workflow specs that read `.github/workflows/*.yml`, is not selected. A change to any `package.json` selects every test.

## Verification

[Workflow tests](../../../../scripts/ci-workflow.spec.ts) evaluate the workflows' own `if`, `name`, and verdict expressions for a draft push, a ready-for-review event, a push to a ready pull request, a `full-ci` label, another label, a push to `flowleap`, and the schedule. They prove that no required verdict name passes unless every full-lane job succeeded, for each job and for the results failure, cancelled, and skipped. Removing the coverage check from the CI verdict makes that test fail. The tests also pin the job counts per lane.

## Alternatives considered

**Run every unit test on drafts.** Measured on the first draft run of PR 373: `check:ci:unit` took 33 min on a 4-CPU runner, longer than the 27 min coverage job. With Vitest's 5 s default, 21 tests in `client-ui-forge`, `forge-github`, and `worktree` timed out.

**Paid larger or third-party runners.** The existing `DSH_CI_FAILOVER_LINUX=blacksmith` switch needs no code. The founder rejected the cost.

**Skip heavy jobs by changed paths.** A path list must classify every file that can change behavior. Package READMEs are typechecked, and skills and `AGENTS.md` steer agents. A wrong entry lets a code change skip its tests. The draft state is an explicit author signal instead.

**Run Windows coverage on pull requests only for Windows-sensitive paths.** Path, process, sandbox, and file-system code is spread across many packages, so a path list would miss cases.
