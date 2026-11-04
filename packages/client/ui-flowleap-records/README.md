---
description: "The Matters row in the FlowLeap sidebar (German Akten) and the Matters panel: the IPMS views (intake, matters, deadline, work on a letter, the work board) over the Records API of flowleap-os, built on the client theme and ui-primitives to the FlowLeap design language."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-records

## Summary

An attorney sees one **Matters** row among the app launchers of the `flowleap-web` sidebar (German **Akten**). It opens the Matters panel: the IPMS views of the Firm Record as React views on the client theme and `ui-primitives`, to the bar of the [FlowLeap design language](../../../.agents/skills/flowleap-design-language/SKILL.md). The panel reads and writes through the Records API of flowleap-os at `<recordsHref>api/` on the same origin, behind the same sign-in, so a decision goes from the panel to the Firm Record through the firm proxy, never through the runtime. Without the Records service the sidebar shows no Matters row.

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

Mount the row; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the id `ui-flowleap-records`:

```yaml
- id: ui-flowleap-records
  name: '@deepseek-ai/dsh-client-ui-flowleap-records'
  config:
    recordsHref: records/
```

`recordsHref` (default `records/`) is the Records service as a path relative to the document; a value with a scheme, a host, a leading slash, a query or a fragment fails the row at load, so the panel cannot leave the origin of the Web app. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-ui-flowleap-records) is the exhaustive source for every accepted field.

The browser asks `GET api/flowleap/records-link` once at start; the Host answers `{ "href": "records/" }`. The browser then registers the **Matters** launcher (`sidebar.panellist`, order 18, an archive glyph), the Matters panel (the keyed `main` slot, panel id `flowleap-records`), and the context menu of an intake row (`ui-context-menu` target `records.intake-row`). For an error status, a failed request, or an answer that it cannot read, it registers nothing and shows no error. The copy is in the `flowleapRecords` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt), with the atlas word of every process state under `atlas.<machine>.<state>`.

### The panel

The panel has a 44 px top bar and one view at a time. On a list the top bar shows the view tabs **Matters**, **Intake** with the count of letters that wait for a person, and **Work**; on a detail page it shows the breadcrumb. At the right it shows **Search** with the key of the app's Search command, which opens the command menu of the open item (`ctx.commandMenu.open()`), and on the work board the **List** and **Board** layouts. The panel opens on the view that the address names, else on Intake.

| View | Route | Reads |
|---|---|---|
| Matters list | `{ view: 'matters' }` | `GET matters` |
| Intake with the open letter beside it from 1366 px; below 1366 px the open letter is the item page with "1 / N" | `{ view: 'intake', list, open, step? }` | `GET intake?view=<list>`, `GET intake/documents/<sha256>` |
| Matter | `{ view: 'matter', fileNumber }` | `GET matters/<fileNumber>` |
| Deadline | `{ view: 'deadline', id }` | `GET deadlines/<id>` |
| Work on a letter | `{ view: 'work', id }` | `GET tickets/<id>` |
| Work board, as columns or as a list grouped by state | `{ view: 'board', layout? }` | `GET tickets` |

Every read also holds `GET me` (the deciding person) and the waiting list (the Intake count). A command sends `Content-Type: application/json` and an `Idempotency-Key` of `ipms:<uuid>` that names one act of the person; a retry of the same act sends the same key. After the Records service accepts an act, the panel loads its view and the count again.

### The address

The route is in the browser address beside the client's `page` parameter, so a reload, a bookmark, Copy link and a link in a reply mail open the same view: `?page=flowleap-records&records=<path>`. The query carries it, not the fragment, because a sign-in redirect keeps the query. The paths are `intake`, `intake/filed-today`, `intake/not-relevant`, `intake/<list>/<sha256>` (a letter open on its list), `work/<ticket id>`, `board`, `board/list`, `matters`, `matter/<file number, URI-encoded>` and `deadline/<deadline id>`. While another panel or a chat is open, the address has no `records` parameter.

### Intake

The view bar has the three lists as filter chips with their counts (the lists are filters, so one letter can count in two). The list groups the letters by atlas state under sticky headers with counts, newest first in each group. From 1366 px the open letter is beside the list, and the first letter opens when none is open; below 1366 px a row opens the item page with its properties panel. The letter pane draws the letter from reader 1's fields with each read value marked, gives the reasons with their quotes, and docks the decision bar: **Accept and file** on the proposed matter, **Other matter…** with a picker of only the matters that the person may see, **Not relevant…** with its reason step, or **Record office event** for a reading that waits for a person. `X`, ⇧ click or a checkbox selects letters for one bulk decision, one act for each letter; a letter whose act fails stays selected. `J`, `K` and the arrows move, `↵` opens, `O` opens the PDF, Esc closes a step, clears the selection or (below 1366 px) closes the letter. Every act is in the row's context menu and in ⌘K with the same keys.

### Work board

