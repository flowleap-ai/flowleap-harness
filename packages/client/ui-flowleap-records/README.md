---
description: "My work and the Matters row in the FlowLeap sidebar (German Akten) with their panels: the IPMS views (My work, intake and the letter page, matters and the dossier, deadline, work on a letter, the work board), Find a matter and the account button, over the Records API of flowleap-os, built on the client theme and ui-primitives to the FlowLeap design language."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-flowleap-records

## Summary

My work is the first row of the `flowleap-web` sidebar and the first screen; the **Matters** row follows (German **Meine Arbeit**, **Akten**). Both open the IPMS views of the Firm Record as React views on the client theme and `ui-primitives`, to the bar of the [FlowLeap design language](../../../.agents/skills/flowleap-design-language/SKILL.md). The sidebar foot shows the account button with **Sign out**. The views read and write through the Records API of flowleap-os at `<recordsHref>api/` on the same origin, behind the same sign-in, never through the runtime. Without the Records service the sidebar shows neither row.

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
    signOutHref: oauth2/sign_out?rd=%2F
```

`recordsHref` (default `records/`) is the Records service as a path relative to the document; a value with a scheme, a host, a leading slash, a query or a fragment fails the row at load, so the panel cannot leave the origin of the Web app. `signOutHref` (default empty) is where **Sign out** goes: a path relative to the document with an optional query, such as the firm proxy's `oauth2/sign_out?rd=%2F`; a value with a scheme, a host, a leading slash or a fragment fails the row at load, and an empty value means no sign-in in front of the app, so the account menu has no **Sign out**. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-ui-flowleap-records) is the exhaustive source for every accepted field.

At start the browser registers the **My work** launcher (`sidebar.panellist`, order -120, a goal glyph), its count (`sidebar.panellist.count`: the number of the person's tasks once My work has loaded, the last count after a failed load, nothing for none) and the My work panel (the keyed `main` slot, panel id `flowleap-my-work`), and provides My work to `uiWorkspace.provideLanding`, so the start restoration lands on it (atlas sheet 0, decision Q6). It asks `GET api/flowleap/records-link` once; the Host answers `{ "href": "records/", "signOutHref": "oauth2/sign_out?rd=%2F" }` (`signOutHref` is null when the config is empty). The Records API client waits for that answer. The browser then registers the **Matters** launcher (order -110, an archive glyph), the Matters panel (panel id `flowleap-records`), the context menus of an intake row (`records.intake-row`) and of a My work row (`records.work-row`), the keys, Find a matter, and the account button (`sidebar.footer.action`, id `flowleap-account`). For an error status, a failed request, or an answer that it cannot read, it takes My work and the landing back, registers nothing more and shows no error. The copy is in the `flowleapRecords` locale namespace in the eight shipped UI languages (en, zh, ja, es, fr, de, ru, pt), with the atlas word of every process state under `atlas.<machine>.<state>`.

### My work

My work is the projection of the person's open tasks (`GET my-work`), the first screen of every role (mockups `1-my-work-*`, decision B9). Its first line counts, as the mockups count their rows, the letters to file (`summary.lettersToFile`, "arrived") and the letters whose work waits for a decision (`lettersWorked`, "worked"), each only when there is one, and the tasks that need the person ("1 letter worked, 1 needs you", or "Nothing needs you"); the next line is the day with the count of each group ("Saturday 7 November · 1 due today"). The tasks are in the due-time groups **Overdue**, **Today** and **Later**, each under a sticky 36 px header with its UI icon and count, in the order of the answer (the next step first). A row shows the task in words (the client words each `kind`; the os text of `title` and `why` never shows), the os's `reason` in English or German (English for the other UI languages; under the task when the two do not fit on one line; at 390 px it wraps to every line it needs), the status of the task's object with its atlas word, the matter key and its client, the legal date of a deadline apart from the task's own due time, and that due time written out. The status of a letter comes from the intake waiting list, which My work holds; a deadline task takes the state of the deadline that its `subject` names, and every other kind has one waiting state (`src/client/my-work.ts`). A row opens the page of its object from its record address (`act`): a letter opens as its own page (`letter/<sha256>`, mockup `2-file-letter`), a deadline and a work item as their pages, each with the breadcrumb from My work and "1 / N" over the tasks. My work has no row selection and no bulk act (decision B9); its row context menu has **Open** (↵), **Open matter** (`G M`, the dossier in the Matters panel) and **Copy link**. J, K and the arrows move between rows. With no task the list is the empty state with **Show filed today** (`F`). A refused read (403 or 404) shows a not-found state with **Open My work** and no **Try again** (#328); any other failure keeps the last data under the notice with **Try again**.

### Find a matter

`/` (the `records.find` command of the view-scoped layer), **Find a matter** in the top bar, and ⌘K on My work or the Matters panel when the view has no open item open the Find a matter dialog (`shell.overlay`, `FindDialog.tsx`): a 712 px menu with the Matters chip and the query input. After a 150 ms pause it asks `GET search?q=<text>&limit=20` and stops the read of an older query. The matters are grouped by the field that each matched first, in the answer's order, each group under a heading that names its field ("Matters · client", German "Akten · Mandant"). Each found matter shows its file number and title, then its client and the application number or person that the query matched; ↑, ↓ and ↵ open its dossier in the Matters panel. The Records API applies the walls, so only matters of the person's teams come back. The dialog says what to type, that nothing matches, that the search failed, or that more matters match. With an open item, ⌘K on these panels opens the item's acts; on any other view ⌘K opens the app's search. On a German page the top bar shows the app's Search key, because `/` types "-" on a German keyboard.

### The account button

The sidebar foot shows the signed-in person's avatar, display name and firm role (`GET me` `role`; none for `null`). Its menu names the person and the role and has **Sign out**, which leaves the app for `signOutHref`, and the line that Microsoft asks which account signs in next. Settings stays the sidebar's own entry at the foot, so the app shows it once.

### The panel

The panel has a 44 px top bar and one view at a time. On a list the top bar shows the view tabs **Matters**, **Intake** with the count of letters that wait for a person, and **Work**; on a detail page it shows the breadcrumb. At the right it shows **Search** with the key of the app's Search command, which opens the command menu of the open item (`ctx.commandMenu.open()`), and on the work board the **List** and **Board** layouts. The panel opens on the view that the address names, else on Intake.

| View | Route | Reads |
|---|---|---|
| My work | `{ view: 'my-work' }` | `GET my-work` |
| A letter as its own page | `{ view: 'letter', document }` | `GET intake/documents/<sha256>` |
| Matters list | `{ view: 'matters' }` | `GET matters` |
| Intake with the open letter beside it from 1366 px; below 1366 px the open letter is the item page with "1 / N" | `{ view: 'intake', list, open, step? }` | `GET intake?view=<list>`, `GET intake/documents/<sha256>` |
| Matter | `{ view: 'matter', fileNumber }` | `GET matters/<fileNumber>` |
| Deadline | `{ view: 'deadline', id }` | `GET deadlines/<id>` |
| Work on a letter, with "1 / N" over the work that waits for a decision | `{ view: 'work', id }` | `GET tickets/<id>`, `GET tickets` |
| Work board, as columns or as a list grouped by state | `{ view: 'board', layout? }` | `GET tickets` |

Every read also holds `GET me` (the deciding person) and the waiting list (the Intake count). A command sends `Content-Type: application/json` and an `Idempotency-Key` of `ipms:<uuid>` that names one act of the person. Each decision (a letter, a bulk decision, a deadline, a work item) sends its acts through one act runner (`src/client/act-runner.ts`): while its acts run, the primary act is busy and a second click, key or ⌘K act sends nothing. A failed act keeps its key for the next try only when its outcome is unknown (no answer came back, or a 5xx service failure) and the command built now is the same request (the same path and body); a refusal (a 4xx answer), or a changed decision, sends a new act, and a confirm names the `recordSeq` on screen now. The decision bar shows each failure in place, and only there: what failed, what is still safe ("FlowLeap did not answer" for an unknown outcome, "FlowLeap refused it" only for a 4xx refusal), and **Try again** (`R`); a change of the decision hides it. After each group of acts, the panel loads its view and the count again.

### The address

The route is in the browser address beside the client's `page` parameter, so a reload, a bookmark, Copy link and a link in a reply mail open the same view: `?page=flowleap-records&records=<path>`. My work is the landing page, whose address names no `page`: `?records=<path>`. Until a panel has been open once, it leaves a start route in the address. The query carries it, not the fragment, because a sign-in redirect keeps the query. The paths are `my-work`, `letter/<sha256>`, `intake`, `intake/filed-today`, `intake/not-relevant`, `intake/<list>/<sha256>` (a letter open on its list), `work/<ticket id>`, `board`, `board/list`, `matters`, `matter/<file number, URI-encoded>` and `deadline/<deadline id>`. While another panel or a chat is open, the address has no `records` parameter. The panel registers only after the records-link answer, so for a start address with a route it selects itself once it is registered (at most 20 tries, 50 ms apart), also when the start restoration has already landed on another page.

### People

The os names only the members of a matter's team (product rule 8): a member is `{ id, name }`, with `name: null` when the person has no display name yet, and anyone outside the team, or a mail address of no person, is `{ id: null, name: null }`. The parsers refuse a name with no id, and a team or a signed-in person with no id. Every view writes a member with no name as "Unnamed person" and anyone else as "A person outside the team" (`personName`, and `personInText` inside a sentence), and their avatar draws a neutral person glyph instead of an initial (`avatarOf`): in the rows, the cards, the properties, the decision bar, Activity and the reply recipients.

### Intake

The view bar has the three lists as filter chips with their counts (the lists are filters, so one letter can count in two). The list groups the letters by atlas state under sticky headers with counts, newest first in each group. From 1366 px the open letter is beside the list, and the first letter opens when none is open; below 1366 px a row opens the item page. The letter pane (mockup `2-file-letter`, the same page that My work opens) shows what FlowLeap read in the readings table of the deadline page (`readers`; with no second reading the table has one column and the heading says "one reading", and a value that reader 1 quoted but did not take into its result shows as read with its quote), the proposed matter and the key that found it (the application number, `matchedBy: 'application-number'`, or the file number), the reasons with their quotes (the letter's kind is quoted by its title line, `fields.title`, such as "Communication under Rule 71(3) EPC"; a reading with no title line quotes nothing for the kind, and the form code shows only in the drawing and in Audit), what happens when the person files, and at the right the letter's page images with the read values quoted by page beside them, as on the deadline page, or the drawing of the letter from reader 1's fields with each read value marked for a letter stored without page images. It docks the decision bar: **File** on the proposed matter, **Other matter…** with a picker of only the matters that the person may see, **Not relevant…** with its reason step, or **Record office event** for a reading that waits for a person. The bar's note names who confirms the deadline when the person decides now (`nextConfirmer`: "Lena Hoffmann confirms the deadline, because you decide the date", "You confirm the deadline", or the queue that the person keeps); for a hand entry it asks the card again with the picked matter (`?matter=<file number>`), because before the filing the card names no matter. When the card holds both readings and they differ on the date, the bar asks which date the letter bears and offers the two dates; **Record decision** is disabled until the person chooses one, and the bar says that a second person confirms the deadline. A scan with no reading (`unreadable`) shows the fields of the hand entry: the matter (only the matters that the person may see), the application number, the office event (the card's `entry.codes`, in English or German) and the date of the letter. **Enter office event** sends `POST intake/documents/<sha256>/file`, which files the scan and records its office event in one act; it stays disabled until every field is set, and an os that sends no `entry` blocks it as not available. A letter with no office event code (no form line, an annex form, or a form outside the code table) goes to the hand entry as a scan does; the card's `entry.read` gives what reader 1 read, and the hand entry starts with that date, application number and matter. A letter from the firm's scan mailbox (`mail.route: 'scan-mailbox'`) names no forwarder: its lede says when the scan came and how the readings came out (`readers.outcome`). A letter whose office event no reader could tell is titled by its date ("Letter of 9 Jun 2026"), and its reasons and When you file say that a person enters the office event after the filing; the card's `entry` offers the hand entry for such a letter too. When the person may decide, the eyebrow says "Waits for you since …", and the bar's why line says "You are the formalities person of …" for a person whose firm role is formalities. A filed letter that FlowLeap still reads, and a letter whose office event is recorded, show a Done bar: what the person's act did, what comes next, who confirms the deadline (the card's `deadline.confirmer`, or that it is confirmed or rejected), Open the deadline, and Go to the matter; the eyebrow then says "Waits for FlowLeap since …" or "Done". `X`, ⇧ click or a checkbox selects letters for one bulk decision, one act for each letter; a letter whose act fails stays selected. On a touch screen a long press selects the letter, and while letters are selected a tap checks or unchecks a letter; the bulk bar's overflow menu (⋯) has the row acts of the one selected letter (Open, File on another matter…, Copy link) and Clear the selection, because a touch has no row context menu. `J`, `K` and the arrows move, `↵` opens, `O` opens the PDF, Esc closes a step, clears the selection or (below 1366 px) closes the letter. Every act is in the row's context menu and in ⌘K with the same keys.

### Work board

The board has a column for each state that work waits or works in (Assigned, Running, Proposals ready, Decided) and, on one line above the columns, the count of every other state. A card shows each fact on its own line of text with its status ("Deadline · Active"); a fact never wraps or is cut, so a column is at least as wide as its longest fact. A card moves only on an allowed transition by the person the work is routed to: from Proposals ready to Decided, a decision, so its drop opens the work page and nothing moves until the person records it there. While a card is dragged, every other column says why it takes no card. **For me** shows the work routed to the person. At 390 px the board scrolls sideways inside its own area, and the list layout keeps the status, the title and the due date, with the matter key under the title.

### Loading, empty and error states

Each read follows rule R18: a first load shows nothing for 150 ms, then its loading state for at least 300 ms: a list shows its column header and skeleton rows on its own column grid, the board shows skeleton columns, and a page that is not a list shows one centred spinner. A load over shown data keeps the data. A failure keeps the last data at full contrast under one notice with its time and **Try again**; with no data the notice says that nothing in the record changed. The intake split view shows one notice for the list and the open letter, with the time of the older data (`viewFailure`).

### The matter, deadline and work pages

The **matters list** is a table of the matters the person may see, next due first; J and K move between the rows. The **matter** page is the dossier (mockup `5-dossier`): the title and the matter's line (file number, client, and the application number linked to the EPO Register for an EP application), **What waits** (`matter.waits`, every open task of the matter with its status, its owner and its due time, the next step first and tagged), the deadlines, the **E-file** (the matter's documents, each with its state (filed, or a letter that the intake proposed for the matter), the letter it is, its date, when it arrived and who filed it; the file name on hover), Activity with Audit, and the properties panel with the matter (file number, client, what the client allows the AI to do from `clientRules`, the client's report language, application) and its people (responsible, formalities person, team, and the wall: the team and the count of screened people), which stacks under the content at 390 px. Each deadline row names who confirmed or rejected it. Each row starts with its status and word and opens its record; a table with no rows is one sentence that names what the matter has none of.

The **deadline** page (mockups `3-confirm-deadline*`) answers "is this date right": the due date is the key fact, with the days left or "Overdue by N days" from today, the rule, each step of the engine's calculation in a plain sentence with its legal citation (the period in months or days from the step's two dates, the office by its name; the last step has the tag Deadline, and its dot has the deadline's status colour), the line that names the matter and the person who recorded the office event (the actor of `office-event/recorded`), the readings of the letter with the quoted span of each value (the office event by the letter's title line, `readers.code.fields.title`, and by no quote when the reading has no title line; the form code shows only in Audit), and the legal sources (a link only for an `https:` address; any other address shows as text). An engine note shows in the person's words by its code (`late-receipt`); the engine's English text of every note, and a note of a code that the views do not word, show only in Audit. the letter's page images are at the right with the date and the application number quoted beside them by page (`pageImages`, `marks`; the OCR gives no position, so nothing is drawn on a page, and a form number shows only in Audit), or, for a letter stored without page images, the drawing of the letter from reader 1's fields; the page has no properties panel. When reader 1 read the OCR text of a scan (`readers.code.source`), its column says so. **Confirm** sends the `recordSeq` that the person saw as `seen`, and the bar's note says who the confirmer will be; **Reject…** asks for the reason. When the person may not confirm (`mayConfirm`), the evidence stays and the decision bar says who confirms and why, with no primary act: the owner of the open Confirm the deadline task (`confirmTask`) heads the bar and the eyebrow ("Waits for Lena Hoffmann"), with the time of the notice or that the task waits in a queue. A confirmed or rejected deadline has no decision bar. For an office event that a person entered by hand (no source letter), the section is "The office event" with "No source letter" and the people, the first step counts from the date of the office event, the decision bar says who entered it, and Activity writes the entry as "entered the office event by hand" (an `office-event/recorded` event with no `document`).

Times and days show in the firm's time zone (`GET me` `firm.timeZone`), as the notices give them.

An EP application number shows in the office format, `EP 24 123 456.7`, or `EP 23 771 920` when the Record holds no check digit, wherever a view shows it (`formatApplicationNumber`); a quote of the letter keeps the letter's text.

On a touch screen (`@media (pointer: coarse)`), every text field of the views (Find a matter, the hand entry, a reason field and the agent composer) takes 16 px, so iOS Safari does not zoom into it; this is the one exception to the design language's R1 type scale. Fine pointers keep the role sizes.

Activity words each event in the person's words: in English and German the os's `words` (with its facts, such as "filed the letter on SF-2023-0045"), in the other languages the views' own words. An event with `words: null` (task and outbox steps, the seed load), and an event that the views do not word, shows only in Audit. The scan mailbox (`scan-mailbox`) is an actor of its own. A report event names its draft by `kind` (the draft reply or the client report), and an outbox event names its mail by `kind` (the notice, or the mail with the drafts to the person who forwarded the letter), from the event itself or from the `report/proposed` or `outbox/composed` event of the same proposal or mail.

The **work on a letter** page (mockup `4-review-work`) shows its deadline first ("Confirmed by …" and the days left), then the draft reply to the office (`draftReply`, "Draft reply to the EPO"; with none, its section says that the agent has not drafted a reply) and the client report (`clientReport`), each with its file row ("Letter to the EPO" for the reply, "Client report" for the report, and the language; no page count, because the firm cannot count the pages of a .docx; the file name on hover and never the template's name; Preview opens the document, Open in Word opens it with the `ms-word:` link), and each statement with its quotes and pages, the excerpt on hover. The decision bar has a part for each proposed draft, named by its `kind`, with Accept or Reject… and a reason, and the check of the deadline (or "no deadline yet"). **Record decision** sends `approve` or `reject` for each report and the `deadlineCheck`: the deadline id, its state and the work's `recordSeq` as they were when the person ticked the check. A refresh that shows another deadline or another state clears the tick, so the person checks the new deadline again. A statement with no span blocks Accept and Record decision until the person rejects that report. An accepted part says Accepted, and its Accept button takes the success tint. The decision bar takes at most 40 % of the view height (48 % in a view 700 px high or less): above it, its part rows scroll with a shade at the edge that has more parts, and its header and its footer with Record decision stay in view; at 390 px each part keeps only its title and its control. In a view 700 px high or less and wider than 720 px, the page header hides its lede and its people line, so the evidence starts above the bar; the responsible person and the team then show as one avatar stack in the top bar, each avatar with its name on hover, and a hidden line gives a screen reader who is responsible and who is in the team. A person who is not the routed one sees who decides and no primary act: the bar's header shows the decider's avatar and "Dr. Anna Becker decides", never "Your decision", as the deadline and intake bars do for a person who may not decide; a decided work item has no bar, and Activity shows the decision. The status of the deadline stands before its date; the report's status follows its "Client report" heading, which names it. The status and the date take the width of their longest value; "Confirmed by …" wraps rather than cuts, as the What waits and E-file rows of the dossier do. The properties panel at the right holds the matter (file number, client, what the client allows the AI to do, application), its people (responsible, formalities person, team) and the work: **Drafted by** (the patent agent, a button that opens the agent panel in the panel's place), Finished, the letter's pages (with "scan" for an OCR reading), and the mail with the drafts to the person who forwarded the letter, with its recipients of the team, the count of the others ("2 people outside the team") and its status. At 390 px the panel hides, as on the other decision pages.

The **agent panel** is a 376 px column at the right of the work page with the patent agent's run on the letter, in the place of the properties panel; it opens from Drafted by or the top bar's **Patent agent** button. Its header names the agent and the run's model (the local model, or the cloud provider) and has **Minimise** and **Close** (both give the column back to the properties panel) and **Expand** (the panel takes the whole work area). At 390 px the panel opens full screen from that button. When this runtime has the run Session (`run.session` of `GET tickets/<id>`), the panel shows its conversation and composer: the shared Conversation content in its embedded variant, in the Session-scoped slot `records.agent.conversation`. The browser half provides the client resource `dsh-resource://recordsrun/session/<id>`, which holds one reference to the Session while the panel reads it (reference source `recordsRun`), and only where the runtime has Sessions and client resources. Otherwise the panel shows an empty state: the run's state as the heading (not started, working, finished, or did not finish, which alone shows the refused shape), one sentence on where the conversation is (no run yet, no recorded Session, the chats of the person who ran the work, or not in the person's chats), the run summary from `run` (when it finished and its steps) and each proposed report with its status, its file name in full on the line below. Below it, where the runtime has Session navigation (`uiWorkspace`), the composer "Ask about this letter" opens a new chat with the question drafted after the matter key and the letter's title (`startSession` with `whenDraftExists: 'append'`), so the person checks and sends it. A failed read of the run Session is a notice with **Try again** above the same summary.

