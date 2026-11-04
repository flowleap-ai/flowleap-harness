# References

## Linear

We learn Linear's rules for quality and patterns. We do not copy its brand, icons or layouts.

| Reference | URL | What it teaches |
|---|---|---|
| How we redesigned the Linear UI | https://linear.app/now/how-we-redesigned-the-linear-ui | Themes from three variables (base, accent, contrast) in LCH; elevation by surface levels; one display face for headings |
| Behind the latest design refresh | https://linear.app/now/behind-the-latest-design-refresh | "Structure should be felt not seen": a dimmer sidebar, fewer separators, smaller icons |
| Triage docs | https://linear.app/docs/triage | Single-key acts (1 accept, 2 decline, 3 duplicate, H snooze); accept and decline take an optional comment |
| Inbox docs | https://linear.app/docs/inbox | `J` and `K` move through the list; unread is a small accent dot; status icon at the row edge |
| Changelog | https://linear.app/changelog | The current patterns; look here first when a choice is open |
| Triage list (image) | https://webassets.linear.app/images/ornj730p/production/30183e73c9ef009bb8cb14adbe97d9f34a5b9a69-2352x1632.png | A two-line list: title, then source and actor; key and age right-aligned; hairlines, no boxes |
| Triage header (image) | https://webassets.linear.app/images/ornj730p/production/c40aa85cbcf9b1ae058bd94c2fb3dd7d2017270a-1784x515.png | A 44 px view header: view icon, name, filter and display icons at the right |
| Inbox, dark (image) | https://webassets.linear.app/images/ornj730p/production/b442b340278740de70919c868dce1afca4335fe7-3600x2080.png | Read rows fade to the tertiary text colour |
| Issue page (founder's screenshot, not public) | none | Top bar with status, key, title and "1 / N"; title, description, then Activity where system events are one muted line; a docked agent panel shows the result as a card with Preview; the top bar and properties stay fixed while the content scrolls |

## Guides

The rule sources with their URLs are in [rules.md](../rules.md#sources).

## Reference mockups

The approved Records redesign (founder, 2026-11-04) in [mockups/](mockups/). Open a file with `?theme=dark` or `?theme=light`, and with `?state=<name>` for the view states that its `data-state` attributes name. `frame.js` draws the app sidebar and the icons and computes every "days left" from the demo date 2026-11-04. Check the folder with `node ../../scripts/check-mockups.mjs .` from inside it, and add `--shoot` to screenshot every page and state.

| Mockup | Screen | States |
|---|---|---|
| [a-intake-list.html](mockups/a-intake-list.html) | Intake list, grouped by state | `cmdk`, `empty`, `loading`, `error` |
| [b-intake-item.html](mockups/b-intake-item.html), [German](mockups/b-intake-item.de.html) | Intake item: which matter is this letter for | |
| [c-matter.html](mockups/c-matter.html) | Matter: deadlines, work, office events, documents | |
| [d-deadline.html](mockups/d-deadline.html) | Deadline: is this date right | |
| [e-letter-work.html](mockups/e-letter-work.html), [German](mockups/e-letter-work.de.html) | Work on a letter: the client report and the deadline check | `evidence`, `missing`, `activity` |
| [f-work-board.html](mockups/f-work-board.html) | Work board with allowed moves | |

## Screenshots

1440 px wide, from the mockups above. The work page is one 1440 × 900 view; the other pages are full height.

| Screen | Light | Dark | German |
|---|---|---|---|
| Intake list | [light](screenshots/a-intake-list-light.png) | [dark](screenshots/a-intake-list-dark.png) | |
| Intake list, command menu | | [dark](screenshots/a-intake-list-command-dark.png) | |
| Intake list, empty | | [dark](screenshots/a-intake-list-empty-dark.png) | |
| Intake list, loading | | [dark](screenshots/a-intake-list-loading-dark.png) | |
| Intake list, error | [light](screenshots/a-intake-list-error-light.png) | | |
| Intake item | [light](screenshots/b-intake-item-light.png) | | [dark](screenshots/b-intake-item-de-dark.png) |
| Matter | [light](screenshots/c-matter-light.png) | | |
| Deadline | | [dark](screenshots/d-deadline-dark.png) | |
| Work on a letter | [light](screenshots/e-letter-work-light.png) | [dark](screenshots/e-letter-work-dark.png) | [dark](screenshots/e-letter-work-de-dark.png) |
| Work, evidence on hover | [light](screenshots/e-letter-work-evidence-light.png) | | |
| Work, missing evidence | [light](screenshots/e-letter-work-missing-light.png) | | |
| Work board | | [dark](screenshots/f-work-board-dark.png) | |
