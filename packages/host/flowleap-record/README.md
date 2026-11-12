---
description: "The Firm Record of flowleap-os in the harness: the flowleapRecord seam that reads one matter's view with its record position and the work of the token's person, its http provider, and the read-only record_read and record_my_work tools whose JSON results name recordSeq in the Session log."
kind: "package-reference"
---

# @deepseek-ai/dsh-flowleap-record

## Summary

`dsh-flowleap-record` connects an attorney's runtime to the Firm Record of flowleap-os, the only writer of the firm's record (design PR 214). A runtime reads and proposes; it never writes a decision. The Service Definition `ctx.flowleapRecord` reads a matter's view and the work of the token's person, and sends the run commands of a Ticket. The http Provider is `./http`. The read-only tools are `record_read` (its result names `recordSeq` and `viewHash`) and `record_my_work`. The `./run` entry adds the tools of a Ticket run.

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

Mount the provider beside the `credentials` service, which reads the record token, and the tool row beside the tool registry; the [`dsh-flowleap-web`](../../bundle/flowleap-web/README.md) bundle does this under the ids `flowleap-record-http` and `flowleap-record`. A test composition may provide `flowleapRecord` itself and mount only the tool row.

### Configuration

```yaml
- id: flowleap-record-http
  name: '@deepseek-ai/dsh-flowleap-record/http'
  config:
    baseURL: http://flowleap-record:8091
    apiKeyRef: FLOWLEAP_RECORD_TOKEN
    timeoutMs: 5000

- id: flowleap-record
  name: '@deepseek-ai/dsh-flowleap-record'
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `''` | Base URL of the Firm Record; empty when the runtime has no Firm Record, and every read then reports `not_configured`. Any other value must be an https URL, or an http URL to a loopback address or a single-label host such as `flowleap-record`, or the row fails at load |
| `apiKeyRef` | required | Credential reference (environment-variable name) of the runtime's record token, read through `ctx.credentials` and sent as `Authorization: Bearer <token>`; an invalid name fails at load |
| `timeoutMs` | `5000` | Longest time one read may take, body included, in milliseconds (100 to 60000) |

The run row registers `record_propose_report`, `record_propose_reading` and `record_finish_run` for a Ticket run; the opt-in overlay of [`dsh-flowleap-ticket`](../../experimental/flowleap-ticket/README.md) mounts it beside the Ticket ingress:

```yaml
- id: flowleap-record-run
  name: '@deepseek-ai/dsh-flowleap-record/run'
  config:
    templatesDir: /opt/flowleap/templates