### Keys and ⌘K

`src/client/key-layer.ts` registers the scope `records.panel` (the root of both panels) and every act of the design language's keys.md once, with `/` for Find a matter: the single keys and the `G M` and `G I` sequences in the view-scoped layer, `↵` and the arrows as fixed keys, and Record the decision (`⇧⌘↵`, macOS and Windows) as an application command that acts only while focus is in the panel and not in a text field or an editable element, also on Desktop, where the key goes first to the application in every region. Each command runs the handler of the latest mounted screen that provides one (`useKeyActs`), and passes the key on otherwise. A screen whose decision has a failed act (`failed`) outranks the others, so `R` retries that act, which is the person's pending decision, and the view's load notice keeps its **Try again**, which then has no key and no keycap and loads only the view again; with only a load failure, `R` loads the view again. While focus is in the agent panel, every key of the layer and ⇧⌘↵ pass on, so a key typed in the conversation never acts on the work. A screen gives ⌘K its open item and acts with `useCommandItem`. Each button shows its command's current keycap from the shortcut catalog, and the row context menu draws the same boxed keycaps (`keyText: 'keycap'`), with ↵ on Open and an icon for each act. On the work page the keycaps of `1` and `2` show only on the report part that those keys act on, the first part with no choice yet.

### The parts

