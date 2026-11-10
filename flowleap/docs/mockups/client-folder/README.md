# Client folder mockups

HTML mockups of [the client folder page](../../2026-11-08-client-folder-page.md): a client's folder with no chat, a file open in the middle, adding and organizing files, and **Ask about this**. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md). The founder approved them on 2026-11-08.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state.

| Page | What it shows | States |
|---|---|---|
| [1-client-folder.html](1-client-folder.html) | The Syntegon client folder: 15 family folders, the client mail folder and two files | `context` (row menu), `select` (two rows checked, the bulk bar), `loading`, `error`, `more` (390 px overflow menu) |
| [2-matter-folder.html](2-matter-folder.html) | The Office folder of matter EP 23 171 862 with its three files | `matter` (the matter folder with its six template folders), `empty` (the empty Drafts folder), `tree` (the tree at 390 px), `loading`, `error`, `more` |
| [3-file-open.html](3-file-open.html) | The published PDF EP 4 292 805 A1 open in the middle | `markdown` (Search report.md), `mail` (the sample client mail), `more` |
| [4-drop.html](4-drop.html) | Three files dragged onto the Search folder | `adding` (progress in the rows), `conflict` (Keep both or Skip), `done` (the new rows and the toast), `more` |
| [5-organize.html](5-organize.html) | A new folder being named in the matter folder | `invalid` (the name is already there), `rename` (a file name in edit), `move` (Move to… the matter's Client folder), `more` |
| [6-ask.html](6-ask.html) | The new chat that **Ask about this** opens, with the PDF referenced and in the right sidebar | `folder` (a folder referenced), `sent` (the answer with its source file) |

**Ask about this** is the one primary action on each folder and file view. In the `select` state the bulk bar holds it ("Ask about these 2"); in a dialog the dialog's act is the primary and the page under it is inert. The page has no delete act ([note](../../2026-11-08-client-folder-page.md#what-the-page-does)).

## Founder decisions

- **Grouping.** The list groups by **Folders** and **Files**, not by state, because a file has no state. This is an exception to product rule 1, as My work has one; the founder approved it ([decision 2](../../2026-11-08-client-folder-page.md#founder-decisions)).
- **Keys.** The pages show only keys of the [key map](../../../../.agents/skills/flowleap-design-language/keys.md): `↵` (Open) in the row menu and `R` (Try again). The founder approved the keys of the new acts ([decision 3](../../2026-11-08-client-folder-page.md#founder-decisions)); they go into the key map with the build.
- **Long names.** The real folder names are long. The tree rows and the list rows end a long name in an ellipsis, as the title cell of a list row does (R17); the folder header shows the full name, and every row has it on hover.

## Data

- The folder is a snapshot of `~/flowleap-demo/Syntegon` (demo loop 4, 2026-11-08): the real folder names, file names and sizes, in `build.mjs`. Every file there was written on 8 November 2026, so every Modified date is that day.
- The sources are where **Add client** read each file: the EP Register, the EPO publication server and EPO OPS. "Demo sample" marks the made-up client mail. The drop state adds the cited documents D1 and D2 of the search report as uploads of Dr. Anna Becker, the attorney of the design language's cast; their sizes are examples.
- [scan/ep-4-292-805-a1-page-1.webp](scan/ep-4-292-805-a1-page-1.webp) is page 1 of the published EP 4 292 805 A1, rendered at 110 dpi. The representative block (74) shows "your firm" in place of the published name.
- The answer in `6-ask.html?state=sent` is the computed table of `Search report.md`: no claim is free of X documents; claims 6, 9, 11 and 12 have one X document each.
- File and folder names are data from disk, not product copy, so they carry `data-verbatim`: the copy deny-list does not apply to them (a name such as `Search report.md` looks like an account handle to it).

## Build and check

The pages are generated. Edit `build.mjs`, then run `node build.mjs` in this folder. `client-folder.css` adds the parts that the reference `records.css` of the skill does not have; `frame.js` draws the app sidebar of the `flowleap-web` profile with the **Clients** entry.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/client-folder --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/client-folder
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/client-folder --shoot <dir>
```

`check-mockups.mjs` needs Playwright (`FLOWLEAP_PLAYWRIGHT`, see the skill). `--shoot` writes each page and state at 1440 × 900, 1366 × 650 and 390 × 844, light and dark, in English and German (348 screenshots); they are not committed.
