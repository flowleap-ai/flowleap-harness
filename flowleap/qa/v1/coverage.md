# Coverage

Three tables. The first shows each line of [the v1 scope](../../docs/2026-11-10-v1-scope.md) against the stories that test it. The second shows each finding of [the QA day of 2026-11-06](../2026-11-06-matters-qa.md) against a story, or the reason why it is not a v1 story. The third shows each finding of the founder's two-person test of 2026-11-10 against a story.

## The v1 lines

The story lists come from the **Lines** field of each story. The counts are by the story's mark. A line with no "Today" story cannot be tested on the merged code.

| Line | Capability | Stories | Today | WIP | New |
|---|---|---|---|---|---|
| V1 | Administrator sets the firm in one place | INS-11, ADM-01, ADM-03, ADM-04, ADM-11, ADM-12, ADM-13, ADM-14, ADM-15, ADM-16, ADM-18, ADM-20, ADM-22, ADM-23, ADM-24, MON-10, MON-13, NEV-13, NEV-20, NEV-28 | 3 | 1 | 16 |
| V2 | Each act needs its role | INS-08, INS-11, INS-12, ADM-02, ADM-03, ADM-04, ADM-09, ADM-17, ADM-25, IMP-02, IMP-08, DL-02, DL-14, DL-23, PREP-03, PREP-08, NEV-05, NEV-06, NEV-08, NEV-27, NEV-28, NEV-30 | 7 | 1 | 14 |
| V3 | Walls | INS-06, ADM-16, ADM-20, ADM-22, IMP-12, LET-05, LET-08, LET-09, LET-16, LET-22, MW-04, MW-05, MAT-07, NOT-05, NOT-06, MON-12, MON-13, NEV-01, NEV-02, NEV-03, NEV-04, NEV-06, NEV-12, NEV-13, NEV-22, NEV-23, NEV-24, NEV-25, NEV-27, NEV-28, NEV-31, NEV-33, NEV-34 | 13 | 4 | 16 |
| V4 | Firm state in one place | ADM-01, ADM-03, ADM-04, ADM-05, ADM-10, ADM-13, ADM-14, ADM-20, ADM-22, IMP-01, IMP-07, IMP-09, LET-17, DL-04, DL-20, MW-02, MAT-02, MAT-06, MON-06, NEV-05, NEV-07, NEV-15 | 5 | 1 | 16 |
| V5 | MyEPO linked by the administrator | ADM-05, ADM-06, ADM-07, ADM-08, ADM-09, ADM-19, ADM-25, IMP-01, IMP-05, LET-01, LET-11, LET-12, LET-13, DL-08, MW-05, NEV-07 | 0 | 0 | 16 |
| V6 | EPO OPS linked by the administrator | ADM-10, ADM-19, LET-14, MAT-10, NEV-07 | 0 | 0 | 5 |
| V7 | Import your EP docket | ADM-08, IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06, IMP-15, IMP-16, LET-20 | 1 | 0 | 9 |
| V8 | Add client | ADM-23, IMP-06, IMP-07, IMP-08, IMP-09, IMP-10, IMP-11, IMP-12, IMP-13, IMP-14, IMP-15, NEV-33 | 8 | 0 | 4 |
| V9 | Mailbox letters filed automatically | ADM-19, IMP-16, LET-01, LET-02, LET-03, LET-04, LET-05, LET-06, LET-07, LET-08, LET-09, LET-10, LET-11, LET-12, LET-13, LET-14, LET-15, LET-16, LET-17, LET-18, LET-19, LET-20, LET-21, LET-22, DL-13, DL-18, DL-19, DL-23, DL-28, DL-30, MON-01, MON-09, NEV-12, NEV-16, NEV-21, NEV-22, NEV-29, NEV-33, NEV-34 | 12 | 2 | 25 |
| V10 | The read flag | ADM-11, LET-02, DL-32, DL-33, DL-35 | 0 | 0 | 5 |
| V11 | Deadlines for the frequent EP terms | IMP-16, LET-04, LET-18, LET-19, DL-01, DL-05, DL-06, DL-07, DL-12, DL-18, DL-19, DL-22, DL-25, DL-26, DL-27, DL-30, DL-31, DL-38, DL-39, MON-02, MON-04, MON-05, MON-11, MON-14 | 7 | 3 | 14 |
| V12 | Deadline confirmation | ADM-12, ADM-17, LET-16, DL-01, DL-02, DL-03, DL-04, DL-08, DL-09, DL-10, DL-11, DL-13, DL-14, DL-15, DL-17, DL-20, DL-21, DL-22, DL-23, DL-24, DL-28, DL-29, DL-31, DL-32, DL-34, DL-37, DL-38, MW-03, PREP-11, NOT-08, MON-02, MON-03, MON-04, MON-05, MON-09, MON-14, NEV-09, NEV-10, NEV-15, NEV-16, NEV-19, NEV-30 | 14 | 5 | 23 |
| V13 | My work | INS-04, INS-09, INS-10, INS-12, LET-20, LET-21, DL-03, DL-15, DL-16, DL-17, DL-24, DL-34, MW-01, MW-02, MW-03, MW-04, MW-05, MW-06, MW-07, MW-08, MW-09, MW-10, MW-11, MAT-08, PREP-05, NOT-01, MON-01, MON-03, MON-10, MON-12, NEV-19, NEV-23, NEV-32 | 7 | 16 | 10 |
| V14 | Letters | INS-10, LET-01, LET-03, LET-11, LET-15, DL-17, MW-07, MW-11, NEV-19, NEV-23, NEV-32 | 3 | 3 | 5 |
| V15 | Deadlines | INS-10, DL-01, DL-16, DL-17, DL-21, DL-31, MW-11, MON-02, NEV-19, NEV-23 | 2 | 3 | 5 |
| V16 | Matter page with its files | INS-09, INS-10, LET-01, DL-01, DL-16, DL-17, DL-21, MW-10, MAT-01, MAT-02, MAT-07, MAT-08, MAT-09, MAT-12, NEV-19, NEV-25, NEV-32 | 2 | 6 | 9 |
| V17 | Matter memory | DL-17, MW-06, MAT-01, MAT-02, MAT-03, MAT-04, MAT-05, MAT-06, MAT-10, MAT-11, PREP-01, PREP-07, NEV-03, NEV-19, NEV-25, NEV-26 | 6 | 2 | 8 |
| V18 | Prepared work for two letter types | ADM-15, MAT-11, PREP-01, PREP-02, PREP-03, PREP-04, PREP-05, PREP-06, PREP-07, PREP-08, PREP-09, PREP-10, PREP-11, MON-11, MON-15, NEV-04, NEV-10, NEV-11, NEV-17, NEV-26 | 13 | 3 | 4 |
| V19 | Notices to Outlook | ADM-21, LET-08, LET-21, DL-03, DL-24, NOT-01, NOT-02, NOT-03, NOT-04, NOT-05, NOT-06, NOT-07, NOT-08, MON-01, MON-03, MON-12, NEV-11, NEV-19, NEV-24, NEV-32 | 11 | 3 | 6 |
| V20 | Sign-in with Entra | INS-01, INS-02, INS-03, INS-05, INS-07, INS-08, INS-11, ADM-21, MON-10, NEV-18, NEV-20 | 4 | 3 | 4 |
| V21 | One runtime for each attorney | INS-01, INS-06, NEV-14, NEV-30, NEV-31 | 4 | 0 | 1 |
| V22 | Model gateway | INS-01, ADM-15, MAT-11, PREP-05, MON-11, NEV-17, NEV-29 | 2 | 2 | 3 |
| V23 | Backups with restore | MON-08, MON-09, MON-13 | 0 | 0 | 3 |
| V24 | Updates | INS-07, MON-06, MON-07, MON-15 | 4 | 0 | 0 |
| V25 | Release gate | INS-01 | 1 | 0 | 0 |
| V26 | Sign-out and account switch | INS-03, NEV-18 | 0 | 2 | 0 |
| V27 | Hand entry with a second person | LET-15, DL-12, DL-18, DL-27, DL-29, DL-31, DL-37, DL-39, NEV-16 | 3 | 3 | 3 |
| V28 | The lost-letter check | LET-14 | 0 | 0 | 1 |
| V29 | Close a deadline as met or replaced | DL-21, DL-22 | 0 | 0 | 2 |
| V30 | Change an active date for an EPO extension | DL-28 | 0 | 0 | 1 |
| V31 | Reminders before the due date | DL-24 | 0 | 0 | 1 |
| V32 | The three sources of a text-only period | DL-12, DL-25, DL-32, DL-33, DL-34, DL-35, DL-36, DL-37 | 0 | 1 | 7 |
| V33 | Find a matter | MAT-07, NEV-01 | 0 | 2 | 0 |
| V34 | Client instructions with their source | MAT-06 | 0 | 0 | 1 |

