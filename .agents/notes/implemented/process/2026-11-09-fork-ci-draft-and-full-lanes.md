# Agent Note: The fork runs a fast lane on drafts and the full suite on ready pull requests

Status: implemented

## Problem

The `flowleap` fork runs CI on free GitHub-hosted runners with 4 CPUs, because the founder decided on 2026-11-09 not to pay for larger or third-party runners. The workflows came from upstream, which runs them on 8 to 32 CPU pools. On the free runners one push took about 37 min before `all checks passed` reported and about 75 min before every job finished: `windows node 24 / coverage` alone took 74 min (measured on CI runs 42631585615 and 42614655512). Many fork pull requests are drafts, documentation, or mockups that do not need the full suite on every push. The fork also had no CI after a merge, because `ci-master.yml` runs only on pushes to `master`.

## Decision

`ci.yml`, `ci-windows.yml`, and `ci-python.yml` each start with the same `lane` job. It sets `full` to true for a push or a schedule and for a pull request labelled `full-ci`, and `ready` to true for a pull request that is not a draft. Every other job reads those outputs. This note first sent every ready pull request to the full lane; [the ready fast lane](2026-11-16-fork-ci-ready-pull-requests-fast-lane.md) replaced that part of the decision.

- **Fast lane (each pull request without the `full-ci` label).** `node 24 / static` (including the doc-sync gates, without `doc-typecheck`, which needs a build), `node 24 / lint` (with typecheck), and `node 24 / unit, changed files (fast lane)`. A ready pull request adds the eight web snapshot shards. The unit job runs `check:ci:unit:changed`: `vitest run --changed <PR base>` without coverage, with the coverage lane's 90 s test budget. Windows and Python run no job.
- **Full lane.** Linux static, lint, coverage, snapshots and artifacts, the eight web snapshot shards, benchmarks, and Node compatibility; the Windows build and native tests; and Python. The unit job does not run, because coverage runs the same tests.
- **After a merge.** A push to `flowleap` runs the full Linux suite, the Windows build, native tests, and coverage, and Python. Pushes queue instead of cancelling each other, so every run that starts also finishes.
- **Nightly.** `ci-windows.yml` runs only Windows coverage at 02:17 UTC.

The `full-ci` label must exist in the repository; it was created once on 2026-11-09 with `gh label create full-ci -R flowleap-ai/flowleap-harness --color 0E8A16 --description "Run the full CI suite on this PR"`. Adding it to a pull request starts a `labeled` run in the full lane.

Each verdict job names itself from the lane. Only a full-lane run reports `all checks passed`, `windows checks passed`, or `python checks passed`, and only when every job of the full lane succeeded. A fast-lane run reports `fast lane passed (not full CI)`, `windows checks not run (fast lane)`, or `python checks not run (fast lane)`. A re-run keeps the event and the names of its first attempt.

A `labeled` event for any label other than `full-ci` skips the `lane` job, and with it every job of the run. Its concurrency group carries the run id, so it cannot cancel the run of the current head.

Branch protection on `flowleap` requires only the `signoff` status, so the verdict names do not change what can merge. They tell the reader which lane passed.

## Consequences

A draft push starts 3 worker jobs at the same time, a ready push 11, a `full-ci` push at most 18, and a push to `flowleap` at most 19, of the 20 that the organization's free plan allows. Two ready pushes at the same time wait in the queue for runners.

Windows-only coverage gaps and Windows-only test failures under coverage are found after the merge, on the `flowleap` push run or the nightly run, not on the pull request. The Windows build and native tests run on every `full-ci` pull request.

A fast-lane run does not run `doc-typecheck`, coverage, the recorded-session snapshots, or any Windows or Python job, and a draft also runs no web snapshot. Its green fast lane is not evidence for those surfaces. Vitest selects the fast lane's unit tests through the import graph. A test that reads a changed file at run time, such as the workflow specs that read `.github/workflows/*.yml`, is not selected. A change to any `package.json` selects every test.

## Verification

[Workflow tests](../../../../scripts/ci-workflow.spec.ts) evaluate the workflows' own `if`, `name`, and verdict expressions for a draft push, a ready-for-review event, a push to a ready pull request, a `full-ci` label on a draft and on a ready pull request, another label, a push to `flowleap`, and the schedule. They prove that no required verdict name passes unless every full-lane job succeeded, for each job and for the results failure, cancelled, and skipped. Removing the coverage check from the CI verdict makes that test fail. The tests also pin the job counts per lane.

## Alternatives considered

**Run every unit test on drafts.** Measured on the first draft run of PR 373: `check:ci:unit` took 33 min on a 4-CPU runner, longer than the 27 min coverage job. With Vitest's 5 s default, 21 tests in `client-ui-forge`, `forge-github`, and `worktree` timed out.

**Paid larger or third-party runners.** The existing `DSH_CI_FAILOVER_LINUX=blacksmith` switch needs no code. The founder rejected the cost.

**Skip heavy jobs by changed paths.** A path list must classify every file that can change behavior. Package READMEs are typechecked, and skills and `AGENTS.md` steer agents. A wrong entry lets a code change skip its tests. The draft state is an explicit author signal instead.

**Run Windows coverage on pull requests only for Windows-sensitive paths.** Path, process, sandbox, and file-system code is spread across many packages, so a path list would miss cases.
