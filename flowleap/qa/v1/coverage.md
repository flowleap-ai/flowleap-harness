# Coverage

Two tables. The first shows each line of [the v1 scope](../../docs/2026-11-10-v1-scope.md) against the stories that test it. The second shows each finding of [the QA day of 2026-11-06](../2026-11-06-matters-qa.md) against a story, or the reason why it is not a v1 story.

## The v1 lines

The story lists come from the **Lines** field of each story. The counts are by the story's mark. A line with no "Today" story cannot be tested on the merged code.

| Line | Capability | Stories | Today | WIP | New |
|---|---|---|---|---|---|
| V1 | Administrator sets the firm in one place | ADM-01, ADM-03, ADM-04, ADM-11, ADM-12, ADM-13, ADM-14, ADM-15, ADM-16, ADM-18, MON-10, NEV-13, NEV-20 | 3 | 2 | 8 |
| V2 | Each act needs its role | INS-08, ADM-02, ADM-03, ADM-04, ADM-09, ADM-17, IMP-02, IMP-08, DL-02, DL-14, PREP-03, PREP-08, NEV-05, NEV-06, NEV-08 | 6 | 1 | 8 |
| V3 | Walls | INS-06, ADM-16, IMP-12, LET-05, LET-08, LET-09, LET-16, MW-04, MW-05, MAT-07, NOT-05, NOT-06, MON-12, NEV-01, NEV-02, NEV-03, NEV-04, NEV-06, NEV-12, NEV-13, NEV-22, NEV-23, NEV-24 | 12 | 4 | 7 |
| V4 | Firm state in one place | ADM-01, ADM-03, ADM-04, ADM-05, ADM-10, ADM-13, ADM-14, IMP-01, IMP-07, IMP-09, LET-17, DL-04, DL-20, MW-02, MAT-02, MAT-06, MON-06, NEV-05, NEV-07, NEV-15 | 5 | 2 | 13 |
| V5 | MyEPO linked by the administrator | ADM-05, ADM-06, ADM-07, ADM-08, ADM-09, IMP-01, IMP-05, LET-01, LET-11, LET-12, LET-13, DL-08, MW-05, NEV-07 | 0 | 3 | 11 |
| V6 | EPO OPS linked by the administrator | ADM-10, LET-14, MAT-10, NEV-07 | 0 | 0 | 4 |
| V7 | Import your EP docket | ADM-08, IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06, IMP-15 | 1 | 0 | 7 |
| V8 | Add client | IMP-06, IMP-07, IMP-08, IMP-09, IMP-10, IMP-11, IMP-12, IMP-13, IMP-14, IMP-15 | 7 | 0 | 3 |
| V9 | Mailbox letters filed automatically | LET-01, LET-02, LET-03, LET-04, LET-05, LET-06, LET-07, LET-08, LET-09, LET-10, LET-11, LET-12, LET-13, LET-14, LET-15, LET-16, LET-17, LET-18, LET-19, DL-13, DL-18, DL-19, MON-01, MON-09, NEV-12, NEV-16, NEV-21, NEV-22 | 10 | 1 | 17 |
| V10 | The read flag | ADM-11, LET-02 | 0 | 1 | 1 |
| V11 | Deadlines for the frequent EP terms | LET-04, LET-18, LET-19, DL-01, DL-05, DL-06, DL-07, DL-12, DL-18, DL-19, MON-02, MON-04, MON-05, MON-11 | 7 | 2 | 5 |
| V12 | Deadline confirmation | ADM-12, ADM-17, LET-16, DL-01, DL-02, DL-03, DL-04, DL-08, DL-09, DL-10, DL-11, DL-13, DL-14, DL-15, DL-17, DL-20, MW-03, PREP-11, NOT-08, MON-02, MON-03, MON-04, MON-05, MON-09, NEV-09, NEV-10, NEV-15, NEV-16, NEV-19 | 11 | 5 | 13 |
| V13 | My work | INS-04, INS-09, INS-10, DL-03, DL-15, DL-16, DL-17, MW-01, MW-02, MW-03, MW-04, MW-05, MW-06, MW-07, MW-08, MW-09, MW-10, MAT-08, PREP-05, NOT-01, MON-01, MON-03, MON-10, MON-12, NEV-19, NEV-23 | 5 | 15 | 6 |
| V14 | Letters | INS-10, LET-01, LET-03, LET-11, LET-15, DL-17, MW-07, NEV-19, NEV-23 | 1 | 3 | 5 |
| V15 | Deadlines | INS-10, DL-01, DL-16, DL-17, MON-02, NEV-19, NEV-23 | 1 | 3 | 3 |
| V16 | Matter page with its files | INS-09, INS-10, LET-01, DL-01, DL-16, DL-17, MW-10, MAT-01, MAT-02, MAT-07, MAT-08, MAT-09, MAT-12, NEV-19 | 1 | 6 | 7 |
| V17 | Matter memory | DL-17, MW-06, MAT-01, MAT-02, MAT-03, MAT-04, MAT-05, MAT-06, MAT-10, MAT-11, PREP-01, PREP-07, NEV-03, NEV-19 | 5 | 2 | 7 |
| V18 | Prepared work for two letter types | ADM-15, MAT-11, PREP-01, PREP-02, PREP-03, PREP-04, PREP-05, PREP-06, PREP-07, PREP-08, PREP-09, PREP-10, PREP-11, MON-11, NEV-04, NEV-10, NEV-11, NEV-17 | 11 | 3 | 4 |
| V19 | Notices to Outlook | LET-08, DL-03, NOT-01, NOT-02, NOT-03, NOT-04, NOT-05, NOT-06, NOT-07, NOT-08, MON-01, MON-03, MON-12, NEV-11, NEV-19, NEV-24 | 10 | 2 | 4 |
| V20 | Sign-in with Entra | INS-01, INS-02, INS-03, INS-05, INS-07, INS-08, MON-10, NEV-18, NEV-20 | 4 | 3 | 2 |
| V21 | One runtime for each attorney | INS-01, INS-06, NEV-14 | 3 | 0 | 0 |
| V22 | Model gateway | INS-01, ADM-15, MAT-11, PREP-05, MON-11, NEV-17 | 2 | 2 | 2 |
| V23 | Backups with restore | MON-08, MON-09 | 0 | 0 | 2 |
| V24 | Updates | INS-07, MON-06, MON-07 | 3 | 0 | 0 |
| V25 | Release gate | INS-01 | 1 | 0 | 0 |

