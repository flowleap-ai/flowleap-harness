# Mailbox mirror mockups

HTML mockups of the Letters page as a mirror of the firm's MyEPO Mailbox, for the founder's approval before the build. They show the founder decision of 2026-11-15: mirror first. The page shows each letter of the Mailbox as MyEPO has it. It has no deadline, no letter state of FlowLeap, no matter and no task. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md). **Status: waits for the founder's approval.**

## How to view

The pages need the client theme by a relative path, so serve the repository root:

```sh
python3 -m http.server 8765 --directory <repository root>
```

Then open `http://localhost:8765/flowleap/docs/mockups/mailbox-mirror/mailbox.html`. Add `?theme=light` or `?theme=dark`, and `?state=<name>` for a view state.

## Pages

Each page has an English file and a German file (`<name>.de.html`).

| Page | What it shows | States |
|---|---|---|
| [mailbox.html](mailbox.html) | Letters: a data table of the Mailbox with sort, filters and pagination, and the reading pane from 1366 px | `default` (a letter open), `unopened`, one for each other letter (`x1`, `r15`, `r6`, `r16`, `r5`, `r3`, `r2`, `r1`, `r4`), `loading`, `error`, `empty` (MyEPO not linked) |
| [letter.html](letter.html) | One letter on its own page: below 1366 px a row opens it | `default`, `unopened`, one for each other letter |

## Decisions in the mockups

- **The columns are the fields of the MyEPO list** (`flowleap/docs/2026-11-09-myepo-api-study.md`): title, application number, the firm's reference, applicant, dispatch date, read and handled. The document code is not shown (product rule 4 of the design language).
- **Each letter shows, with or without a rule.** The page does not use the code table or the deadline engine.
- **Opening is a person's act.** A row shows the list data at once. **Open the letter** downloads the PDF, and MyEPO then shows the letter as read for the firm (sandbox result of 2026-11-09). The page says this only on an unread letter.
- **Read and handled are read only.** The page shows the two flags of MyEPO. It has no control that writes to MyEPO.
- **The sidebar keeps My work, Matters and Clients** (founder, 2026-11-15). It has no Deadlines row, because that page does not exist.

## Open points for the founder

1. Is a click on a row sufficient to open the letter, or is the **Open the letter** button correct?
2. The mirror shows all letters of the firm to each person. A screen on a matter does not hide its letters here, because the mirror knows no matter.
3. The Mailbox folders of MyEPO are not shown.

## Data

- **Applications and letters.** The seed firm (`flowleap-seed-firm`): the file numbers, application numbers, applicant names and dispatch dates of ten letters, as the MyEPO surfaces mockups of PR 388 list them. The letter titles are those of `flowleap-os/lib/record/office-codes.mjs`.
- **Examples.** The values of read and handled, the time of the last read, the letter `x1` (a real kind of letter of the EPO sandbox Mailbox, with no application), and "Page 1 of 4".
- **The letter image.** The page image of the Rule 71(3) communication of SF-2023-0045, from the MyEPO surfaces mockups.

## Build and check

The pages are generated. Edit `build.mjs`, then run `node build.mjs` in this folder. `frame.js`, `table.js` and `surfaces.css` are copies from the MyEPO surfaces mockups (PR 388); `mailbox.css` has the new parts.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/mailbox-mirror --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/mailbox-mirror
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/mailbox-mirror --shoot <dir>
```

On 2026-11-15, `check-css.mjs` and `check-copy.mjs` passed. `check-mockups.mjs` did not run: the Playwright browser is not installed on this computer.