`src/client/parts/` holds the IPMS parts that every view composes: the list (`ListFrame`, `ListGroup`, `ListRow`, `ListSkeleton`, `SkeletonBone`, `SelectionBar` and the cells), the layouts (`QueueSplit`, `DetailLayout`, `WorkColumn`, `DetailHeader`, `KeyFact`, `Section`, `PropertiesPanel`, `KeyProperties`), the decision bar (`DecisionBar`, `DecisionPart`, with the reason step, the failure notice, a 44 px header row with why the person may decide at its right or on a second line under the question, and the overflow menu, which takes the secondary acts at 390 px and whenever the acts do not fit on one row; in a view 700 px high or less the note hides and each part is one row), the evidence (`EvidenceQuote`, whose quote is main-view copy that the deny-list reads, because only its excerpt and the letter drawing are pictures of the letter (`data-verbatim`), `MissingEvidence`, `RecordSource`, `StatementTable`, `StatementRow`), the Activity timeline, the board (`BoardColumn`, `BoardCard`, `CardSlot`, `BoardColumnSkeleton`), the status (`AtlasStatus`, `AtlasPill`, `RowStatusIcon`, and `FactStatus`, which puts a fact's label before its status, such as "Report · Sent", and never cuts the label or the status word: a board card keeps each fact on one line, and a card too narrow for its matter key and team hides the column's icon; each needs an `AtlasWord` from the dictionary), the act button (`ActButton`, with its command's keycap) and the states (`EmptyState`, which always offers its next step, `ErrorNotice`, `Notice`, `PageSpinner`, `LoadView`). The status shapes, the keycap and the avatars are `ui-primitives` parts.

Each part that the design language allows as a box in the content column carries `data-fdl-part` with the class name of its mockup part, because the built class names are hashed and [`panel-boxes.js`](../../../.agents/skills/flowleap-design-language/scripts/panel-boxes.js) (R8) finds an allowed part in the built app only by this attribute: `decision` (the decision bar and the bulk bar), `file` (a file row), `letter`, `quote` and `excerpt` (evidence), `notice`, `empty-art` (the icon tile of an empty state), `col` and `card` (the board), `other` (the Other states line), `dock` (the agent panel and all its parts), `seg`, `fact`, `chip` (a record source and the missing-evidence chip) and `av` (a system avatar in Activity). A new boxed part takes a name from the lists in `panel-boxes.js`.

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
| [`src/client/model.ts`](src/client/model.ts) | the routes, the screens, the tabs, and the model of one panel (My work or Matters) that loads them and performs acts |
| [`src/client/my-work.ts`](src/client/my-work.ts) | the view logic of My work: the due-time groups, the status of a task's object, the clients, the lede counts |
| [`src/client/find.ts`](src/client/find.ts), [`src/client/FindDialog.tsx`](src/client/FindDialog.tsx) | Find a matter: the search as the person types, and the dialog |
| [`src/client/Account.tsx`](src/client/Account.tsx) | the account button and menu at the sidebar foot |
| [`src/client/act-runner.ts`](src/client/act-runner.ts) | the act runner of one decision: one submit at a time, the key of an act with an unknown outcome, the failure |
| [`src/client/Panel.tsx`](src/client/Panel.tsx) | the panel, its top bar with the tabs, the breadcrumb and the pager |
| [`src/client/screens/`](src/client/screens/) | one screen for each view: My work (`MyWorkScreen.tsx`), the letter page (`LetterScreen.tsx`), Intake (`IntakeScreen.tsx`, `IntakeLetter.tsx`), the evidence that the letter and deadline pages share (`evidence.tsx`), the work board (`BoardScreen.tsx`), and the matter, deadline and work screens; `detail.tsx` holds the detail table, the facts and the rule words of the matter, deadline and work pages |
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
- **The matter page has no Record office event** — the Records API has no command for it.
- **Record the decision has no Linux default** — the registry reserves Enter with modifiers on Linux, so `⇧⌘↵` is unbound there; the button still records.
- **The panel does not follow changes by itself** — a view loads again after an act of this person or Try again; a change by another person shows on the next load.
- **The Records API gives no position of a read value on a page** — the page images carry no marks; the quotes beside them name the page only. The dossier names no "Responsible since", which the record does not keep.
- **Gendered role words** — German has no neutral word for a patent attorney, and the API gives no gender, so the account menu says "Patentanwält:in" where the mockup says "Patentanwältin".
- **The sidebar count of My work follows the My work load** — it changes when My work loads again, not when another person's act adds a task.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
