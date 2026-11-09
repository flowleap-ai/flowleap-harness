# Client model mockups

HTML mockups of [the client model](../../2026-11-09-client-model.md) and of the Add client steps that [Add client for large clients](../../2026-11-09-add-client-large-clients.md) changes: the Clients list, the client page with its application table and its files, step 1 with the two counts of each name and the docket states, the review from the firm docket, the **Record** step that replaces the build, the page of one application, and the firm identity setting. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md), except where a founder decision below says otherwise, and extend the approved [Add client mockups](../add-client/README.md). They wait for the founder's approval.

## How to view

The pages need the client theme: the skill's `records.css` imports `packages/client/ui-theme/src/styles/*.css` by a relative path, so a page copied out of the repository shows without styles. Open the pages from a checkout of this branch, or serve the repository root and open them over HTTP:

```sh
python3 -m http.server 8000 --directory <repository root>
```

Then open `http://localhost:8000/flowleap/docs/mockups/client-model/0-clients.html?walk=1`.

## Walkthrough

[0-clients.html?walk=1](0-clients.html?walk=1) starts a clickable walkthrough of the whole flow with the real Syntegon data. A panel at the bottom of the sidebar shows the step (1 of 13), what the person sees, and **Back** and **Next**; the one control that goes on has a blue outline.

1. The Clients list (Clients in the sidebar) → **Add client**.
2. Step 1 with an empty field → click the field.
3. Step 1 with "Syntegon" and its 5 names, each with its two counts → **Continue**.
4. The review: 16 matters, the conflict check, the role → **Add client**.
5. Record: the progress; the page goes on by itself.
6. Record done → **Open client page**.
7. The client page, Applications tab → the row EP 23 171 862.
8. The page of that application: its story, its matter folder and the chat placeholder → **Next**.
9. An application with no work yet: its story and the empty matter folder → **Syntegon** in the top bar.
10. The client page → **Files**.
11. The Files tab → **Clients** in the sidebar.
12. The Clients list with Syntegon → the row **Syntegon** (the way in to an existing client).
13. The client page again: the end.

The walkthrough is in English. The German pages follow when the founder agrees with the English flow. Without `?walk` the pages are plain mockups; the tables sort, filter and page, and a row opens its page.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state.

| Page | What it shows | States |
|---|---|---|
| [0-clients.html](0-clients.html) | The Clients list as a data table: client, role, applicant names, EP applications at your firm, matter folders, added; **Add client** | `after` (Syntegon added, with the toast) |
| [1-client-applications.html](1-client-applications.html) | The Syntegon client page, Applications tab: the client, its role and its applicant names; the client's instructions and wishes (empty: what goes there and how it fills); **At your firm** and **At other firms**; the 16 applications in a data table with application, publication, title, status, next deadline, last register event with its date, representative changed and matter folder; sortable headers, a filter bar (text, status, matter folder) and pagination; the sources with their times | `instructions` (3 instructions with their sources), `search` (**At other firms**: the live count and a search, with **This is ours**), `myepo` (later: the firm's file numbers and the MyEPO source line), `loading` (skeleton rows), `error` (the EP Register did not answer; the times of the last read and **Try again**), `empty` (Gerhard Schubert: no EP application at your firm), `large` (Siemens: "1–25 of 1,132") |
| [2-client-files.html](2-client-files.html) | The Files tab: the client folder page with only `00 Client` and `About this folder.md`, and the line that says when a matter folder appears | `work` (the folder of EP 23 171 862 after a person dropped the first file on it) |
| [3-find.html](3-find.html) | Step 1: the group of 5 Syntegon names, each with **At your firm** and **Matching EP applications**, and the docket line | `empty` (no name typed yet), `reading` (progress; skeleton counts; **Continue** waits and says why), `partial` (one query failed; "at least" and **Try again**), `failed` (no count at your firm, **Try again**, and why **Continue** waits), `none` (no firm identity; a link to the setting), `large` (Siemens with "10,000+") |
| [4-review.html](4-review.html) | Step 2: "16 EP matters at your firm" from the docket, the matters with a checkbox, the conflict check, the count at other firms with the search field, and the decision bar | `address` (one row matched by address only, in its own group), `search` (a search among the applications at other firms), `large` (Siemens) |
| [5-record.html](5-record.html) | Step 3, **Record**: the client record, the conflict check, the 16 applications in 1 batch, and "Keep this page open until the records are written" | `large` (batch 8 of 12), `failed` (batch 8 failed; **Try again** records only the missing batches), `done` (**Open client page**) |
| [6-firm-identity.html](6-firm-identity.html) | Settings, Firm identity: the line on what FlowLeap sends, the docket state with its read time, and the firm's names, addresses and representatives | `reading`, `partial`, `failed`, `empty` (no firm identity; **Save** waits for a value and then starts the first read) |
| [7-matter.html](7-matter.html) | One application of the client, EP 23 171 862: its status, publication, applicant and representative change; its story from the EP Register and the Firm Record; its matter folder with one dropped file; and the chat, marked **Placeholder** | `empty` (EP 23 215 725: the story, no matter folder yet, and how the first file makes it) |

The decision bar of the review holds the one primary action, **Add client** `⇧⌘↵`. The client page, the Files tab and the application page have **Ask about this**, the Clients list has **Add client**, step 1 has **Continue**, the Record step has **Open client page**, and the setting has **Save**; none of these has a key. **Try again** has `R`. From 1080 px down, the top bar acts that do not fit go into the overflow button.

## Decisions for the founder

