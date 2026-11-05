# References

## Linear

We learn Linear's rules for quality and patterns. We do not copy its brand, icons or layouts.

| Reference | URL | What it teaches |
|---|---|---|
| How we redesigned the Linear UI | https://linear.app/now/how-we-redesigned-the-linear-ui | Themes from three variables (base colour, accent colour, contrast) in LCH; elevation by surface levels; Inter Display for headings and Inter for the rest |
| Behind the latest design refresh | https://linear.app/now/behind-the-latest-design-refresh | "Structure should be felt not seen": a sidebar a few notches dimmer, fewer separators, fewer and smaller icons |
| Triage docs | https://linear.app/docs/triage | Single-key acts: accept with 1, decline with 2, duplicate with 3, snooze with H |
| Inbox docs | https://linear.app/docs/inbox | `J` and `K` move through the list |
| Select issues docs | https://linear.app/docs/select-issues | `X` or ⇧ click selects; bulk acts at the bottom of the view and in ⌘K; a right-click on the selection opens its acts |
| Changelog | https://linear.app/changelog | The current patterns; look here first when a choice is open |
| Triage list (image) | https://webassets.linear.app/images/ornj730p/production/30183e73c9ef009bb8cb14adbe97d9f34a5b9a69-2352x1632.png | A list with the title, then source and actor; key and age right-aligned; no boxes |
| Triage header (image) | https://webassets.linear.app/images/ornj730p/production/c40aa85cbcf9b1ae058bd94c2fb3dd7d2017270a-1784x515.png | A 44 px view header: view icon, name, filter and display icons at the right |

### Live Linear measurements

The independent reviews of PR 288 measured and observed linear.app in the browser on 2026-11-04. Rules cite the measurements as [L-LIVE] and the second review's queue, header and avatar observations as [L-REVIEW2]. The skill takes Linear's layout numbers and keeps the client's look (font, colours, radii).

| Part | Linear | This skill |
|---|---|---|
| Font | Inter Variable, weights 450 and 550 | The client font (`--dsw-font-family`), 400 and 500 |
| Issue row | 44 px, no hairlines | 44 px, no hairlines |
| Group header | Tinted, 36 px, 8 px radius | Tinted, 36 px, 12 px radius (the client radius of a 32 to 40 px cell) |
| Properties column | About 376 px | 376 px |
| ⌘K menu | 713 px wide, 46 px items, a key for every act | 712 px (a multiple of 8), 44 px items (the row height), a key for every act, Menu material |
| Description text | 15 px | 14 px (the client `s-14` role) |
| Neutral borders | 0.5 px | 0.5 px |
| Detail page | The controls stay in place on every detail page | The decision bar is docked on every decision page |
| Queue | List and detail side by side | Side by side from 1366 px (R20) |
| List headers | Group and column headers stay in view while the list scrolls | Sticky, the next group pushes the last one out |
| People in rows | An avatar only, the name on hover | An avatar only, the name on hover and as its accessible name |

## Guides

The rule sources with their URLs are in [rules.md](../rules.md#sources).

## Reference mockups

The Records redesign in [mockups/](mockups/), on the harness client theme and in the client's `AppFrame` layout (the sidebar and a flush content column): `records.css` imports `packages/client/ui-theme/src/styles`, and `frame.js` sets `body[data-ds-dark-theme]` for the dark theme. Open a file with `?theme=dark` or `?theme=light`, and with `?state=<name>` for the view states that its `data-state` attributes name. `frame.js` draws the app sidebar and the icons and computes every "days left" from the demo date 2026-11-04. The people are display names from Entra: Dr. Anna Becker (responsible attorney), Jonas Weber (attorney), Lena Hoffmann (formalities). Check the folder from the skill folder with `node scripts/check-mockups.mjs references/mockups`, `node scripts/check-css.mjs references/mockups` and `node scripts/check-copy.mjs references/mockups`; add `--shoot <dir>` to the first to screenshot every page, state, theme and size.

| Mockup | Screen | States |
|---|---|---|
| [a-intake-list.html](mockups/a-intake-list.html) | Intake: 22 letters in six atlas groups; from 1366 px the list and the open letter side by side | `cmdk`, `context`, `select`, `scrolled`, `empty`, `loading`, `error` |
| [b-intake-item.html](mockups/b-intake-item.html), [German](mockups/b-intake-item.de.html) | Intake item below 1366 px: which matter is this letter for | `more` (the overflow menu at 390 px) |
| [c-matter.html](mockups/c-matter.html) | Matter: deadlines, work, office events, documents | |
| [d-deadline.html](mockups/d-deadline.html) | Deadline: is this date right | `more` |
| [e-letter-work.html](mockups/e-letter-work.html), [German](mockups/e-letter-work.de.html) | Work on a letter: the client report and the deadline check | `evidence`, `missing`, `activity`, `more` |
| [f-work-board.html](mockups/f-work-board.html) | Work board at rest: four state columns with their cards | `drag` (the allowed moves, and why a column takes no card) |

## Screenshots

From the mockups above. A list page with a split view and a decision page are one view, with the decision bar docked at the bottom; other pages are full height. The 390 px views run on a touch screen, so no key shows.

| Screen | Dark | Light | German | 390 px |
|---|---|---|---|---|
| Intake, list and letter side by side | [1440](screenshots/a-intake-list-dark-1440.png) | [1366](screenshots/a-intake-list-light-1366.png) | | [dark](screenshots/a-intake-list-dark-390.png) |
| Intake, three letters selected | | [1366](screenshots/a-intake-list-select-light-1366.png) | | [dark](screenshots/a-intake-list-select-dark-390.png) |
| Intake, row context menu | [1440](screenshots/a-intake-list-context-dark-1440.png) | | | |
| Intake, scrolled (sticky headers) | [1366](screenshots/a-intake-list-scrolled-dark-1366.png) | | | |
| Intake, command menu | [1440](screenshots/a-intake-list-cmdk-dark-1440.png) | | | |
| Intake, empty | [1440](screenshots/a-intake-list-empty-dark-1440.png) | | | |
| Intake, error | | [1440](screenshots/a-intake-list-error-light-1440.png) | | |
| Intake item | | [1366](screenshots/b-intake-item-light-1366.png) | [dark 1440](screenshots/b-intake-item-de-dark-1440.png) | [overflow menu](screenshots/b-intake-item-more-dark-390.png) |
| Matter | | [1440](screenshots/c-matter-light-1440.png) | | [dark](screenshots/c-matter-dark-390.png) |
| Deadline | [1366](screenshots/d-deadline-dark-1366.png) | | | |
| Work on a letter | [1440](screenshots/e-letter-work-dark-1440.png) | | [dark 1440](screenshots/e-letter-work-de-dark-1440.png) | [dark](screenshots/e-letter-work-dark-390.png) |
| Work, missing evidence | | [1440](screenshots/e-letter-work-missing-light-1440.png) | | |
| Work board at rest | [1440](screenshots/f-work-board-dark-1440.png) | [1366](screenshots/f-work-board-light-1366.png) | | |
| Work board, a card dragged | [1440](screenshots/f-work-board-drag-dark-1440.png) | | | |