Lines that cannot be tested today:

- **V5** (MyEPO linked by the administrator): the firm link is not built; the merged link keeps the secret in one runtime (#389).
- **V6** (EPO OPS linked by the administrator): there is no console card, and the key is copied into every runtime.
- **V7** (Import your EP docket): not built. Its only "Today" story, IMP-15, tests the client group of Add client.
- **V10** (the read flag): no MyEPO intake and no setting.
- **V23** (backups with restore): a restore runs today, but the story needs the hash-chain drill of #238 and the re-read of the lost hours.

## The findings of the QA day

"After the pass" means a UX or UI finding that the founder put after the v1 QA pass (decision 4 of 2026-11-10). It stays a ticket and is not a v1 story.

| Finding | What it was | Story, or why not |
|---|---|---|
| 1 | No name, no sign-out | INS-02, INS-03 |
| 2 | The first screen does not show what needs me | INS-04, MW-01 |
| 3 | Test-run names in an attorney's workspaces | Not a v1 story: the dashboard and workspaces are not v1 surfaces. The gate and verify runs that leave them are a release-process defect; no ticket found |
| 4 | Two cards for one fact on the dashboard | Not a v1 story: My work replaces the dashboard as the first screen (founder, 2026-11-07) |
| 5 | "Install FlowLeap" card with "Coming later" rows | Not a v1 story, as finding 4 |
| 6 | "Office actions" and "Matters" in the sidebar | Decided on 2026-11-07 (Office actions leaves the sidebar); INS-04 tests the first screen |
| 7 | "Matters" opens the Intake | INS-04, MW-10 |
| 8 | All Intake rows look the same | LET-01, LET-15 |
| 9 | No page image of a scan | LET-15 |
| 10 | Filing offered but refused for scans (#325) | LET-15 |
| 11 | No matter proposed from the subject of a scan | LET-15 (a proposal only, by sheet 01) |
| 12 | "A person outside the team forwarded this letter" | After the pass (copy) |
| 13 | Raw event names in the Audit | After the pass (copy) |
| 14 | "Received" twice, "Office None" | After the pass (UI) |
| 15 | No matter search | MAT-07, NEV-01 |
| 16 | The date column is clipped | DL-16, INS-09 |
| 17 | No header and no initials in the person column | After the pass (UI) |
| 18 | Titles in capitals | After the pass (UI) |
| 19 | Seed letters read as overdue on the real date | Seed data: [the QA round](how-to-run-a-qa-round.md) runs on the real date and names the seed clock; DL-16 tests how overdue shows |
| 20 | The list hides an unconfirmed deadline | DL-17, NEV-19 |
| 21 | No grouping, bulk select or matter status | MAT-12 (filter by state); grouping and bulk acts after the pass |
| 22 | The page does not name the next step or who | DL-02, MAT-08 |
| 23 | The deadline row does not open | MAT-09 |
| 24 | A column with no header; a fact twice | After the pass (UI) |
| 25 | "Unnamed person" | INS-02, MAT-03 |
| 26 | "Application: Not recorded" | MAT-03 |
| 27 | "Documents 0" while letters wait | LET-15, MAT-01 |
| 28 | No clear first action on the matter page | MAT-08 |
| 29 | A long breadcrumb | After the pass (UI) |
| 30 | Not clear who proposed the deadline | DL-01, DL-02 |
| 31 | "Waits for a second person" without a name | DL-02 |
| 32 | The date and rule are clear (works) | DL-01 |
| 33 | The computation steps look like radio buttons | DL-01 (one line of steps); the visual form after the pass |
| 34 | "Office event" is not explained | After the pass (copy, high) |
| 35 | Legal source chips do not open the text | DL-01 |
| 36 | The right panel repeats the main area | After the pass (UI) |
| 37 | "an unnamed person" with a small letter | INS-02 (names); the capital letter after the pass |
| 38 | Main finding: the chain breaks and has no person layer | The chain is areas 4 to 8 in order: LET-01, DL-01, DL-02, MW-01, MW-02, MAT-01, PREP-01, NOT-01 |
| 39 | The account switch on a shared PC | INS-03, NEV-18 |
| 40 | Jonas sees no Intake letter (works) | LET-09 |
| 41 | The empty Intake says letters file themselves | MW-07 |
| 42 | A letter by address does not open (works) | LET-09 |
| 43 | A refusal shown as a load error | NEV-02 |
| 44 | No screen to enter an office event by hand | LET-15, DL-12, DL-18 |
| 45 | `record_read` answers `not_configured` on the firm | MAT-03 |
| 46 | The agent's honest answer (works) | MAT-04 |
| 47 | The chat is not on the matter; 219K tokens | Not a v1 story: the place of a chat is UX after the pass; the token count is a budget question of V22 with no story |
| 48 | Developer context in an attorney's runtime | Not a v1 story: a defect of the firm profile; no ticket found |
| 49 | Tokens per step; Landlock "partial" | NEV-14 (runtime isolation); the token display after the pass |
| 50 | A screened matter by address (wall holds) | NEV-02 |
| L1 | Walls hold on the local firm (works) | LET-09 |
| L2 | The agent reads the record (works) | MAT-03 |
| L3 | "No responsible attorney" | MAT-03 |
| L4 | The agent cannot list my matters | MW-06 |
| L5 | No shell or Office tool on the local firm (Rosetta) | Not a v1 story: a limit of the local firm; [the QA round](how-to-run-a-qa-round.md) names it |
| L6 | No FlowLeap token on the local firm | Not a v1 story: the setup of the local firm; [the QA round](how-to-run-a-qa-round.md) names it |
| L7 | The agent invents an example file number | MAT-04 |
| L8 | The responsible attorney named (works) | MAT-03 |
| L9 | "A deadline appears only once confirmed" | DL-17 |
| L10 | The agent offers what this firm cannot do | MAT-03, MAT-10 |
| L11 | "Which matters are mine?" (works) | MW-06 |
| L12 | My work hides the intake person's letters | INS-04, MW-01 |
| L13 | No application number in the agent's view | MAT-03 |
