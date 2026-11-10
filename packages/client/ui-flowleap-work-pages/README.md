---
description: "FlowLeap work pages in the dsh web client: the Office actions launcher in the Sidebar and the office action board page, which shows each saved office action analysis and lets the attorney set a review state, an owner and a note on each objection."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-work-pages

## Summary

The **Office actions** entry in the Sidebar opens the office action board of [flowleap-harness#81](https://github.com/flowleap-ai/flowleap-harness/issues/81). It reads the work pages that [`flowleap-deliverables`](../../host/flowleap-deliverables/README.md) writes beside each `office-action-scaffold` report: the application, the time limit, the cited documents, and one card for each objection with the ground, the claims hit and the cited passages. On each card the attorney sets a review state, an owner and a note. **Write response plan** sends one message into the chat of the analysis. **New analysis** opens a new chat with the request drafted.

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

Mount the row in a web composition with the `flowleap-deliverables` Host row; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-work-pages`. The plugin registers its launcher and its page only while the current Peer may call `flowleapWorkPages/list`.

| Action | What happens |
|---|---|
| State, owner, note on a card | `flowleapWorkPages.review()` changes that field of the objection in `<report>.work.json`; the board shows the page the Host returns. A failed change shows `The change was not saved. Try again.` The owner is committed on Enter or blur, the note on blur; the Host trims them, and the fields accept at most 200 and 4,000 characters, as the Host does. While the attorney types, a new page from another change does not replace the draft. |
| **Write response plan** | `session.prompt()` queues one user message in the chat that saved the analysis, then the chat opens: `Write the response plan for the office action analysis of <application> (<report>). First read <report>.work.json: it holds my review state, owner and note for each objection. Leave out the objections that I marked "Not relevant", and follow my notes.` The page makes no model call: the message starts a turn in that chat like a typed message. |
| **Open chat** | opens the chat that saved the analysis |
| **New analysis** | a form with the application number; **Open the chat** opens a new chat in the current workspace with `Analyse the office action for <number>.` drafted. The attorney attaches the office action PDF there, if there is one, and sends it. |
| Analysis picker | shown when there are two or more analyses; chooses the one on show. Each row shows the application and the save date and time in the browser's time zone, and under them the chat that saved the analysis and its workspace folder (`<chat title> · <folder>`, or the chat's display title when it has no title or no folder; nothing when the Session list does not have the chat), so two analyses of one application on one day differ. While the chosen analysis is read, `Opening the analysis <application>, saved <time>` shows (`Opening the analysis` when the list no longer has it), the analysis on show is dimmed, `inert` and `aria-busy`, and **Write response plan** and **Open chat** are disabled. The picker reads only the Session list entries of the listed chats, so a change of another chat does not render the board. |
| Newer save | a save of another analysis after the analysis on show was saved does not replace it: `A newer analysis of <application> was saved <time>.` shows with **Show it**, which opens that analysis and moves the focus to its heading, and a button that hides the notice. A save that a read after a reconnection lists shows the same notice. The notice ends when the analysis on show was saved after it. A save of the analysis on show updates it in place. The notice and the opening line are in live regions that stay mounted, so a screen reader announces them. |
| **Export Word**, **Share** | disabled; their tooltips say that the Word export of the analysis and sharing come in a later version |

The text that the analysis wrote renders as compact Markdown through the chat's `MarkdownText`, in the color and type of its board cell; one newline in a paragraph stays a line break. The Markdown fields are the cited passage (`says`) on the card and in the side panel, and in the side panel the legal basis, the examiner's reasoning, the source of the objection, the assessment, the interpretation, the claim element, the examiner mapping, the cited text and the arrangement of each claim table, the response option text, the reply must address, the confidence and the sources. The other fields render as plain text: the ground, the title, the cited document and the passage location, the document list, and the owner and note that the attorney types. A patent reader link (`[EP4814394A1 claim 1](flowleap://…)`) shows as its label, as in the chat: the Web app has no patent reader, so the renderer makes no link for the `flowleap:` scheme. An HTTP(S) link opens in a new browser tab: the board has no `MarkdownDelegateProvider`, so it does not follow the chat's link setting, which can open a link in the sidebar browser.

For automation, the board root (`data-testid="office-action-board"`) carries the id of the analysis on show in `data-work-page-id`; each picker row, the notice of a newer save (`office-action-newer`) and the opening line (`office-action-opening`) carry the id of their analysis in the same attribute.

The launcher shows a dot beside its glyph while an objection of any analysis is in the Needs review state, as the Needs review launcher does; the board header shows the count.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`createBoard` owns one snapshot: the page list, the page on show with its file, the open objection, the form state, the send state, and the last notice. It reads only while the framework observes it: the first subscriber reads the list and the newest page, and starts the `flowleap-work-pages/changed` and `connection/reset` listeners; the last unsubscribe stops them and discards responses still in flight. The `changed` event carries the page after the change, so the board puts its summary in the list and shows it when it is the page on show (or when no page is on show) without a new read; only `connection/reset` and **Try again** read again. A changed page that is not on show and whose `savedAt` differs from its listed summary is a new save; when that save is later than the save of the page on show, it becomes `newer`. A read keeps the changed pages that arrive while it is in flight: its final list and page on show use them, because its answers can be older. After a read, `newer` is the newest listed page saved after the page on show that is the current `newer` or that the list before the read did not have with that `savedAt`, so a save during a disconnection shows the notice after `connection/reset`, and a choice of an older known page does not. A review change keeps `savedAt`, so it never becomes `newer`. The attorney decides when the page on show changes because a switch would drop the open side panel and the attorney's place on the page. `choose()` sets `opening` until its read ends; while `opening` is set, `setReview`, `select`, `writePlan` and `openChat` do nothing, and a reset or a new observation reads the chosen page again. Objection cards are keyed by page and objection id, so an owner or note draft never moves to another page with the same objection ids. A read keeps the page on show when the list still has it and keeps the open objection when the page still has it. A review answer is newer than a read that is still in flight, so that read is discarded. The board never edits a finding: each attorney change is a `review()` call, and the Host returns the page that it wrote. The review states, the new review fields and the field lengths come from `@deepseek-ai/dsh-flowleap-deliverables/work-pages`, the one home that the Host also reads; the client bundle inlines that module.

Copy is in the `flowleapWorkPages` namespace in zh, en, ja, es, fr, de, ru and pt. The two messages that the board writes for the attorney (`message.plan`, `message.analysis`) are copy in the attorney's language, as a typed message would be.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, the board over the Remotes, and the two registrations |
| [`src/client/board.ts`](src/client/board.ts) | the board snapshot, its reads, and the attorney actions |
| [`src/client/OfficeActionBoard.tsx`](src/client/OfficeActionBoard.tsx) | the page |
| [`src/client/ObjectionCard.tsx`](src/client/ObjectionCard.tsx) | one card with the state menu, the owner field and the note field |
| [`src/client/ObjectionPanel.tsx`](src/client/ObjectionPanel.tsx) | the side panel |
| [`src/client/AnalysisText.tsx`](src/client/AnalysisText.tsx) | the analysis text as compact Markdown |
| [`src/client/AnalysisForm.tsx`](src/client/AnalysisForm.tsx) | the analysis form |
| [`src/client/WorkPagesPanelIcon.tsx`](src/client/WorkPagesPanelIcon.tsx) | the launcher glyph with its count |
| [`tests/`](tests/) | the board snapshot over fake Remote calls, the page as rendered, and the registrations with their access gate and disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [flowleap-deliverables](../../host/flowleap-deliverables/README.md#the-office-action-work-page) — the work page file and the `flowleapWorkPages` Remote.
- [ui-flowleap-routines](../ui-flowleap-routines/README.md) — the Needs review page, the sibling first-level page.
- [Slots](../../../docs/subsystems/slots.md) — injected hooks and panel contributions.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package registers no tool and no prompt text: the two messages that the attorney starts from the board (see [Use this package](#use-this-package)) reach the model as ordinary user messages in the attorney's UI language, and the Session log records them.

#### KV Cache effect

None; the messages are appended to the chat like typed messages and do not change the prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No Word export** — `Export Word` is disabled: the deliverables package has no Word export of a report; the Word builders serve only the application draft and the inventor questions.
- **The form has the application number only** — the office action PDF is attached in the chat, the chat runs the workspace's default agent, and the form shows no budget, because no Remote serves the gateway budget to the client yet.
- **One template** — the board shows office action work pages only; the gallery and the other templates are flowleap-harness#82.
- **No dashboard link** — the FlowLeap dashboard has no link to this board yet; a link registration is a follow-up after the dashboard has a slot for it.
- **Shared lazy source** — the board and the Needs review source of `ui-flowleap-routines` each own the same observe-on-first-subscriber pattern; one shared client helper is a follow-up.
- **Reader links show as labels** — a `flowleap:` reader link in the analysis text shows as its label, not as a link, until the Web app has a patent reader.
- **Launcher dot is visual only** — as on the Needs review launcher, the dot is not part of the launcher's accessible name.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
