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
| Work on a letter, with "1 / N" over the work that waits for a decision | `{ view: 'work', id }` | `GET tickets/<id>`, `GET tickets` |
| Work board, as columns or as a list grouped by state | `{ view: 'board', layout? }` | `GET tickets` |

Every read also holds `GET me` (the deciding person) and the waiting list (the Intake count). A command sends `Content-Type: application/json` and an `Idempotency-Key` of `ipms:<uuid>` that names one act of the person. Each decision (a letter, a bulk decision, a deadline, a work item) sends its acts through one act runner (`src/client/act-runner.ts`): while its acts run, the primary act is busy and a second click, key or ⌘K act sends nothing. A failed act keeps its key for the next try only when its outcome is unknown (no answer came back, or a 5xx service failure) and the command built now is the same request (the same path and body); a refusal (a 4xx answer), or a changed decision, sends a new act, and a confirm names the `recordSeq` on screen now. The decision bar shows each failure in place, and only there: what failed, what is still safe ("FlowLeap did not answer" for an unknown outcome, "FlowLeap refused it" only for a 4xx refusal), and **Try again** (`R`); a change of the decision hides it. After each group of acts, the panel loads its view and the count again.

### The address

The route is in the browser address beside the client's `page` parameter, so a reload, a bookmark, Copy link and a link in a reply mail open the same view: `?page=flowleap-records&records=<path>`. The query carries it, not the fragment, because a sign-in redirect keeps the query. The paths are `intake`, `intake/filed-today`, `intake/not-relevant`, `intake/<list>/<sha256>` (a letter open on its list), `work/<ticket id>`, `board`, `board/list`, `matters`, `matter/<file number, URI-encoded>` and `deadline/<deadline id>`. While another panel or a chat is open, the address has no `records` parameter. The panel registers only after the records-link answer, so for a start address with a route it selects itself once it is registered (at most 20 tries, 50 ms apart), also when the start restoration has already landed on another page.

### People

The os names only the members of a matter's team (product rule 8): a member is `{ id, name }`, with `name: null` when the person has no display name yet, and anyone outside the team, or a mail address of no person, is `{ id: null, name: null }`. The parsers refuse a name with no id, and a team or a signed-in person with no id. Every view writes a member with no name as "Unnamed person" and anyone else as "A person outside the team" (`personName`, and `personInText` inside a sentence), and their avatar draws a neutral person glyph instead of an initial (`avatarOf`): in the rows, the cards, the properties, the decision bar, Activity and the reply recipients.

### Intake

The view bar has the three lists as filter chips with their counts (the lists are filters, so one letter can count in two). The list groups the letters by atlas state under sticky headers with counts, newest first in each group. From 1366 px the open letter is beside the list, and the first letter opens when none is open; below 1366 px a row opens the item page with its properties panel. The letter pane draws the letter from reader 1's fields with each read value marked, gives the reasons with their quotes, and docks the decision bar: **Accept and file** on the proposed matter, **Other matter…** with a picker of only the matters that the person may see, **Not relevant…** with its reason step, or **Record office event** for a reading that waits for a person. `X`, ⇧ click or a checkbox selects letters for one bulk decision, one act for each letter; a letter whose act fails stays selected. On a touch screen a long press selects the letter, and while letters are selected a tap checks or unchecks a letter; the bulk bar's overflow menu (⋯) has the row acts of the one selected letter (Open, File on another matter…, Copy link) and Clear the selection, because a touch has no row context menu. `J`, `K` and the arrows move, `↵` opens, `O` opens the PDF, Esc closes a step, clears the selection or (below 1366 px) closes the letter. Every act is in the row's context menu and in ⌘K with the same keys.

### Work board

The board has a column for each state that work waits or works in (Assigned, Running, Proposals ready, Decided) and, on one line above the columns, the count of every other state. A card shows each fact on its own line of text with its status ("Deadline · Active"); a fact never wraps or is cut, so a column is at least as wide as its longest fact. A card moves only on an allowed transition by the person the work is routed to: from Proposals ready to Decided, a decision, so its drop opens the work page and nothing moves until the person records it there. While a card is dragged, every other column says why it takes no card. **For me** shows the work routed to the person. At 390 px the board scrolls sideways inside its own area, and the list layout keeps the status, the title and the due date, with the matter key under the title.

### Loading, empty and error states

Each read follows rule R18: a first load shows nothing for 150 ms, then its loading state for at least 300 ms: a list shows its column header and skeleton rows on its own column grid, the board shows skeleton columns, and a page that is not a list shows one centred spinner. A load over shown data keeps the data. A failure keeps the last data at full contrast under one notice with its time and **Try again**; with no data the notice says that nothing in the record changed. The intake split view shows one notice for the list and the open letter, with the time of the older data (`viewFailure`).

### The matter, deadline and work pages

