# Client model mockups

HTML mockups of [the client model](../../2026-11-09-client-model.md) and of the Add client steps that [Add client for large clients](../../2026-11-09-add-client-large-clients.md) changes: the Clients list, the client page with its application table and its files, step 1 with the two counts of each name and the docket states, the review from the firm docket, the **Record** step that replaces the build, the page of one application, and the firm identity setting. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md), except where a founder decision below says otherwise, and extend the approved [Add client mockups](../add-client/README.md). The founder approved the English walkthrough on 2026-11-09, then asked for Add client as a stepper wizard with a review step at the end (decision 10).

## How to view

The pages need the client theme: the skill's `records.css` imports `packages/client/ui-theme/src/styles/*.css` by a relative path, so a page copied out of the repository shows without styles. Open the pages from a checkout of this branch, or serve the repository root and open them over HTTP:

```sh
python3 -m http.server 8000 --directory <repository root>
```

Then open `http://localhost:8000/flowleap/docs/mockups/client-model/0-clients.html?walk=1`, or `0-clients.de.html?walk=1` for German.

## Walkthrough

[0-clients.html?walk=1](0-clients.html?walk=1) starts a clickable walkthrough of the whole flow with the real Syntegon data; [0-clients.de.html?walk=1](0-clients.de.html?walk=1) starts it in German. A panel at the bottom of the sidebar shows the step (1 of 18), what the person sees, and **Back** and **Next**; the one control that goes on has a blue outline.

