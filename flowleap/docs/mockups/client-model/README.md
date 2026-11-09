# Client model mockups

HTML mockups of [the client model](../../2026-11-09-client-model.md) and of the Add client steps that [Add client for large clients](../../2026-11-09-add-client-large-clients.md) changes: the client page with its application list and its files, step 1 with the two counts of each name and the docket states, the review from the firm docket, the **Record** step that replaces the build, and the firm identity setting. They follow the [FlowLeap design language](../../../../.agents/skills/flowleap-design-language/SKILL.md) and extend the approved [Add client mockups](../add-client/README.md). They wait for the founder's approval.

## Pages

Each page has an English file and a German file (`<name>.de.html`). Open a page with `?theme=light` or `?theme=dark`, and with `?state=<name>` for a view state.

| Page | What it shows | States |
|---|---|---|
| [1-client-applications.html](1-client-applications.html) | The Syntegon client page, Applications tab: the client, its role and its applicant names; the client's instructions and wishes (empty: what goes there and how it fills); the view bar with **At your firm**, **With a matter folder** and **At other firms**; the 16 applications at your firm, grouped by register status, with the publication, the next deadline, the last register event and its date, the register's last change of the representative entry, and the matter folder; the sources with their times | `instructions` (3 instructions with their sources), `search` (**At other firms**: the live count and a search, with **This is ours**), `myepo` (later: the firm's file numbers and the MyEPO source line), `loading` (skeleton rows), `error` (the EP Register did not answer; the times of the last read and **Try again**), `select` (3 rows selected, the bulk bar), `context` (the row context menu), `empty` (Gerhard Schubert: no EP application at your firm), `large` (Siemens with 1,132 applications at your firm) |
| [2-client-files.html](2-client-files.html) | The Files tab: the client folder page with only `00 Client` and `About this folder.md`, and the line that says when a matter folder appears | `work` (the folder of EP 23 171 862 after a person dropped the first file on it) |
| [3-find.html](3-find.html) | Step 1: the group of 5 Syntegon names, each with **At your firm** and **Matching EP applications**, and the docket line | `reading` (progress; skeleton counts; **Continue** waits and says why), `partial` (one query failed; "at least" and **Try again**), `failed` (no count at your firm, **Try again**, and why **Continue** waits), `none` (no firm identity; a link to the setting), `large` (Siemens with "10,000+") |
| [4-review.html](4-review.html) | Step 2: "16 EP matters at your firm" from the docket, the matters with a checkbox, the conflict check, the count at other firms with the search field, and the decision bar | `address` (one row matched by address only, in its own group), `search` (a search among the applications at other firms), `large` (Siemens) |
| [5-record.html](5-record.html) | Step 3, **Record**: the client record, the conflict check, the 16 applications in 1 batch, and "Keep this page open until the records are written" | `large` (batch 8 of 12), `failed` (batch 8 failed; **Try again** records only the missing batches), `done` (**Open client page**) |
| [6-firm-identity.html](6-firm-identity.html) | Settings, Firm identity: the line on what FlowLeap sends, the docket state with its read time, and the firm's names, addresses and representatives | `reading`, `partial`, `failed`, `empty` (no firm identity; **Save** waits for a value and then starts the first read) |

The decision bar of the review holds the one primary action, **Add client** `⇧⌘↵`. The client page and the Files tab have **Ask about this**, the bulk bar has **Ask about 3**, step 1 has **Continue**, the Record step has **Open client page**, and the setting has **Save**; none of these has a key. **Try again** has `R`, and **Open** in the row context menu has `↵`. At 390 px the top bar acts that do not fit go into the overflow button.

## Decisions for the founder

1. **The application list groups by register status**, in the order of the EP procedure, with the EP Register's own words (also on the German pages, because they are register data). The headers have no status shape: the register statuses are not states of the process atlas, so product rule 3 does not apply to them yet. When the atlas has an EP application machine, its states replace these groups. The register status therefore shows once, in the group header, and the row shows the last register event, or "Status changed" when that event is the change to the group's status.
2. **The client page has two tabs in the top bar**, **Applications** with its count and **Files**, as a Linear project has its views in the top bar. Below 1080 px the tabs replace the breadcrumb.
3. **Step 1 waits for the docket.** While the docket is read or after it failed, **Continue** is disabled, because the review cannot show the firm's matters. With no firm identity, **Continue** stays enabled, so a person can still add a client by name.
4. **The next deadline column shows a dash** until the deadline docket has the deadline; the source line under the filters says so once.
5. **The matter folder is an icon in the last column**, with "Matter folder since <date>" on hover, and the **With a matter folder** filter.
6. **"Representative changed", not "Representative since".** The EP Register gives the date of the last change of the representative entry, not the date when the firm took the case (EP 25 210 820 was filed on 23 Oct 2025 and shows 3 Apr 2026). The column says what the date is; the firm's own start date can come later from the firm's files or MyEPO.
7. **The applications at other firms are a view, not a list.** **At other firms** in the view bar shows the live count and the search field, so a large client reaches them without scrolling past its own rows.
8. **A row matched by address only starts unticked.** [The large-client sheet](../../2026-11-09-add-client-large-clients.md#the-firm-docket) lets a person untick it; the mockup goes one step further, because another firm can have the same address and a wrong row would record another firm's matter. The counts and the decision bar count the row only when a person ticks it.

## Linear references

| Choice | Linear screen | Why |
|---|---|---|
| **Applications** and **Files** as tabs in the top bar | [Projects](https://linear.app/docs/projects): a project has its views as tabs, such as **Issues** | One client, two views of it, one click apart |
| Grouping by status, the **Display** button and the **Filter** button | [Display options](https://linear.app/docs/display-options), [Filters](https://linear.app/docs/filters) | Linear groups an issue list by status and keeps grouping and filters in the view's top right |
| View bar chips **At your firm**, **With a matter folder**, **At other firms** | [Filters](https://linear.app/docs/filters) | Saved filters of one list as chips; **At other firms** is a view of the same group |
| Row selection, the bulk bar and the row context menu | [Select issues](https://linear.app/docs/select-issues) | The same acts by checkbox, `X`, ⇧ click and right-click, as product rule 1 requires |

## Data

- **Syntegon.** EP Register, read on 2026-11-09 through the FlowLeap patent data tools: the 5 applicant names with their counts (`pa="<name>"`), the 16 applications whose representative is your firm with their status, last register event and the date of the last change of the representative entry, the 272 applications of `pa="Syntegon"` (so 256 at other firms), and the 4 results of the search "weighing" (`pa="Syntegon" and ti=weighing`). For the 3 applications with only an international publication, the register gives no EP event.
- **Your firm.** The seed firm of the dev loop. Its docket (one address query) has 38 EP applications on 2026-11-09, 16 of them Syntegon. The setting shows the firm with fictional names (Muster & Partner, the seed users Dr. Anna Becker and Jonas Weber), and the docket line counts one query for each of its 4 entries.
- **Siemens.** The 10 applicant names and their counts are real (EP Register, 2026-11-09; `pa="Siemens Aktiengesellschaft"` answers 10,000, the cap). Your firm has no Siemens matter. So these values are examples: the 1,132 applications at your firm (the count of one test query in the large-client sheet), the docket of 16,204 rows, the split of the 1,132 rows over the groups, and the rows themselves, which are real Siemens Aktiengesellschaft applications of October 2026 at other firms, with the register's last change of representative. The pages mark these parts **Example**.
- **Gerhard Schubert.** `pa="Gerhard Schubert"` gives 57 EP applications on 2026-11-09, none at your firm. The conflict line on its page repeats the approved Add client mockups, where Syntegon Packaging Systems AG opposed one of its patents.
- **Examples.** The 3 instructions, the file numbers of the `myepo` state, the matter folder of EP 23 171 862, the address-only match of EP 25 712 877, the progress and failure counts of the docket and of the Record step.
- **Verbatim text.** Register statuses, register events, applicant names and file names carry `data-verbatim`.
- **No firm names.** The search results name the town of the representative, never the firm.

## Build and check

The pages are generated. Edit `build.mjs` or `data.mjs`, then run `node build.mjs` in this folder. The pages load `records.css` of the skill, `../add-client/add-client.css` and `client-model.css`, and draw the app sidebar with `../add-client/frame.js`.

From the skill folder `.agents/skills/flowleap-design-language`:

```sh
node scripts/check-css.mjs ../../../flowleap/docs/mockups/client-model --pairs
node scripts/check-copy.mjs ../../../flowleap/docs/mockups/client-model
node scripts/check-mockups.mjs ../../../flowleap/docs/mockups/client-model --shoot <dir>
```

`check-mockups.mjs` needs Playwright (`FLOWLEAP_PLAYWRIGHT`, see the skill). The screenshots are not committed.
