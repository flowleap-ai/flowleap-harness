# First-demo mockups

HTML mockups of the first demo of [sheet 00, the connected flow](../../process-atlas/00-connected-flow.md): two roles (the formalities person and the attorney), the five scope points, and the value moment on one real seed letter. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md) and wait for the founder's approval. No UI code is built from them before that approval.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state.

| Page | Person | Scope point | States | QA findings it resolves |
|---|---|---|---|---|
| [1-my-work-formalities.html](1-my-work-formalities.html) | Tobias Schmitt | 1. One line of what waits for me | `empty`, `loading`, `error` | 2, 4, 5, 7, 22, 38 |
| [1-my-work-attorney.html](1-my-work-attorney.html) | Dr. Anna Becker | 1, 4 | | 2, 22, 28, 38 |
| [2-file-letter.html](2-file-letter.html) | Tobias Schmitt | 2. The letter arrives, is read, and the matter is found | `disagree` (Check the office event, nothing chosen), `disagree-ready` (the date chosen), `no-reading` (Enter the office event), `more` | 8, 9, 10, 11, 14, 44, #325 |
| [3-confirm-deadline.html](3-confirm-deadline.html) | Tobias Schmitt | 2, 3. The deadline with its reasons; the named confirmer | `waiting` (Tobias Schmitt decided the date, so Lena Hoffmann confirms), `more` | 22, 29, 30, 31, 33, 34, 35, 36 |
| [3-confirm-deadline-second.html](3-confirm-deadline-second.html) | Lena Hoffmann | 3. The named second confirmer | `more` | 22, 31 |
| [4-review-work.html](4-review-work.html) | Dr. Anna Becker | 4. The attorney's one action | `ready` (all parts decided), `evidence`, `more` | 28, 38 |
| [5-dossier.html](5-dossier.html) | Tobias Schmitt | 5. The dossier, names, sign-out and search | `account` (account menu), `search` (find a matter) | 1, 15, 22, 23, 24, 25, 27, 28, 39 |
| [6-mail-formalities.html](6-mail-formalities.html) | Tobias Schmitt | 3. Confirm in one click from a notice | | 22, 31 |
| [6-mail-attorney.html](6-mail-attorney.html) | Dr. Anna Becker | 4. The worked letter waits for the attorney | | 28, 38 |
| [6-mail-second.html](6-mail-second.html) | Lena Hoffmann | 3. The named second confirmer gets the notice | | 22, 31 |

The primary action of each decision page is the one that sheet 00 names: **File**, **Confirm** and **Record decision**; the hand entry has **Enter office event**. A decision starts with nothing chosen: **Record decision** stays disabled until each part is decided, and the bar names the open parts. The first line of My work is counted from its rows. Each mail button opens the decision page and decides nothing (README decision F2 of the atlas).

## Data

All data comes from the seed firm (`flowleap-seed-firm`, commit cee0c11) and the deadline engine (`flowleap-deadlines`):

- The demo letter is the real Rule 71(3) communication of seed case `r71-3-en-open` (row 18 of EP23771920), dated 29 September 2026. Its page images in [scan/](scan/) are the register PDF rendered at 110 dpi; the quotes are its exact text.
- The due date is Friday 29 January 2027: delivery on the date of the letter (Rule 126(2) EPC), start on 30 September 2026 (Rule 131(2) EPC), four months (Rule 71(3) and Rule 131(4) EPC), and no move, because the EPO filing offices are open that day (Rule 134(1) EPC, closing days of 2027 in OJ EPO 2026, A30). The engine has no 2027 calendar yet (#326), so it refuses this date today; the steps follow its rule `ep.r71-3.grant-communication` version 1.
- The demo day is Monday 9 November 2026. It is `TODAY` in `build.mjs`, which writes it into `<html data-today>`; `frame.js` computes every "days left" from it, so a new demo day is one edit.
- The "Readings differ" state uses the second date of the real letter: the footer prints 25.09.2026 beside the form number.
- The persons follow the seed wall of SF-2023-0045 (coordinator decision of 2026-11-07, `HANDOFF.md`): Tobias Schmitt is the formalities person, Dr. Anna Becker the responsible attorney since 15 October 2026 (seed case `S2`, the handover from Lena Hoffmann), and Lena Hoffmann the other confirmer. Sheet 00 names Sabine Wolf and Jonas Weber; they are outside the wall of this matter. The persons are one table at the top of `build.mjs`, so a change of the cast is one edit.
- The second row of the attorney is the notice of opposition of SF-2026-0019 (seed case `r79-1-opposition`; four months from 14 October 2026 end on a Sunday, so on Monday 15 February 2027). Its worked state and its task due date of 15 January 2027 are demo assumptions (`ticket.decideBy` one month before the legal date), and no mockup page opens it.
- The client report asks Renishaw for instructions by Friday 15 January 2027 (`INSTRUCT_BY`, two weeks before the due date), a firm choice.
- The persons, the task words and the task kinds are those of sheet 00 sections 3 and 9. The status words come from the skill's status map.

## Build and check

The pages are generated. Edit `build.mjs`, then run `node build.mjs` in this folder. `first-demo.css` adds the parts that the reference `records.css` of the skill does not have; `frame.js` is the reference frame with My work, the account button and the demo day.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/first-demo
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/first-demo
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/first-demo --shoot <dir>
```

`check-mockups.mjs` needs Playwright (`FLOWLEAP_PLAYWRIGHT`, see the skill). `--shoot` writes each page and state at 1440 × 900, 1366 × 650 and 390 × 844, light and dark, in English and German (300 screenshots); they are not committed.