The **matters list** is a table of the matters the person may see, next due first; J and K move between the rows. The **matter** page has the file number and the client, the title, the facts that wait for a person ("1 deadline waits for a second person"), the tables of deadlines, work, office events and documents (each row starts with its status and word and opens its record; a table with no rows is one sentence, "Nothing on this matter yet."), Activity with Audit, and the properties panel, which stacks under the content at 390 px.

The **deadline** page answers "is this date right": the due date is the key fact, with the days left or "Overdue by N days" from today, the rule, each step of the engine's calculation with its legal citation, the two readings of the letter with the quoted span of each value, and the legal sources (a link only for an `https:` address; any other address shows as text). An engine note shows in the person's words by its code (`late-receipt`); the engine's English text of every note, and a note of a code that the views do not word, show only in Audit. **Confirm deadline** sends the `recordSeq` that the person saw as `seen`; **Reject…** asks for the reason. When the person may not confirm (`mayConfirm`), the evidence stays and the decision bar says who confirms and why, with no primary act. A confirmed or rejected deadline has no decision bar. For an office event that a person entered by hand (no source letter), the section is "The office event" with "No source letter" and the people, the first step counts from the date of the office event, the decision bar says who entered it, and Activity writes the entry as "entered the office event by hand" (an `office-event/recorded` event with no `document`).

An EP application number shows in the office format, `EP 24 123 456.7`, wherever a view shows it (`formatApplicationNumber`); a quote of the letter keeps the letter's text.

The **work on a letter** page shows the client report: its file row (Preview opens the document, Open in Word opens it with the `ms-word:` link), and each statement with its quotes and pages, the excerpt on hover. The decision bar has two parts, Accept or Reject… with a reason for each proposed report, and the check of the deadline (or "no deadline yet"). **Record decision** sends `approve` or `reject` for each report and the `deadlineCheck`: the deadline id, its state and the work's `recordSeq` as they were when the person ticked the check. A refresh that shows another deadline or another state clears the tick, so the person checks the new deadline again. A statement with no span blocks Accept and Record decision until the person rejects that report. The decision bar takes at most 40 % of the view height: above it, its part rows scroll, and its header and its footer with Record decision stay in view; at 390 px each part keeps only its title and its control. In a view 700 px high or less and wider than 720 px, the page header hides its lede and its people line, so the evidence starts above the bar; the responsible person and the team then show as one avatar stack in the top bar, each avatar with its name on hover, and a hidden line gives a screen reader who is responsible and who is in the team. A person who is not the routed one sees who decides and no primary act: the bar's header shows the decider's avatar and "Dr. Anna Becker decides", never "Your decision", as the deadline and intake bars do for a person who may not decide; a decided work item has no bar, and Activity shows the decision. The status of the deadline and the reply each carries its label first ("Deadline · Active", "Reply · Sent"), as the board cards do, so two records whose states share a word never read the same; the report's status follows its "Client report" heading, which names it. The reply names its recipients of the team and counts the others ("2 people outside the team").

