---
description: "The Needs review mark of FlowLeap routine runs in the dsh web client: a Sidebar row badge, a Needs review page, a Mark as done action, a Needs review filter tab on the Automation tasks page, and the routine surfaces of the FlowLeap dashboard, over the flowleapRoutines Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-routines

## Summary

A chat that a routine run marked **Needs review** shows a badge on its Sidebar row. The **Needs review** page lists the marked chats, newest first, with the chat and task titles and the time. Select a row to open the chat, or **Mark as done** to clear the mark. The open chat header shows **Mark as done** while it is marked. The **Automation tasks** page gets a **Needs review** filter tab for the tasks whose runs marked such a chat. It also fills the dashboard's review and watch surfaces. The marks and the watches come from [`dsh-flowleap-routines`](../../host/flowleap-routines/README.md) through `ctx.remote.flowleapRoutines`.

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

Mount the row beside `dsh-flowleap-routines` and `ui-schedule` in a web composition; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-routines`. The surfaces register only while the current Peer may call `flowleapRoutines/reviews`, and the Host lists only the chats the Peer may read. The owner always has access.

Where the deployment sets the `ui-schedule` Config field `newTaskDraft: true`, as `dsh-flowleap-web` does, **New** on the Automation tasks page opens a chat whose composer holds a patent example request in the UI language, unsent: "Every Monday at 9:00, check the EP Register for EP1234567 and tell me what changed."

On the [dashboard](../ui-flowleap-dashboard/README.md), the **Waiting for review** card counts the marked chats and the **Needs your review** panel lists the five newest, each opening its chat. The **Cases watched** card counts the different applications that the register watches name. The **Coming up** panel lists the active register watches, next check first, with the time of the next register check and, for each application, the newest event of its last register read; each row opens the chat that owns the watch task. The register watch records an event after the office records it and computes no deadline, so the panel says so below the list. The **Routines** group of the dashboard search lists the scheduled tasks whose title, or whose watched application, matches the query; a result opens the chat that owns the task. A failed watch read shows an error on the card and the panel, never a number. Only the `needs_review` state is a mark in the UI. A chat whose run still works (`running`) shows nothing until its Agent goes idle. The mark clears when the user sends a message in the chat or selects **Mark as done**; every surface reads again on `flowleap-routines/changed`, `schedule/changed`, and `connection/reset`. The Sidebar has no **Needs review** launcher: the **Needs your review** panel on the dashboard opens the page, and the page address `?page=flowleap-needs-review` opens it. The page and the dashboard card show the count. A chat without a title in the Session list shows as **Untitled chat**, and a task that the catalog no longer holds shows no task title. The filter tab lists only tasks the catalog still holds, whatever their status, and search on the page still applies.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`createReviewsSource` keeps one observable snapshot over `flowleapRoutines.reviews()` and `schedule.catalog()`: the `needs_review` marks sorted by `since`, newest first, the catalog records, and the chats whose **Mark as done** request is in flight. It reads only while a surface observes it; the first subscriber reads and starts the invalidation listeners, and the last unsubscribe stops them and discards responses still in flight. A failed catalog read leaves the marks ready without task titles; a failed marks read keeps the last marks and shows a Retry notice on the page. `createWatchesSource` is a second source, a `createLazyRemoteSource` of `@deepseek-ai/dsh-client-store` over `flowleapRoutines.watches()`: only **Cases watched** and **Coming up** read it, and a failed read keeps the last watches with the `error` state. Both sources read again on `flowleap-routines/changed`, `schedule/changed`, and `connection/reset`. **Mark as done** calls `flowleapRoutines.done(sessionId)` and reads again after the Host confirms.

The browser entry registers eight contributions and one search group under one `ctx.remoteAccess.whenAccess('flowleapRoutines/reviews')` effect: `sidebar.session.row.trailing` (id `flowleap-needs-review`, order 10), the keyed `main` page under the panel id `flowleap-needs-review` (no Sidebar launcher), `conversation.session.header.utilities` (order -6, left of the reminder clock), the `schedule.manager.filter` list slot that [`ui-schedule`](../ui-schedule/README.md#use-this-package) declares on its Automation tasks page, and on the dashboard **Waiting for review** and **Cases watched** in `dashboard.metric` (orders 10 and 20), **Needs your review** and **Coming up** in `dashboard.widget` (orders 10 and 20), and the **Routines** search group with `dashboardSearch` (order 30), which matches a task title or a watched application and opens the chat of the task; without the dashboard these five wait and register nothing. The filter tab maps the marked chats' task ids to the catalog records and passes that set to the page's `select`, again while selected whenever the set changes. All copy is in the `flowleapRoutines` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt). Outside that effect, one `ctx.locale.override('schedule.manager', locale, { 'new.draft': … })` per language replaces the example request of `ui-schedule` with the text in [`src/client/schedule-draft.ts`](src/client/schedule-draft.ts).

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host half: an empty plugin body |
| [`src/client/index.ts`](src/client/index.ts) | dictionaries, the two sources, the eight registrations, and the Routines search group |
| [`src/client/reviews-source.ts`](src/client/reviews-source.ts) | the shared marks snapshot and the Mark as done action |
| [`src/client/watches-source.ts`](src/client/watches-source.ts) | the shared watches snapshot |
| [`src/client/marks.tsx`](src/client/marks.tsx) | the row badge, the header action, and the filter tab |
| [`src/client/NeedsReviewPage.tsx`](src/client/NeedsReviewPage.tsx) | the Needs review page |
| [`src/client/dashboard.tsx`](src/client/dashboard.tsx) | the dashboard cards and panels |
| [`tests/`](tests/) | the source, each surface as rendered, and the registrations with their disposal |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-routines](../../host/flowleap-routines/README.md) — the marks, the Remote, and the change event.
- [ui-schedule](../ui-schedule/README.md) — the Automation tasks page and its `schedule.manager.filter` slot.
- [Slots](../../../docs/subsystems/slots.md) — injected hooks and panel contributions.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side surface that registers no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Header failure is announced, not shown** — a failed **Mark as done** in the Session header is announced to assistive technology and the button stays for a retry; the page shows the failure as a visible notice.
- **Opening an archived chat** — a row opens its chat through ordinary Session navigation; the page does not check whether the chat is archived first.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