1. **The application list is a normal data table** (founder, 2026-11-09: "it should be a normal table with pagination and filters"). It replaces the list grouped by register status. Status is a column with the EP Register's own words (also on the German pages, because they are register data); the filter bar filters by text, status and matter folder; each header sorts; the footer pages with 10, 25, 50 or 100 rows. The table has no row selection, no bulk bar and no row context menu; product rule 1 of the design language asks for them, and that rule change goes to the founder separately. The Clients list uses the same table.
2. **The client page has two tabs in the top bar**, **Applications** with its count and **Files**, as a Linear project has its views in the top bar. Below 1080 px the tabs replace the breadcrumb.
3. **Step 1 waits for the docket.** While the docket is read or after it failed, **Continue** is disabled, because the review cannot show the firm's matters. With no firm identity, **Continue** stays enabled, so a person can still add a client by name.
4. **The next deadline column shows a dash** until the deadline docket has the deadline; the source line above the table says so once.
5. **The matter folder is a column** with "Yes" and a folder icon, and a filter (all, with, without). It replaces the icon-only column and the **With a matter folder** chip of the grouped list.
6. **"Representative changed", not "Representative since".** The EP Register gives the date of the last change of the representative entry, not the date when the firm took the case (EP 25 210 820 was filed on 23 Oct 2025 and shows 3 Apr 2026). The column says what the date is; the firm's own start date can come later from the firm's files or MyEPO.
7. **The applications at other firms are a view, not a table.** **At your firm** and **At other firms** stay above the table; **At other firms** shows the live count and a search field, because FlowLeap keeps no list of them.
8. **A row matched by address only starts unticked.** [The large-client sheet](../../2026-11-09-add-client-large-clients.md#the-firm-docket) lets a person untick it; the mockup goes one step further, because another firm can have the same address and a wrong row would record another firm's matter. The counts and the decision bar count the row only when a person ticks it.
9. **A row of the table opens the application.** With a matter folder, the page shows its story, its files and the chat; with none, the same story and an empty folder state that says the first file makes the folder. The chat is a placeholder until the matter page is built.

## Proposal: one shared table component

The harness client has no table component today. The build should add one in `ui-primitives` on [TanStack Table](https://tanstack.com/table): it is headless, so it renders with the client tokens and `MenuSurface`, and it gives sorting, filtering, pagination, column visibility and server-side paging for a large docket. The repository already uses `@tanstack/react-virtual` in `packages/client/ui-chat`, `packages/client/web` and the session inspector, which pairs with it for long tables. The Clients list, this application table, and later Matters and Office actions use the same component. `table.js` in this folder only imitates its behavior for the mockups.

## Linear references

| Choice | Linear screen | Why |
|---|---|---|
| **Applications** and **Files** as tabs in the top bar | [Projects](https://linear.app/docs/projects): a project has its views as tabs, such as **Issues** | One client, two views of it, one click apart |
| **At your firm** and **At other firms** above the table | [Filters](https://linear.app/docs/filters) | Two views of one group as chips |
| The data table with sortable headers, a filter bar and pagination | None: a founder decision (decision 1) | The founder asked for a normal table |

## Data

- **Syntegon.** EP Register, read on 2026-11-09 through the FlowLeap patent data tools: the 5 applicant names with their counts (`pa="<name>"`), the 16 applications whose representative is your firm with their status, last register event and the date of the last change of the representative entry, the 272 applications of `pa="Syntegon"` (so 256 at other firms), the 4 results of the search "weighing" (`pa="Syntegon" and ti=weighing`), and the register events of EP 23 171 862 and EP 23 215 725 for their stories. For the 3 applications with only an international publication, the register gives no EP event.
- **Your firm.** The seed firm of the dev loop. Its docket (one address query) has 38 EP applications on 2026-11-09, 16 of them Syntegon and 9 Bucher Hydraulics. The setting shows the firm with fictional names (Muster & Partner, the seed users Dr. Anna Becker and Jonas Weber), and the docket line counts one query for each of its 4 entries.
- **The Clients list.** Bucher Hydraulics (2 names, 9 EP applications at your firm) and Gerhard Schubert (none) are clients of the dev loop; their "added" dates are examples.
- **Siemens.** The 10 applicant names and their counts are real (EP Register, 2026-11-09; `pa="Siemens Aktiengesellschaft"` answers 10,000, the cap). Your firm has no Siemens matter. So these values are examples: the 1,132 applications at your firm (the count of one test query in the large-client sheet), the docket of 16,204 rows, and the 12 rows of the table, which are real Siemens Aktiengesellschaft applications of October 2026 at other firms, with the register's last change of representative. The pages mark these parts **Example**.
- **Gerhard Schubert.** `pa="Gerhard Schubert"` gives 57 EP applications on 2026-11-09, none at your firm. The conflict line on its page repeats the approved Add client mockups, where Syntegon Packaging Systems AG opposed one of its patents.
- **Examples.** The 3 instructions, the file numbers of the `myepo` state, the matter folder of EP 23 171 862 and its dropped file, the address-only match of EP 25 712 877, and the progress and failure counts of the docket and of the Record step.
- **Verbatim text.** Register statuses, register events, applicant names and file names carry `data-verbatim`.
- **No firm names.** The search results name the town of the representative, never the firm.

## Build and check

The pages are generated. Edit `build.mjs` or `data.mjs`, then run `node build.mjs` in this folder. The pages load `records.css` of the skill, `../add-client/add-client.css` and `client-model.css`, draw the app sidebar with `../add-client/frame.js`, and run `table.js` and `walk.js`.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/client-model --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/client-model
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/client-model --shoot <dir>
```

`check-mockups.mjs` needs Playwright (`FLOWLEAP_PLAYWRIGHT`, see the skill). The screenshots are not committed.
