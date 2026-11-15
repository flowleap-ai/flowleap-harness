---
description: "FlowLeap Letters in the dsh web client: the Letters launcher in the Sidebar and the Letters page, a mirror of the MyEPO Mailbox with its folders, each letter with the fields of the MyEPO list, and the PDF of the open letter."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-letters

## Summary

The **Letters** entry in the Sidebar opens a mirror of the MyEPO Mailbox. The page shows each letter that the MyEPO list returns, handled or not, with the fields of that list. It does not use the document code table or the deadline engine, so a letter of any kind shows. The page has three panes: the views and the Mailbox folders, the letters, and the open letter with its PDF. It reads through the `flowleapConnectors` Remote of [`flowleap-connectors`](../../host/flowleap-connectors/README.md) with the stored MyEPO link.

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

Mount the row in a web composition with the `flowleap-connectors` Host row; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-letters`. The plugin waits for `remote.flowleapConnectors`. The link to MyEPO is made on the MyEPO card of Settings, Connectors.

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

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`createMailbox` owns one snapshot: the letters, folders and total of the last read that answered, why the last read gave none, the view, the text, the row limit, the open letter, the wide flag, the PDF state and the letters this page opened while unread. The first observer starts the first read. `select` releases the address of the last PDF, downloads the new one, and drops an answer that another `select` overtook. The PDF bytes become an object address (`URL.createObjectURL`) for the frame and the download link; the plugin releases it when its fiber is disposed.

The state is in the page only. Nothing is stored in the browser or on the Host, and nothing here writes to MyEPO; the read flag changes because the EPO sets it at a download.

Copy is in the `flowleapLetters` namespace in zh, en, ja, es, fr, de, ru and pt. A letter title is data of the EPO and shows as the EPO wrote it.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, the model over the Remote, and the two registrations |
| [`src/client/mailbox.ts`](src/client/mailbox.ts) | the snapshot, the views and the text filter, the reads and the acts |
| [`src/client/LettersPage.tsx`](src/client/LettersPage.tsx) | the page |
| [`src/client/LettersPanelIcon.tsx`](src/client/LettersPanelIcon.tsx) | the launcher glyph |
| [`tests/`](tests/) | the model over fake Remote calls, the page as rendered over fixed states, and the registrations with their disposal |

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

- **Single-user installation only** — the page reads MyEPO with the link of this app instance. On a firm installation the runtime of a person holds no MyEPO credential, so the page says that MyEPO is not linked. A firm needs the Mailbox list from the Firm Record, which does not store the applicant, the recipient, the read and handled flags or the folders yet.
- **No walls** — the page shows each letter of the Mailbox to the person of the instance. The Firm Record path must decide what a person outside the team of a matter, or a screened person, sees.
- **At most 500 letters** — one read returns the first 500 letters of the MyEPO list; the page says when the Mailbox holds more. The views, the counts and the search work on the read letters only.
- **Opening marks as read** — each open of a letter downloads its PDF, and the EPO then shows the letter as read for the firm. The page has no way to look at a PDF without that.
- **No writes** — the page does not mark a letter as handled and does not move it to a folder.
- **No deadline** — the page does not show or set a due date; that is the next layer on this mirror.
- **PDF viewer of the browser** — a browser with no PDF viewer for a frame shows no page; **Download PDF** still works.
- **Launcher glyph** — the launcher uses the archive glyph; `ui-primitives` has no letter glyph.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
