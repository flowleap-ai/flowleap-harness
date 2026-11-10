# v1 user stories: the acceptance test of v1

These stories are the acceptance test of [the v1 scope](../../docs/2026-11-10-v1-scope.md). v1 passes when every story passes by [the pass rule](how-to-run-a-qa-round.md#when-v1-passes). Until then, the work is v1 work. UX and UI polish starts after the pass.

Write a result for a story only by [the QA round procedure](how-to-run-a-qa-round.md). Do not change a story's expected result to match the product. If a story is wrong, change it in a pull request with the reason.

## The areas, in the order a firm meets them

| File | Area | Stories | Today | WIP | New |
|---|---|---|---|---|---|
| [01-install-and-sign-in.md](01-install-and-sign-in.md) | Install and first sign-in | 11 | 6 | 4 | 1 |
| [02-firm-setup.md](02-firm-setup.md) | The administrator sets up the firm | 22 | 3 | 5 | 14 |
| [03-docket-and-clients.md](03-docket-and-clients.md) | Import your EP docket and Add client | 16 | 7 | 0 | 9 |
| [04-letter-arrives.md](04-letter-arrives.md) | A letter arrives | 22 | 4 | 2 | 16 |
| [05-deadline.md](05-deadline.md) | The deadline | 31 | 12 | 5 | 14 |
| [06-my-work.md](06-my-work.md) | My work | 11 | 1 | 8 | 2 |
| [07-matter-and-memory.md](07-matter-and-memory.md) | The matter page and matter memory | 12 | 3 | 2 | 7 |
| [08-prepared-work.md](08-prepared-work.md) | Prepared work on a letter | 11 | 7 | 2 | 2 |
| [09-notices.md](09-notices.md) | Notices | 8 | 6 | 1 | 1 |
| [10-month-of-use.md](10-month-of-use.md) | A month of use | 15 | 6 | 0 | 9 |
| [11-must-never-happen.md](11-must-never-happen.md) | What must never happen | 34 | 17 | 3 | 14 |
| | **All** | **193** | **72** | **32** | **89** |

Count again after each change to a story file, with the command in [how to run a QA round](how-to-run-a-qa-round.md#count-the-stories).

Also: [coverage.md](coverage.md) (each v1 line and each QA-day finding against its stories) and [how-to-run-a-qa-round.md](how-to-run-a-qa-round.md).

## The persons

The persons are the [seed firm](https://github.com/flowleap-ai/flowleap-seed-firm)'s persons (fictional names, real public EP files). Use these names in every result.

| Person | Role | May confirm a deadline | Intake person | Sees (at the seed clock `fetch`, 2026-11-05) |
|---|---|---|---|---|
| Felix Neumann | administrator | no | no | no matter |
| Dr. Martin Krüger | partner | yes | no | all 7 matters |
| Dr. Anna Becker | attorney | yes | no | SF-2023-0045, SF-2020-0031, SF-2026-0019 |
| Jonas Weber | attorney | yes | no | SF-2021-0011, SF-2024-0007; screened from SF-2022-0024 |
| Lena Hoffmann | attorney | yes | no | SF-2021-0011, SF-2022-0024, SF-2024-0007, SF-2023-0042, SF-2023-0045 |
| Sabine Wolf | formalities | yes | yes | the four WAGO and Renishaw matters of her teams |
| Tobias Schmitt | formalities | yes | yes | SF-2023-0045, SF-2020-0031, SF-2026-0019 |
| Miriam Yilmaz | formalities (assistant) | no | yes | SF-2020-0031 |
| The agent | actor | never | never | what its person sees, and only through a run or a chat of that person |

The agent prepares, reads, compares and checks. It never decides, files, confirms, sends or pays. A story that has the agent as actor tests that line.

The matters:

| File number | Client | EP application | Team | Open item at the seed clock |
|---|---|---|---|---|
| SF-2021-0011 | WAGO | EP21755382 | Jonas (responsible), Lena, Sabine | granted |
| SF-2022-0024 | WAGO | EP22213933 | Lena (responsible), Sabine; Jonas screened | Rule 71(3) of 2026-04-01, period ended Monday 2026-08-03 |
| SF-2024-0007 | WAGO | EP24166597 | Jonas (responsible), Lena, Sabine | Art. 94(3) of 2026-09-18 (German) |
| SF-2023-0042 | Renishaw | EP23755468 | Lena (responsible), Sabine | Art. 94(3) of 2026-06-09 (English) |
| SF-2023-0045 | Renishaw | EP23771920 | Anna (responsible since 2026-10-15), Lena, Tobias | Rule 71(3) of 2026-09-29, period ends 2027-01-29 |
| SF-2020-0031 | Phoenix Contact | EP20706232 | Anna (responsible), Tobias, Miriam | loss of rights of 2026-01-21 |
| SF-2026-0019 | Phoenix Contact | EP21810318 | Anna (responsible), Tobias | opposition, Rule 79(1) of 2026-10-14 |

Client AI wishes: WAGO `allowed`; Phoenix Contact `local-model-only`; Renishaw not recorded on the seed main branch (`allowed` in seed PR 2).

## The setups

| Code | Setup | Two persons at the same time | Start |
|---|---|---|---|
| L | The local firm: the real installer in a VM on the Mac, with the seed firm | yes, one browser profile for each person | flowleap-os `scripts/local-firm.sh up` |
| D | The dev loop: the harness from source against a local Firm Record | no; act as one person, then switch | `flowleap/dev-loop.sh up`, then `flowleap/dev-loop.sh as <person>` |
| B | The box: the test firm with Entra | Jonas (attorney.a) and Lena (attorney.b) only | released candidate through the gate |
| X | The MyEPO double: a local MyEPO with the seed's public letters | with L or D | PR 387; `dev-loop.sh up --myepo-double` |

[How to run a QA round](how-to-run-a-qa-round.md) has the commands and the order.

## The story format

Each story has these lines.

- **Id and title.** The area code and a number, for example `LET-06`. An id never changes and is never used again.
- **Mark.** One of:
  - **Today**: the story runs on the merged code (the evidence base of the scope page).
  - **WIP**: the story needs work in progress; the line names the PR or the session.
  - **New**: the story needs something that is not started; the line names it.
  - The mark is the strongest need of the whole expected result: New before WIP before Today. A story whose parts differ says "Parts:" and names the mark of each part.
- **Fails today** (when known): the evidence that the merged code does not give the expected result. A story can be "Today" and fail.
- **Risk** (edge cases): what goes wrong if the story fails. **Deadline** (a deadline can be lost), **Wrong person** (a fact reaches a person who must not see it), **Distrust** (a person stops trusting what FlowLeap shows).
- **Lines.** The v1 lines (V1 to V25) that the story tests.
- **Story.** As a person, I want something, so that a result.
- **Start.** The setup, the seed data, the double state, the persons and the clock.
- **Steps.** What the person does, in order, in words a tester follows.
- **Expected.** What the tester sees, on a screen, in the Firm Record or in a log. A step that writes firm state has a second person who sees the change.
- **Proof.** By hand (on L, D or B), by an existing automated test (named), or by a test that does not exist yet (named "new test").

Every story that changes firm state is a two-person story: one person changes, another person sees.
