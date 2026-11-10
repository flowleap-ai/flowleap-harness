# How to run a QA round

A QA round runs every story of [the v1 user stories](README.md) on one released candidate and records one result for each. Do not run a round on a branch.

## The setup

1. **Pick the candidate.** A candidate that `release/release.sh cut` made from `flowleap`. Write its version at the top of the round's result file. Every story of the round runs on this version.
2. **The local firm (L).** In the flowleap-os checkout:

   ```bash
   scripts/local-firm.sh up <version> && scripts/local-firm.sh check
   ```

   Add the accounts of the persons that the round needs:

   ```bash
   LOCAL_FIRM_ACCOUNTS="jonas tobias anna lena sabine miriam felix partner" scripts/local-firm.sh up <version>
   ```

   Open `http://localhost:14180/`. Use one Chrome profile for each person who acts at the same time. Known limits of L: no Entra (local accounts only), no shell or Office tool under Rosetta (QA finding L5), and no FlowLeap token unless the founder sets it (L6). A story that needs one of these runs on B.
3. **The MyEPO double (X).** Until PR 387 merges, the double runs from its branch: `flowleap/dev-loop.sh up --os <flowleap-os path> --myepo-double`. `POST /_double/arrive` delivers the Rule 71(3) letter of SF-2023-0045; `POST /_double/reset` starts again. The double cannot make a timeout, a rate limit, a removed permission, zero portfolios, an unknown code, a duplicate or a letter with no application. A story that needs one of these is "blocked" until the double has the control.
4. **The box (B).** Only for the stories that need Entra (INS-02, INS-03, INS-05, INS-06, INS-08, NOT-01, NEV-18, NEV-20). The candidate reaches the box only through the gate, after a passing local-firm record (`release/gate.sh current <version>`). A write on the box needs the founder's permission. The box has two persons: attorney.a plays Jonas, attorney.b plays Lena.
5. **The clock.** Run on the real date. Write the date in the result file. A story that names the seed clock `fetch` (2026-11-05) reads its expected dates against that clock; a story that names the real date uses today.
6. **The old docket.** For MON-02, use a list of the seed letters' deadlines that an attorney computed by hand, with the source of each date. Never use dates that the FlowLeap engine or the double made.
7. **Accounts on L.** Act as each person with that person's own account. Add `jonas` to `LOCAL_FIRM_ACCOUNTS`. Never use `admin` as a person in a story: it reads every notice on the outbox page (os `lib/record/outbox-page.mjs:28`) and holds the console.

## The order

Run the areas in the order of the files, 01 to 11. Each area leaves the firm in the state that the next area starts from. Inside an area, run the stories in their order. Run the stories of file 11 last, and run each again after a fix in any area.

## How to record a result

Write one file for each round: `flowleap/qa/v1/rounds/<date>-<version>.md`, with one table row for each story:

| Story | Result | Person and setup | Evidence | Ticket |
|---|---|---|---|---|

The result is one of:

- **Pass.** The expected result happened, all of it. The evidence names what the tester saw: a screenshot path, a record position, or a log line.
- **Fail.** Any part of the expected result did not happen. The evidence names what the tester saw, beside the expected result. Every fail gets a ticket in the same row.
- **Blocked.** The story cannot run on this candidate: its WIP or New dependency is not merged, or a setup is missing. Name the dependency. A blocked story is not a pass.

Do not write "pass with notes". If a part of the expected result is wrong, the story is a fail, and a pull request changes the story with the reason.

## When v1 passes

v1 passes QA when one round on one candidate has:

1. every story **Pass**, with no **Fail** and no **Blocked**;
2. every story of file 11 (what must never happen) **Pass**, with no exception;
3. MON-02 (the comparison with the old docket) **Pass** for each working day of the round, with no deadline missing from FlowLeap.

After the QA pass, the work moves to UX and UI. The test of v1 itself is the month at a firm (the scope page): MON-02 runs each working day of that month, and the month passes when every FlowLeap deadline equals the old docket's date or has a recorded reason (decision 8 of the scope).

## Count the stories

Run this in `flowleap/qa/v1` after each change to a story file, and copy the numbers into [the index](README.md):

```bash
for f in [0-9]*.md; do awk -v f="$f" '/^### /{n++} /^- \*\*Mark:\*\* /{m=$3; sub(/[^A-Za-z]+$/,"",m); c[m]++} END{printf "%s %d Today=%d WIP=%d New=%d\n", f, n, c["Today"], c["WIP"], c["New"]}' "$f"; done
```