Lines that cannot be tested today:

- **V5** (MyEPO linked by the administrator): the firm link is not built (sheet 06, migration step 7); the merged link keeps the secret in one runtime (#389).
- **V6** (EPO OPS linked by the administrator): the console Keys page has no OPS card, and the key is copied into every runtime (the office proxy is migration step 1).
- **V7** (Import your EP docket): not built (sheet 07). Its only "Today" story, IMP-15, tests how Add client groups one client.
- **V10** (the read flag): no MyEPO intake and no setting.
- **V23** (backups with restore): a restore runs today, but the story needs the hash-chain drill of #238 and the re-read of the lost hours.
- **V26** (sign-out and the account switch) and **V33** (find a matter): their screens are in draft PR 346.
- **V28** (the lost-letter check), **V29** (close a deadline as met or replaced), **V30** (change an active date), **V31** (reminders), **V32** (the three sources of a text-only period) and **V34** (client instructions): not built. V32 also needs an amendment of sheets 01, 02, 06 and 08 (decision A of the scope).

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

## The findings of the founder's test of 2026-11-10

The founder ran candidate 2026.11.10.0935 on the local firm with the accounts `admin` and `lena`.

| Finding | Story |
|---|---|
| The Firm identity page asks for names and addresses "as the EP Register writes them", which an administrator cannot know | ADM-23 |
| The Save button of Firm identity is at the top of the section, out of view after the form is filled | ADM-23 |
| The Firm identity page names `cordis.yml` to an administrator | ADM-24 |
| The docket error says "Patent data connectors"; the section is "Connectors" | ADM-24 |
| "Open configuration file" in Settings shows to every person and answers "Could not open configuration file" | ADM-25 |
| The administrator's saved identity is only in the administrator's runtime volume; a second person sees "None" | ADM-01 (fails today as expected) |
| An attorney sees the MyEPO card with editable secret fields | ADM-09, ADM-25 |
| The walls work: the second person saw exactly her five matters | MW-04, NEV-01 (evidence of a pass for the walls part) |
| A new attorney does not know where to start (the founder's local test) | INS-12 |
