# Agent Note: Ready pull requests of the fork run the fast lane

Status: implemented

## Problem

[The draft and full lanes](2026-11-09-fork-ci-draft-and-full-lanes.md) sent every ready pull request to the full suite. On the free 4-CPU runners the `node 24 / coverage` job of that suite took 42 min in CI run 43869292318 and 50 min in the failed run 43847827499, while every other Linux job took 13 min or less and the Windows build took 20 min. A ready push also started about 20 jobs with the Python and release workflows, so two open pull requests waited in the queue for each other. The founder asked on 2026-11-16 for a pull-request wait below 10 min and accepted that some faults show only after the merge. The full suite already ran a second time on the push to `flowleap`.

## Decision

The `lane` job sets `full` only for a push, a schedule, or the `full-ci` label. The draft state no longer selects a lane: a draft and a ready pull request both run the fast lane (`node 24 / static`, `node 24 / lint`, and `node 24 / unit, changed files (fast lane)`) and report `fast lane passed (not full CI)`.

Coverage, the snapshots and artifacts, the web browser snapshots, benchmarks, Node compatibility, Windows, and Python run on a pull request only with the `full-ci` label. They run after each merge on the push to `flowleap`; `ci-python.yml` gained that push trigger, because it had none.

## Consequences

A coverage gap, a snapshot difference, a benchmark regression, and a Windows or Python failure show after the merge, on the `flowleap` push run. `flowleap` can be red until a correction lands, so a release starts only from a head whose push run is green. An upstream merge, a change to the web client, and a change to shared runtime code warrant the `full-ci` label before the merge.

In CI run 43901564549 the three fast-lane jobs took 7 min 16 s (static), 5 min 42 s (lint), and 1 min 56 s (unit).

## Alternatives considered

**Split coverage across a matrix of runners.** The partition coordinator already writes one blob per partition and merges them for the threshold check. Four runners give an estimated 15 to 18 min including the merge job; a wait below 10 min needs eight or more runners and fills the 20-job limit with one pull request.

**Add the web snapshots in eight shards to ready pull requests.** Measured in CI run 43901564549: the shards took 5 min 58 s to 13 min 13 s, and the run took 13 min 29 s. The snapshot step took 284 to 681 s per shard and 3,768 s over eight shards, against 2,292 s over four shards in run 43869292318. More shards add a fixed cost to each one, and Vitest splits by file, not by duration.

**Run the web snapshots only when web paths change.** The earlier note rejected path lists because a wrong entry lets a code change skip its tests.