The board has a column for each state that work waits or works in (Assigned, Running, Proposals ready, Decided) and the count of every other state. A card moves only on an allowed transition by a member of the matter's team: from Proposals ready to Decided, a decision, so its drop opens the work page and nothing moves until the person records it there. While a card is dragged, every other column says why it takes no card. **For me** shows the work routed to the person. At 390 px the board scrolls sideways inside its own area.

### Loading, empty and error states

Each read follows rule R18: a first load shows nothing for 150 ms, then the skeleton of its list (or one centred spinner on a page) for at least 300 ms. A load over shown data keeps the data. A failure keeps the last data at full contrast under one notice with its time and **Try again**; with no data the notice says that nothing in the record changed.

### The parts

`src/client/parts/` holds the IPMS parts that every view composes: the list (`ListFrame`, `ListGroup`, `ListRow`, `SkeletonRows`, `SelectionBar` and the cells), the layouts (`QueueSplit`, `DetailLayout`, `WorkColumn`, `DetailHeader`, `KeyFact`, `Section`, `PropertiesPanel`, `KeyProperties`), the decision bar (`DecisionBar`, `DecisionPart`, with the reason step and the 390 px overflow menu), the evidence (`EvidenceQuote`, `MissingEvidence`, `RecordSource`, `StatementTable`, `StatementRow`), the Activity timeline, the board (`BoardColumn`, `BoardCard`, `CardSlot`), the status (`AtlasStatus`, `AtlasPill`, `RowStatusIcon`, which need an `AtlasWord` from the dictionary), the act button (`ActButton`, with its command's keycap) and the states (`EmptyState`, `ErrorNotice`, `PageSpinner`, `LoadView`). The status shapes, the keycap and the avatars are `ui-primitives` parts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half validates `recordsHref` and registers one exact Fetch route of `ctx.connection.fetch`, so the connection authenticates the request first. The browser half reads the route, creates the API client and the model, and registers the launcher, the panel and the row menu. The model holds the route and one loader for each read that the route needs; navigating keeps a read that the next view also needs and disposes the others. The panel reads the model through the inject `hooks` compartment and passes each screen its screen (the route with its loads) and a screen context.

| File | Role |
|---|---|
| [`src/route.ts`](src/route.ts) | the route path and its JSON answer, shared by both halves |
| [`src/index.ts`](src/index.ts) | Host half: the config check and the route |
| [`src/client/index.ts`](src/client/index.ts) | Browser half: the request, the dictionaries, the UI language, and the registrations |
| [`src/client/api.ts`](src/client/api.ts) | the Records API types, the parsers that check each answer at the wire boundary, the reads and the commands |
| [`src/client/wire.ts`](src/client/wire.ts) | the parser combinators and the ISO time and date brands |
| [`src/client/atlas.ts`](src/client/atlas.ts) | the atlas states with their status shapes |
| [`src/client/load.ts`](src/client/load.ts) | the loading state machine of one read (R18) |
| [`src/client/model.ts`](src/client/model.ts) | the routes, the screens, the tabs, and the model that loads them and performs acts |
| [`src/client/Panel.tsx`](src/client/Panel.tsx) | the panel, its top bar with the tabs, the breadcrumb and the pager |
| [`src/client/screens/`](src/client/screens/) | one screen for each view: Intake (`IntakeScreen.tsx`, `IntakeLetter.tsx`), the work board (`BoardScreen.tsx`), and the matter, deadline and work screens |
| [`src/client/address.ts`](src/client/address.ts) | the route in the browser address and the address of Copy link |
| [`src/client/parts/`](src/client/parts/) | the IPMS parts |
| [`src/client/row-menu.ts`](src/client/row-menu.ts) | the intake row's context menu contribution |
| [`src/client/keys.ts`](src/client/keys.ts) | the commands of the acts (keys.md) and their keycaps from the shortcut catalog |
| [`src/client/words.ts`](src/client/words.ts), [`src/client/format.ts`](src/client/format.ts) | letter titles, actor names, Activity text, times, dates and days left |
| [`tests/fixtures.client.ts`](tests/fixtures.client.ts) | answers that match the reference mockups and a fixture `RecordsApi` |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [flowleap-design-language](../../../.agents/skills/flowleap-design-language/SKILL.md) — the bar, the components and the merge checklist of the IPMS screens.
- [dsh-flowleap-record](../../host/flowleap-record/README.md) — the `record_read` tool, the model's read of the same record.
- [ui-context-menu](../ui-context-menu/README.md) — the row context menu.
- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle row.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a sidebar launcher, a panel, a context menu contribution, and an authenticated route that register no model-facing tools or messages.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Not every intake state has an act** — a proposed kind or a proposed duplicate is decided by filing the letter on a matter or marking it not relevant; the Records API has no kind or duplicate command in R1.
- **The board has no Matter and Office filters** — only **For me**; the Work tab shows no count.
- **The keys show only the registry's current catalog** — a button shows its command's keycap when the key layer registers the command; until then it shows no keycap.
- **The panel does not follow changes by itself** — a view loads again after an act of this person or Try again; a change by another person shows on the next load.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
