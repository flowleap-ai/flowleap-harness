---
description: "FlowLeap MyEPO pages in the dsh web client: the Letters and Applications launchers in the Sidebar and their pages, the mirrors of the Mailbox and of the applications that MyEPO has for the firm."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-myepo

## Summary

The package holds the pages that mirror MyEPO: each page shows what the EPO has for the firm, as the EPO gives it. **Letters** shows each letter of the MyEPO Mailbox with its folders and its PDF. **Applications** shows the docket of the firm with the data, the EPO due dates and the pending fees of the open application. A single-user installation reads MyEPO through the `flowleapConnectors` Remote of [`flowleap-connectors`](../../host/flowleap-connectors/README.md). A firm installation reads the copy in the Firm Record, which only a person with the MyEPO pages gets.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the row in a web composition with the `flowleap-connectors` Host row; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-myepo`. The plugin waits for `remote.flowleapConnectors` and registers the launchers `flowleap-letters` and `flowleap-applications`. The link to MyEPO is made on the MyEPO card of Settings, Connectors.

The plugin asks the Host route `api/flowleap/records-link` once where the Firm Record is. With no Firm Record, each read is a call of the `flowleapConnectors` Remote, as the tables below say. With a Firm Record, each read is a `GET` below `<records>api/myepo/` through the firm's sign-in:

| Read | Firm Record path | Answer |
|---|---|---|
| The Mailbox | `mailbox` | the letters and the folders of the last copy with its time |
| The PDF of a letter | `letters/<id>/content` | the firm's copy of the PDF; `404 no-copy` when the firm has none, and the page then says to open the letter in MyEPO |
| The applications | `applications` | the list of the last copy with its time |
| One application | `applications/<procedure>/<number>` | the data, the EPO due dates and the pending fees of the last copy |

The firm worker makes the copy at each of its reads (`copyMyEpoToRecord` of `flowleap-connectors`). The side panel of an application says when the firm worker read its data (`Copied from MyEPO: …`). A page says `FlowLeap has not copied this data from MyEPO yet` before the first copy (`not-read`), and `Your administrator has not given you the MyEPO pages` when the Firm Record refuses the person (`403 no-myepo-access`). An administrator gives the pages to a person on the Users page of the Firm admin console; the console refuses a person who is screened on a matter, because the pages show each letter and each application of the firm. Opening a letter of the copy does not change MyEPO: the firm worker downloaded it at its arrival.

When MyEPO is not linked, refuses the stored credentials, does not answer or answers with an error, a page says which and offers **Read again**. After a read that answered, a failed read keeps the last list with its time.

An open page reads its list again by itself every 60 seconds while the window shows, and when the window shows again. The open letter with its PDF, the open application, the filters and the read data stay. The Applications page then also reads the data of the open application again, and changes the panel only with the answer. **Read again** reads at once; on the Applications page it also drops the data read so far.

### Letters

| Action | What happens |
|---|---|
| Open the page | `flowleapConnectors.myEpoMailbox()` reads the folders and the list (`GET /communications`, 50 letters for each request, at most 500 letters). The read changes nothing in MyEPO. |
| A view or a folder | filters the read list in the page: **All letters**, **Unread**, **Not handled**, or one Mailbox folder, each with its count |
| **Find a letter** | filters by title, application number, reference, applicant and document code |
| A row | opens the letter in the third pane and calls `flowleapConnectors.myEpoLetterPdf(id)`. The EPO marks the letter as read in MyEPO at each download; the page then shows it as read and says so. |
| **Read wide** (`F`) | the open letter uses the full width of the page; **Three panes**, **Letters** or `Escape` goes back |
| **Download PDF** | saves the downloaded PDF under the file name that the EPO gave it |
| **Open in MyEPO** | opens the address of the application's digital file from the MyEPO list in a new tab |
| **Read again** | reads the Mailbox again |
| `J`, `K`, `↓`, `↑` | the next or the previous letter of the shown list |

The PDF shows in a frame with the PDF viewer of the browser, which has its own zoom, page list and search.

A row shows the applicant, the dispatch date, the title in two lines and the reference with the application number. A line that does not fit fades at its end and has its full text as a tooltip. A letter with no applicant, title, reference or application says so. A title of more than 160 characters shows three lines in the open letter until **Show the full title**. The list shows 100 rows and then **Show 100 more**.

Below 900 px of page width the views are a menu above the list. Below 620 px the list and the letter are separate screens.

When MyEPO is not linked, refuses the stored credentials, does not answer or answers with an error, the page says which and offers **Read again**. After a read that answered, a failed read keeps the last list with its time.

### Applications

| Action | What happens |
|---|---|
| Open the page | `flowleapConnectors.myEpoApplications()` reads the list (`GET /applications`, 50 for each request, at most 2,000 applications). The read changes nothing in MyEPO. |
| The table fills | The MyEPO list has no title, applicant or due date. The page calls `flowleapConnectors.myEpoApplication(procedure, number)` for each shown row, one at a time and the open row first. A cell shows `Not read`, then `Reading…`, then its value. |
| A column header | sorts by your reference, application, portfolio, filing date or next due date; a second click turns the order. A row with no value in the column is last. |
| **All**, **European patent**, **Unitary patent** | filters by procedure, each with its count |
| **Portfolio** | filters by one MyEPO portfolio |
| **Find an application** | filters by number, reference, portfolio and, for a row whose data is read, title and applicant |
| A row | opens the application in the side panel |
| **Read again** | reads the list again and drops the data read so far |
| `J`, `K`, `↓`, `↑`, `Escape` | the next or the previous application of the shown list; close the side panel |

The side panel shows the EPO due dates in date order with the words of their terms in English, French or German, the actor, and a mark on a date in the past. The section says `From the EPO, not checked by FlowLeap`: the deadline engine did not compute or check these dates. The panel then shows the pending fees (due date, fee code, amount with the currency when the EPO names one), the applicants, the representative, the inventors, the priorities, the publications and the IPC and CPC classes. A list of more than four entries shows four until **Show all**.

One application number can have two rows: a European patent (`EPC`) and a unitary patent (`UPP`). When the account has no permission for the portfolio of an application, the side panel says so.

Below 900 px of page width, or beside the side panel, the table keeps the reference, the number, the type, the filing date and the next due date. Below 620 px the table and the open application are separate screens.

The Applications page is not the Matters page: it shows what the EPO has, not the files of the Firm Record.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each page has one model with one snapshot. `createPageStore` holds the snapshot and starts the first list read when the first observer arrives. `readList` runs a list read and records its outcome; a failed read keeps the list of the last read that answered. The state is in the page only. Nothing is stored in the browser or on the Host, and nothing here writes to MyEPO.

`installationSource` (`shared/sources.ts`) chooses the source of the four reads once: `recordSource` when the Host names a Firm Record, else `remoteSource`. `recordSource` validates each JSON answer and turns the two refusals that it knows into page states.

`createMailbox` (Letters) adds the view and the text that filter the list, the row limit, the open letter, the wide flag, the PDF state and the letters this page opened while unread. `select` releases the address of the last PDF, downloads the new one, and drops an answer that another `select` overtook. The PDF bytes become an object address (`URL.createObjectURL`) for the frame and the download link; the plugin releases it when its fiber is disposed. The read flag of a letter changes only after a download from MyEPO (`marksRead`), because the EPO sets it then.

`update` of each model is the automatic read: it does nothing while no page observes the model. The plugin calls it from one timer (`AUTO_READ_MS`) and from `visibilitychange`.

`createDocket` (Applications) adds the data read for each application by its key (`<procedure>:<number>`), the filters, the sort and the open application. After each change it reads the data of the wanted applications that have none: the open one, then the shown rows up to the row limit, one call at a time. A new list read starts a new epoch and drops an answer for the older list. A failed data read stays failed until the person asks for it again. The Host reads the term descriptions (`GET /terms`) once and puts the words on each due date.

Copy is in the namespaces `flowleapLetters` and `flowleapApplications` in zh, en, ja, es, fr, de, ru and pt. `term.language` names the EPO term language of each Applications dictionary. A title, a party, a folder name and a portfolio name are data of the EPO and show as the EPO wrote them.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, the two models over the Remote, and the four registrations |
| [`src/client/shared/read.ts`](src/client/shared/read.ts) | the page store, the list read with its outcomes, the date format |
| [`src/client/shared/sources.ts`](src/client/shared/sources.ts) | the two sources of the reads: MyEPO through the Host, or the copy in the Firm Record |
| [`src/client/shared/ReadParts.tsx`](src/client/shared/ReadParts.tsx) | the page before its list is read, the stale notice, the search field and the summary line |
| [`src/client/letters/`](src/client/letters/) | the Mailbox model, the Letters page and its launcher glyph |
| [`src/client/applications/`](src/client/applications/) | the docket model, the Applications page and its launcher glyph |
| [`src/client/locales/`](src/client/locales/) | the dictionaries of the two pages |
| [`tests/`](tests/) | the models over fake Remote calls, the two sources over a fake Remote and a fake Firm Record, the pages as rendered over fixed states, and the registrations with their disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [flowleap-connectors](../../host/flowleap-connectors/README.md) — the MyEPO client, the MyEPO link and the `flowleapConnectors` Remote.
- [ui-settings-flowleap-connectors](../ui-settings-flowleap-connectors/README.md) — the MyEPO card that stores the link.
- [Slots](../../../docs/subsystems/slots.md) — injected hooks and panel contributions.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package registers no tool and no prompt text, and makes no model call.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The pages are outside the walls** — a page shows each letter and each application of the firm, also of a matter whose team the person is not in. So a firm gives the pages to a person explicitly, and a person who is screened on a matter cannot have them. A filter that hides only the screened matters is not built.
- **The copy of a firm is as old as the last read of the firm worker** — by default 15 minutes for the Mailbox and the list of applications. The data of the applications is copied 20 applications at each read, so a long docket fills over hours, and a row shows `Not read` until then.
- **A firm gets the PDF of an older letter after some reads** — the firm worker downloads a letter when it arrives, and at each read the PDFs of at most 20 other letters that MyEPO shows as read. Until then, and for a letter whose PDF the EPO does not give or the Firm Record does not take (above 10 MB), the page says to open it in MyEPO. An unread letter that is already handled gets no PDF, because a download would mark it as read.
- **The automatic read is every 60 seconds** — the interval is fixed. On a single-user installation each automatic read is a read of MyEPO.
- **The launchers show for each person of a firm** — a person without the MyEPO pages sees the two launchers and the sentence that the administrator has not given the pages.
- **One switch for the two pages** — the two pages are one plugin row, so the row turns both on or off.
- **Opening a letter marks it as read on a single-user installation** — each open of a letter downloads its PDF from MyEPO, and the EPO then shows the letter as read.
- **At most 500 letters and 2,000 applications** — one read returns the first entries of a MyEPO list; the page says when the list holds more. The views, the counts and the search work on the read entries only.
- **EPO due dates are not checked** — Applications shows the due dates as the EPO gives them. The deadline engine did not compute or check them, and the MyEPO sandbox gives placeholder dates.
- **Three EPO requests for each application** — the data, the due dates and the fees of a row are read one row at a time at the request rate of the connector. A long docket fills slowly, and a sort by next due date changes as rows arrive.
- **No link between the pages** — a letter does not open its application, and an application does not list its letters.
- **Not the Matters page** — Applications does not show the client, the responsible person or the deadlines of the Firm Record.
- **No writes** — no page marks a letter as handled, moves it to a folder, or sets the file reference of an application.
- **PDF viewer of the browser** — a browser with no PDF viewer for a frame shows no page; **Download PDF** still works.
- **Launcher glyphs** — the launchers use the archive glyph and the open-folder glyph; `ui-primitives` has no letter glyph.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