The **agent panel** is a 376 px column at the right of the work page with the patent agent's run on the letter. Its header names the agent and the run's model (the local model, or the cloud provider) and has **Minimise** (the panel stays mounted and hidden), **Expand** (the panel takes the whole work area) and **Close**; the top bar's **Patent agent** button opens it again. At 390 px the panel opens full screen from that button. When this runtime has the run Session (`run.session` of `GET tickets/<id>`), the panel shows its conversation and composer: the shared Conversation content in its embedded variant, in the Session-scoped slot `records.agent.conversation`. The browser half provides the client resource `dsh-resource://recordsrun/session/<id>`, which holds one reference to the Session while the panel reads it (reference source `recordsRun`), and only where the runtime has Sessions and client resources. Otherwise the panel shows an empty state: the run's state as the heading (not started, working, finished, or did not finish, which alone shows the refused shape), one sentence on where the conversation is (no run yet, no recorded Session, the chats of the person who ran the work, or not in the person's chats), the run summary from `run` (when it finished and its steps) and each proposed report with its status, its file name in full on the line below. Below it, where the runtime has Session navigation (`uiWorkspace`), the composer "Ask about this letter" opens a new chat with the question drafted after the matter key and the letter's title (`startSession` with `whenDraftExists: 'append'`), so the person checks and sends it. A failed read of the run Session is a notice with **Try again** above the same summary.

### Keys and ⌘K

`src/client/key-layer.ts` registers the scope `records.panel` (the panel root) and every act of the design language's keys.md once: the single keys and the `G M` and `G I` sequences in the view-scoped layer, `↵` and the arrows as fixed keys, and Record the decision (`⇧⌘↵`, macOS and Windows) as an application command that acts only while focus is in the panel and not in a text field or an editable element, also on Desktop, where the key goes first to the application in every region. Each command runs the handler of the latest mounted screen that provides one (`useKeyActs`), and passes the key on otherwise. A screen whose decision has a failed act (`failed`) outranks the others, so `R` retries that act, which is the person's pending decision, and the view's load notice keeps its **Try again**, which then has no key and no keycap and loads only the view again; with only a load failure, `R` loads the view again. While focus is in the agent panel, every key of the layer and ⇧⌘↵ pass on, so a key typed in the conversation never acts on the work. A screen gives ⌘K its open item and acts with `useCommandItem`. Each button shows its command's current keycap from the shortcut catalog, and the row context menu draws the same boxed keycaps (`keyText: 'keycap'`), with ↵ on Open and an icon for each act. On the work page the keycaps of `1` and `2` show only on the report part that those keys act on, the first part with no choice yet.

### The parts

`src/client/parts/` holds the IPMS parts that every view composes: the list (`ListFrame`, `ListGroup`, `ListRow`, `ListSkeleton`, `SkeletonBone`, `SelectionBar` and the cells), the layouts (`QueueSplit`, `DetailLayout`, `WorkColumn`, `DetailHeader`, `KeyFact`, `Section`, `PropertiesPanel`, `KeyProperties`), the decision bar (`DecisionBar`, `DecisionPart`, with the reason step, the failure notice, a 44 px header row with why the person may decide at its right or on a second line under the question, and the overflow menu, which takes the secondary acts at 390 px and whenever the acts do not fit on one row; in a view 700 px high or less the note hides and each part is one row), the evidence (`EvidenceQuote`, `MissingEvidence`, `RecordSource`, `StatementTable`, `StatementRow`), the Activity timeline, the board (`BoardColumn`, `BoardCard`, `CardSlot`, `BoardColumnSkeleton`), the status (`AtlasStatus`, `AtlasPill`, `RowStatusIcon`, and `FactStatus`, which puts a fact's label before its status, such as "Report · Sent", and never cuts the label or the status word: a board card keeps each fact on one line, and a card too narrow for its matter key and team hides the column's icon; each needs an `AtlasWord` from the dictionary), the act button (`ActButton`, with its command's keycap) and the states (`EmptyState`, which always offers its next step, `ErrorNotice`, `Notice`, `PageSpinner`, `LoadView`). The status shapes, the keycap and the avatars are `ui-primitives` parts.

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
| [`src/client/act-runner.ts`](src/client/act-runner.ts) | the act runner of one decision: one submit at a time, the key of an act with an unknown outcome, the failure |
| [`src/client/Panel.tsx`](src/client/Panel.tsx) | the panel, its top bar with the tabs, the breadcrumb and the pager |
| [`src/client/screens/`](src/client/screens/) | one screen for each view: Intake (`IntakeScreen.tsx`, `IntakeLetter.tsx`), the work board (`BoardScreen.tsx`), and the matter, deadline and work screens; `detail.tsx` holds the detail table, the facts and the rule words of the matter, deadline and work pages |
| [`src/client/address.ts`](src/client/address.ts) | the route in the browser address and the address of Copy link |
| [`src/client/key-layer.ts`](src/client/key-layer.ts) | the one registration of the panel's keys and its ⌘K contribution, and the hooks that screens use |
| [`src/client/parts/`](src/client/parts/) | the IPMS parts |
| [`src/client/row-menu.ts`](src/client/row-menu.ts) | the intake row's context menu contribution |
| [`src/client/keys.ts`](src/client/keys.ts) | the commands of the acts (keys.md) and their keycaps from the shortcut catalog |
| [`src/client/agent-run.ts`](src/client/agent-run.ts), [`src/client/RunConversation.tsx`](src/client/RunConversation.tsx) | the run Session resource and the run conversation slot of the agent panel |
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

None, as the package is a sidebar launcher, a panel, a context menu contribution, and an authenticated route that register no model-facing tools or messages. The agent panel shows an existing run Session through the shared Conversation content; a message that a person sends from its composer is that Session's own turn. The composer of a panel with no conversation only drafts a prompt in a new chat; the person sends it there as an ordinary turn of that Session.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Not every intake state has an act** — a proposed kind or a proposed duplicate is decided by filing the letter on a matter or marking it not relevant; the Records API has no kind or duplicate command in R1.
- **The board has no Matter and Office filters** — only **For me**; the Work tab shows no count.
- **The agent panel names the provider, not the model** — the work answer's `run.model` is `local` or a provider name, so the header shows "OpenRouter", not the model name of the mockup; a run Session in another person's chats cannot show here, so the panel shows the run summary from the record; the record has no start time of a run.
- **The matter page has no Record office event and no client rules** — the Records API has no command or field for them.
- **Record the decision has no Linux default** — the registry reserves Enter with modifiers on Linux, so `⇧⌘↵` is unbound there; the button still records.
- **The panel does not follow changes by itself** — a view loads again after an act of this person or Try again; a change by another person shows on the next load.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