```

| Field | Default | Meaning |
|---|---|---|
| `templatesDir` | required | Absolute folder of the firm's `.docx` templates, the `templatesDir` of the Office tools; a relative path fails at load. The report names the template by its file name (`templateName`), and its `templateVersion` is `sha256:<hex>` of the named template file there |

The run row injects `flowleapRecord`, `tools`, `fs`, and `workingDirectory`. The tool row has no config. The `flowleap-web` bundle sets `apiKeyRef` to `FLOWLEAP_RECORD_TOKEN`, the ref that the keys document of flowleap-os holds for each runtime, and no `baseURL`; the firm patch of flowleap-os sets `baseURL`. A patch replaces the row's whole `config`, so it restates `apiKeyRef` too. The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field.

### The seam

`ctx.flowleapRecord.matterView(fileNumber, signal)` returns a `MatterViewResult`: the `MatterView` (`recordSeq`, `viewHash`, `matter`, `deadlines`), or `{ error }` with a `MatterViewRefusal`. `recordSeq` is the position of the record log the view was read at, and `viewHash` the SHA-256 of the canonical JSON of the view without the hash; the Firm Record rebuilds the view at that position with `GET matters/<fileNumber>/view?at=<recordSeq>`, so an auditor can check what a Session saw. Ids and dates are branded (`MatterFileNumber`, `DeadlineId`, `RuleId`, `RecordSeq`, `ViewHash`, `LocalDate`); the provider brands them when it validates the answer, and the tool brands the file number when it parses the model's argument. The method rejects when `signal` fires. `MatterSummary` (the view's `matter`) and `MyWorkMatter` (each item of `MyWork.matters`) both carry `applicationNumber: string | null`, the application number as the firm recorded it, for example `EP24166597`; the register and patent tools take it, so the model needs no publication number from the person.

| Refusal | When |
|---|---|
| `not_found` | the Firm Record answers 404: no matter with this file number inside the reader's wall |
| `not_configured` | `baseURL` is empty |
| `no_key` | the credential of `apiKeyRef` is not set, is empty, or cannot be read; a read failure logs one warning |
| `refused` | the Firm Record answers 401 or 403 |
| `unreachable` | the connection fails, the service redirects, or the answer does not arrive within `timeoutMs`; the Host logs the cause without the token |
| `service_error` | the Firm Record answers another HTTP error status; the Host logs the status |
| `invalid_answer` | the body is larger than 1 MiB, is not JSON, or is not a matter view |

`ctx.flowleapRecord.myWork(signal)` returns a `MyWorkResult`: the `MyWork` (`recordSeq`, `person`, `summary`, `work`, `inSight`, `matters`), or `{ error }` with a `MyWorkRefusal`, which is a `MatterViewRefusal` without `not_found`. The call has no person argument: the Firm Record takes the person from the record token, so the model never names one. `PersonId` is branded like the other ids. The work is the person's open tasks of the Firm Record (atlas sheet 0: one task for one named person at each step that waits for a person); `summary` is the first line of My work, and `inSight` the tasks that the person held before they escalated. A `WorkItem` has the same fields for every kind of work: `id`, `kind`, `title`, `why`, `matter`, `due`, `since`, and `act`, and from a Firm Record of schema 10 the task fields `task`, `state` (`TaskState`), `group` (`WorkGroup`) and `dueAt`. A Firm Record of schema 9 or earlier sends no `summary`, no `inSight` and no task field, and the provider passes its answer on unchanged. `WorkKind` is a merge-extensible union: `KnownWorkKind` (the task kinds of the first demo: `file-letter`, `enter-office-event`, `decide-office-event`, `enter-date`, `confirm-deadline`, `restart-run`, `decide-work`, `send-report`) plus any other string, because a Firm Record with new features lists new kinds without a change of the runtime. Code that switches on a kind handles the known kinds and treats every other kind through the common fields; the provider and the tool pass an unknown kind on unchanged. The refusals are those of the view read with two differences: a 404 (an old Firm Record without the path) is a `service_error`, and the Host logs the status.

### The http read

The provider sends `GET <origin of baseURL>/records/api/matters/<fileNumber>/view` with the token as a bearer token; the file number is percent-encoded. It does not follow a redirect and reads at most 1 MiB of the body. The Firm Record answers `200` with this JSON body:

```json
{
  "recordSeq": 7,
  "viewHash": "1dde72a9…",
  "matter": { "fileNumber": "FL-2026-0001", "title": "Heat pump control", "client": "Nordwind Energie GmbH", "responsible": "A. Novak", "applicationNumber": "EP24166597", "state": "open" },
  "deadlines": [{
    "id": "0b2d5a8e-…", "ruleId": "ep.r71-3.grant-communication", "ruleVersion": 1, "due": "2026-03-02", "state": "proposed",
    "trace": [{ "op": "delivery", "from": "2025-10-30", "to": "2025-10-30", "cite": "R.126(2) EPC, OJ EPO 2023 A29" }]
  }]
}
```

The phase R1 view adds four fields, always present (empty lists and `null` when there is nothing):

```json
{
  "clientRules": { "seq": 3, "aiUse": "allowed", "aiLetters": "allowed", "reportEvents": "all-office-actions", "language": "en", "text": "Report every office action in English…" },
  "officeEvents": [{ "id": "oe-1", "seq": 5, "code": "EPO:R71(3)", "documentDate": "2025-10-30", "applicationNumber": "EP23812345.6", "document": "5f2c8a1e…", "state": "observed" }],
  "tickets": [{ "id": "tk-1", "pass": 1, "state": "running", "routedTo": "A. Novak" }],
  "documents": [{ "sha256": "5f2c8a1e…", "fileName": "R71-3-communication.pdf", "mediaType": "application/pdf", "source": "mail" }]
}
```

`matter.responsible` is the display name of the matter's responsible attorney, or `null` while that person has no display name (the firm's sign-in gives no names until the People service; the view never names a person by the sign-in). `matter.applicationNumber` is the application number as the firm recorded it, for example `EP24166597`, or `null` when the record holds none; the register and patent tools take it, so the model does not ask the person for a publication number. A Firm Record before this field sends no such key, and the provider then gives `null`, so the model always reads the field; an empty string is an `invalid_answer`. `matter.state` is `open` or `closed`; a deadline `state` is `proposed`, `active`, or `rejected` (the R0 subset of the deadline state machine); dates are `YYYY-MM-DD`. `clientRules` is `null` when no person recorded the client's rules; its `aiUse` is `not-recorded`, `allowed`, `local-model-only`, or `not-allowed`, its `aiLetters` is `allowed` or `not-allowed`, its `reportEvents` is `all-office-actions` or a list of event codes, and its `language` is `de` or `en`. An office event's `applicationNumber` and `document` are `null` for an event that a person recorded without a document, and its `code` and `documentDate` are `null` for a letter that the intake filed before its code was decided and its date was read. A Ticket's `state` is one of the eleven states of [atlas sheet 3](../../../flowleap/docs/process-atlas/03-notify-and-run.md), and `routedTo` is the routed person's display name, or `null` before routing. Document hashes are lower-case SHA-256 hex. Unknown fields are dropped; a missing or malformed field is an `invalid_answer`. **An R0 Firm Record** answers no `clientRules`, `officeEvents`, `tickets`, or `documents`: the view then has none of these four keys, not `null` or empty lists, because an empty list would tell the model that the matter has no Tickets or documents and `null` would tell it that no person recorded the client's rules. A view with only some of the four is an `invalid_answer`.

### The http work read

The provider sends `GET <origin of baseURL>/records/api/my-work` with the token as a bearer token and no query and no body, with the same timeout, redirect rule, and 1 MiB limit as the view read. The Firm Record answers `200` with this JSON body:

```json
{
  "recordSeq": 45,
  "person": { "id": "admin", "name": null },
  "work": [{
    "id": "confirm-deadline:0b2d5a8e-…", "kind": "confirm-deadline", "title": "Confirm the deadline",
    "why": "The deadline is proposed and needs a second person; you did not record its office event or decide its code, so you may confirm it.",
    "matter": { "fileNumber": "FL-2026-0001", "title": "Heat pump control" }, "due": "2026-03-02",
    "since": "2026-11-06T10:00:00.000Z", "act": "deadline/0b2d5a8e-…"
  }],
  "matters": [{
    "fileNumber": "FL-2026-0001", "title": "Heat pump control", "client": "Nordwind Energie GmbH", "applicationNumber": "EP24166597", "role": "responsible", "state": "open",
    "nextDeadline": { "id": "0b2d5a8e-…", "due": "2026-03-02", "state": "deadline_proposed" }
  }]
}
```

`person.id` is an Entra object ID or `admin`; `person.name` is `null` while the person has no display name. `work` holds every kind of work that waits for the person, by `due` (no date last), then by `since`. Every item has the same fields: `id` (`<kind>:<object id>`), `kind` (a non-empty string; today `confirm-deadline`, `decide-office-event`, `decide-work`, or `file-letter`), `title` and `why` (plain words), `matter` (`{ fileNumber, title }`, or `null` when the work has no matter that the person may see), `due` (the legal date or `null`), `since` (the ISO 8601 timestamp at which the object began to wait), and `act` (the address in the Records app where the person acts, such as `deadline/<id>`, `work/<id>`, or `intake/waiting/<sha256>`). The provider checks `kind` as a non-empty string and not as a list, so an unknown kind is valid work and reaches the model unchanged. `matters` holds the matters inside the person's walls, the nearest due date first, as context beside `work`; `applicationNumber` is the same field as `matter.applicationNumber` of the view (a non-empty string or `null`; `null` when a Firm Record before this field sends no such key); `role` is `responsible` or `team`; `state` is `open` or `closed`; `nextDeadline` is `null` or the earliest proposed or active deadline, whose `state` is `deadline_proposed` or `active`. A missing or malformed field, or an empty `kind`, `id`, or `act`, is an `invalid_answer`; unknown fields are dropped. A letter in the Intake that waits to be filed is a `file-letter` item for its forwarder and the intake persons, also through a runtime; a runtime cannot read such a letter before it is filed.

### The run commands

A runtime woken for a Ticket (see [`dsh-flowleap-ticket`](../../experimental/flowleap-ticket/README.md)) reports to the Firm Record through three seam methods, and reads the text of a document with a fourth. The three commands each send `POST <origin>/records/api/tickets/<ticketId>/<action>` with the record token, a JSON body, and an `Idempotency-Key` of `<kind>:<SHA-256 hex of the JSON array of its parts>`, so a repeat of the same command sends the same key:

| Method | Action and body | Key parts | Receipt |
|---|---|---|---|
| `runStarted(ticket, { session })` | `run-started`: `{ session }` | `run-started`: Ticket, Session | `200 { recordSeq }` |
| `proposeReport(ticket, proposal)` | `reports`: `{ kind, fileName, contentBase64, templateName, templateVersion, rulesSeq, statements, session, toolCall }` | `report`: Ticket, Session, tool call | `201 { proposalId, document, recordSeq }` |
| `finishRun(ticket, { session, deadline })` | `finish`: `{ session, deadline: { id, state, seq } }`, where `id` and `state` are both `none-yet` when the event has no deadline | `finish`: Ticket, Session | `200 { recordSeq, outbox: { id, state } \| null }`: the Firm Record queues one reply with the proposed letters attached as drafts to the forwarder of the office letter and the routed person; `state` is `refused` when a recipient is not a firm address; `outbox` is null for a letter from the scan mailbox, which has no forwarder and gets no reply. Nothing goes to the client |

`documentText(document)` sends `GET <origin>/records/api/documents/<sha256>/text` with the record token and no `Idempotency-Key`, and reads `200 { pages: string[] }`, where `pages[0]` is page 1. The text is the text layer that the Firm Record stores with the document, the same text that the Firm Record searches for a quote. The answer is at most 1 MiB, as for the view.

A statement is `{ text, evidence: [{ document, span }] }` with at least one evidence item, and every item has a `span`. A `span` is `{ page, quote }`: the page number from 1, and a quote of 1 to 200 characters that the run copies character for character from that page of the document text. The run sends no offsets. The Firm Record finds the quote on the page, which must hold it exactly once, and stores the offsets. Each method returns the receipt or a `RecordCommandError` `{ error, detail? }`; `detail` is the Firm Record's one-sentence detail, at most 300 characters:

| Refusal | When |
|---|---|
| `not_configured`, `no_key`, `unreachable`, `service_error`, `invalid_answer` | as for the view read |
| `refused` | 401, or 403 without a known code |
| `agent_cannot_decide` | 403 `agent-cannot-decide` |
| `not_routed_person` | 403 `not-routed-person`: the Ticket is routed to another person |
| `not_found` | 404: no Ticket with this id; for `documentText`, no document with this hash or no text layer for it |
| `invalid_body` | 400 `invalid-body` |
| `ticket_not_waking` | 409 `ticket-not-waking`: `run-started` for a Ticket that is not `waking` |
| `ticket_not_running` | 409 `ticket-not-running`: a report or finish for a Ticket that is not `running` |
| `client_rule_forbids_ai_draft` | 409 `report.no-ai-draft-against-client-rule` |
| `statement_without_evidence` | 422 `report.statement-has-evidence` |
| `statement_without_span` | 422 `report.statement-has-span`: an evidence item has no span |
| `quote_not_in_letter` | 422 `report.quote-not-in-letter`: a quote is not in the text of its page |
| `quote_ambiguous` | 422 `report.quote-ambiguous`: a quote is in the text of its page more than once |
| `no_proposals` | 409 `no-proposals`: a finish before a proposal of this Ticket and pass |
| `document_too_large` | 413 `document-too-large`: the letter is above 5 MiB |
| `idempotency_key_reused` | 409 `idempotency-key-reused`: the key came before with another body, such as a second finish of the run with another deadline summary, or a report of the same tool call with another letter |

### The run tools

`record_read_document_text` takes `document`, a lower-case SHA-256, calls `documentText`, and answers `{ pages }` or the refusal. It changes nothing in the record. `record_propose_report` reads the `.docx` letter from the Session working directory (relative path, inside the directory, at most 5 MiB) and the named template from `templatesDir`, and calls `proposeReport` with the `kind` (`client-report`, the default, or `office-reply` for the draft reply to the office), the letter, the template name, `templateVersion`, `rules_seq`, the statements, the Session id, and the id of the tool call itself (a call inside a PTC program has its own id, so two letters proposed by one `run_code` program are two commands). Each statement needs at least one evidence item `{ document, span }`; `document` is a lower-case SHA-256, and the `span` is required: a positive `page` and a `quote` of 1 to 200 characters. A `span` with `start` or `end` is a tool error, because the Firm Record finds the offsets. `record_finish_run` calls `finishRun` with the Session id and the summary `{ id, state, seq }` from `deadline_id`, `deadline_state` (`proposed`, `active`, `rejected`, or `none-yet`), and `record_seq`; `deadline_id` and `deadline_state` are both `none-yet` or neither is. An argument that breaks these rules, a missing file or template, or a call outside an agent Session is a tool error, and the seam is not called. A refusal of the Firm Record is a JSON result `{ error, message, detail? }`, where `message` says what the model does next.

`record_propose_reading` takes the `document` (the office letter's SHA-256), the letter's `language` (`de`, `en` or `fr`), `items` (one per objection of the examiner: `ground`, `claims`, `documents` labels, `reasoning`, and 1 to 10 `evidence` passages `{ page, quote }`), the cited `documents` (`label`, `publication`, `evidence`), and `no_items_reason` for a letter with no objection. It calls `proposeReading` with the Session id and the id of the tool call, and answers `{ readingId, recordSeq }` or the refusal; the Firm Record finds each quote on its page (a run of whitespace counts as one space). A refusal message names this tool where the shared one would name `record_propose_report`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`FlowleapRecordHttp` (the `./http` entry) is a Cordis `Service` under the `flowleapRecord` name. The constructor validates `baseURL` and `apiKeyRef` (through `credentialRef`); each call reads the token, sends one request, maps the status to a refusal, and validates the body with a strict zod schema whose transforms brand the ids and dates. `registerRecordReadTool` and `registerRecordMyWorkTool` define the tools with `defineTool`; the plugin entry registers each through its own `ctx.effect`, so disposing the row removes both tools.

| File | Role |
|---|---|
| [`src/types.ts`](src/types.ts) | the Service Definition `FlowleapRecord`, the branded ids, the view, the run commands and receipts, and the refusals |
| [`src/http.ts`](src/http.ts) | the http Provider: Config, the read and the commands (bodies through `readBoundedText` of `dsh-flowleap-connectors`), the idempotency key, the refusal-code map, and the answer validation |
| [`src/tool.ts`](src/tool.ts) | the Consumer: the `record_read` schema, the file-number parse, and the refusal messages |
| [`src/my-work-tool.ts`](src/my-work-tool.ts) | the Consumer: the `record_my_work` schema (no parameter), the description, and the refusal messages |
| [`src/index.ts`](src/index.ts) | the function plugin that registers the tools |
| [`src/run/`](src/run/) | the run entry: `record_read_document_text`, `record_propose_report` (the letter and template read through the file rules of `dsh-flowleap-office`), `record_propose_reading`, `record_finish_run`, their argument rules, and the refusal messages |
| [`tests/`](tests/) | the provider against a local Firm Record double, the tools with their refusals and disposal, and the Loader composition test with a fixture provider |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-flowleap-web](../../bundle/flowleap-web/README.md) — the bundle rows.
- [ui-flowleap-records](../../client/ui-flowleap-records/README.md) — the Matters panel, the IPMS views over the Records API, where a person confirms a deadline.
- [dsh-flowleap-budget](../flowleap-budget/README.md) — the same address, token, and answer rules for the firm's model gateway.

-----

<a id="model-experience"></a>
## Model Experience

### The `record_read` declaration

#### What the model sees

The generated tool catalog covers the shipped DeepSeek presets only, so the declaration is stated here. Description: "Read one matter of the firm's record: its file number, title, client, responsible attorney, state, and each deadline with its rule, due date, state, and the computation trace with legal citations; the client's recorded rules (AI use, AI letters, the events that need a report, the letter language, and their text); the office events, the Tickets, and the documents of the e-file with their SHA-256. A Firm Record before R1 holds none of clientRules, officeEvents, tickets, and documents: the result then has none of these four fields, and you do not know the client's rules, so you do not assume them. Every matter has a responsible attorney: matter.responsible is that person's display name, and responsible is null while the responsible attorney has no display name yet, so you do not say that the matter has none. matter.applicationNumber is the application number of the matter, for example EP24166597. The register and patent tools take it. When it has a value, use it, and do not ask the person for a publication number or an application number. applicationNumber is null when the record holds none. An office event's code and documentDate are null while the letter is filed but its event code is not decided and its date is not read. The result names recordSeq, the position of the record log the view was read at, and viewHash, so the view can be rebuilt later. The read is read-only: you cannot change the record, and a proposed deadline becomes active only when a person confirms it in the Records app." One required parameter, `file_number` (the firm's file number, for example `FL-2026-0001`). The result is JSON text: the view with `recordSeq`, `viewHash`, `matter` (with `applicationNumber`, a string or `null`), `deadlines` (each with its `trace`), `clientRules`, `officeEvents`, `tickets`, and `documents`, where a Firm Record before R1 gives none of the last four; or `error` (`invalid_file_number`, `not_found`, `not_configured`, `no_key`, `refused`, `unreachable`, `service_error`, `invalid_answer`) and `message`. The [`flowleap-record-read`](../../../snapshots/session/flowleap-record-read/) snapshot pins one read over a fixture provider; its `tool/result` line holds `"recordSeq":7` verbatim.

#### Token effect

The schema contributes fixed request-context tokens while the row is mounted. A result grows with the number of deadlines and their trace steps, office events, Tickets, and documents, bounded by the provider's 1 MiB answer limit.

#### KV Cache effect

The declaration is stable while the row is mounted. Results append to history.

### The `record_my_work` declaration

#### What the model sees

Description: "List who you are in the firm's record and what waits for you. The list work holds your open tasks: the Firm Record opens one task for one named person at each step that waits for a person, and closes it when the act on its object is recorded, so the list is the same as the person's My work screen. summary is its first line: lettersArrived letters arrived today, needYou need the person, with the count of each group (overdue, today, later). Read each item through title, why, matter, due, since, and act, also for a kind that you do not know: a new kind is work too, and you do not skip it. due is the legal date; dueAt is the task's own due time. inSight holds the tasks that the person held before they went to the next person of their chain. The list matters is the context beside it: the matters inside the person's walls, each with the role of the person (responsible or team), its state, and its next open deadline (null when it has none). Each matter has applicationNumber, the application number of the matter, for example EP24166597. The register and patent tools take it. When it has a value, use it, and do not ask the person for a publication number or an application number. applicationNumber is null when the record holds none. Use the tool when the person asks which matters are theirs or what waits for them. Give no argument: the record token names the person. The lists hold only what this person may see. A null name means that the person has no display name yet: do not say that the person has no name or does not exist. A letter in the Intake that waits to be filed is a file-letter task of one intake person; you cannot read such a letter before it is filed. You cannot close a task: the person acts on its object in the Records app (act). The result names recordSeq, the position of the record log the lists were read at. The read is read-only: you cannot change the record. To read one matter in full, call record_read with its fileNumber." No parameter. The result is JSON text: `recordSeq`, `person` (`id` and `name`, which is `null` while the person has no display name), `summary` (`lettersArrived`, `needYou`, `overdue`, `today`, `later`), `work` and `inSight` (each item with `id`, `task`, `kind`, `title`, `why`, `state`, `group`, `matter`, `due`, `dueAt`, `since`, and `act`), and `matters` (each with `fileNumber`, `title`, `client`, `applicationNumber`, `role`, `state`, and `nextDeadline`); or `error` (`not_configured`, `no_key`, `refused`, `unreachable`, `service_error`, `invalid_answer`) and `message`. The [`flowleap-record-my-work`](../../../snapshots/session/flowleap-record-my-work/) snapshot pins one call over a fixture provider; the person there has no display name, and one work item has a kind that the harness does not know.

#### Token effect

The schema contributes fixed request-context tokens while the row is mounted. A result grows with the number of work items and matters of the person, bounded by the provider's 1 MiB answer limit.

#### KV Cache effect

The declaration is stable while the row is mounted. Results append to history.

### The `record_propose_report` declaration

#### What the model sees

`record_propose_report` description: "Propose a letter of this Ticket run to the attorney: the report to the client (kind client-report, the default), or the draft reply to the office (kind office-reply). The client rules on AI letters apply to the client report only. The letter is a .docx file in the working directory that office_letter_from_template wrote on a firm template. Give each statement that the letter makes about the office letter, the matter, or the deadline, each with at least one source. A source is the SHA-256 of a document of the record (record_read lists them) and a span: the page number and a quote of at most 200 characters that you copy character for character from that page of the text that record_read_document_text gives. The quote must be on that page exactly once, so use a longer quote when a short one is on the page more than once. The Firm Record finds the quote and stores its place; it refuses a source without a span and a quote that it does not find. rules_seq is the seq of the client rules (clientRules.seq of record_read) that the letter follows. The Firm Record stores the letter as a proposal; the attorney accepts or rejects it in the Records app. Nothing goes to the client or to the office before the attorney decides: when the run finishes, the Firm Record attaches the letters as drafts to one reply to firm addresses only, the person who forwarded the office letter and the routed attorney. You do not send or file a letter." Parameters: `ticket_id`, `file`, `template`, `rules_seq`, and `statements` (each `{ text, evidence: [{ document, span: { page, quote } }] }`), all required, and `kind` (`client-report` or `office-reply`), optional. The result is JSON text: `{ proposalId, document, recordSeq }`, or `{ error, message, detail? }`.

#### Token effect

The schema contributes fixed request-context tokens while the run row is mounted. A call grows with its statements; the result is a few hundred characters.

#### KV Cache effect

The declaration is stable while the run row is mounted. Results append to history.

### The `record_propose_reading` declaration

#### What the model sees

`record_propose_reading` description: "Propose your reading of the office letter of this Ticket to the attorney: what the examiner said, and nothing else. Give one item per objection: the legal ground (for example "Art. 84 EPC: clarity"), the numbers of the claims it concerns, the labels of the cited documents it uses, and the examiner's reasoning in short, in the language of the letter. List the documents that the letter cites, each with its label (D1, D2 and so on) and its publication number as the letter prints it. Each item and each document needs at least one passage: the page number and a quote of at most 200 characters, copied character for character from that page of the text that record_read_document_text gives, never translated. A run of spaces and line breaks counts as one space; nothing else may differ. The quote must be on that page exactly once, so use a longer quote when a short one is on the page more than once. When the letter holds no objection (for example only the cover form, which names the reasons as an enclosure), give no item and say why in no_items_reason; do not guess an objection. The Firm Record finds each quote and stores its place, and refuses a passage that it does not find. The attorney accepts or rejects the reading in the Records app."

#### Token effect

The schema contributes fixed request-context tokens while the run row is mounted. A call grows with its objections and their quotes; the result is a few hundred characters.

#### KV Cache effect

The declaration is stable while the run row is mounted. Results append to history.

### The `record_read_document_text` declaration

#### What the model sees

`record_read_document_text` description: "Read the text of a document of the record, page by page. Give the SHA-256 of the document as record_read lists it. The result pages holds the text of each page, and pages[0] is page 1. Read the office letter with this tool before you propose a report: every statement of the report quotes this text. A quote is a part of one page, copied character for character, with that page number. The tool changes nothing in the record." One required parameter, `document`. The result is JSON text: `{ pages }`, or `{ error, message, detail? }`.

#### Token effect

The schema contributes fixed request-context tokens while the run row is mounted. A result is the full text of the document, bounded by the provider's 1 MiB answer limit, and it stays in the history of the run.

#### KV Cache effect

The declaration is stable while the run row is mounted. Results append to history.

### The `record_finish_run` declaration

#### What the model sees

`record_finish_run` description: "End this Ticket run after you proposed its letters. Give the deadline summary: the id and state of the deadline of the office event as record_read shows it, and the recordSeq of that read; give none-yet for both id and state when the record has no deadline for the event. You do not compute or change a date: the attorney checks the deadline and decides each proposal in the Records app. When a person forwarded the office letter, the Firm Record then queues one reply to firm addresses only, that person and the routed attorney, with the proposed letters attached as drafts; a letter from the scan mailbox gets no reply. Nothing goes to the client, and you send nothing." Parameters: `ticket_id`, `deadline_id`, `deadline_state`, and `record_seq`, all required. The result is JSON text: `{ recordSeq, outbox: { id, state } | null }`, or `{ error, message, detail? }`. The [`flowleap-ticket-run`](../../../snapshots/session/flowleap-ticket-run/) snapshot pins one Ticket run over a fixture provider.

#### Token effect

The schema contributes fixed request-context tokens while the run row is mounted; the result is a few hundred characters.

#### KV Cache effect

The declaration is stable while the run row is mounted. Results append to history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No decisions** — a runtime never confirms or rejects a deadline or a proposal; the Firm Record answers every decision with a runtime credential with `403 agent-cannot-decide`, and this package offers no tool for one. A person decides in the Records app.
- **No `report/by-hand` or `report/flagged` command** — when the client rules forbid an AI draft, the run can only tell the attorney in the chat; atlas sheet 4 lists `checking_rule → by_hand` and `proposed → flagged` with the agent as actor, but the R1 Firm Record has no command for them.
- **The run tools are on in every Session of the row** — the model of any chat sees them while the run row is mounted; the Firm Record refuses a command for a Ticket that is not running or not routed to the runtime's person.
- **One matter per read, no search** — `record_read` reads one matter by file number; `record_my_work` lists only the matters of the token's person. There is no search over other matters.
- **No letter text before filing** — `record_my_work` lists a waiting letter as the task of one intake person, but no tool reads the letter before it is filed.
- **No `?at=` read** — the tool reads the current view only; rebuilding the view at a logged `recordSeq` is an auditor's call on the Firm Record, not a model call.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The engine's actor on a `deadline/proposed` event is `{ kind: 'engine', onBehalfOf: person }`; the view does not carry actors, so the seam's types have no actor union. Add one only when a consumer reads it.

</details>
