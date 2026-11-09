# Add client mockups

HTML mockups of [Add client](../../2026-11-08-add-client.md): find a company, confirm its group of applicant names, choose the role in a decision, see the firm's matters or a conflict, build the client folder, and end on the client folder page. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md). The founder approved them on 2026-11-08.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state.

| Page | What it shows | States |
|---|---|---|
| [1-find.html](1-find.html) | The empty search: what Add client does, and that only the name leaves the firm | `loading`, `group` (8 names ticked, the source line), `error` (the data plugin does not answer), `plugin` (no data plugin: add by name only), `existing` (Syntegon is already a client) |
| [2-review.html](2-review.html) | Syntegon: "16 EP matters at your firm" as the key fact, the matters, the limits of public data, no conflict, and the decision bar with the role | `reference` (the list at other firms) |
| [3-conflict.html](3-conflict.html) | Gerhard Schubert as a client: one possible conflict with the client Syntegon, and no EP matter at your firm | `checked` (the person checked the conflict and wrote why), `watch` (the Watch role), `other` (the Other party role, with the matter picker) |
| [4-build.html](4-build.html) | The build: the records first, then the folders, with the step that runs | `failed` (3 publications not read; Try again reads only those) |
| [5-client-folder.html](5-client-folder.html) | The end: the Syntegon client folder page with the toast | `snapshot` (a dated EP Register file of the matter EP 23 171 862) |

The decision bar holds the one primary action, **Add client** `⇧⌘↵` (the `record` act of the [key map](../../../../.agents/skills/flowleap-design-language/keys.md)), and the role as a segmented control. A part that is not set, such as an unchecked conflict, disables the primary. The founder replaced this decision bar with a stepper wizard and a Review step on 2026-11-09: see [decision 10 of the client model mockups](../client-model/README.md#decisions-for-the-founder). Page 1 has **Continue** in the top bar and page 4 has **Open client folder**; neither has a key. **Try again** has `R`.

## Founder decisions

- **Grouping.** The matters list groups by **At your firm** and **At other firms**, not by state, because these rows have no atlas state yet. The founder approved this exception to product rule 1, as for the folder page's **Folders** and **Files**.
- **Keys.** The pages show only `⇧⌘↵` and `R` from the key map. Add client has no key of its own (approved); ⌘K finds it.

## Data

- **Syntegon.** The 8 applicant names and their application counts are from PATSTAT 2026 Spring (demo loop 2). The 272 and 16 EP applications and the matter rows are from the EP Register of 2026-11-08. The reference rows are the first 10 of the 256 at other firms; they name the town of the representative, never the firm.
- **Gerhard Schubert.** 4 applicant names from PATSTAT 2026 Spring, 57 EP applications in the EP Register, and none with your firm as the representative (both read on 2026-11-08). The opposition is real: Syntegon Packaging Systems AG opposed EP 3 296 081 of Gerhard Schubert GmbH on 8 January 2025, and the patent is revoked. That Syntegon is a client of your firm is the premise of the demo.
- **Examples.** The reason text in `3-conflict.html?state=checked`, the progress counts on page 4, and the failure of 3 publications in the `failed` state are examples, not a recorded failure.
- **Verbatim text.** PATSTAT names are in capitals, and "PATSTAT" is the name of a data product. Both carry `data-verbatim`, so the deny-list for account handles does not apply to them. Folder and file names carry it too, as on the folder page.

## Build and check

The pages are generated. Edit `build.mjs`, then run `node build.mjs` in this folder. `add-client.css` adds the parts that the reference `records.css` of the skill does not have, and repeats the folder page parts from the [client folder mockups](https://github.com/flowleap-ai/flowleap-harness/pull/358). `frame.js` draws the app sidebar of the `flowleap-web` profile with the **Clients** entry.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/add-client --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/add-client
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/add-client --shoot <dir>
```

`check-mockups.mjs` needs Playwright (`FLOWLEAP_PLAYWRIGHT`, see the skill). `--shoot` writes each page and state at 1440 × 900, 1366 × 650 and 390 × 844, light and dark, in English and German (192 screenshots); they are not committed.
