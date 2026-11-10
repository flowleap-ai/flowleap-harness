# MyEPO surfaces mockups

HTML mockups of how a person meets the MyEPO data in FlowLeap, for the founder's approval before the builds of **Import your EP docket** and the Mailbox intake. They show the founder decisions of 2026-11-10: four surfaces, where My work holds what needs a person's decision and Letters, Deadlines and Files are views of the same records for looking, search and audit. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md) and extend the approved [Add client](../add-client/README.md), [client model](../client-model/README.md) and [MyEPO card](../myepo/README.md) mockups, and My work of the [first-demo mockups](https://github.com/flowleap-ai/flowleap-harness/pull/343). **Status: waits for the founder's approval.**

## How to view

Open [index.html](index.html) (German: [index.de.html](index.de.html)), the review page. It links every screen and state, starts the walkthrough, and lists the decisions for the founder. The pages need the client theme by a relative path, so open them from a checkout of this branch, or serve the repository root:

```sh
python3 -m http.server 8000 --directory <repository root>
```

Then open `http://localhost:8000/flowleap/docs/mockups/myepo-surfaces/index.html`.

## Walkthrough

[5-myepo-card.html?state=linked&walk=1](5-myepo-card.html?state=linked&walk=1) starts a clickable walkthrough of 18 steps; [the German one](5-myepo-card.de.html?state=linked&walk=1) has the same steps. A panel at the bottom left shows the step, what the person sees, and **Back** and **Next**; the one control that goes on has a blue outline.

1. Felix Neumann (administrator): the linked MyEPO card with the new part **Letters from the Mailbox**. He opens the other mode, reads what it changes in MyEPO, keeps the default, and selects **Import your EP docket**.
2. Dr. Martin Krüger (partner): **Import your EP docket**, the Add client stepper with Docket, Clients, Conflict check and Review, then Record.
3. Lena Hoffmann (patent attorney): **Letters**, with the Rule 71(3) communication of SF-2023-0045 listed and not opened, then opened; its deadline with the evidence; **Deadlines** as a table and as a month; the overdue deadline of SF-2022-0024 that needs a person.
4. Dr. Anna Becker (patent attorney): **My work** with the three kinds of MyEPO item, and the letter that FlowLeap cannot file.

The persons change because the seed walls decide what each person sees: only Lena Hoffmann's walls hold both the overdue Wago deadline and the demo matter, and only Dr. Anna Becker is responsible for SF-2023-0045 and SF-2026-0019.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state. [index.html](index.html) lists every state.

| Page | What it shows |
|---|---|
| [1a-docket.html](1a-docket.html) to [1e-record.html](1e-record.html) | Import your EP docket: the counts of the docket, the proposed clients in one list with the role, the conflict check, the Review with **Import 3 clients** `⇧⌘↵`, and Record. Each step has the state `large` (a firm with 1,132 applications) |
| [2-letters.html](2-letters.html) | Letters: a data table of the letters with filters by text, state, client, matter, document type and PDF, and the reading pane from 1366 px. One state for each letter (`r1` to `r16`), `unopened`, `loading`, `error` and `empty` |
| [2-letter.html](2-letter.html) | One letter on its own page: below 1366 px a row opens it, and My work opens the letters of Dr. Anna Becker (`r15`, `x1`) |
| [3-deadlines.html](3-deadlines.html) | Deadlines: a data table by due date, the Outlook line, and the `month` view; `loading` and `error` |
| [3-deadline.html](3-deadline.html) | One deadline with its evidence: confirmed automatically (default), `person` (overdue, needs a person), `r16` and `r15` (no rule: enter the date), `r6` (no rule, another person enters it), `r1` (closed, replaced) |
| [4-my-work.html](4-my-work.html) | My work of PR 343 with the three MyEPO items; `context` (row menu) |
| [5-myepo-card.html](5-myepo-card.html) | The approved MyEPO card, linked, with the letter setting: `linked`, `arrival` (changed, not saved), `saved`, `readonly` |

## Decisions in the mockups

- **The letter states are not atlas states.** They use the status shapes with their own words and the classes `.cstatus` and `.cst`, as the MyEPO card does, so `check-mockups.mjs` does not look for them in the status map. The deadline states are atlas states (Active, Deadline proposed, Not computed, Stale).
- **My work is not redesigned.** It is the My work of PR 343 (founder decision B9: groups Overdue, Today and Later, no checkboxes, a row context menu), with **Open the letter** `O` added to the row menu.
- **Decision 6 is marked.** Every part that shows the confirmation of a deadline carries the tag **Design not yet approved**.
- **The overdue date** uses the outline warning triangle in `state-error-primary` with "Overdue by N days" from frame.js, as rule R11 asks.
- **The Outlook calendar** is one stated line on Deadlines and a property of a deadline; it has no setting.
- **The data tables** have row hairlines, as the approved client model tables do (client model decision 1).

## Data

- **Matters, letters and persons.** The seed firm (`flowleap-seed-firm`, commit cee0c11): the seven matters with their file numbers, application numbers, clients and responsible attorneys; the EPO letters of `documents.json` with their kinds and dates; the eight users and the walls of `groups.json`. Titles, applicant names and register statuses are from the EP Register reads of S14 (2026-11-10). An annex and the text intended for grant are files of their letter, not letters of their own.
- **Due dates.** Only from the deadline engine (`flowleap-deadlines` with the 2027 calendar, rule Rule 71(3) EPC, version 1): 29 Jan 2027 for SF-2023-0045 (letter of 29 Sep 2026), 3 Aug 2026 for SF-2022-0024 (letter of 1 Apr 2026; the four months end on Saturday 1 Aug 2026), 2 Jan 2026 and 20 Oct 2025 for the letters of SF-2021-0011, each with the engine's steps and citations. The engine has no rule for an Article 94(3) communication or a notice of opposition, so these deadlines show **Not computed** and ask a person for the date that the letter states. No other date is a due date.
- **The day.** The MyEPO link and the first read are on 9 Nov 2026, 14:05 (the example time of the approved card); today is 10 Nov 2026. "Days left" come from the viewer's real clock.
- **Examples.** The letter `x1` (a change in the list of professional representatives with no application number, a real kind of letter of the EPO sandbox Mailbox); the EPO due dates in MyEPO (29 Jan 2027 for SF-2023-0045, none for SF-2022-0024); the signature of Rule 71(3) EPC, version 1, by Dr. Martin Krüger (no rule version is signed today); the times of the reads and of the opened letter; the person for letters without a matter; the large firm (1,132 applications, 312 applicant names, 287 clients, 18 with no file number, the reading progress, the counts of its rows; the applicant names and the Syntegon opposition of 8 Jan 2025 are real). The pages mark them **Example**.
- **The letter image.** The page image of the Rule 71(3) communication of SF-2023-0045, from the first-demo mockups (the register PDF at 110 dpi).

## Build and check

The pages are generated. Edit `build.mjs`, `review.mjs` or `data.mjs`, then run `node build.mjs` in this folder. The pages load `records.css` of the skill, `../add-client/add-client.css`, `../client-model/client-model.css` and `myepo-surfaces.css`; the card page also loads `../myepo/myepo.css` and draws its dialog with `../myepo/frame.js`. `frame.js` is the first-demo frame with Letters and Deadlines in the sidebar; `table.js` sorts, filters and pages the tables; `walk.js` runs the walkthrough.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/myepo-surfaces --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/myepo-surfaces
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/myepo-surfaces --shoot <dir>
```

`check-mockups.mjs` needs Playwright (`FLOWLEAP_PLAYWRIGHT`, see the skill). The screenshots are not committed.
