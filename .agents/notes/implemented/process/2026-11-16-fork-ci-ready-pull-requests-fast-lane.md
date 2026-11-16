# Agent Note: Ready pull requests of the fork run the fast lane and the web snapshots

Status: implemented

## Problem

[The draft and full lanes](2026-11-09-fork-ci-draft-and-full-lanes.md) sent every ready pull request to the full suite. On the free 4-CPU runners the `node 24 / coverage` job of that suite took 42 min in CI run 43869292318 and 50 min in the failed run 43847827499, while every other Linux job took 13 min or less and the Windows build took 20 min. A ready push also started about 20 jobs with the Python and release workflows, so two open pull requests waited in the queue for each other. The founder asked on 2026-11-16 for a pull-request wait below 10 min and accepted that some faults show only after the merge. The full suite already ran a second time on the push to `flowleap`.

## Decision

The `lane` job sets `full` only for a push, a schedule, or the `full-ci` label, and sets a second output, `ready`, for a pull request that is not a draft. A ready pull request runs the fast lane (`node 24 / static`, `node 24 / lint`, and `node 24 / unit, changed files (fast lane)`) and the web browser snapshots. The web snapshots run in eight shards instead of four, in every lane. The fast-lane verdict `fast lane passed (not full CI)` fails for a ready pull request unless every web snapshot shard succeeded.

Coverage, the recorded-session snapshots and artifacts, benchmarks, Node compatibility, Windows, and Python run on a pull request only with the `full-ci` label. They run after each merge on the push to `flowleap`; `ci-python.yml` gained that push trigger, because it had none.

## Consequences

A coverage gap, a recorded-session snapshot difference, a benchmark regression, and a Windows or Python failure show after the merge, on the `flowleap` push run. `flowleap` can be red until a correction lands, so a release starts only from a head whose push run is green. An upstream merge and a change to shared runtime code warrant the `full-ci` label before the merge.

The two draft runs 43403131293 and 43389194547 finished the three fast-lane jobs in 7 and 8 min. With four shards the web snapshot step took 416 to 710 s after about 2 min of setup; the time of each of the eight shards is not measured in this note. Shard 1 also runs the three serial files, so it is the longest shard.

## Alternatives considered

**Split coverage across a matrix of runners.** The partition coordinator already writes one blob per partition and merges them for the threshold check. Four runners give an estimated 15 to 18 min including the merge job; a wait below 10 min needs eight or more runners and fills the 20-job limit with one pull request.

**Run the web snapshots only when web paths change.** The earlier note rejected path lists because a wrong entry lets a code change skip its tests. The ready state remains the explicit author signal.

**Fast lane only for ready pull requests.** The web client is the product surface that the fork changes most, and eight shards keep its snapshots inside the wait.