1. The Clients list (Clients in the sidebar) → **Add client**.
2. Step 1, Company, with an empty field → click the field.
3. Step 1 with "Syntegon" and its 5 names, each with its two counts → **Next**.
4. Step 2, Matters: the 16 applications at your firm and one quiet line on the applications at other firms → **Next**.
5. Step 3, Role, with no role chosen; **Next** waits → **Client**.
6. Step 3 with Client chosen → **Next**.
7. Step 4, Conflict check, with one possible conflict; the stepper marks the step as blocked and **Next** waits → **I checked this conflict**.
8. Step 4 with the reason written → **Next**.
9. Step 5, Review: every choice with **Edit**, and the only **Add client** → **Add client**.
10. Record: the progress; the page goes on by itself.
11. Record done → **Open client page**.
12. The client page, Applications tab, with no matter folder yet → the row EP 23 171 862.
13. That application with no work yet: its story and no matter folder → **Upload files** (the client's instruction letter).
14. The first file made the matter folder; the chat is a placeholder → **Syntegon** in the top bar.
15. The client page, where EP 23 171 862 now has a matter folder → **Files**.
16. The Files tab → **Clients** in the sidebar.
17. The Clients list with Syntegon (16 applications, 1 matter folder) → the row **Syntegon** (the way in to an existing client).
18. The client page again: the end.

The English and German walkthroughs have the same steps; each German page links to the German pages. During the walkthrough, a link other than the marked control does not leave it; the panel gets an outline instead. Without `?walk` the pages are plain mockups; the tables sort, filter and page, and each row opens its own application.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state.

| Page | What it shows | States |
|---|---|---|
| [0-clients.html](0-clients.html) | The Clients list as a data table: client, role, applicant names, EP applications at your firm, matter folders, added; **Add client** | `after` (Syntegon added, with the toast) |
| [1-client-applications.html](1-client-applications.html) | The Syntegon client page, Applications tab: the client, its role and its applicant names; the client's instructions and wishes (empty: what goes there and how it fills); **At your firm** and **At other firms**; the 16 applications in a data table with application, publication, title, status, next deadline, last register event with its date, representative changed and matter folder; sortable headers, a filter bar (text, status, matter folder) and pagination; the sources with their times | `work` (after the first file: EP 23 171 862 has a matter folder), `instructions` (3 instructions with their sources), `search` (**At other firms**: the live count and a search, with **Mark as your firm's matter**), `myepo` (later: the firm's file numbers and the MyEPO source line), `loading` (skeleton rows), `error` (the EP Register did not answer; the times of the last read and **Try again**), `empty` (Gerhard Schubert: no EP application at your firm), `large` (Siemens: "1–25 of 1,132" over 12 example rows, and a line that says where the example rows end) |
| [2-client-files.html](2-client-files.html) | The Files tab: the client folder page with only `00 Client` and `About this folder.md`, and the line that says when a matter folder appears | `work` (the folder of EP 23 171 862 after a person dropped the first file on it) |
| [3-find.html](3-find.html) | Add client step 1, Company: the stepper, the field, the group of 5 Syntegon names, each with **At your firm** and **Matching EP applications**, the docket line, and the footer with **Next** | `empty` (no name typed yet; **Next** waits), `reading` (progress; skeleton counts; **Next** waits and says why), `partial` (one query failed; "at least" and **Try again**), `failed` (no count at your firm, **Try again**, and why **Next** waits), `none` (no firm identity; a link to the setting), `large` (Siemens with "10,000+") |
| [3-matters.html](3-matters.html) | Step 2, Matters: the 16 applications at your firm from the docket, each with a checkbox, and one quiet line: "256 more EP applications of the group are at other firms" | `address` (one row matched by address only, unticked, in its own group), `large` (Siemens: 12 example rows of 1,132) |
| [3-role.html](3-role.html) | Step 3, Role: Client, Watch and Other party, each with its one-line meaning, and the line that FlowLeap records the role with the person's name; no role chosen, so **Next** waits | `client` (Client chosen), `address` and `address-client` (the same for the address variant), `large` (Siemens, Client chosen) |
| [3-conflict.html](3-conflict.html) | Step 4, Conflict check: one possible conflict with its EP Register facts, **I checked this conflict** and the reason field; the stepper marks the step as blocked and **Next** waits | `checked` (the reason written), `address` and `address-checked` (the same for the address variant), `large` (Siemens: no conflict) |
| [4-review.html](4-review.html) | Step 5, Review: the company, the names, the matter count with the line on other firms, the role and the conflict result with the reason, each with **Edit** to its step; the footer with **Back**, **Cancel**, "FlowLeap records the client and its 16 applications. It copies no files." and **Add client** | `blocked` (the conflict is not checked: the stepper marks step 4 as blocked and **Add client** waits), `address` (15 applications, one matched by address only and not ticked), `large` (Siemens, no conflict) |
| [5-record.html](5-record.html) | **Record**, after Review, with every step of the stepper done: the client record, the conflict check, the 16 applications in 1 batch, and "Keep this page open until the records are written" | `address` (15 applications), `large` (batch 8 of 12), `failed` (batch 8 failed; **Try again** records only the missing batches), `done` (**Open client page**) |
| [6-firm-identity.html](6-firm-identity.html) | Settings, Firm identity: the line on what FlowLeap sends, the docket state with its read time, and the firm's names, addresses and representatives | `reading`, `partial`, `failed`, `empty` (no firm identity; **Save** waits for a value and then starts the first read) |
| [7-matter.html](7-matter.html) | One application of the client, EP 23 171 862, after the first file: its status, publication, applicant and representative change; its story from the EP Register and the Firm Record; its matter folder with the instruction letter; and the chat, marked **Placeholder** | One state for each application of the table, named by its number (such as `EP23215725`): its story and no matter folder yet; the 12 Siemens rows are marked **Example** |

The footer of the Review step holds the one primary action of Add client, **Add client** `⇧⌘↵`; the footer of each other step has **Next** as its primary. The client page, the Files tab and the application page have **Ask about this**, the Clients list has **Add client**, the Record step has **Open client page**, and the setting has **Save**; none of these has a key. **Try again** has `R`. From 1080 px down, the top bar acts that do not fit go into the overflow button.

## Decisions for the founder

1. **The application list is a normal data table** (founder, 2026-11-09: "it should be a normal table with pagination and filters"). It replaces the list grouped by register status. Status is a column with the EP Register's own words (also on the German pages, because they are register data); the filter bar filters by text, status and matter folder; each header sorts; the footer pages with 10, 25, 50 or 100 rows. The table has no row selection, no bulk bar and no row context menu; product rule 1 of the design language asks for them, and that rule change goes to the founder separately. The Clients list uses the same table.
2. **The client page has two tabs in the top bar**, **Applications** with its count and **Files**, as a Linear project has its views in the top bar. Below 1080 px the tabs replace the breadcrumb.
3. **Step 1 waits for the docket.** While the docket is read or after it failed, **Next** is disabled, because step 2 cannot show the firm's matters. With no firm identity, **Next** stays enabled, so a person can still add a client by name.
4. **The next deadline column shows a dash** until the deadline docket has the deadline; the source line above the table says so once.
5. **The matter folder is a column** with "Yes" and a folder icon, and a filter (all, with, without). It replaces the icon-only column and the **With a matter folder** chip of the grouped list.
6. **"Representative changed", not "Representative since".** The EP Register gives the date of the last change of the representative entry, not the date when the firm took the case (EP 25 210 820 was filed on 23 Oct 2025 and shows 3 Apr 2026). The column says what the date is; the firm's own start date can come later from the firm's files or MyEPO.
7. **The applications at other firms are a view on the client page only.** **At your firm** and **At other firms** stay above the table; **At other firms** shows the live count and a search field, because FlowLeap keeps no list of them, and **Mark as your firm's matter** on each result. In Add client the founder found the section confusing, so the Matters step and the Review show only one quiet line, such as "256 more EP applications of the group are at other firms", with no search.
8. **A row matched by address only starts unticked.** [The large-client sheet](../../2026-11-09-add-client-large-clients.md#the-firm-docket) lets a person untick it; the mockup goes one step further, because another firm can have the same address and a wrong row would record another firm's matter. The counts and the Review count the row only when a person ticks it.
9. **A row of the table opens the application.** With a matter folder, the page shows its story, its files and the chat; with none, the same story and an empty folder state that says the first file makes the folder. The chat is a placeholder until the matter page is built.
10. **Add client is a stepper wizard with a Review step at the end** (founder, 2026-11-09: "I changed my mind about the UI; it should be a stepper with steps and a review step at the end"). This replaces the page form of the first change, which replaced the floating decision card. Five steps, each one page with one job: **Company**, **Matters**, **Role**, **Conflict check** and **Review**; **Record** follows. Company also confirms the names, because the names appear as the person types and confirming the group is unticking a name in that same list; a separate Names page would repeat that list, and the Review still has its own Names row. The stepper on top numbers the steps and shows each as done (a check), current, not yet (its number) or blocked (a warning: a conflict without a check and a reason); a done or blocked step links to its page. Every step has a footer with **Back**, **Cancel**, one line, and **Next**; the line says why **Next** waits ("Choose a role first.") or what comes next. **Add client** `⇧⌘↵` is only on Review, with "FlowLeap records the client and its 16 applications. It copies no files."; it stays disabled while a conflict is not checked (the `blocked` state: the person opened step 4 again from the stepper and removed the tick; the built stepper then still links to Review, which the static mockup cannot show). The role is recorded with the person's name. Each footer keeps the class `decision` and is docked below its step; `check-mockups` proves the position of **Add client** on Review (R13), and the footers of the other steps are docked in the same way. **Record** has **Open client page** in the same footer. This also replaces the decision bar of the approved [Add client mockups](../add-client/README.md) (PR 361). The design language's decision bar (product rule 6, the Decision bar component) holds the question and one row for each part; that rule change goes to the founder separately. The mockup shows the role Client only; with Watch the Conflict check step is not needed and the Review's primary says **Add to Watch**, and with Other party it says **Add party**. In the mockup, **Edit** opens the step in its state and the steps after it show as not yet; the built wizard keeps the later choices and its footer then says **Back to review**. With no firm identity, step 1 lets the person go on; the built Matters step then says that FlowLeap has no docket yet, and the mockup continues with the Syntegon data. The `address` variant (one row matched by address only) goes on through Role, Conflict check, Review and Record with 15 applications. The German label of Review is **Prüfen**; the stepper is the **Schrittleiste**.

## Proposal: one shared table component

The harness client has no table component today. The build should add one in `ui-primitives` on [TanStack Table](https://tanstack.com/table): it is headless, so it renders with the client tokens and `MenuSurface`, and it gives sorting, filtering, pagination, column visibility and server-side paging for a large docket. The repository already uses `@tanstack/react-virtual` in `packages/client/ui-chat`, `packages/client/web` and the session inspector, which pairs with it for long tables. The Clients list, this application table, and later Matters and Office actions use the same component. `table.js` in this folder only imitates its behavior for the mockups.

## Linear references

| Choice | Linear screen | Why |
|---|---|---|
| **Applications** and **Files** as tabs in the top bar | [Projects](https://linear.app/docs/projects): a project has its views as tabs, such as **Issues** | One client, two views of it, one click apart |
| **At your firm** and **At other firms** above the table | [Filters](https://linear.app/docs/filters) | Two views of one group as chips |
| The data table with sortable headers, a filter bar and pagination | None: a founder decision (decision 1) | The founder asked for a normal table |
| Add client as a stepper with a Review step | None: a founder decision (decision 10) | The founder asked for a classic stepper with a review at the end |

## Data

- **Syntegon.** EP Register, read on 2026-11-09 through the FlowLeap patent data tools: the 5 applicant names with their counts (`pa="<name>"`), the 16 applications whose representative is your firm with their status, last register event and the date of the last change of the representative entry, the 272 applications of `pa="Syntegon"` (so 256 at other firms), the 4 results of the search "weighing" (`pa="Syntegon" and ti=weighing`), and the register events of EP 23 171 862 and EP 23 215 725 for their stories. For the 3 applications with only an international publication, the register gives no EP event.
- **Your firm.** The seed firm of the dev loop. Its docket (one address query) has 38 EP applications on 2026-11-09, 16 of them Syntegon and 9 Bucher Hydraulics. The setting shows the firm with fictional names (Muster & Partner, the seed users Dr. Anna Becker and Jonas Weber), and the docket line counts one query for each of its 4 entries.
- **The Clients list.** Bucher Hydraulics (2 names, 9 EP applications at your firm) and Gerhard Schubert (none) are clients of the dev loop; their "added" dates are examples.
- **Siemens.** The 10 applicant names and their counts are real (EP Register, 2026-11-09; `pa="Siemens Aktiengesellschaft"` answers 10,000, the cap). Your firm has no Siemens matter. So these values are examples: the 1,132 applications at your firm (the count of one test query in the large-client sheet), the docket of 16,204 rows, and the 12 rows of the table, which are real Siemens Aktiengesellschaft applications of October 2026 at other firms, with the register's last change of representative. The pages mark these parts **Example**.
- **Gerhard Schubert.** `pa="Gerhard Schubert"` gives 57 EP applications on 2026-11-09, none at your firm. It is a client of the dev loop, so the conflict check of Syntegon finds one possible conflict: Syntegon Packaging Systems AG, one of the 5 Syntegon names, filed an opposition against EP 3 296 081 B1 of Gerhard Schubert GmbH on 8 Jan 2025, and the patent is revoked (EP Register, 2026-11-09). The approved Add client mockups show the same opposition from the other side. The reason in the checked conflict is an example.
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
